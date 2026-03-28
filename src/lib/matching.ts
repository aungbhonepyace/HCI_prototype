import type {
  AiAnswers,
  AppState,
  ChatMessage,
  MatchSuggestion,
  MatchingProfile,
  Membership,
  ProjectRecord,
  ProjectRole,
  QueueConstraints,
  TeamRecord,
  TeamCreatedFrom,
  TeamProposal,
  User,
} from "@/lib/types";
import { createId, overlapCount, sentenceCase, unique } from "@/lib/utils";

function fallbackMatchingProfile(userId: string): MatchingProfile {
  return {
    userId,
    rolePreference: "UI/Design",
    secondaryRole: "Writer/Presenter",
    skills: ["Figma", "Writing"],
    availability: ["weekdays", "evenings"],
    goalLevel: "balanced",
    workingStyle: "collab",
    updatedAt: new Date().toISOString(),
  };
}

export function resolveMatchingProfile(state: AppState, userId: string): MatchingProfile {
  return (
    state.matchingProfiles.find((profile) => profile.userId === userId) ||
    fallbackMatchingProfile(userId)
  );
}

function getActiveMembership(
  memberships: Membership[],
  userId: string,
  projectId: string,
): Membership | undefined {
  return memberships.find(
    (membership) =>
      membership.userId === userId &&
      membership.projectId === projectId &&
      membership.status === "active",
  );
}

function isProposalLive(proposal: TeamProposal): boolean {
  return proposal.status === "pending" || proposal.status === "refilling";
}

export function isUserInConfirmedProjectTeam(
  state: AppState,
  userId: string,
  projectId: string,
): boolean {
  return state.memberships.some(
    (membership) =>
      membership.userId === userId &&
      membership.projectId === projectId &&
      membership.status === "active" &&
      (membership.matchingStatus === "confirmed" ||
        Boolean(membership.confirmedTeamId || membership.teamId)),
  );
}

function getProjectAvailableStudents(
  state: AppState,
  projectId: string,
  currentUserId: string,
): Array<{ user: User; matching: MatchingProfile }> {
  const memberIds = state.memberships
    .filter(
      (membership) =>
      membership.projectId === projectId &&
      membership.status === "active" &&
      membership.userId !== currentUserId &&
      membership.matchingStatus !== "confirmed" &&
      membership.matchingStatus !== "proposed" &&
      !membership.confirmedTeamId &&
      !membership.teamId,
    )
    .map((membership) => membership.userId);

  return state.users
    .filter(
      (user) =>
        user.role === "student" &&
        memberIds.includes(user.id) &&
        !user.flags.matchingRestricted,
    )
    .map((user) => ({
      user,
      matching: resolveMatchingProfile(state, user.id),
    }));
}

function getFallbackStudents(
  state: AppState,
  projectId: string,
  currentUserId: string,
): Array<{ user: User; matching: MatchingProfile }> {
  return state.users
    .filter(
      (user) =>
        user.role === "student" &&
        user.id !== currentUserId &&
        !user.flags.matchingRestricted &&
        !state.memberships.some(
          (membership) =>
            membership.userId === user.id &&
            membership.projectId === projectId &&
            (membership.status === "removed" ||
              (membership.status === "active" && Boolean(membership.teamId)) ||
              membership.status === "active"),
        ),
    )
    .map((user) => ({
      user,
      matching: resolveMatchingProfile(state, user.id),
    }));
}

function getAvailableStudents(
  state: AppState,
  projectId: string,
  currentUserId: string,
): Array<{ user: User; matching: MatchingProfile }> {
  const localCandidates = getProjectAvailableStudents(state, projectId, currentUserId);
  const localIds = new Set(localCandidates.map((candidate) => candidate.user.id));
  const fallbackCandidates = getFallbackStudents(state, projectId, currentUserId).filter(
    (candidate) => !localIds.has(candidate.user.id),
  );

  return [...localCandidates, ...fallbackCandidates];
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return items;
  }

  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function scoreCandidate(
  source: MatchingProfile,
  candidate: MatchingProfile,
  roleHint?: ProjectRole,
): number {
  const overlapSkills = overlapCount(source.skills, candidate.skills);
  const overlapAvailability = overlapCount(source.availability, candidate.availability);
  const goalMatch = source.goalLevel === candidate.goalLevel ? 3 : 0;
  const styleMatch = source.workingStyle === candidate.workingStyle ? 2 : 0;
  const roleBonus = roleHint && candidate.rolePreference === roleHint ? 4 : 0;

  return overlapSkills * 3 + overlapAvailability * 4 + goalMatch + styleMatch + roleBonus;
}

