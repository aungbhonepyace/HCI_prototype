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
  buildQueueSuggestion,
  buildTeamArtifacts,
  resolveCurrentProject,
  resolveCurrentTeam,
} from "@/lib/matching";
import {
  buildNewUser,
  createProjectRecord,
  defaultProjectPayload,
  loadState,
  persistState,
} from "@/lib/storage";
import type {
  AiAnswers,
  AppState,
  AuthState,
  MatchSuggestion,
  ProjectRecord,
  ProjectRole,
  QueueConstraints,
  QueueSession,
  ReportFormInput,
  TeamRecord,
  User,
  UserProfile,
} from "@/lib/types";
import { createId, formatDate, generateJoinCode } from "@/lib/utils";

interface AppContextValue {
  state: AppState;
  currentUser?: User;
  currentProject?: ProjectRecord;
  currentTeam?: TeamRecord;
  currentMembershipProjectIds: string[];
  login: (email: string, role: AuthState["role"]) => void;
  logout: () => void;
  updateCurrentUser: (payload: Partial<User> & { profile?: Partial<UserProfile> }) => void;
  joinProject: (joinCode: string) => { ok: boolean; message: string };
  createClass: (payload: { name: string; term: string }) => void;
  createProject: (
    classId: string,
    payload: ReturnType<typeof defaultProjectPayload>,
  ) => ProjectRecord;
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
  acceptAiMatch: () => string | undefined;
  saveQueueRoles: (primaryRole: ProjectRole, secondaryRole?: ProjectRole) => void;
  saveQueueConstraints: (constraints: QueueConstraints) => void;
  enterQueue: () => void;
  leaveQueue: () => void;
  resolveQueueMatch: () => MatchSuggestion | undefined;
  requeueQueueMatch: () => void;
  acceptQueueMatch: () => string | undefined;
  sendTeamMessage: (content: string) => { ok: boolean; message?: string };
  toggleTask: (taskId: string) => void;
  setMeetingTime: (meetingTime: string) => void;
  submitReport: (payload: ReportFormInput) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  adminActOnReport: (
    reportId: string,
    action: "warn" | "mute" | "restrict matching" | "remove from project",
    note: string,
  ) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function pushNotification(
  state: AppState,
  userId: string,
  title: string,
  body: string,
  link?: string,
): AppState {
  return {
    ...state,
    notifications: [
      {
        id: createId("notification"),
        userId,
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

function buildStudentDefaults(user: User): UserProfile {
  return {
    skills: user.profile.skills,
    availability: user.profile.availability,
    goalLevel: user.profile.goalLevel,
    workingStyle: user.profile.workingStyle,
    bio: user.profile.bio,
    rolePreference: user.profile.rolePreference,
    secondaryRole: user.profile.secondaryRole,
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
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const commit = (updater: (previous: AppState) => AppState) => {
    setState((previous) => {
      const next = updater(previous);
      persistState(next);
      return next;
    });
  };

  const currentUser = state.auth
    ? state.users.find((user) => user.id === state.auth?.userId)
    : undefined;
  const currentProject = currentUser ? resolveCurrentProject(state, currentUser.id) : undefined;
  const currentTeam = currentUser ? resolveCurrentTeam(state, currentUser.id) : undefined;

  const value: AppContextValue = {
    state,
    currentUser,
    currentProject,
    currentTeam,
    currentMembershipProjectIds: getCurrentMembershipProjectIds(state, currentUser?.id),
    login(email, role) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        return;
      }

      commit((previous) => {
        let user =
          previous.users.find(
            (entry) => entry.email.toLowerCase() === normalized && entry.role === role,
          ) || null;
        let nextUsers = previous.users;
        if (!user) {
          user = buildNewUser(normalized, role);
          nextUsers = [user, ...previous.users];
        } else if (!user.verified) {
          nextUsers = previous.users.map((entry) =>
            entry.id === user?.id ? { ...entry, verified: true } : entry,
          );
        }

        return {
          ...previous,
          users: nextUsers,
          auth: {
            userId: user.id,
            role,
          },
        };
      });
    },
    logout() {
      commit((previous) => ({ ...previous, auth: null }));
    },
    updateCurrentUser(payload) {
      if (!currentUser) {
        return;
      }

      commit((previous) => ({
        ...previous,
        users: previous.users.map((user) =>
          user.id === currentUser.id
            ? {
                ...user,
                ...payload,
                profile: {
                  ...user.profile,
                  ...payload.profile,
                },
              }
            : user,
        ),
      }));
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

        return next;
      });

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
      commit((previous) => ({
        ...previous,
        projects: [project, ...previous.projects],
      }));
      return project;
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
          skills: payload.profile.skills || baseUser.profile.skills,
          availability: payload.profile.availability || baseUser.profile.availability,
          bio: payload.profile.bio ?? baseUser.profile.bio,
          goalLevel: payload.profile.goalLevel || baseUser.profile.goalLevel,
          workingStyle: payload.profile.workingStyle || baseUser.profile.workingStyle,
          rolePreference: payload.profile.rolePreference || baseUser.profile.rolePreference,
          secondaryRole: payload.profile.secondaryRole,
        },
      };

      commit((previous) => ({
        ...previous,
        users: [nextUser, ...previous.users],
      }));

      return { ok: true, message: "Student created.", userId: nextUser.id };
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
                  skills: payload.profile.skills || user.profile.skills,
                  availability: payload.profile.availability || user.profile.availability,
                  bio: payload.profile.bio ?? user.profile.bio,
                  goalLevel: payload.profile.goalLevel || user.profile.goalLevel,
                  workingStyle: payload.profile.workingStyle || user.profile.workingStyle,
                  rolePreference: payload.profile.rolePreference || user.profile.rolePreference,
                  secondaryRole:
                    payload.profile.secondaryRole === undefined
                      ? user.profile.secondaryRole
                      : payload.profile.secondaryRole,
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
                      teamId: undefined,
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
              ? { ...membership, status: "removed", teamId: undefined }
              : membership,
          ),
          teams: previous.teams.map((team) =>
            affectedTeamIds.includes(team.id)
              ? {
                  ...team,
                  memberIds: team.memberIds.filter((memberId) => memberId !== userId),
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

        return {
          ...previous,
          aiSessions: existing
            ? previous.aiSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.aiSessions],
        };
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
    acceptAiMatch() {
      if (!currentUser || !currentProject) {
        return undefined;
      }

      const session = stateRef.current.aiSessions.find(
        (entry) => entry.userId === currentUser.id && entry.projectId === currentProject.id,
      );
      if (!session?.lastResult) {
        return undefined;
      }

      const memberIds = [currentUser.id, ...session.lastResult.candidateIds];
      const artifacts = buildTeamArtifacts(
        currentProject,
        "ai",
        memberIds,
        session.lastResult.roleAssignments,
        session.lastResult.compatibilitySummary,
      );

      commit((previous) => {
        let next: AppState = {
          ...previous,
          teams: [artifacts.team, ...previous.teams],
          teamChat: [artifacts.chatBucket, ...previous.teamChat],
          teamTasks: [artifacts.taskBucket, ...previous.teamTasks],
          memberships: previous.memberships.map((membership) =>
            memberIds.includes(membership.userId) && membership.projectId === currentProject.id
              ? { ...membership, teamId: artifacts.team.id }
              : membership,
          ),
        };

        memberIds.forEach((memberId) => {
          next = pushNotification(
            next,
            memberId,
            "AI team confirmed",
            `Your team is active in ${currentProject.name}.`,
            "/student/team",
          );
        });

        return next;
      });

      return artifacts.team.id;
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

        return {
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === existing.id)
            ? previous.queueSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.queueSessions],
        };
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

        return {
          ...previous,
          queueSessions: previous.queueSessions.some((item) => item.id === existing.id)
            ? previous.queueSessions.map((item) => (item.id === existing.id ? session : item))
            : [session, ...previous.queueSessions],
        };
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
        let next: AppState = {
          ...previous,
          teams: [artifacts.team, ...previous.teams],
          teamChat: [artifacts.chatBucket, ...previous.teamChat],
          teamTasks: [artifacts.taskBucket, ...previous.teamTasks],
          memberships: previous.memberships.map((membership) =>
            memberIds.includes(membership.userId) && membership.projectId === currentProject.id
              ? { ...membership, teamId: artifacts.team.id }
              : membership,
          ),
        };

        memberIds.forEach((memberId) => {
          next = pushNotification(
            next,
            memberId,
            "Lucky Draw team confirmed",
            `Your queue match for ${currentProject.name} is now active.`,
            "/student/team",
          );
        });

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
    setMeetingTime(meetingTime) {
      if (!currentTeam) {
        return;
      }

      commit((previous) => ({
        ...previous,
        teams: previous.teams.map((team) =>
          team.id === currentTeam.id ? { ...team, meetingTime } : team,
        ),
      }));
    },
    submitReport(payload) {
      if (!currentUser) {
        return;
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
