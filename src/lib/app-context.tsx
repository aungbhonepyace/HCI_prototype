import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildAiSuggestion,
  buildProposalCompatibilitySummary,
  buildQueueSuggestion,
  buildTeamArtifacts,
  findProposalRefillCandidates,
  isUserInConfirmedProjectTeam,
  resolveCurrentProject,
  resolveCurrentTeam,
  resolveStudentProjects,
  resolveStudentTeams,
} from "@/lib/matching";
import {
  DEMO_ACCOUNT_PASSWORD,
  buildDefaultMatchingProfile,
  buildNewUser,
  buildProjectSetting,
  createProjectRecord,
  defaultProjectPayload,
  hashPassword,
  isPasswordStrong,
  loadState,
  persistState,
} from "@/lib/storage";
import type {
  AiAnswers,
  AppState,
  AuthState,
  MatchSuggestion,
  Membership,
  MatchingProfile,
  NotificationType,
  OverflowState,
  ProjectSetting,
  ProjectRecord,
  ProjectRole,
  QueueConstraints,
  QueueSession,
  ReportFormInput,
  TeamRecord,
  TeamProposal,
  User,
  UserProfile,
} from "@/lib/types";
import { createId, formatDate, generateJoinCode, overlapCount, unique } from "@/lib/utils";

interface AppContextValue {
  state: AppState;
  activeProjectId?: string;
  currentUser?: User;
  currentProject?: ProjectRecord;
  currentTeam?: TeamRecord;
  studentProjects: ProjectRecord[];
  studentTeams: TeamRecord[];
  currentMembershipProjectIds: string[];
  setActiveProject: (projectId: string) => void;
  login: (
    email: string,
    password: string,
    role: AuthState["role"],
  ) => { ok: boolean; message: string };
  logout: () => void;
  updateCurrentUser: (payload: Partial<User> & { profile?: Partial<UserProfile> }) => void;
  joinProject: (joinCode: string) => { ok: boolean; message: string };
  createClass: (payload: { name: string; term: string }) => void;
  createProject: (
    classId: string,
    payload: ReturnType<typeof defaultProjectPayload>,
  ) => ProjectRecord;
  updateProjectSettings: (payload: {
    projectId: string;
    overflowTeamsAllowed: number;
    formationDeadline: string;
    forceOverflowAtDeadline: boolean;
  }) => { ok: boolean; message: string };
  adminCreateStudent: (payload: {
    name: string;
    email: string;
    verified: boolean;
    profile: Partial<UserProfile>;
  }) => { ok: boolean; message: string; userId?: string };
  adminUpdateStudent: (
    userId: string,
    payload: {
      name: string;
      email: string;
      verified: boolean;
      profile: Partial<UserProfile>;
    },
  ) => { ok: boolean; message: string };
  adminAddStudentToClass: (userId: string, classId: string) => { ok: boolean; message: string };
  adminRemoveStudentFromClass: (
    userId: string,
    classId: string,
  ) => { ok: boolean; message: string };
  regenerateJoinCode: (projectId: string) => void;
  runAiMatch: (answers: AiAnswers) => MatchSuggestion | undefined;
  rematchAi: () => MatchSuggestion | undefined;
  proposeAiTeam: () => { ok: boolean; message: string; proposalId?: string };
  respondToProposal: (
    proposalId: string,
    decision: "accepted" | "declined",
  ) => { ok: boolean; message: string; proposalId?: string; teamId?: string };
  saveQueueRoles: (primaryRole: ProjectRole, secondaryRole?: ProjectRole) => void;
  saveQueueConstraints: (constraints: QueueConstraints) => void;
  enterQueue: () => void;
  leaveQueue: () => void;
  resolveQueueMatch: () => MatchSuggestion | undefined;
  requeueQueueMatch: () => void;
  acceptQueueMatch: () => string | undefined;
  sendTeamMessage: (content: string) => { ok: boolean; message?: string };
  toggleTask: (taskId: string) => void;
  addMeetingOption: (startsAt: string) => { ok: boolean; message: string };
  voteMeetingOption: (optionId: string) => void;
  submitReport: (payload: ReportFormInput) => { ok: boolean; message: string };
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  adminActOnReport: (
    reportId: string,
    action: "warn" | "mute" | "restrict matching" | "remove from project",
    note: string,
  ) => void;
}

declare global {
  interface Window {
    gfDebug?: {
      help: () => Record<string, string>;
      demoAccounts: () => {
        password: string;
        students: string[];
        admins: string[];
      };
      inspectSession: () => Record<string, unknown>;
      inspectProject: (projectId?: string) => Record<string, unknown>;
      forceAiProposal: (
        projectId?: string,
      ) => { ok: boolean; message: string; proposalId?: string };
      acceptAllPendingProposal: (
        proposalId?: string,
      ) => { ok: boolean; message: string; proposalId?: string; teamId?: string };
      declinePendingProposal: (
        proposalId?: string,
        userId?: string,
      ) => { ok: boolean; message: string; proposalId?: string };
      forceQueueMatch: (projectId?: string) => { ok: boolean; message: string };
      inspectQueue: (projectId?: string) => {
        ok: boolean;
        message: string;
        queue?: QueueSession;
      };
      finalizeOverflow: (
        projectId?: string,
      ) => { ok: boolean; message: string; overflow?: OverflowState };
      setVolunteer: (enabled: boolean) => { ok: boolean; message: string };
      resetDemoData: () => { ok: boolean; message: string };
    };
  }
}

const AppContext = createContext<AppContextValue | undefined>(undefined);
const ACTIVE_PROJECT_KEY = "gf_active_project";

function readActiveProjectId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.sessionStorage.getItem(ACTIVE_PROJECT_KEY) || undefined;
}

function writeActiveProjectId(projectId?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!projectId) {
    window.sessionStorage.removeItem(ACTIVE_PROJECT_KEY);
    return;
  }

  window.sessionStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