function buildReasons(
  source: MatchingProfile,
  teammates: Array<{ user: User; matching: MatchingProfile }>,
  roles: ProjectRole[],
): string[] {
  const allSkills = unique(teammates.flatMap((candidate) => candidate.matching.skills));
  const sharedAvailability = unique(
    teammates.flatMap((candidate) =>
      candidate.matching.availability.filter((slot) => source.availability.includes(slot)),
    ),
  );
  const alignedGoal = teammates.some(
    (candidate) => candidate.matching.goalLevel === source.goalLevel,
  );

  return [
    `Skill coverage spans ${allSkills.slice(0, 4).join(", ")}.`,
    sharedAvailability.length
      ? `Shared availability lines up on ${sharedAvailability.map(sentenceCase).join(", ")}.`
      : "The roster balances different schedules to widen meeting options.",
    alignedGoal
      ? `At least one teammate shares your ${sentenceCase(source.goalLevel)} outcome target.`
      : "Goal levels are mixed, which can steady pace and accountability.",
    `Roles are covered across ${roles.join(", ")}.`,
  ];
}

function assignRoles(
  project: ProjectRecord,
  currentUserId: string,
  currentMatching: MatchingProfile,
  teammates: Array<{ user: User; matching: MatchingProfile }>,
  preferredRole?: ProjectRole,
): Record<string, ProjectRole> {
  const availableRoles = [...project.roleTemplates];
  const assignments: Record<string, ProjectRole> = {};

  const currentRole =
    preferredRole && availableRoles.includes(preferredRole)
      ? preferredRole
      : availableRoles[0] || currentMatching.rolePreference;
  assignments[currentUserId] = currentRole;
  const currentIndex = availableRoles.indexOf(currentRole);
  if (currentIndex >= 0) {
    availableRoles.splice(currentIndex, 1);
  }

  teammates.forEach(({ user, matching }) => {
    const preferred = matching.rolePreference;
    const fallback = matching.secondaryRole;
    const role =
      (preferred && availableRoles.includes(preferred) && preferred) ||
      (fallback && availableRoles.includes(fallback) && fallback) ||
      availableRoles[0] ||
      preferred ||
      "Analyst";
    assignments[user.id] = role;
    const index = availableRoles.indexOf(role);
    if (index >= 0) {
      availableRoles.splice(index, 1);
    }
  });

  return assignments;
}

export function buildAiSuggestion(
  state: AppState,
  project: ProjectRecord,
  currentUser: User,
  answers: AiAnswers,
  rematchCount: number,
): MatchSuggestion | undefined {
  const currentMatching: MatchingProfile = {
    userId: currentUser.id,
    rolePreference: answers.rolePreference,
    skills: answers.skills,
    availability: answers.availability,
    goalLevel: answers.goalLevel,
    workingStyle: answers.workingStyle,
    secondaryRole: resolveMatchingProfile(state, currentUser.id).secondaryRole,
    updatedAt: new Date().toISOString(),
  };

  const candidates = getAvailableStudents(state, project.id, currentUser.id)
    .map((candidate) => ({ candidate, score: scoreCandidate(currentMatching, candidate.matching) }))
    .sort((left, right) => right.score - left.score || left.candidate.user.name.localeCompare(right.candidate.user.name))
    .map((entry) => entry.candidate);

  if (!candidates.length) {
    return undefined;
  }

  const teamMates = rotate(candidates, rematchCount).slice(0, Math.max(project.teamSize - 1, 1));
  const roles = assignRoles(project, currentUser.id, currentMatching, teamMates, answers.rolePreference);

  return {
    candidateIds: teamMates.map((candidate) => candidate.user.id),
    reasons: buildReasons(currentMatching, teamMates, Object.values(roles)),
    compatibilitySummary: teamMates.map(({ user, matching }) => {
      const sharedSkills = matching.skills.filter((skill) => answers.skills.includes(skill));
      const sharedAvailability = matching.availability.filter((slot) =>
        answers.availability.includes(slot),
      );
      return `${user.name}: ${
        sharedSkills.length
          ? `shared strengths in ${sharedSkills.slice(0, 2).join(" and ")}`
          : `adds ${matching.skills.slice(0, 2).join(" and ")}`
      }, with ${sharedAvailability.length ? sharedAvailability.join("/") : "complementary"} availability.`;
    }),
    roleAssignments: roles,
  };
}

