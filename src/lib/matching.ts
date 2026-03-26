import type {
  AiAnswers,
  AppState,
  MatchSuggestion,
  Membership,
  ProjectRecord,
  ProjectRole,
  QueueConstraints,
  TeamRecord,
  User,
} from "@/lib/types";
import { createId, inferRole, overlapCount, sentenceCase, unique } from "@/lib/utils";

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

function getAvailableStudents(state: AppState, projectId: string, currentUserId: string): User[] {
  const memberIds = state.memberships
    .filter(
      (membership) =>
        membership.projectId === projectId &&
        membership.status === "active" &&
        membership.userId !== currentUserId &&
        !membership.teamId,
    )
    .map((membership) => membership.userId);

  return state.users.filter(
    (user) =>
      user.role === "student" &&
      memberIds.includes(user.id) &&
      !user.flags.matchingRestricted,
  );
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return items;
  }

  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function scoreCandidate(
  source: Pick<User, "profile">,
  candidate: User,
  roleHint?: ProjectRole,
): number {
  const overlapSkills = overlapCount(source.profile.skills, candidate.profile.skills);
  const overlapAvailability = overlapCount(
    source.profile.availability,
    candidate.profile.availability,
  );
  const goalMatch = source.profile.goalLevel === candidate.profile.goalLevel ? 3 : 0;
  const styleMatch = source.profile.workingStyle === candidate.profile.workingStyle ? 2 : 0;
  const roleBonus = roleHint && inferRole(candidate.profile) === roleHint ? 4 : 0;

  return overlapSkills * 3 + overlapAvailability * 4 + goalMatch + styleMatch + roleBonus;
}

function buildReasons(source: Pick<User, "profile">, teammates: User[], roles: ProjectRole[]): string[] {
  const allSkills = unique(teammates.flatMap((candidate) => candidate.profile.skills));
  const sharedAvailability = unique(
    teammates.flatMap((candidate) =>
      candidate.profile.availability.filter((slot) => source.profile.availability.includes(slot)),
    ),
  );
  const alignedGoal = teammates.some(
    (candidate) => candidate.profile.goalLevel === source.profile.goalLevel,
  );

  return [
    `Skill coverage spans ${allSkills.slice(0, 4).join(", ")}.`,
    sharedAvailability.length
      ? `Shared availability lines up on ${sharedAvailability.map(sentenceCase).join(", ")}.`
      : "The roster balances different schedules to widen meeting options.",
    alignedGoal
      ? `At least one teammate shares your ${sentenceCase(source.profile.goalLevel)} outcome target.`
      : "Goal levels are mixed, which can steady pace and accountability.",
    `Roles are covered across ${roles.join(", ")}.`,
  ];
}