function toIsoDateTime(value: string, fallback: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function pushNotification(
  state: AppState,
  userId: string,
  title: string,
  body: string,
  link?: string,
  type: NotificationType = "GENERAL",
): AppState {
  return {
    ...state,
    notifications: [
      {
        id: createId("notification"),
        userId,
        type,
        title,
        body,
        link,
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...state.notifications,
    ],
  };
}

function getOrCreateQueueSession(state: AppState, userId: string, projectId: string): QueueSession {
  return (
    state.queueSessions.find(
      (session) => session.userId === userId && session.projectId === projectId,
    ) || {
      id: createId("queue"),
      userId,
      projectId,
      etaSeconds: 45,
      inQueue: false,
      requeueCount: 0,
      updatedAt: new Date().toISOString(),
    }
  );
}

function getProjectSetting(state: AppState, project: ProjectRecord): ProjectSetting {
  return (
    state.projectSettings.find((setting) => setting.projectId === project.id) ||
    buildProjectSetting(project.id, project.teamSize, undefined, 0, project.deadline, true)
  );
}

function isMembershipConfirmed(
  membership: Pick<Membership, "status" | "matchingStatus" | "confirmedTeamId" | "teamId">,
): boolean {
  return (
    membership.status === "active" &&
    (membership.matchingStatus === "confirmed" ||
      Boolean(membership.confirmedTeamId || membership.teamId))
  );
}

function isUserInActiveProposal(
  state: AppState,
  userId: string,
  projectId: string,
  excludedProposalId?: string,
): boolean {
  return state.teamProposals.some(
    (proposal) =>
      proposal.id !== excludedProposalId &&
      proposal.projectId === projectId &&
      isProposalActive(proposal) &&
      proposal.memberStatuses[userId] &&
      proposal.memberStatuses[userId] !== "declined",
  );
}

function replaceOverflowState(state: AppState, overflow: OverflowState): AppState {
  return {
    ...state,
    overflowState: state.overflowState.some((entry) => entry.projectId === overflow.projectId)
      ? state.overflowState.map((entry) =>
          entry.projectId === overflow.projectId ? overflow : entry,
        )
      : [overflow, ...state.overflowState],
  };
}

function getOverflowState(state: AppState, project: ProjectRecord): OverflowState {
  const setting = getProjectSetting(state, project);
  return (
    state.overflowState.find((entry) => entry.projectId === project.id) || {
      projectId: project.id,
      overflowTeamsAllowed: setting.overflowTeamsAllowed,
      overflowSlotsNeeded: Math.max(setting.overflowTeamsAllowed, 0),
      overflowSlotsFilled: 0,
      overflowMemberIds: [],
      forcedOverflowMemberIds: [],
      deadlineFinalized: false,
    }
  );
}

function isProposalActive(proposal: TeamProposal): boolean {
  return proposal.status === "pending" || proposal.status === "refilling";
}

function getAcceptedProposalMemberIds(proposal: TeamProposal): string[] {
  return Object.entries(proposal.memberStatuses)
    .filter(([, status]) => status === "accepted")
    .map(([userId]) => userId);
}

function getPendingProposalMemberIds(proposal: TeamProposal): string[] {
  return proposal.memberIds.filter((userId) => proposal.memberStatuses[userId] === "pending");
}

function getCurrentProposalMemberIds(proposal: TeamProposal): string[] {
  return proposal.memberIds.filter((userId) => proposal.memberStatuses[userId] !== "declined");
}

function getProposalById(state: AppState, proposalId: string): TeamProposal | undefined {
  return state.teamProposals.find((proposal) => proposal.id === proposalId);
}

function hasActiveProposalForUser(state: AppState, userId: string, projectId: string): boolean {
  return state.teamProposals.some(
    (proposal) =>
      proposal.projectId === projectId &&
      proposal.createdByUserId === userId &&
      isProposalActive(proposal),
  );
}

function replaceProposal(state: AppState, proposal: TeamProposal): AppState {
  return {
    ...state,
    teamProposals: state.teamProposals.map((entry) =>
      entry.id === proposal.id ? proposal : entry,
    ),
  };
}

function notifyProposalMembers(
  state: AppState,
  memberIds: string[],
  title: string,
  body: string,
  link: string,
  type: NotificationType,
): AppState {
  return memberIds.reduce(
    (next, memberId) => pushNotification(next, memberId, title, body, link, type),
    state,
  );
}

function confirmProposalTeam(
  state: AppState,
  proposal: TeamProposal,
  project: ProjectRecord,
): AppState {
  const memberIds = proposal.memberIds.filter(
    (userId) => proposal.memberStatuses[userId] === "accepted",
  );
  const compatibilitySummary = buildProposalCompatibilitySummary(
    state,
    memberIds,
    proposal.roleAssignments,
  );
  const artifacts = buildTeamArtifacts(
    project,
    "ai",
    memberIds,
    proposal.roleAssignments,
    compatibilitySummary,
    "AI_PROPOSAL",
  );

  let next = attachMembersToProject(
    {
      ...state,
      teams: [artifacts.team, ...state.teams],
      teamChat: [artifacts.chatBucket, ...state.teamChat],
      teamTasks: [artifacts.taskBucket, ...state.teamTasks],
    },
    memberIds,
    project,
    artifacts.team.id,
  );

  const confirmedProposal: TeamProposal = {
    ...proposal,
    memberIds,
    compatibilitySummary,
    lockedAcceptedMemberIds: memberIds,
    slotsNeeded: 0,
    status: "confirmed",
    finalTeamId: artifacts.team.id,
  };
  next = replaceProposal(next, confirmedProposal);

  memberIds.forEach((memberId) => {
    next = pushNotification(
      next,
      memberId,
      "Team confirmed",
      `Your proposal for ${project.name} is complete. Open the team workspace.`,
      "/student/team",
      "TEAM_CONFIRMED",
    );
  });

  next = syncProjectMembershipStatuses(next, project);
  return applyOverflowPlacement(next, project);
}

function expireProposal(state: AppState, proposal: TeamProposal, project?: ProjectRecord): AppState {
  if (!isProposalActive(proposal)) {
    return state;
  }

  const acceptedMembers = getAcceptedProposalMemberIds(proposal);
  let next = replaceProposal(state, {
    ...proposal,
    status: "expired",
    slotsNeeded: 0,
  });

  acceptedMembers.forEach((memberId) => {
    next = pushNotification(
      next,
      memberId,
      "Proposal expired",
      `Your proposal${project ? ` for ${project.name}` : ""} expired. Please rematch or use Lucky Draw.`,
      "/student/match",
      "PROPOSAL_EXPIRED",
    );
  });

  return project ? syncProjectMembershipStatuses(next, project) : next;
}

function refillProposal(
  state: AppState,
  proposal: TeamProposal,
  project: ProjectRecord,
): AppState {
  const currentMemberIds = getCurrentProposalMemberIds(proposal);
  const acceptedMembers = currentMemberIds.filter(
    (userId) => proposal.memberStatuses[userId] === "accepted",
  );
  const pendingMembers = currentMemberIds.filter(
    (userId) => proposal.memberStatuses[userId] === "pending",
  );
  const slotsNeeded = Math.max(proposal.teamSize - (acceptedMembers.length + pendingMembers.length), 0);

  if (slotsNeeded <= 0) {
    return replaceProposal(state, {
      ...proposal,
      memberIds: currentMemberIds,
      lockedAcceptedMemberIds: acceptedMembers,
      slotsNeeded: 0,
      compatibilitySummary: buildProposalCompatibilitySummary(
        state,
        currentMemberIds,
        proposal.roleAssignments,
      ),
      status: proposal.status === "refilling" ? "refilling" : "pending",
    });
  }

  const excludedIds = new Set(Object.keys(proposal.memberStatuses));
  const refill = findProposalRefillCandidates(
    state,
    project,
    currentMemberIds,
    excludedIds,
    proposal.roleAssignments,
    slotsNeeded,
    proposal.id,
  );
  const nextMemberIds = [...currentMemberIds, ...refill.candidateIds];
  const nextStatuses = { ...proposal.memberStatuses };
  refill.candidateIds.forEach((userId) => {
    nextStatuses[userId] = "pending";
  });

  const nextProposal: TeamProposal = {
    ...proposal,
    memberIds: nextMemberIds,
    memberStatuses: nextStatuses,
    roleAssignments: refill.roleAssignments,
    lockedAcceptedMemberIds: acceptedMembers,
    slotsNeeded: Math.max(
      proposal.teamSize -
        (acceptedMembers.length + pendingMembers.length + refill.candidateIds.length),
      0,
    ),
    compatibilitySummary: buildProposalCompatibilitySummary(
      state,
      nextMemberIds,
      refill.roleAssignments,
    ),
    status: "refilling",
  };

  let next = ensureProjectMemberships(state, nextMemberIds, project, "proposed");
  next = replaceProposal(next, nextProposal);

  refill.candidateIds.forEach((userId) => {
    next = pushNotification(
      next,
      userId,
      "Team proposal invite",
      `You were invited to join a proposed team for ${project.name}. Review the roster and respond.`,
      `/student/proposals/${proposal.id}`,
      "PROPOSAL_INVITE",
    );
  });

  if (acceptedMembers.length) {
    next = notifyProposalMembers(
      next,
      acceptedMembers,
      "Proposal is refilling",
      `We’re refilling the open slot${proposal.teamSize - acceptedMembers.length === 1 ? "" : "s"} for ${project.name}.`,
      `/student/proposals/${proposal.id}`,
      "PROPOSAL_REFILLING",
    );
  }

  return syncProjectMembershipStatuses(next, project);
}

function reconcileProposal(state: AppState, proposalId: string): AppState {
  const proposal = getProposalById(state, proposalId);
  if (!proposal || !isProposalActive(proposal)) {
    return state;
  }

  const project = state.projects.find((entry) => entry.id === proposal.projectId);
  if (!project) {
    return state;
  }

  if (new Date().getTime() > new Date(proposal.expiresAt).getTime()) {
    return expireProposal(state, proposal, project);
  }

  const activeMemberIds = getCurrentProposalMemberIds(proposal);
  const acceptedMembers = activeMemberIds.filter(
    (userId) => proposal.memberStatuses[userId] === "accepted",
  );
  if (acceptedMembers.length >= proposal.teamSize) {
    return confirmProposalTeam(state, proposal, project);
  }

  const pendingMembers = getPendingProposalMemberIds(proposal);
  const slotsNeeded = Math.max(proposal.teamSize - (acceptedMembers.length + pendingMembers.length), 0);

  if (slotsNeeded > 0 || proposal.status === "refilling") {
    return refillProposal(state, proposal, project);
  }

  return syncProjectMembershipStatuses(replaceProposal(state, {
    ...proposal,
    memberIds: activeMemberIds,
    lockedAcceptedMemberIds: acceptedMembers,
    slotsNeeded: 0,
    compatibilitySummary: buildProposalCompatibilitySummary(
      state,
      activeMemberIds,
      proposal.roleAssignments,
    ),
    status: "pending",
  }), project);
}

function expireActiveProposals(state: AppState): AppState {
  return state.teamProposals.reduce((next, proposal) => {
    if (
      !isProposalActive(proposal) ||
      new Date().getTime() <= new Date(proposal.expiresAt).getTime()
    ) {
      return next;
    }

    const project = next.projects.find((entry) => entry.id === proposal.projectId);
    return expireProposal(next, proposal, project);
  }, state);
}

function attachMembersToProject(
  state: AppState,
  memberIds: string[],
  project: ProjectRecord,
  teamId: string,
): AppState {
  let next = ensureProjectMemberships(state, memberIds, project, "confirmed");
  next = {
    ...next,
    memberships: next.memberships.map((membership) =>
      memberIds.includes(membership.userId) &&
      membership.projectId === project.id &&
      membership.status === "active"
        ? {
            ...membership,
            classId: project.classId,
            teamId,
            confirmedTeamId: teamId,
            matchingStatus: "confirmed",
          }
        : membership,
    ),
  };

  return syncProjectMembershipStatuses(next, project);
}

function ensureProjectMemberships(
  state: AppState,
  memberIds: string[],
  project: ProjectRecord,
  matchingStatus: Membership["matchingStatus"] = "unmatched",
): AppState {
  let changed = false;
  const now = new Date().toISOString();
  const memberships = [...state.memberships];

  memberIds.forEach((memberId) => {
    const removedMembership = memberships.find(
      (membership) =>
        membership.userId === memberId &&
        membership.projectId === project.id &&
        membership.status === "removed",
    );
    if (removedMembership) {
      return;
    }

    const existing = memberships.find(
      (membership) =>
        membership.userId === memberId &&
        membership.projectId === project.id &&
        membership.status === "active",
    );

    if (existing) {
      if (
        existing.matchingStatus !== matchingStatus &&
        !isMembershipConfirmed(existing)
      ) {
        const index = memberships.findIndex((membership) => membership.id === existing.id);
        memberships[index] = {
          ...existing,
          matchingStatus,
          teamId: matchingStatus === "confirmed" ? existing.teamId : undefined,
          confirmedTeamId:
            matchingStatus === "confirmed" ? existing.confirmedTeamId : undefined,
        };
        changed = true;
      }
      return;
    }

    memberships.unshift({
      id: createId("membership"),
      userId: memberId,
      classId: project.classId,
      projectId: project.id,
      status: "active",
      matchingStatus,
      joinedAt: now,
    });
    changed = true;
  });

  return changed ? { ...state, memberships } : state;
}

function syncProjectMembershipStatuses(state: AppState, project: ProjectRecord): AppState {
  const confirmedTeamByUserId = new Map<string, string>();
  state.teams
    .filter((team) => team.projectId === project.id)
    .forEach((team) => {
      team.memberIds.forEach((memberId) => confirmedTeamByUserId.set(memberId, team.id));
    });

  const proposedIds = new Set<string>();
  state.teamProposals
    .filter((proposal) => proposal.projectId === project.id && isProposalActive(proposal))
    .forEach((proposal) => {
      Object.entries(proposal.memberStatuses).forEach(([userId, status]) => {
        if (status !== "declined" && !confirmedTeamByUserId.has(userId)) {
          proposedIds.add(userId);
        }
      });
    });

  let next = ensureProjectMemberships(state, [...proposedIds], project, "proposed");
  next = {
    ...next,
    memberships: next.memberships.map((membership) => {
      if (membership.projectId !== project.id || membership.status !== "active") {
        return membership;
      }

      const confirmedTeamId = confirmedTeamByUserId.get(membership.userId);
      if (confirmedTeamId) {
        return {
          ...membership,
          teamId: confirmedTeamId,
          confirmedTeamId,
          matchingStatus: "confirmed",
        };
      }

      if (proposedIds.has(membership.userId)) {
        return {
          ...membership,
          teamId: undefined,
          confirmedTeamId: undefined,
          matchingStatus: "proposed",
        };
      }

      return {
        ...membership,
        teamId: undefined,
        confirmedTeamId: undefined,
        matchingStatus: "unmatched",
      };
    }),
  };

  return next;
}

function appendSystemTeamMessage(state: AppState, teamId: string, content: string): AppState {
  const message = {
    id: createId("message"),
    teamId,
    userId: "system",
    content,
    createdAt: new Date().toISOString(),
  };

  if (state.teamChat.some((bucket) => bucket.teamId === teamId)) {
    return {
      ...state,
      teamChat: state.teamChat.map((bucket) =>
        bucket.teamId === teamId
          ? { ...bucket, messages: [...bucket.messages, message] }
          : bucket,
      ),
    };
  }

  return {
    ...state,
    teamChat: [{ teamId, messages: [message] }, ...state.teamChat],
  };
}

function syncOverflowProjectState(
  state: AppState,
  project: ProjectRecord,
  patch: Partial<OverflowState> = {},
): AppState {
  const setting = getProjectSetting(state, project);
  const existing = getOverflowState(state, project);
  const overflowMemberIds = unique(
    state.teams
      .filter(
        (team) =>
          team.projectId === project.id &&
          team.isOverflowTeam &&
          typeof team.overflowMemberId === "string" &&
          team.overflowMemberId,
      )
      .map((team) => team.overflowMemberId as string),
  );

  const nextOverflow: OverflowState = {
    projectId: project.id,
    overflowTeamsAllowed: setting.overflowTeamsAllowed,
    overflowSlotsFilled: overflowMemberIds.length,
    overflowSlotsNeeded: Math.max(setting.overflowTeamsAllowed - overflowMemberIds.length, 0),
    overflowMemberIds,
    forcedOverflowMemberIds: unique([
      ...existing.forcedOverflowMemberIds,
      ...(patch.forcedOverflowMemberIds || []),
    ]).filter((userId) => overflowMemberIds.includes(userId)),
    deadlineFinalized:
      typeof patch.deadlineFinalized === "boolean"
        ? patch.deadlineFinalized
        : existing.deadlineFinalized,
  };

  return replaceOverflowState(state, nextOverflow);
}

function scoreOverflowCandidate(
  state: AppState,
  team: TeamRecord,
  candidate: { user: User; matching: MatchingProfile; joinedAt: string },
  requireAvailabilityOverlap: boolean,
): number | undefined {
  const teamProfiles = team.memberIds.map((memberId) => getMatchingProfile(state, memberId));
  const teamAvailability = unique(teamProfiles.flatMap((profile) => profile.availability));
  const availabilityScore = overlapCount(candidate.matching.availability, teamAvailability);

  if (
    requireAvailabilityOverlap &&
    teamAvailability.length &&
    candidate.matching.availability.length &&
    availabilityScore === 0
  ) {
    return undefined;
  }

  const teamRoles = new Set(Object.values(team.roles));
  const teamSkills = unique(teamProfiles.flatMap((profile) => profile.skills));
  const roleBonus = !teamRoles.has(candidate.matching.rolePreference)
    ? 6
    : candidate.matching.secondaryRole && !teamRoles.has(candidate.matching.secondaryRole)
      ? 4
      : 1;
  const goalBonus = teamProfiles.some((profile) => profile.goalLevel === candidate.matching.goalLevel)
    ? 3
    : 0;
  const styleBonus = teamProfiles.some(
    (profile) => profile.workingStyle === candidate.matching.workingStyle,
  )
    ? 2
    : 0;

  return (
    availabilityScore * 5 +
    roleBonus +
    goalBonus +
    styleBonus +
    overlapCount(candidate.matching.skills, teamSkills)
  );
}

function getOverflowCandidates(
  state: AppState,
  project: ProjectRecord,
  volunteerOnly: boolean,
): Array<{ user: User; matching: MatchingProfile; joinedAt: string }> {
  return state.users
    .filter((user) => {
      if (
        user.role !== "student" ||
        user.flags.matchingRestricted ||
        (volunteerOnly && !user.volunteer) ||
        isUserInConfirmedProjectTeam(state, user.id, project.id) ||
        isUserInActiveProposal(state, user.id, project.id)
      ) {
        return false;
      }

      return state.memberships.some(
        (membership) =>
          membership.userId === user.id &&
          membership.classId === project.classId &&
          membership.status === "active" &&
          (!membership.projectId || membership.projectId === project.id),
      );
    })
    .map((user) => {
      const candidateMemberships = state.memberships
        .filter(
          (membership) =>
            membership.userId === user.id &&
            membership.classId === project.classId &&
            membership.status === "active" &&
            (!membership.projectId || membership.projectId === project.id),
        )
        .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));

      return {
        user,
        matching: getMatchingProfile(state, user.id),
        joinedAt: candidateMemberships[0]?.joinedAt || user.createdAt,
      };
    });
}