function matchesConstraints(candidate: MatchingProfile, constraints: QueueConstraints): boolean {
  const hasAvailability = overlapCount(candidate.availability, constraints.availability) > 0;
  const goalMatch = candidate.goalLevel === constraints.goalLevel;
  const styleMatch = candidate.workingStyle === constraints.workingStyle;

  if (constraints.strictness === "must") {
    return hasAvailability && goalMatch && styleMatch;
  }

  return hasAvailability || goalMatch || styleMatch;
}

export function buildQueueSuggestion(
  state: AppState,
  project: ProjectRecord,
  currentUser: User,
  primaryRole: ProjectRole,
  secondaryRole: ProjectRole | undefined,
  constraints: QueueConstraints,
  requeueCount: number,
): MatchSuggestion | undefined {
  const currentMatching = resolveMatchingProfile(state, currentUser.id);
  const candidates = getAvailableStudents(state, project.id, currentUser.id).filter((candidate) =>
    matchesConstraints(candidate.matching, constraints),
  );

  if (!candidates.length) {
    return undefined;
  }

  const assignments: Record<string, ProjectRole> = {
    [currentUser.id]: primaryRole,
  };

  const remainingRoles = project.roleTemplates.filter((role) => role !== primaryRole);
  const selected: Array<{ user: User; matching: MatchingProfile }> = [];

  remainingRoles.forEach((role, index) => {
    if (selected.length >= project.teamSize - 1) {
      return;
    }

    const ordered = rotate(
      candidates
        .filter((candidate) => !selected.some((picked) => picked.user.id === candidate.user.id))
        .map((candidate) => ({
          candidate,
          score:
            scoreCandidate(currentMatching, candidate.matching, role) +
            (candidate.matching.secondaryRole === role ? 2 : 0) +
            (secondaryRole === role ? 1 : 0),
        }))
        .sort((left, right) => right.score - left.score || left.candidate.user.name.localeCompare(right.candidate.user.name))
        .map((entry) => entry.candidate),
      requeueCount + index,
    );

    const match = ordered[0];
    if (!match) {
      return;
    }

    selected.push(match);
    assignments[match.user.id] = role;
  });

  const fallbacks = rotate(
    candidates.filter((candidate) => !selected.some((picked) => picked.user.id === candidate.user.id)),
    requeueCount,
  );

  while (selected.length < project.teamSize - 1 && fallbacks.length) {
    const fallback = fallbacks.shift();
    if (!fallback) {
      break;
    }
    selected.push(fallback);
    assignments[fallback.user.id] =
      assignments[fallback.user.id] ||
      fallback.matching.rolePreference ||
      fallback.matching.secondaryRole ||
      "Analyst";
  }

  return {
    candidateIds: selected.map((candidate) => candidate.user.id),
    reasons: [
      `Role coverage is staged around ${[
        primaryRole,
        ...Object.values(assignments).filter((role) => role !== primaryRole),
      ].join(", ")}.`,
      `Queue filters prioritized ${sentenceCase(constraints.workingStyle)} collaboration with ${sentenceCase(constraints.goalLevel)} goals.`,
      constraints.availability.length
        ? `Meeting overlap exists on ${constraints.availability.map(sentenceCase).join(", ")}.`
        : "Availability is flexible across the current roster.",
    ],
    compatibilitySummary: selected.map(({ user, matching }) => {
      return `${user.name}: ${matching.rolePreference} lead, ${matching.workingStyle} workflow, ${matching.goalLevel.replace(/-/g, " ")} goal.`;
    }),
    roleAssignments: assignments,
  };
}

export function shouldFastTrackQueueMatch(
  state: AppState,
  project: ProjectRecord,
  currentUser: User,
  primaryRole: ProjectRole,
  secondaryRole: ProjectRole | undefined,
  constraints: QueueConstraints,
  requeueCount: number,
  elapsedSeconds: number,
): boolean {
  const preview = buildQueueSuggestion(
    state,
    project,
    currentUser,
    primaryRole,
    secondaryRole,
    constraints,
    requeueCount,
  );

  if (!preview) {
    return false;
  }

  const roleSpread = new Set(Object.values(preview.roleAssignments)).size;
  const targetRoleSpread = Math.max(1, Math.min(project.roleTemplates.length || 1, 3));
  const hiddenThreshold = requeueCount > 0 ? 4 : roleSpread >= targetRoleSpread ? 8 : 12;

  return elapsedSeconds >= hiddenThreshold;
}

