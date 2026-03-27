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
  resolveStudentProjects,
  resolveStudentTeams,
  resolveCurrentTeam,
} from "@/lib/matching";
import {
  DEMO_ACCOUNT_PASSWORD,
  buildDefaultMatchingProfile,
  buildNewUser,
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
  MatchingProfile,
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
  submitReport: (payload: ReportFormInput) => { ok: boolean; message: string };
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  adminActOnReport: (
    reportId: string,
    action: "warn" | "mute" | "restrict matching" | "remove from project",
    note: string,
  ) => void;
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

function attachMembersToProject(
  state: AppState,
  memberIds: string[],
  project: ProjectRecord,
  teamId: string,
): AppState {
  const attached = new Set<string>();
  const updatedMemberships = state.memberships.map((membership) => {
    if (
      memberIds.includes(membership.userId) &&
      membership.projectId === project.id &&
      membership.status === "active"
    ) {
      attached.add(membership.userId);
      return { ...membership, classId: project.classId, teamId };
    }

    return membership;
  });

  const newMemberships = memberIds
    .filter((memberId) => !attached.has(memberId))
    .map((memberId) => ({
      id: createId("membership"),
      userId: memberId,
      classId: project.classId,
      projectId: project.id,
      status: "active" as const,
      joinedAt: new Date().toISOString(),
      teamId,
    }));

  return {
    ...state,
    memberships: [...newMemberships, ...updatedMemberships],
  };
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
      persistState(next);
      return next;
    });
  };

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