function assignOverflowRole(
  project: ProjectRecord,
  team: TeamRecord,
  matching: MatchingProfile,
): ProjectRole {
  const occupied = new Set(Object.values(team.roles));
  const preferences = [matching.rolePreference, matching.secondaryRole].filter(
    (role): role is ProjectRole => Boolean(role),
  );

  return (
    preferences.find((role) => !occupied.has(role)) ||
    project.roleTemplates.find((role) => !occupied.has(role)) ||
    preferences[0] ||
    project.roleTemplates[0] ||
    "Analyst"
  );
}

function pickOverflowCandidateForTeam(
  state: AppState,
  team: TeamRecord,
  candidates: Array<{ user: User; matching: MatchingProfile; joinedAt: string }>,
  mode: "volunteer" | "forced",
): { user: User; matching: MatchingProfile; joinedAt: string } | undefined {
  const ranked = (requireAvailabilityOverlap: boolean) =>
    candidates
      .map((candidate) => ({
        candidate,
        score: scoreOverflowCandidate(state, team, candidate, requireAvailabilityOverlap),
      }))
      .filter(
        (
          entry,
        ): entry is {
          candidate: { user: User; matching: MatchingProfile; joinedAt: string };
          score: number;
        } => typeof entry.score === "number",
      )
      .sort((left, right) => {
        const leftPriority =
          mode === "volunteer"
            ? new Date(left.candidate.user.volunteerEnabledAt || left.candidate.joinedAt).getTime()
            : new Date(left.candidate.joinedAt).getTime();
        const rightPriority =
          mode === "volunteer"
            ? new Date(right.candidate.user.volunteerEnabledAt || right.candidate.joinedAt).getTime()
            : new Date(right.candidate.joinedAt).getTime();

        return (
          leftPriority - rightPriority ||
          right.score - left.score ||
          left.candidate.user.name.localeCompare(right.candidate.user.name)
        );
      });

  return ranked(true)[0]?.candidate || (mode === "forced" ? ranked(false)[0]?.candidate : undefined);
}

function applyOverflowPlacement(
  state: AppState,
  project: ProjectRecord,
  options: { deadlineMode?: boolean } = {},
): AppState {
  const setting = getProjectSetting(state, project);
  let next = syncProjectMembershipStatuses(state, project);

  if (setting.overflowTeamsAllowed <= 0) {
    return syncOverflowProjectState(next, project, {
      deadlineFinalized: options.deadlineMode ? true : getOverflowState(next, project).deadlineFinalized,
    });
  }

  const overflowTeamsFilled = next.teams.filter(
    (team) => team.projectId === project.id && team.isOverflowTeam && team.overflowMemberId,
  ).length;
  const openTeams = next.teams
    .filter(
      (team) =>
        team.projectId === project.id &&
        team.status === "active" &&
        !team.isOverflowTeam &&
        team.memberIds.length >= setting.teamSize &&
        team.memberIds.length < setting.teamSize + 1,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const slotsRemaining = Math.max(setting.overflowTeamsAllowed - overflowTeamsFilled, 0);
  if (!slotsRemaining || !openTeams.length) {
    return syncOverflowProjectState(next, project, {
      deadlineFinalized: options.deadlineMode ? true : getOverflowState(next, project).deadlineFinalized,
    });
  }

  let volunteerPool = getOverflowCandidates(next, project, true);
  let forcedPool = options.deadlineMode && setting.forceOverflowAtDeadline
    ? getOverflowCandidates(next, project, false).filter((candidate) => !candidate.user.volunteer)
    : [];
  const forcedOverflowMemberIds: string[] = [];

  openTeams.slice(0, slotsRemaining).forEach((team) => {
    const volunteerCandidate = pickOverflowCandidateForTeam(next, team, volunteerPool, "volunteer");
    const forcedCandidate =
      !volunteerCandidate && options.deadlineMode && setting.forceOverflowAtDeadline
        ? pickOverflowCandidateForTeam(next, team, forcedPool, "forced")
        : undefined;
    const picked = volunteerCandidate || forcedCandidate;

    if (!picked) {
      return;
    }

    const role = assignOverflowRole(project, team, picked.matching);
    const forced = Boolean(forcedCandidate);

    next = {
      ...next,
      teams: next.teams.map((entry) =>
        entry.id === team.id
          ? {
              ...entry,
              memberIds: [...entry.memberIds, picked.user.id],
              roles: {
                ...entry.roles,
                [picked.user.id]: role,
              },
              compatibilitySummary: [
                ...entry.compatibilitySummary,
                forced
                  ? `${picked.user.name}: added as an overflow member after the formation deadline.`
                  : `${picked.user.name}: added as a flex volunteer to balance class enrollment.`,
              ],
              maxSize: setting.teamSize + 1,
              isOverflowTeam: true,
              overflowMemberId: picked.user.id,
            }
          : entry,
      ),
    };
    next = attachMembersToProject(next, [picked.user.id], project, team.id);
    next = appendSystemTeamMessage(
      next,
      team.id,
      forced
        ? `${picked.user.name} was added as the overflow member due to the project deadline policy.`
        : `${picked.user.name} was added as the overflow member through Flex volunteer placement.`,
    );
    next = pushNotification(
      next,
      picked.user.id,
      forced ? "Overflow placement finalized" : "Overflow placement confirmed",
      forced
        ? `You were added to ${project.name} as the overflow member because the formation deadline passed.`
        : `You were added to ${project.name} as the flex overflow member.`,
      "/student/team",
    );

    if (forced) {
      forcedOverflowMemberIds.push(picked.user.id);
      forcedPool = forcedPool.filter((candidate) => candidate.user.id !== picked.user.id);
    } else {
      volunteerPool = volunteerPool.filter((candidate) => candidate.user.id !== picked.user.id);
      forcedPool = forcedPool.filter((candidate) => candidate.user.id !== picked.user.id);
    }
  });

  next = syncProjectMembershipStatuses(next, project);
  return syncOverflowProjectState(next, project, {
    forcedOverflowMemberIds,
    deadlineFinalized: options.deadlineMode ? true : getOverflowState(next, project).deadlineFinalized,
  });
}

function finalizeOverflowDeadlines(state: AppState): AppState {
  const now = Date.now();

  return state.projects.reduce((next, project) => {
    const setting = getProjectSetting(next, project);
    const overflow = getOverflowState(next, project);
    if (
      overflow.deadlineFinalized ||
      now < new Date(setting.formationDeadline).getTime()
    ) {
      return next;
    }

    return applyOverflowPlacement(next, project, { deadlineMode: true });
  }, state);
}

function buildStudentDefaults(user: User): UserProfile {
  return { ...user.profile };
}

function getMatchingProfile(state: AppState, userId: string): MatchingProfile {
  return (
    state.matchingProfiles.find((profile) => profile.userId === userId) ||
    buildDefaultMatchingProfile(userId)
  );
}

function upsertMatchingProfile(
  state: AppState,
  userId: string,
  patch: Partial<MatchingProfile>,
): AppState {
  const existing = getMatchingProfile(state, userId);
  const nextProfile: MatchingProfile = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...state,
    matchingProfiles: state.matchingProfiles.some((profile) => profile.userId === userId)
      ? state.matchingProfiles.map((profile) =>
          profile.userId === userId ? nextProfile : profile,
        )
      : [nextProfile, ...state.matchingProfiles],
  };
}

function getCurrentMembershipProjectIds(state: AppState, userId?: string): string[] {
  if (!userId) {
    return [];
  }

  return state.memberships
    .filter((membership) => membership.userId === userId && membership.status === "active")
    .map((membership) => membership.projectId)
    .filter((projectId): projectId is string => Boolean(projectId));
}