export function buildProposalCompatibilitySummary(
  state: AppState,
  memberIds: string[],
  roleAssignments: Record<string, ProjectRole>,
): string[] {
  return memberIds
    .map((userId) => {
      const user = state.users.find((entry) => entry.id === userId);
      if (!user) {
        return undefined;
      }

      const matching = resolveMatchingProfile(state, userId);
      const role = roleAssignments[userId] || matching.rolePreference;

      return `${user.name}: ${role} lead, ${sentenceCase(matching.workingStyle)} workflow, ${sentenceCase(
        matching.goalLevel,
      )} goal, ${matching.availability.map(sentenceCase).join("/") || "flexible"} availability.`;
    })
    .filter((item): item is string => Boolean(item));
}

function getProposalRefillPool(
  state: AppState,
  project: ProjectRecord,
  excludedIds: Set<string>,
  excludedProposalId?: string,
): Array<{ user: User; matching: MatchingProfile }> {
  const candidateIds = unique(
    state.memberships
      .filter(
        (membership) =>
          membership.classId === project.classId &&
          membership.status === "active" &&
          (!membership.projectId || membership.projectId === project.id) &&
          !membership.teamId,
      )
      .map((membership) => membership.userId),
  );

  return state.users
    .filter((user) => {
      if (
        user.role !== "student" ||
        excludedIds.has(user.id) ||
        !candidateIds.includes(user.id) ||
        user.flags.matchingRestricted ||
        isUserInConfirmedProjectTeam(state, user.id, project.id)
      ) {
        return false;
      }

      return !state.teamProposals.some(
        (proposal) =>
          proposal.id !== excludedProposalId &&
          isProposalLive(proposal) &&
          proposal.memberIds.includes(user.id) &&
          proposal.memberStatuses[user.id] !== "declined",
      );
    })
    .map((user) => ({
      user,
      matching: resolveMatchingProfile(state, user.id),
    }));
}

function scoreProposalRefillCandidate(
  candidate: MatchingProfile,
  teamProfiles: MatchingProfile[],
  roleHint?: ProjectRole,
): number {
  const roleScore =
    roleHint && candidate.rolePreference === roleHint
      ? 12
      : roleHint && candidate.secondaryRole === roleHint
        ? 8
        : 0;

  const availabilityTarget = unique(teamProfiles.flatMap((profile) => profile.availability));
  const skillTarget = unique(teamProfiles.flatMap((profile) => profile.skills));
  const goalTarget = teamProfiles[0]?.goalLevel;
  const styleTarget = teamProfiles[0]?.workingStyle;

  return (
    roleScore +
    overlapCount(candidate.availability, availabilityTarget) * 4 +
    overlapCount(candidate.skills, skillTarget) +
    (goalTarget && candidate.goalLevel === goalTarget ? 4 : 0) +
    (styleTarget && candidate.workingStyle === styleTarget ? 3 : 0)
  );
}