function assignRoles(
  project: ProjectRecord,
  currentUser: User,
  teammates: User[],
  preferredRole?: ProjectRole,
): Record<string, ProjectRole> {
  const availableRoles = [...project.roleTemplates];
  const assignments: Record<string, ProjectRole> = {};

  const currentRole =
    preferredRole && availableRoles.includes(preferredRole)
      ? preferredRole
      : availableRoles[0] || inferRole(currentUser.profile);
  assignments[currentUser.id] = currentRole;
  const currentIndex = availableRoles.indexOf(currentRole);
  if (currentIndex >= 0) {
    availableRoles.splice(currentIndex, 1);
  }

  teammates.forEach((candidate) => {
    const preferred = candidate.profile.rolePreference || inferRole(candidate.profile);
    const fallback = candidate.profile.secondaryRole;
    const role =
      (preferred && availableRoles.includes(preferred) && preferred) ||
      (fallback && availableRoles.includes(fallback) && fallback) ||
      availableRoles[0] ||
      preferred ||
      "Analyst";
    assignments[candidate.id] = role;
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
  const virtualUser: User = {
    ...currentUser,
    profile: {
      ...currentUser.profile,
      rolePreference: answers.rolePreference,
      skills: answers.skills,
      availability: answers.availability,
      goalLevel: answers.goalLevel,
      workingStyle: answers.workingStyle,
    },
  };

  const candidates = getAvailableStudents(state, project.id, currentUser.id)
    .map((candidate) => ({ candidate, score: scoreCandidate(virtualUser, candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name))
    .map((entry) => entry.candidate);

  if (!candidates.length) {
    return undefined;
  }

  const teamMates = rotate(candidates, rematchCount).slice(0, Math.max(project.teamSize - 1, 1));
  const roles = assignRoles(project, currentUser, teamMates, answers.rolePreference);

  return {
    candidateIds: teamMates.map((candidate) => candidate.id),
    reasons: buildReasons(virtualUser, teamMates, Object.values(roles)),
    compatibilitySummary: teamMates.map((candidate) => {
      const sharedSkills = candidate.profile.skills.filter((skill) => answers.skills.includes(skill));
      const sharedAvailability = candidate.profile.availability.filter((slot) =>
        answers.availability.includes(slot),
      );
      return `${candidate.name}: ${
        sharedSkills.length
          ? `shared strengths in ${sharedSkills.slice(0, 2).join(" and ")}`
          : `adds ${candidate.profile.skills.slice(0, 2).join(" and ")}`
      }, with ${sharedAvailability.length ? sharedAvailability.join("/") : "complementary"} availability.`;
    }),
    roleAssignments: roles,
  };
}

function matchesConstraints(candidate: User, constraints: QueueConstraints): boolean {
  const hasAvailability =
    overlapCount(candidate.profile.availability, constraints.availability) > 0;
  const goalMatch = candidate.profile.goalLevel === constraints.goalLevel;
  const styleMatch = candidate.profile.workingStyle === constraints.workingStyle;

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
  const candidates = getAvailableStudents(state, project.id, currentUser.id).filter((candidate) =>
    matchesConstraints(candidate, constraints),
  );

  if (!candidates.length) {
    return undefined;
  }

  const assignments: Record<string, ProjectRole> = {
    [currentUser.id]: primaryRole,
  };

  const remainingRoles = project.roleTemplates.filter((role) => role !== primaryRole);
  const selected: User[] = [];

  remainingRoles.forEach((role, index) => {
    if (selected.length >= project.teamSize - 1) {
      return;
    }

    const ordered = rotate(
      candidates
        .filter((candidate) => !selected.some((picked) => picked.id === candidate.id))
        .map((candidate) => ({
          candidate,
          score:
            scoreCandidate(currentUser, candidate, role) +
            (candidate.profile.secondaryRole === role ? 2 : 0) +
            (secondaryRole === role ? 1 : 0),
        }))
        .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name))
        .map((entry) => entry.candidate),
      requeueCount + index,
    );

    const match = ordered[0];
    if (!match) {
      return;
    }

    selected.push(match);
    assignments[match.id] = role;
  });

  const fallbacks = rotate(
    candidates.filter((candidate) => !selected.some((picked) => picked.id === candidate.id)),
    requeueCount,
  );
  while (selected.length < project.teamSize - 1 && fallbacks.length) {
    const fallback = fallbacks.shift();
    if (!fallback) {
      break;
    }
    selected.push(fallback);
    assignments[fallback.id] =
      assignments[fallback.id] ||
      fallback.profile.rolePreference ||
      fallback.profile.secondaryRole ||
      inferRole(fallback.profile);
  }

  return {
    candidateIds: selected.map((candidate) => candidate.id),
    reasons: [
      `Role coverage is staged around ${[primaryRole, ...Object.values(assignments).filter((role) => role !== primaryRole)].join(", ")}.`,
      `Queue filters prioritized ${sentenceCase(constraints.workingStyle)} collaboration with ${sentenceCase(constraints.goalLevel)} goals.`,
      constraints.availability.length
        ? `Meeting overlap exists on ${constraints.availability.map(sentenceCase).join(", ")}.`
        : "Availability is flexible across the current roster.",
    ],
    compatibilitySummary: selected.map((candidate) => {
      return `${candidate.name}: ${inferRole(candidate.profile)} lead, ${candidate.profile.workingStyle} workflow, ${candidate.profile.goalLevel.replace(/-/g, " ")} goal.`;
    }),
    roleAssignments: assignments,
  };
}

export function buildTeamArtifacts(
  project: ProjectRecord,
  mode: "ai" | "queue",
  memberIds: string[],
  roleAssignments: Record<string, ProjectRole>,
  compatibilitySummary: string[],
): {
  team: TeamRecord;
  chatBucket: { teamId: string; messages: [] };
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
      status: "active",
      compatibilitySummary,
      createdAt,
    },
    chatBucket: {
      teamId,
      messages: [],
    },
    taskBucket: {
      teamId,
      tasks: [
        { id: createId("task"), title: "Confirm role ownership and deliverables", status: "todo" },
        { id: createId("task"), title: "Pick a kickoff meeting time", status: "todo" },
        { id: createId("task"), title: "Draft milestone one outline", status: "todo" },
      ],
    },
  };
}

export function resolveCurrentProject(state: AppState, userId: string): ProjectRecord | undefined {
  const membership = [...state.memberships]
    .filter((item) => item.userId === userId && item.status === "active" && item.projectId)
    .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))[0];

  return membership
    ? state.projects.find((project) => project.id === membership.projectId)
    : undefined;
}

export function resolveCurrentTeam(state: AppState, userId: string): TeamRecord | undefined {
  const membership = [...state.memberships]
    .filter((item) => item.userId === userId && item.status === "active" && item.projectId && item.teamId)
    .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))[0];

  return membership ? state.teams.find((team) => team.id === membership.teamId) : undefined;
}

export function canUserMatch(state: AppState, userId: string, projectId: string): boolean {
  const membership = getActiveMembership(state.memberships, userId, projectId);
  const user = state.users.find((item) => item.id === userId);
  return Boolean(membership && !membership.teamId && !user?.flags.matchingRestricted);
}