function resolveTargetContext(state: AppState, targetType: ReportFormInput["targetType"], targetId: string) {
  if (targetType === "message") {
    const bucket = state.teamChat.find((entry) =>
      entry.messages.some((message) => message.id === targetId),
    );
    const message = bucket?.messages.find((entry) => entry.id === targetId);
    return {
      userId: message?.userId,
      teamId: message?.teamId,
      messageSnippet: message?.content.slice(0, 120),
    };
  }

  if (targetType === "team") {
    return {
      teamId: targetId,
    };
  }

  if (targetType === "user" || targetType === "profile") {
    return {
      userId: targetId,
    };
  }

  return {};
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(() =>
    readActiveProjectId(),
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const commit = (updater: (previous: AppState) => AppState) => {
    setState((previous) => {
      const next = updater(previous);
      if (next !== previous) {
        persistState(next);
      }
      return next;
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      commit((previous) => expireActiveProposals(previous));
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    commit((previous) => finalizeOverflowDeadlines(previous));

    const timer = window.setInterval(() => {
      commit((previous) => finalizeOverflowDeadlines(previous));
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const resolveDebugUser = (liveState: AppState) => {
      const auth = liveState.auth;
      if (!auth) {
        return { ok: false as const, message: "Login first." };
      }

      const user = liveState.users.find((entry) => entry.id === auth.userId);
      if (!user) {
        return { ok: false as const, message: "The current user could not be resolved." };
      }

      return { ok: true as const, user };
    };

    const resolveDebugProject = (
      liveState: AppState,
      user: User | undefined,
      projectId?: string,
    ) => {
      const project =
        (projectId
          ? liveState.projects.find((entry) => entry.id === projectId)
          : user?.role === "student"
            ? resolveCurrentProject(liveState, user.id, activeProjectId)
            : liveState.projects[0]) || undefined;

      if (!project) {
        return { ok: false as const, message: "No project could be resolved for this debug command." };
      }

      return { ok: true as const, project };
    };

    const resolveDebugProposal = (
      liveState: AppState,
      user: User | undefined,
      proposalId?: string,
    ) => {
      const proposal =
        (proposalId
          ? getProposalById(liveState, proposalId)
          : user?.role === "student"
            ? liveState.teamProposals.find(
                (entry) =>
                  entry.projectId ===
                    resolveCurrentProject(liveState, user.id, activeProjectId)?.id &&
                  isProposalActive(entry),
              )
            : liveState.teamProposals.find((entry) => isProposalActive(entry))) || undefined;

      if (!proposal) {
        return { ok: false as const, message: "No matching proposal was found." };
      }

      return { ok: true as const, proposal };
    };

    window.gfDebug = {
      help: () => ({
        demoAccounts: "List all seeded student/admin emails and the shared demo password.",
        inspectSession: "Inspect the current logged-in account, active project, and active team.",
        inspectProject: "Inspect project settings, overflow state, teams, unmatched members, and proposals.",
        forceAiProposal:
          "Generate an AI suggestion from the current student's matching profile and immediately create a proposal.",
        acceptAllPendingProposal:
          "Mark every pending member on a proposal as accepted and confirm the team if possible.",
        declinePendingProposal:
          "Simulate one pending member declining a proposal so refill behavior can be demonstrated.",
        forceQueueMatch: "Resolve the current student's Lucky Draw queue session immediately.",
        inspectQueue: "Inspect the current student's queue session for the selected project.",
        finalizeOverflow:
          "Force overflow placement/finalization immediately for the resolved project.",
        setVolunteer:
          "Toggle Flex volunteer for the current logged-in student account.",
        resetDemoData:
          "Clear local demo state, reseed the app, and reset the active project selection.",
      }),
      demoAccounts: () => {
        const liveState = stateRef.current;
        return {
          password: DEMO_ACCOUNT_PASSWORD,
          students: liveState.users
            .filter((user) => user.role === "student")
            .map((user) => user.email)
            .sort((left, right) => left.localeCompare(right)),
          admins: liveState.users
            .filter((user) => user.role === "admin")
            .map((user) => user.email)
            .sort((left, right) => left.localeCompare(right)),
        };
      },
      inspectSession: () => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        if (!resolvedUser.ok) {
          return resolvedUser;
        }

        const project =
          resolvedUser.user.role === "student"
            ? resolveCurrentProject(liveState, resolvedUser.user.id, activeProjectId)
            : undefined;
        const team =
          resolvedUser.user.role === "student" && project
            ? resolveCurrentTeam(liveState, resolvedUser.user.id, project.id)
            : undefined;

        return {
          ok: true,
          role: resolvedUser.user.role,
          userId: resolvedUser.user.id,
          name: resolvedUser.user.name,
          email: resolvedUser.user.email,
          activeProjectId: project?.id,
          activeProjectName: project?.name,
          activeTeamId: team?.id,
          volunteer: resolvedUser.user.volunteer,
        };
      },
      inspectProject: (projectId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        const resolvedProject = resolveDebugProject(
          liveState,
          resolvedUser.ok ? resolvedUser.user : undefined,
          projectId,
        );
        if (!resolvedProject.ok) {
          return resolvedProject;
        }

        const project = resolvedProject.project;
        const setting = getProjectSetting(liveState, project);
        const overflow = getOverflowState(liveState, project);
        const memberships = liveState.memberships.filter(
          (membership) =>
            membership.projectId === project.id && membership.status === "active",
        );

        return {
          ok: true,
          projectId: project.id,
          projectName: project.name,
          joinCode: project.joinCode,
          teamSize: setting.teamSize,
          overflowTeamsAllowed: setting.overflowTeamsAllowed,
          formationDeadline: setting.formationDeadline,
          forceOverflowAtDeadline: setting.forceOverflowAtDeadline,
          overflow,
          confirmedTeams: liveState.teams.filter((team) => team.projectId === project.id).map((team) => ({
            id: team.id,
            members: team.memberIds,
            isOverflowTeam: team.isOverflowTeam,
            overflowMemberId: team.overflowMemberId,
          })),
          unmatchedMemberIds: unique(
            memberships
              .filter((membership) => membership.matchingStatus !== "confirmed")
              .map((membership) => membership.userId),
          ),
          proposals: liveState.teamProposals
            .filter((proposal) => proposal.projectId === project.id)
            .map((proposal) => ({
              id: proposal.id,
              status: proposal.status,
              memberIds: proposal.memberIds,
              slotsNeeded: proposal.slotsNeeded,
            })),
        };
      },
      forceAiProposal: (projectId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        if (!resolvedUser.ok) {
          return resolvedUser;
        }
        if (resolvedUser.user.role !== "student") {
          return { ok: false, message: "This debug command only works for student sessions." };
        }

        const resolvedProject = resolveDebugProject(liveState, resolvedUser.user, projectId);
        if (!resolvedProject.ok) {
          return resolvedProject;
        }

        const project = resolvedProject.project;
        if (isUserInConfirmedProjectTeam(liveState, resolvedUser.user.id, project.id)) {
          return { ok: false, message: "This student is already in a confirmed team for the project." };
        }

        const activeProposal = liveState.teamProposals.find(
          (proposal) =>
            proposal.projectId === project.id &&
            proposal.createdByUserId === resolvedUser.user.id &&
            isProposalActive(proposal),
        );
        if (activeProposal) {
          return {
            ok: true,
            message: "An active proposal already exists for this student and project.",
            proposalId: activeProposal.id,
          };
        }

        const matching = getMatchingProfile(liveState, resolvedUser.user.id);
        const answers: AiAnswers = {
          rolePreference: matching.rolePreference,
          skills: matching.skills,
          availability: matching.availability,
          goalLevel: matching.goalLevel,
          workingStyle: matching.workingStyle,
        };
        const suggestion = buildAiSuggestion(
          liveState,
          project,
          resolvedUser.user,
          answers,
          0,
        );

        if (!suggestion) {
          return { ok: false, message: "No eligible AI roster is available for this project." };
        }

        const setting = getProjectSetting(liveState, project);
        const proposalId = createId("proposal");
        const createdAt = new Date().toISOString();
        const memberIds = [...new Set([resolvedUser.user.id, ...suggestion.candidateIds])];
        const proposal: TeamProposal = {
          id: proposalId,
          projectId: project.id,
          createdByUserId: resolvedUser.user.id,
          createdAt,
          expiresAt: new Date(
            Date.now() + setting.proposalExpiryMinutes * 60 * 1000,
          ).toISOString(),
          teamSize: setting.teamSize,
          memberIds,
          memberStatuses: Object.fromEntries(
            memberIds.map((userId) => [userId, userId === resolvedUser.user.id ? "accepted" : "pending"]),
          ),
          roleAssignments: suggestion.roleAssignments,
          reasons: suggestion.reasons,
          compatibilitySummary: buildProposalCompatibilitySummary(
            liveState,
            memberIds,
            suggestion.roleAssignments,
          ),
          status: "pending",
          slotsNeeded: Math.max(setting.teamSize - memberIds.length, 0),
          lockedAcceptedMemberIds: [resolvedUser.user.id],
        };

        let next = upsertMatchingProfile(
          {
            ...liveState,
            aiSessions: [
              {
                id: createId("aisession"),
                userId: resolvedUser.user.id,
                projectId: project.id,
                answers,
                lastResult: suggestion,
                rematchCount: 0,
                history: [suggestion],
                updatedAt: createdAt,
              },
              ...liveState.aiSessions.filter(
                (session) =>
                  !(session.userId === resolvedUser.user.id && session.projectId === project.id),
              ),
            ],
            teamProposals: [proposal, ...liveState.teamProposals],
          },
          resolvedUser.user.id,
          answers,
        );
        next = ensureProjectMemberships(next, memberIds, project, "proposed");

        memberIds
          .filter((userId) => userId !== resolvedUser.user.id)
          .forEach((memberId) => {
            next = pushNotification(
              next,
              memberId,
              "Team proposal invite",
              `${resolvedUser.user.name} proposed a team for ${project.name}. Review the roster and respond.`,
              `/student/proposals/${proposalId}`,
              "PROPOSAL_INVITE",
            );
          });

        next = reconcileProposal(next, proposalId);
        commit(() => next);

        return {
          ok: true,
          message: `AI proposal created for ${project.name}.`,
          proposalId,
        };
      },
      acceptAllPendingProposal: (proposalId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        const resolvedProposal = resolveDebugProposal(
          liveState,
          resolvedUser.ok ? resolvedUser.user : undefined,
          proposalId,
        );
        if (!resolvedProposal.ok) {
          return resolvedProposal;
        }

        const pendingIds = Object.entries(resolvedProposal.proposal.memberStatuses)
          .filter(([, status]) => status === "pending")
          .map(([userId]) => userId);
        if (!pendingIds.length) {
          return {
            ok: true,
            message: "No pending members remain on this proposal.",
            proposalId: resolvedProposal.proposal.id,
            teamId: resolvedProposal.proposal.finalTeamId,
          };
        }

        const nextProposal: TeamProposal = {
          ...resolvedProposal.proposal,
          memberStatuses: {
            ...resolvedProposal.proposal.memberStatuses,
            ...Object.fromEntries(pendingIds.map((userId) => [userId, "accepted"])),
          },
          lockedAcceptedMemberIds: unique([
            ...resolvedProposal.proposal.lockedAcceptedMemberIds,
            ...pendingIds,
          ]),
          status: "pending",
        };

        let next = replaceProposal(liveState, nextProposal);
        next = reconcileProposal(next, resolvedProposal.proposal.id);
        const finalProposal = getProposalById(next, resolvedProposal.proposal.id);
        commit(() => next);

        return {
          ok: true,
          message: `Accepted ${pendingIds.length} pending member${pendingIds.length === 1 ? "" : "s"}.`,
          proposalId: resolvedProposal.proposal.id,
          teamId: finalProposal?.finalTeamId,
        };
      },
      declinePendingProposal: (proposalId, userId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        const resolvedProposal = resolveDebugProposal(
          liveState,
          resolvedUser.ok ? resolvedUser.user : undefined,
          proposalId,
        );
        if (!resolvedProposal.ok) {
          return resolvedProposal;
        }

        const project = liveState.projects.find(
          (entry) => entry.id === resolvedProposal.proposal.projectId,
        );
        if (!project) {
          return { ok: false, message: "Project not found for this proposal." };
        }

        const targetId =
          userId ||
          resolvedProposal.proposal.memberIds.find(
            (memberId) =>
              resolvedProposal.proposal.memberStatuses[memberId] === "pending",
          );
        if (!targetId || resolvedProposal.proposal.memberStatuses[targetId] !== "pending") {
          return { ok: false, message: "No pending proposal member could be declined." };
        }

        const targetUser = liveState.users.find((entry) => entry.id === targetId);
        const nextProposal: TeamProposal = {
          ...resolvedProposal.proposal,
          memberIds: resolvedProposal.proposal.memberIds.filter((memberId) => memberId !== targetId),
          memberStatuses: {
            ...resolvedProposal.proposal.memberStatuses,
            [targetId]: "declined",
          },
          lockedAcceptedMemberIds: resolvedProposal.proposal.lockedAcceptedMemberIds.filter(
            (memberId) => memberId !== targetId,
          ),
          status: "refilling",
        };

        let next = replaceProposal(liveState, nextProposal);
        const notifiedUserIds = unique([
          resolvedProposal.proposal.createdByUserId,
          ...nextProposal.lockedAcceptedMemberIds,
        ]).filter((memberId) => memberId !== targetId);

        next = notifyProposalMembers(
          next,
          notifiedUserIds,
          "Proposal declined",
          `${targetUser?.name || "A pending member"} declined the team proposal for ${project.name}. We’ll refill the missing slot.`,
          `/student/proposals/${resolvedProposal.proposal.id}`,
          "PROPOSAL_DECLINED",
        );
        next = reconcileProposal(next, resolvedProposal.proposal.id);
        commit(() => next);

        return {
          ok: true,
          message: `${targetUser?.name || targetId} was set to declined and refill logic ran.`,
          proposalId: resolvedProposal.proposal.id,
        };
      },
      forceQueueMatch: (projectId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        if (!resolvedUser.ok) {
          return resolvedUser;
        }
        if (resolvedUser.user.role !== "student") {
          return { ok: false, message: "This debug command only works for student sessions." };
        }

        const resolvedProject = resolveDebugProject(liveState, resolvedUser.user, projectId);
        if (!resolvedProject.ok) {
          return resolvedProject;
        }
        const project = resolvedProject.project;

        const queue = getOrCreateQueueSession(liveState, resolvedUser.user.id, project.id);
        if (!queue.primaryRole || !queue.constraints) {
          return { ok: false, message: "Complete the Lucky Draw role and constraint steps first." };
        }

        const result = buildQueueSuggestion(
          liveState,
          project,
          resolvedUser.user,
          queue.primaryRole,
          queue.secondaryRole,
          queue.constraints,
          queue.requeueCount,
        );
        if (!result) {
          return { ok: false, message: "No eligible queue roster is available for this project." };
        }

        commit((previous) => ({
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === queue.id)
            ? previous.queueSessions.map((item) =>
                item.id === queue.id
                  ? {
                      ...item,
                      lastMatch: result,
                      inQueue: false,
                      startedAt: undefined,
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              )
            : [
                {
                  ...queue,
                  lastMatch: result,
                  inQueue: false,
                  startedAt: undefined,
                  updatedAt: new Date().toISOString(),
                },
                ...previous.queueSessions,
              ],
        }));

        return {
          ok: true,
          message: `Queue match forced for ${project.name}. Open /student/match/queue/match to review it.`,
        };
      },
      inspectQueue: (projectId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        if (!resolvedUser.ok) {
          return resolvedUser;
        }
        if (resolvedUser.user.role !== "student") {
          return { ok: false, message: "This debug command only works for student sessions." };
        }

        const resolvedProject = resolveDebugProject(liveState, resolvedUser.user, projectId);
        if (!resolvedProject.ok) {
          return resolvedProject;
        }
        const project = resolvedProject.project;

        const queue = liveState.queueSessions.find(
          (session) => session.userId === resolvedUser.user.id && session.projectId === project.id,
        );

        return {
          ok: true,
          message: queue
            ? `Queue session found for ${project.name}.`
            : `No queue session exists yet for ${project.name}.`,
          queue,
        };
      },
      finalizeOverflow: (projectId) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        const resolvedProject = resolveDebugProject(
          liveState,
          resolvedUser.ok ? resolvedUser.user : undefined,
          projectId,
        );
        if (!resolvedProject.ok) {
          return resolvedProject;
        }

        const next = applyOverflowPlacement(liveState, resolvedProject.project, {
          deadlineMode: true,
        });
        const overflow = getOverflowState(next, resolvedProject.project);
        commit(() => next);

        return {
          ok: true,
          message: `Overflow finalization ran for ${resolvedProject.project.name}.`,
          overflow,
        };
      },
      setVolunteer: (enabled) => {
        const liveState = stateRef.current;
        const resolvedUser = resolveDebugUser(liveState);
        if (!resolvedUser.ok) {
          return resolvedUser;
        }
        if (resolvedUser.user.role !== "student") {
          return { ok: false, message: "This debug command only works for student sessions." };
        }

        let next: AppState = {
          ...liveState,
          users: liveState.users.map((user) =>
            user.id === resolvedUser.user.id
              ? {
                  ...user,
                  volunteer: enabled,
                  volunteerEnabledAt: enabled
                    ? user.volunteerEnabledAt || new Date().toISOString()
                    : undefined,
                }
              : user,
          ),
        };

        if (enabled) {
          resolveStudentProjects(next, resolvedUser.user.id).forEach((project) => {
            next = applyOverflowPlacement(next, project);
          });
        }

        commit(() => next);
        return {
          ok: true,
          message: `Flex volunteer is now ${enabled ? "enabled" : "disabled"} for ${resolvedUser.user.name}.`,
        };
      },
      resetDemoData: () => {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith("gf_"))
          .forEach((key) => window.localStorage.removeItem(key));
        window.sessionStorage.removeItem(ACTIVE_PROJECT_KEY);
        const resetState = loadState();
        stateRef.current = resetState;
        setState(resetState);
        setActiveProjectId(undefined);
        writeActiveProjectId(undefined);

        return {
          ok: true,
          message: "Demo data reset to the seeded default state.",
        };
      },
    };

    return () => {
      delete window.gfDebug;
    };
  }, [activeProjectId]);

  const currentUser = state.auth
    ? state.users.find((user) => user.id === state.auth?.userId)
    : undefined;
  const studentProjects =
    currentUser?.role === "student" ? resolveStudentProjects(state, currentUser.id) : [];
  const studentTeams =
    currentUser?.role === "student" ? resolveStudentTeams(state, currentUser.id) : [];
  const currentProject =
    currentUser?.role === "student"
      ? resolveCurrentProject(state, currentUser.id, activeProjectId)
      : undefined;
  const currentTeam =
    currentUser?.role === "student" && currentProject
      ? resolveCurrentTeam(state, currentUser.id, currentProject.id)
      : undefined;

  useEffect(() => {
    if (!currentUser || currentUser.role !== "student") {
      if (activeProjectId) {
        setActiveProjectId(undefined);
        writeActiveProjectId(undefined);
      }
      return;
    }

    const fallbackProjectId = studentProjects[0]?.id;
    const nextProjectId =
      activeProjectId && studentProjects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : fallbackProjectId;

    if (nextProjectId !== activeProjectId) {
      setActiveProjectId(nextProjectId);
    }
    writeActiveProjectId(nextProjectId);
  }, [activeProjectId, currentUser, studentProjects]);

  const value: AppContextValue = {
    state,
    activeProjectId,
    currentUser,
    currentProject,
    currentTeam,
    studentProjects,
    studentTeams,
    currentMembershipProjectIds: getCurrentMembershipProjectIds(state, currentUser?.id),
    setActiveProject(projectId) {
      setActiveProjectId(projectId);
      writeActiveProjectId(projectId);
    },
    login(email, password, role) {
      const normalized = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      if (!normalized) {
        return { ok: false, message: "Enter your university email." };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, message: "Enter a valid email address." };
      }
      if (!trimmedPassword) {
        return { ok: false, message: "Enter your password." };
      }

      const matchingUser = stateRef.current.users.find(
        (entry) => entry.email.toLowerCase() === normalized && entry.role === role,
      );
      const existingByEmail = stateRef.current.users.find(
        (entry) => entry.email.toLowerCase() === normalized,
      );
      if (!matchingUser && existingByEmail && existingByEmail.role !== role) {
        return {
          ok: false,
          message: `This email is registered as ${existingByEmail.role}. Switch the login role and try again.`,
        };
      }
      if (matchingUser && matchingUser.passwordHash !== hashPassword(trimmedPassword)) {
        return { ok: false, message: "Incorrect password." };
      }
      if (!matchingUser && !existingByEmail && !isPasswordStrong(trimmedPassword)) {
        return {
          ok: false,
          message: "Use at least 8 characters with uppercase, lowercase, and a number.",
        };
      }

      commit((previous) => {
        let user =
          previous.users.find(
            (entry) => entry.email.toLowerCase() === normalized && entry.role === role,
          ) || null;
        let nextUsers = previous.users;
        if (!user) {
          user = buildNewUser(normalized, role, trimmedPassword);
          nextUsers = [user, ...previous.users];
        } else if (!user.verified) {
          nextUsers = previous.users.map((entry) =>
            entry.id === user?.id ? { ...entry, verified: true } : entry,
          );
        }

        let nextState: AppState =
          nextUsers !== previous.users ? { ...previous, users: nextUsers } : previous;
        if (!nextState.matchingProfiles.some((profile) => profile.userId === user.id)) {
          nextState = upsertMatchingProfile(
            nextState,
            user.id,
            buildDefaultMatchingProfile(user.id),
          );
        }

        return {
          ...nextState,
          users: nextUsers,
          auth: {
            userId: user.id,
            role,
          },
        };
      });

      return {
        ok: true,
        message: matchingUser
          ? "Login successful."
          : "Verified account created and signed in.",
      };
    },
    logout() {
      setActiveProjectId(undefined);
      writeActiveProjectId(undefined);
      commit((previous) => ({ ...previous, auth: null }));
    },
    updateCurrentUser(payload) {
      if (!currentUser) {
        return;
      }

      commit((previous) => {
        const enablingVolunteer =
          currentUser.role === "student" && payload.volunteer === true && !currentUser.volunteer;

        let next: AppState = {
          ...previous,
          users: previous.users.map((user) =>
            user.id === currentUser.id
              ? {
                  ...user,
                  ...payload,
                  volunteer:
                    typeof payload.volunteer === "boolean" ? payload.volunteer : user.volunteer,
                  volunteerEnabledAt:
                    typeof payload.volunteer === "boolean"
                      ? payload.volunteer
                        ? user.volunteer
                          ? user.volunteerEnabledAt || new Date().toISOString()
                          : new Date().toISOString()
                        : undefined
                      : user.volunteerEnabledAt,
                  profile: {
                    ...user.profile,
                    ...payload.profile,
                  },
                }
              : user,
          ),
        };

        if (enablingVolunteer) {
          previous.projects
            .filter((project) =>
              previous.memberships.some(
                (membership) =>
                  membership.userId === currentUser.id &&
                  membership.projectId === project.id &&
                  membership.status === "active",
              ),
            )
            .forEach((project) => {
              next = applyOverflowPlacement(next, project);
            });
        }

        return next;
      });
    },
    joinProject(joinCode) {
      if (!currentUser || currentUser.role !== "student") {
        return { ok: false, message: "Only students can join projects." };
      }

      const code = joinCode.trim().toUpperCase();
      const project = state.projects.find((entry) => entry.joinCode.toUpperCase() === code);
      if (!project) {
        return { ok: false, message: "Join code not found." };
      }

      const existingMembership = state.memberships.find(
        (membership) =>
          membership.projectId === project.id &&
          membership.userId === currentUser.id &&
          membership.status === "active",
      );

      if (existingMembership) {
        return { ok: true, message: "Already joined." };
      }

      const removedMembership = state.memberships.find(
        (membership) =>
          membership.projectId === project.id &&
          membership.userId === currentUser.id &&
          membership.status === "removed",
      );

      if (removedMembership) {
        return {
          ok: false,
          message: "This account has been removed from the project by an instructor.",
        };
      }

      commit((previous) => {
        let next = {
          ...previous,
          memberships: [
            {
              id: createId("membership"),
              userId: currentUser.id,
              classId: project.classId,
              projectId: project.id,
              status: "active" as const,
              matchingStatus: "unmatched" as const,
              joinedAt: new Date().toISOString(),
            },
            ...previous.memberships,
          ],
        };

        next = pushNotification(
          next,
          currentUser.id,
          "Project joined",
          `You joined ${project.name} with code ${project.joinCode}.`,
          "/student/dashboard",
        );

        previous.users
          .filter((user) => user.role === "admin")
          .forEach((admin) => {
            next = pushNotification(
              next,
              admin.id,
              "New project member",
              `${currentUser.name} joined ${project.name}.`,
              "/admin/students",
            );
          });

        if (currentUser.volunteer) {
          next = applyOverflowPlacement(next, project);
        }

        return next;
      });

      setActiveProjectId(project.id);
      writeActiveProjectId(project.id);
      return { ok: true, message: "Joined successfully." };
    },
    createClass(payload) {
      if (!currentUser || currentUser.role !== "admin") {
        return;
      }

      commit((previous) => ({
        ...previous,
        classes: [
          {
            id: createId("class"),
            name: payload.name,
            code: payload.name
              .split(" ")
              .slice(0, 2)
              .join("")
              .toUpperCase(),
            term: payload.term,
            instructorIds: [currentUser.id],
            createdAt: new Date().toISOString(),
          },
          ...previous.classes,
        ],
      }));
    },
    createProject(classId, payload) {
      const project = createProjectRecord(classId, payload);
      const formationDeadline = toIsoDateTime(payload.formationDeadline, project.deadline);
      commit((previous) =>
        replaceOverflowState(
          {
            ...previous,
            projectSettings: [
              buildProjectSetting(
                project.id,
                project.teamSize,
                undefined,
                payload.overflowTeamsAllowed,
                formationDeadline,
                payload.forceOverflowAtDeadline,
              ),
              ...previous.projectSettings.filter((setting) => setting.projectId !== project.id),
            ],
            projects: [project, ...previous.projects],
          },
          {
            projectId: project.id,
            overflowTeamsAllowed: payload.overflowTeamsAllowed,
            overflowSlotsNeeded: Math.max(payload.overflowTeamsAllowed, 0),
            overflowSlotsFilled: 0,
            overflowMemberIds: [],
            forcedOverflowMemberIds: [],
            deadlineFinalized: false,
          },
        ),
      );
      return project;
    },
    updateProjectSettings(payload) {
      if (!currentUser || currentUser.role !== "admin") {
        return { ok: false, message: "Only admins can update project settings." };
      }

      const project = stateRef.current.projects.find((entry) => entry.id === payload.projectId);
      if (!project) {
        return { ok: false, message: "Project not found." };
      }

      const formationDeadline = toIsoDateTime(
        payload.formationDeadline,
        getProjectSetting(stateRef.current, project).formationDeadline,
      );

      commit((previous) => {
        let next: AppState = {
          ...previous,
          projectSettings: [
            buildProjectSetting(
              project.id,
              project.teamSize,
              getProjectSetting(previous, project).proposalExpiryMinutes,
              payload.overflowTeamsAllowed,
              formationDeadline,
              payload.forceOverflowAtDeadline,
            ),
            ...previous.projectSettings.filter((setting) => setting.projectId !== project.id),
          ],
        };

        next = syncOverflowProjectState(next, project, { deadlineFinalized: false });
        if (
          payload.forceOverflowAtDeadline &&
          Date.now() >= new Date(formationDeadline).getTime()
        ) {
          next = applyOverflowPlacement(next, project, { deadlineMode: true });
        }

        return next;
      });

      return { ok: true, message: "Project policy updated." };
    },
    adminCreateStudent(payload) {
      if (!currentUser || currentUser.role !== "admin") {
        return { ok: false, message: "Only admins can create students." };
      }

      const normalizedEmail = payload.email.trim().toLowerCase();
      if (!normalizedEmail) {
        return { ok: false, message: "Email is required." };
      }

      const duplicate = stateRef.current.users.find(
        (user) => user.email.toLowerCase() === normalizedEmail && user.role === "student",
      );
      if (duplicate) {
        return { ok: false, message: "A student with that email already exists." };
      }

      const baseUser = buildNewUser(normalizedEmail, "student");
      const nextUser: User = {
        ...baseUser,
        name: payload.name.trim() || baseUser.name,
        verified: payload.verified,
        profile: {
          ...buildStudentDefaults(baseUser),
          ...payload.profile,
          bio: payload.profile.bio ?? baseUser.profile.bio,
        },
      };

      commit((previous) =>
        upsertMatchingProfile(
          {
            ...previous,
            users: [nextUser, ...previous.users],
          },
          nextUser.id,
          buildDefaultMatchingProfile(nextUser.id),
        ),
      );

      return {
        ok: true,
        message: `Student created. Temporary password: ${DEMO_ACCOUNT_PASSWORD}`,
        userId: nextUser.id,
      };
    },
    adminUpdateStudent(userId, payload) {
      if (!currentUser || currentUser.role !== "admin") {
        return { ok: false, message: "Only admins can update students." };
      }

      const normalizedEmail = payload.email.trim().toLowerCase();
      if (!normalizedEmail) {
        return { ok: false, message: "Email is required." };
      }

      const duplicate = stateRef.current.users.find(
        (user) =>
          user.id !== userId &&
          user.email.toLowerCase() === normalizedEmail &&
          user.role === "student",
      );
      if (duplicate) {
        return { ok: false, message: "Another student already uses that email." };
      }

      const existing = stateRef.current.users.find(
        (user) => user.id === userId && user.role === "student",
      );
      if (!existing) {
        return { ok: false, message: "Student not found." };
      }

      commit((previous) => ({
        ...previous,
        users: previous.users.map((user) =>
          user.id === userId
            ? {
                ...user,
                name: payload.name.trim() || user.name,
                email: normalizedEmail,
                verified: payload.verified,
                profile: {
                  ...user.profile,
                  ...payload.profile,
                  bio: payload.profile.bio ?? user.profile.bio,
                },
              }
            : user,
        ),
      }));

      return { ok: true, message: "Student updated." };
    },
    adminAddStudentToClass(userId, classId) {
      if (!currentUser || currentUser.role !== "admin") {
        return { ok: false, message: "Only admins can manage class enrollment." };
      }

      const student = stateRef.current.users.find(
        (user) => user.id === userId && user.role === "student",
      );
      const classRecord = stateRef.current.classes.find((entry) => entry.id === classId);

      if (!student) {
        return { ok: false, message: "Student not found." };
      }
      if (!classRecord) {
        return { ok: false, message: "Class not found." };
      }

      const activeMembership = stateRef.current.memberships.find(
        (membership) =>
          membership.userId === userId &&
          membership.classId === classId &&
          membership.status === "active",
      );
      if (activeMembership) {
        return { ok: false, message: "Student is already active in that class." };
      }

      commit((previous) => {
        const removedMembership = previous.memberships.find(
          (membership) =>
            membership.userId === userId &&
            membership.classId === classId &&
            membership.status === "removed",
        );

        let next: AppState = {
          ...previous,
          memberships: removedMembership
            ? previous.memberships.map((membership) =>
                membership.id === removedMembership.id
                  ? {
                      ...membership,
                      status: "active",
                      matchingStatus: "unmatched",
                      teamId: undefined,
                      confirmedTeamId: undefined,
                      joinedAt: new Date().toISOString(),
                    }
                  : membership,
              )
            : [
                {
                  id: createId("membership"),
                  userId,
                  classId,
                  status: "active",
                  matchingStatus: "unmatched",
                  joinedAt: new Date().toISOString(),
                },
                ...previous.memberships,
              ],
        };

        next = pushNotification(
          next,
          userId,
          "Class membership added",
          `An instructor added you to ${classRecord.name}.`,
          "/student/dashboard",
        );

        return next;
      });

      return { ok: true, message: "Student added to class." };
    },
    adminRemoveStudentFromClass(userId, classId) {
      if (!currentUser || currentUser.role !== "admin") {
        return { ok: false, message: "Only admins can remove class memberships." };
      }

      const activeMemberships = stateRef.current.memberships.filter(
        (membership) =>
          membership.userId === userId &&
          membership.classId === classId &&
          membership.status === "active",
      );
      if (!activeMemberships.length) {
        return { ok: false, message: "Student is not currently active in that class." };
      }

      const affectedProjectIds = activeMemberships
        .map((membership) => membership.projectId)
        .filter((projectId): projectId is string => Boolean(projectId));
      const affectedTeamIds = activeMemberships
        .map((membership) => membership.teamId)
        .filter((teamId): teamId is string => Boolean(teamId));
      const classRecord = stateRef.current.classes.find((entry) => entry.id === classId);

      commit((previous) => {
        let next: AppState = {
          ...previous,
          memberships: previous.memberships.map((membership) =>
            membership.userId === userId &&
            membership.classId === classId &&
            membership.status === "active"
              ? {
                  ...membership,
                  status: "removed",
                  matchingStatus: "unmatched",
                  teamId: undefined,
                  confirmedTeamId: undefined,
                }
              : membership,
          ),
          teams: previous.teams.map((team) =>
            affectedTeamIds.includes(team.id)
              ? {
                  ...team,
                  memberIds: team.memberIds.filter((memberId) => memberId !== userId),
                  roles: Object.fromEntries(
                    Object.entries(team.roles).filter(([memberId]) => memberId !== userId),
                  ),
                  maxSize:
                    team.overflowMemberId === userId
                      ? Math.max(team.memberIds.length - 1, team.maxSize - 1)
                      : team.maxSize,
                  isOverflowTeam:
                    team.overflowMemberId === userId ? false : team.isOverflowTeam,
                  overflowMemberId:
                    team.overflowMemberId === userId ? undefined : team.overflowMemberId,
                  status: "paused",
                }
              : team,
          ),
          queueSessions: previous.queueSessions.map((session) =>
            session.userId === userId && affectedProjectIds.includes(session.projectId)
              ? {
                  ...session,
                  inQueue: false,
                  startedAt: undefined,
                  lastMatch: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        };

        next = pushNotification(
          next,
          userId,
          "Class membership removed",
          `An instructor removed you from ${classRecord?.name || "the class"}.`,
          "/student/notifications",
        );

        affectedProjectIds.forEach((projectId) => {
          const project = previous.projects.find((entry) => entry.id === projectId);
          if (project) {
            next = syncProjectMembershipStatuses(next, project);
            next = syncOverflowProjectState(next, project);
          }
        });

        return next;
      });

      return { ok: true, message: "Student removed from class." };
    },
    regenerateJoinCode(projectId) {
      commit((previous) => ({
        ...previous,
        projects: previous.projects.map((project) =>
          project.id === projectId
            ? { ...project, joinCode: generateJoinCode(project.name) }
            : project,
        ),
      }));
    },
    runAiMatch(answers) {
      if (!currentUser || !currentProject) {
        return undefined;
      }

      const result = buildAiSuggestion(stateRef.current, currentProject, currentUser, answers, 0);
      if (!result) {
        return undefined;
      }

      commit((previous) => {
        const existing = previous.aiSessions.find(
          (session) =>
            session.userId === currentUser.id && session.projectId === currentProject.id,
        );
        const session = {
          id: existing?.id || createId("aisession"),
          userId: currentUser.id,
          projectId: currentProject.id,
          answers,
          lastResult: result,
          rematchCount: 0,
          history: existing ? [result, ...existing.history] : [result],
          updatedAt: new Date().toISOString(),
        };

        return upsertMatchingProfile({
          ...previous,
          aiSessions: existing
            ? previous.aiSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.aiSessions],
        },
        currentUser.id,
        {
          rolePreference: answers.rolePreference,
          skills: answers.skills,
          availability: answers.availability,
          goalLevel: answers.goalLevel,
          workingStyle: answers.workingStyle,
        });
      });

      return result;
    },
    rematchAi() {
      if (!currentUser || !currentProject) {
        return undefined;
      }

      const existing = stateRef.current.aiSessions.find(
        (session) => session.userId === currentUser.id && session.projectId === currentProject.id,
      );
      if (!existing?.answers) {
        return undefined;
      }

      const nextRematch = existing.rematchCount + 1;
      const result = buildAiSuggestion(
        stateRef.current,
        currentProject,
        currentUser,
        existing.answers,
        nextRematch,
      );
      if (!result) {
        return undefined;
      }

      commit((previous) => ({
        ...previous,
        aiSessions: previous.aiSessions.map((session) =>
          session.id === existing.id
            ? {
                ...session,
                rematchCount: nextRematch,
                lastResult: result,
                history: [result, ...session.history],
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      }));

      return result;
    },
    proposeAiTeam() {
      if (!currentUser || !currentProject) {
        return { ok: false, message: "Join a project before proposing a team." };
      }

      const liveState = stateRef.current;
      const session = liveState.aiSessions.find(
        (entry) => entry.userId === currentUser.id && entry.projectId === currentProject.id,
      );
      if (!session?.lastResult) {
        return { ok: false, message: "Generate an AI match first." };
      }

      if (isUserInConfirmedProjectTeam(liveState, currentUser.id, currentProject.id)) {
        return { ok: false, message: "You are already in a confirmed team for this project." };
      }

      if (hasActiveProposalForUser(liveState, currentUser.id, currentProject.id)) {
        return { ok: false, message: "You already have an active proposal in this project." };
      }

      const memberIds = [...new Set([currentUser.id, ...session.lastResult.candidateIds])];
      const invalidCandidate = memberIds.find(
        (userId) =>
          userId !== currentUser.id &&
          (isUserInConfirmedProjectTeam(liveState, userId, currentProject.id) ||
            isUserInActiveProposal(liveState, userId, currentProject.id)),
      );
      if (invalidCandidate) {
        return {
          ok: false,
          message: "One of the suggested classmates already joined a confirmed team. Rematch and try again.",
        };
      }

      const setting = getProjectSetting(liveState, currentProject);
      const createdAt = new Date().toISOString();
      const proposalId = createId("proposal");
      const proposal: TeamProposal = {
        id: proposalId,
        projectId: currentProject.id,
        createdByUserId: currentUser.id,
        createdAt,
        expiresAt: new Date(
          Date.now() + setting.proposalExpiryMinutes * 60 * 1000,
        ).toISOString(),
        teamSize: setting.teamSize,
        memberIds,
        memberStatuses: Object.fromEntries(
          memberIds.map((userId) => [userId, userId === currentUser.id ? "accepted" : "pending"]),
        ),
        roleAssignments: session.lastResult.roleAssignments,
        reasons: session.lastResult.reasons,
        compatibilitySummary: buildProposalCompatibilitySummary(
          liveState,
          memberIds,
          session.lastResult.roleAssignments,
        ),
        status: "pending",
        slotsNeeded: Math.max(setting.teamSize - memberIds.length, 0),
        lockedAcceptedMemberIds: [currentUser.id],
      };

      let nextState = ensureProjectMemberships(
        {
          ...liveState,
          teamProposals: [proposal, ...liveState.teamProposals],
        },
        memberIds,
        currentProject,
        "proposed",
      );

      memberIds
        .filter((userId) => userId !== currentUser.id)
        .forEach((memberId) => {
          nextState = pushNotification(
            nextState,
            memberId,
            "Team proposal invite",
            `${currentUser.name} proposed a team for ${currentProject.name}. Review the roster and respond.`,
            `/student/proposals/${proposalId}`,
            "PROPOSAL_INVITE",
          );
        });

      nextState = reconcileProposal(nextState, proposalId);
      commit(() => nextState);

      return { ok: true, message: "Team proposal sent.", proposalId };
    },
    respondToProposal(proposalId, decision) {
      if (!currentUser) {
        return { ok: false, message: "You must be logged in to respond.", proposalId };
      }

      const liveState = expireActiveProposals(stateRef.current);
      const proposal = getProposalById(liveState, proposalId);
      if (!proposal) {
        return { ok: false, message: "Proposal not found.", proposalId };
      }

      if (!proposal.memberStatuses[currentUser.id] && proposal.createdByUserId !== currentUser.id) {
        return { ok: false, message: "This proposal is not assigned to your account.", proposalId };
      }

      if (!isProposalActive(proposal)) {
        return {
          ok: false,
          message:
            proposal.status === "confirmed"
              ? "This proposal is already confirmed."
              : "This proposal is no longer active.",
          proposalId,
          teamId: proposal.finalTeamId,
        };
      }

      if (new Date().getTime() > new Date(proposal.expiresAt).getTime()) {
        const expiredState = expireProposal(
          liveState,
          proposal,
          liveState.projects.find((entry) => entry.id === proposal.projectId),
        );
        commit(() => expiredState);
        return { ok: false, message: "This proposal expired before you responded.", proposalId };
      }

      const project = liveState.projects.find((entry) => entry.id === proposal.projectId);
      if (!project) {
        return { ok: false, message: "Project not found.", proposalId };
      }

      if (decision === "accepted" && isUserInConfirmedProjectTeam(liveState, currentUser.id, project.id)) {
        return { ok: false, message: "You are already in a confirmed team for this project.", proposalId };
      }

      if (proposal.memberStatuses[currentUser.id] === decision) {
        return {
          ok: true,
          message: decision === "accepted" ? "Already accepted." : "Already declined.",
          proposalId,
          teamId: proposal.finalTeamId,
        };
      }

      const nextProposal: TeamProposal = {
        ...proposal,
        memberIds:
          decision === "declined"
            ? proposal.memberIds.filter((userId) => userId !== currentUser.id)
            : proposal.memberIds,
        memberStatuses: {
          ...proposal.memberStatuses,
          [currentUser.id]: decision,
        },
        lockedAcceptedMemberIds:
          decision === "accepted"
            ? [...new Set([...proposal.lockedAcceptedMemberIds, currentUser.id])]
            : proposal.lockedAcceptedMemberIds.filter((userId) => userId !== currentUser.id),
        status: decision === "declined" ? "refilling" : proposal.status,
      };

      let nextState = replaceProposal(liveState, nextProposal);
      const notifiedUserIds = [...new Set([proposal.createdByUserId, ...nextProposal.lockedAcceptedMemberIds])].filter(
        (userId) => userId !== currentUser.id,
      );

      if (decision === "accepted") {
        nextState = notifyProposalMembers(
          nextState,
          notifiedUserIds,
          "Proposal accepted",
          `${currentUser.name} accepted the team proposal for ${project.name}.`,
          `/student/proposals/${proposalId}`,
          "PROPOSAL_ACCEPTED",
        );
      } else {
        nextState = notifyProposalMembers(
          nextState,
          notifiedUserIds,
          "Proposal declined",
          `${currentUser.name} declined the team proposal for ${project.name}. We’ll refill the missing slot.`,
          `/student/proposals/${proposalId}`,
          "PROPOSAL_DECLINED",
        );
      }

      nextState = reconcileProposal(nextState, proposalId);
      const finalProposal = getProposalById(nextState, proposalId);
      commit(() => nextState);

      return {
        ok: true,
        message:
          decision === "accepted"
            ? finalProposal?.status === "confirmed"
              ? "Proposal confirmed."
              : "You accepted the proposal."
            : "You declined the proposal.",
        proposalId,
        teamId: finalProposal?.finalTeamId,
      };
    },
    saveQueueRoles(primaryRole, secondaryRole) {
      if (!currentUser || !currentProject) {
        return;
      }

      commit((previous) => {
        const existing = getOrCreateQueueSession(previous, currentUser.id, currentProject.id);
        const session = {
          ...existing,
          primaryRole,
          secondaryRole,
          updatedAt: new Date().toISOString(),
        };

        return upsertMatchingProfile({
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === existing.id)
            ? previous.queueSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.queueSessions],
        },
        currentUser.id,
        {
          rolePreference: primaryRole,
          secondaryRole,
        });
      });
    },
    saveQueueConstraints(constraints) {
      if (!currentUser || !currentProject) {
        return;
      }

      commit((previous) => {
        const existing = getOrCreateQueueSession(previous, currentUser.id, currentProject.id);
        const session = {
          ...existing,
          constraints,
          updatedAt: new Date().toISOString(),
        };

        return upsertMatchingProfile({
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === existing.id)
            ? previous.queueSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.queueSessions],
        },
        currentUser.id,
        {
          availability: constraints.availability,
          goalLevel: constraints.goalLevel,
          workingStyle: constraints.workingStyle,
        });
      });
    },
    enterQueue() {
      if (!currentUser || !currentProject) {
        return;
      }

      commit((previous) => {
        const existing = getOrCreateQueueSession(previous, currentUser.id, currentProject.id);
        const session = {
          ...existing,
          etaSeconds: 45,
          inQueue: true,
          startedAt: new Date().toISOString(),
          lastMatch: undefined,
          updatedAt: new Date().toISOString(),
        };

        return {
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === existing.id)
            ? previous.queueSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.queueSessions],
        };
      });
    },
    leaveQueue() {
      if (!currentUser || !currentProject) {
        return;
      }

      commit((previous) => ({
        ...previous,
        queueSessions: previous.queueSessions.map((session) =>
          session.userId === currentUser.id && session.projectId === currentProject.id
            ? {
                ...session,
                inQueue: false,
                lastMatch: undefined,
                etaSeconds: 45,
                startedAt: undefined,
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      }));
    },
    resolveQueueMatch() {
      if (!currentUser || !currentProject) {
        return undefined;
      }

      const session = getOrCreateQueueSession(stateRef.current, currentUser.id, currentProject.id);
      if (!session.primaryRole || !session.constraints) {
        return undefined;
      }

      const result = buildQueueSuggestion(
        stateRef.current,
        currentProject,
        currentUser,
        session.primaryRole,
        session.secondaryRole,
        session.constraints,
        session.requeueCount,
      );
      if (!result) {
        return undefined;
      }

      commit((previous) => ({
        ...previous,
        queueSessions: previous.queueSessions.map((item) =>
          item.id === session.id
            ? {
                ...item,
                lastMatch: result,
                inQueue: false,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      }));

      return result;
    },
    requeueQueueMatch() {
      if (!currentUser || !currentProject) {
        return;
      }

      commit((previous) => ({
        ...previous,
        queueSessions: previous.queueSessions.map((session) =>
          session.userId === currentUser.id && session.projectId === currentProject.id
            ? {
                ...session,
                requeueCount: session.requeueCount + 1,
                lastMatch: undefined,
                etaSeconds: 45,
                inQueue: true,
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      }));
    },
    acceptQueueMatch() {
      if (!currentUser || !currentProject) {
        return undefined;
      }

      const session = stateRef.current.queueSessions.find(
        (entry) => entry.userId === currentUser.id && entry.projectId === currentProject.id,
      );
      if (!session?.lastMatch) {
        return undefined;
      }

      const memberIds = [currentUser.id, ...session.lastMatch.candidateIds];
      const artifacts = buildTeamArtifacts(
        currentProject,
        "queue",
        memberIds,
        session.lastMatch.roleAssignments,
        session.lastMatch.compatibilitySummary,
      );

      commit((previous) => {
        let next = attachMembersToProject(
          {
            ...previous,
            teams: [artifacts.team, ...previous.teams],
            teamChat: [artifacts.chatBucket, ...previous.teamChat],
            teamTasks: [artifacts.taskBucket, ...previous.teamTasks],
          },
          memberIds,
          currentProject,
          artifacts.team.id,
        );

        memberIds.forEach((memberId) => {
          next = pushNotification(
            next,
            memberId,
            "Lucky Draw team confirmed",
            `Your queue match for ${currentProject.name} is now active.`,
            "/student/team",
          );
        });

        next = {
          ...next,
          queueSessions: next.queueSessions.map((entry) =>
            entry.userId === currentUser.id && entry.projectId === currentProject.id
              ? {
                  ...entry,
                  inQueue: false,
                  startedAt: undefined,
                  lastMatch: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : entry,
          ),
        };
        next = syncProjectMembershipStatuses(next, currentProject);
        next = applyOverflowPlacement(next, currentProject);

        return next;
      });

      return artifacts.team.id;
    },
    sendTeamMessage(content) {
      if (!currentUser || !currentTeam) {
        return { ok: false, message: "Join a team first." };
      }

      if (currentUser.flags.chatMuted) {
        return { ok: false, message: "Chat is currently muted for this account." };
      }

      const message = content.trim();
      if (!message) {
        return { ok: false, message: "Message is empty." };
      }

      commit((previous) => ({
        ...previous,
        teamChat: previous.teamChat.map((bucket) =>
          bucket.teamId === currentTeam.id
            ? {
                ...bucket,
                messages: [
                  ...bucket.messages,
                  {
                    id: createId("message"),
                    teamId: currentTeam.id,
                    userId: currentUser.id,
                    content: message,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : bucket,
        ),
      }));

      return { ok: true };
    },
    toggleTask(taskId) {
      if (!currentTeam) {
        return;
      }

      commit((previous) => ({
        ...previous,
        teamTasks: previous.teamTasks.map((bucket) =>
          bucket.teamId === currentTeam.id
            ? {
                ...bucket,
                tasks: bucket.tasks.map((task) =>
                  task.id === taskId
                    ? { ...task, status: task.status === "done" ? "todo" : "done" }
                    : task,
                ),
              }
            : bucket,
        ),
      }));
    },
    addMeetingOption(startsAt) {
      if (!currentUser || !currentTeam) {
        return { ok: false, message: "Join a team first." };
      }

      const value = startsAt.trim();
      if (!value) {
        return { ok: false, message: "Choose a meeting time first." };
      }

      const existingOption = stateRef.current.teams
        .find((team) => team.id === currentTeam.id)
        ?.meetingOptions?.find((option) => option.startsAt === value);

      commit((previous) => ({
        ...previous,
        teams: previous.teams.map((team) => {
          if (team.id !== currentTeam.id) {
            return team;
          }

          const options = team.meetingOptions || [];
          if (existingOption) {
            return {
              ...team,
              meetingOptions: options.map((option) => {
                const withoutCurrentUser = option.voterIds.filter((userId) => userId !== currentUser.id);
                return option.id === existingOption.id
                  ? {
                      ...option,
                      voterIds: [...withoutCurrentUser, currentUser.id],
                    }
                  : {
                      ...option,
                      voterIds: withoutCurrentUser,
                    };
              }),
            };
          }

          return {
            ...team,
            meetingOptions: [
              ...options.map((option) => ({
                ...option,
                voterIds: option.voterIds.filter((userId) => userId !== currentUser.id),
              })),
              {
                id: createId("meeting"),
                startsAt: value,
                proposedBy: currentUser.id,
                voterIds: [currentUser.id],
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }),
      }));

      return {
        ok: true,
        message: existingOption
          ? "That time already existed, so your vote moved there."
          : "Meeting option added.",
      };
    },
    voteMeetingOption(optionId) {
      if (!currentUser || !currentTeam) {
        return;
      }

      commit((previous) => ({
        ...previous,
        teams: previous.teams.map((team) =>
          team.id === currentTeam.id
            ? {
                ...team,
                meetingOptions: (team.meetingOptions || []).map((option) => {
                  const withoutCurrentUser = option.voterIds.filter((userId) => userId !== currentUser.id);
                  return option.id === optionId
                    ? {
                        ...option,
                        voterIds: [...withoutCurrentUser, currentUser.id],
                      }
                    : {
                        ...option,
                        voterIds: withoutCurrentUser,
                      };
                }),
              }
            : team,
        ),
      }));
    },
    submitReport(payload) {
      if (!currentUser) {
        return { ok: false, message: "You must be logged in to submit a report." };
      }

      commit((previous) => {
        let next: AppState = {
          ...previous,
          reports: [
            {
              id: createId("report"),
              reporterId: currentUser.id,
              targetType: payload.targetType,
              targetId: payload.targetId,
              category: payload.category,
              severity: payload.severity,
              description: payload.description,
              evidence: payload.evidence,
              status: "New",
              createdAt: new Date().toISOString(),
              context: resolveTargetContext(previous, payload.targetType, payload.targetId),
              actionsLog: [],
            },
            ...previous.reports,
          ],
        };

        previous.users
          .filter((user) => user.role === "admin")
          .forEach((admin) => {
            next = pushNotification(
              next,
              admin.id,
              "New report submitted",
              `${currentUser.name} submitted a ${payload.category} report.`,
              "/admin/reports",
            );
          });

        next = pushNotification(
          next,
          currentUser.id,
          "Report received",
          "Your report has been logged and shared with the moderation team.",
          "/student/notifications",
        );

        return next;
      });

      return { ok: true, message: "Report submitted successfully." };
    },
    markNotificationRead(notificationId) {
      commit((previous) => ({
        ...previous,
        notifications: previous.notifications.map((notification) =>
          notification.id === notificationId ? { ...notification, read: true } : notification,
        ),
      }));
    },
    markAllNotificationsRead() {
      if (!currentUser) {
        return;
      }

      commit((previous) => ({
        ...previous,
        notifications: previous.notifications.map((notification) =>
          notification.userId === currentUser.id ? { ...notification, read: true } : notification,
        ),
      }));
    },
    adminActOnReport(reportId, action, note) {
      if (!currentUser || currentUser.role !== "admin") {
        return;
      }

      commit((previous) => {
        const report = previous.reports.find((entry) => entry.id === reportId);
        if (!report) {
          return previous;
        }

        const targetUserId =
          report.context?.userId ||
          (report.targetType === "user" || report.targetType === "profile"
            ? report.targetId
            : undefined);
        const targetTeamId = report.context?.teamId || (report.targetType === "team" ? report.targetId : undefined);

        let next: AppState = {
          ...previous,
          reports: previous.reports.map((entry) =>
            entry.id === reportId
              ? {
                  ...entry,
                  status: "Resolved",
                  actionsLog: [
                    {
                      id: createId("report-action"),
                      action,
                      adminId: currentUser.id,
                      note,
                      createdAt: new Date().toISOString(),
                    },
                    ...entry.actionsLog,
                  ],
                }
              : entry,
          ),
        };

        if (targetUserId) {
          next = {
            ...next,
            users: next.users.map((user) =>
              user.id === targetUserId
                ? {
                    ...user,
                    flags: {
                      ...user.flags,
                      warned: action === "warn" ? true : user.flags.warned,
                      chatMuted: action === "mute" ? true : user.flags.chatMuted,
                      matchingRestricted:
                        action === "restrict matching"
                          ? true
                          : user.flags.matchingRestricted,
                    },
                  }
                : user,
            ),
          };

          next = pushNotification(
            next,
            targetUserId,
            `Moderation update: ${action}`,
            `An instructor reviewed a report and applied "${action}" on ${formatDate(
              new Date().toISOString(),
            )}.`,
            "/student/notifications",
          );
        }

        if (action === "remove from project") {
          const affectedProjectId =
            targetTeamId
              ? next.teams.find((team) => team.id === targetTeamId)?.projectId
              : next.memberships.find(
                  (membership) =>
                    membership.userId === targetUserId && membership.status === "active",
                )?.projectId;

          if (targetUserId && affectedProjectId) {
            const affectedTeamId = next.memberships.find(
              (membership) =>
                membership.userId === targetUserId &&
                membership.projectId === affectedProjectId &&
                membership.status === "active",
            )?.teamId;

            next = {
              ...next,
              memberships: next.memberships.map((membership) =>
                membership.userId === targetUserId &&
                membership.projectId === affectedProjectId &&
                membership.status === "active"
                  ? { ...membership, status: "removed", teamId: undefined }
                  : membership,
              ),
              teams: next.teams.map((team) =>
                team.id === affectedTeamId
                  ? {
                      ...team,
                      memberIds: team.memberIds.filter((memberId) => memberId !== targetUserId),
                      status: "paused",
                    }
                  : team,
              ),
            };
          }
        }

        return next;
      });
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