export function findProposalRefillCandidates(
  state: AppState,
  project: ProjectRecord,
  currentMemberIds: string[],
  excludedIds: Set<string>,
  roleAssignments: Record<string, ProjectRole>,
  slotsNeeded: number,
  excludedProposalId?: string,
): { candidateIds: string[]; roleAssignments: Record<string, ProjectRole> } {
  const pool = getProposalRefillPool(state, project, excludedIds, excludedProposalId);
  const selectedIds: string[] = [];
  const nextRoleAssignments = { ...roleAssignments };
  const workingMemberIds = [...currentMemberIds];
  const availableRoles = [...project.roleTemplates];

  workingMemberIds.forEach((memberId) => {
    const assignedRole = nextRoleAssignments[memberId];
    const index = availableRoles.indexOf(assignedRole);
    if (index >= 0) {
      availableRoles.splice(index, 1);
    }
  });

  while (selectedIds.length < slotsNeeded) {
    const teamProfiles = workingMemberIds.map((memberId) => resolveMatchingProfile(state, memberId));
    const roleHint = availableRoles[0];

    const ordered = pool
      .filter((candidate) => !selectedIds.includes(candidate.user.id))
      .map((candidate) => ({
        candidate,
        score: scoreProposalRefillCandidate(candidate.matching, teamProfiles, roleHint),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.user.name.localeCompare(right.candidate.user.name),
      )
      .map((entry) => entry.candidate);

    const match = ordered[0];
    if (!match) {
      break;
    }

    selectedIds.push(match.user.id);
    workingMemberIds.push(match.user.id);

    const assignedRole =
      (roleHint && (match.matching.rolePreference === roleHint || match.matching.secondaryRole === roleHint)
        ? roleHint
        : match.matching.rolePreference) ||
      match.matching.secondaryRole ||
      roleHint ||
      "Analyst";
    nextRoleAssignments[match.user.id] = assignedRole;

    const roleIndex = availableRoles.indexOf(assignedRole);
    if (roleIndex >= 0) {
      availableRoles.splice(roleIndex, 1);
    }
  }

  return {
    candidateIds: selectedIds,
    roleAssignments: nextRoleAssignments,
  };
}

export function buildTeamArtifacts(
  project: ProjectRecord,
  mode: "ai" | "queue",
  memberIds: string[],
  roleAssignments: Record<string, ProjectRole>,
  compatibilitySummary: string[],
  createdFrom: TeamCreatedFrom = mode === "queue" ? "QUEUE_MATCH" : "AI_MATCH",
): {
  team: TeamRecord;
  chatBucket: { teamId: string; messages: ChatMessage[] };
  taskBucket: { teamId: string; tasks: { id: string; title: string; status: "todo" | "done" }[] };
} {
  const teamId = createId("team");
  const createdAt = new Date().toISOString();

  return {
    team: {
      id: teamId,
      classId: project.classId,
      projectId: project.id,
      memberIds,
      roles: roleAssignments,
      createdByMode: mode,
      createdFrom,
      status: "active",
      compatibilitySummary,
      meetingOptions: [],
      maxSize: project.teamSize,
      isOverflowTeam: false,
      createdAt,
    },
    chatBucket: {
      teamId,
      messages: [
        {
          id: createId("message"),
          teamId,
          userId: "system",
          content: "Team created. Introduce yourselves.",
          createdAt,
        },
      ],
    },
    taskBucket: {
      teamId,
      tasks: [
        { id: createId("task"), title: "Confirm role ownership and deliverables", status: "todo" },
        { id: createId("task"), title: "Vote on a kickoff meeting time", status: "todo" },
        { id: createId("task"), title: "Draft milestone one outline", status: "todo" },
      ],
    },
  };
}

export function resolveStudentProjects(state: AppState, userId: string): ProjectRecord[] {
  const projectIds = [...state.memberships]
    .filter((item) => item.userId === userId && item.status === "active" && item.projectId)
    .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))
    .map((membership) => membership.projectId)
    .filter((projectId, index, all): projectId is string => Boolean(projectId) && all.indexOf(projectId) === index);

  return projectIds
    .map((projectId) => state.projects.find((project) => project.id === projectId))
    .filter((project): project is ProjectRecord => Boolean(project));
}

export function resolveCurrentProject(
  state: AppState,
  userId: string,
  preferredProjectId?: string,
): ProjectRecord | undefined {
  const projects = resolveStudentProjects(state, userId);

  if (preferredProjectId) {
    const preferred = projects.find((project) => project.id === preferredProjectId);
    if (preferred) {
      return preferred;
    }
  }

  return projects[0];
}

export function resolveStudentTeams(state: AppState, userId: string): TeamRecord[] {
  const teamIds = [...state.memberships]
    .filter((item) => item.userId === userId && item.status === "active" && item.projectId && item.teamId)
    .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))
    .map((membership) => membership.teamId)
    .filter((teamId, index, all): teamId is string => Boolean(teamId) && all.indexOf(teamId) === index);

  return teamIds
    .map((teamId) => state.teams.find((team) => team.id === teamId))
    .filter((team): team is TeamRecord => Boolean(team));
}

export function resolveCurrentTeam(
  state: AppState,
  userId: string,
  projectId?: string,
): TeamRecord | undefined {
  const membership = [...state.memberships]
    .filter(
      (item) =>
        item.userId === userId &&
        item.status === "active" &&
        item.projectId &&
        item.teamId &&
        (!projectId || item.projectId === projectId),
    )
    .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))[0];

  return membership ? state.teams.find((team) => team.id === membership.teamId) : undefined;
}

export function canUserMatch(state: AppState, userId: string, projectId: string): boolean {
  const membership = getActiveMembership(state.memberships, userId, projectId);
  const user = state.users.find((item) => item.id === userId);
  return Boolean(
    membership &&
      membership.matchingStatus !== "confirmed" &&
      !membership.confirmedTeamId &&
      !membership.teamId &&
      !user?.flags.matchingRestricted,
  );
}
