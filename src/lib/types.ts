export type AppRole = "student" | "admin";

export type AvailabilitySlot = "weekdays" | "weekends" | "evenings";

export type GoalLevel = "aiming-for-a" | "balanced" | "pass-focus";

export type WorkingStyle = "quiet" | "collab" | "async";

export type TargetType = "user" | "message" | "profile" | "team";

export type ReportCategory =
  | "harassment"
  | "inappropriate content"
  | "spam/misuse"
  | "other";

export type ReportSeverity = "low" | "medium" | "high";

export type ReportStatus = "New" | "Investigating" | "Resolved" | "Closed";

export type PresetProjectRole =
  | "Backend/SQL"
  | "UI/Design"
  | "Analyst"
  | "Writer/Presenter";

export type ProjectRole = string;

export type TeamStatus = "forming" | "active" | "paused";

export type MatchingMode = "ai" | "queue";

export interface AuthState {
  userId: string;
  role: AppRole;
}

export interface UserProfile {
  skills: string[];
  availability: AvailabilitySlot[];
  goalLevel: GoalLevel;
  workingStyle: WorkingStyle;
  bio: string;
  rolePreference: ProjectRole;
  secondaryRole?: ProjectRole;
}

export interface UserFlags {
  chatMuted?: boolean;
  matchingRestricted?: boolean;
  warned?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  verified: boolean;
  profile: UserProfile;
  flags: UserFlags;
  createdAt: string;
}

export interface ClassRecord {
  id: string;
  name: string;
  code: string;
  term: string;
  instructorIds: string[];
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  classId: string;
  name: string;
  description: string;
  roleTemplates: ProjectRole[];
  teamSize: number;
  deadline: string;
  joinCode: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  classId: string;
  projectId?: string;
  status: "active" | "removed";
  joinedAt: string;
  teamId?: string;
}

export interface AiAnswers {
  rolePreference: ProjectRole;
  skills: string[];
  availability: AvailabilitySlot[];
  goalLevel: GoalLevel;
  workingStyle: WorkingStyle;
}

export interface MatchSuggestion {
  candidateIds: string[];
  reasons: string[];
  compatibilitySummary: string[];
  roleAssignments: Record<string, ProjectRole>;
}

export interface AiSession {
  id: string;
  userId: string;
  projectId: string;
  answers?: AiAnswers;
  lastResult?: MatchSuggestion;
  rematchCount: number;
  history: MatchSuggestion[];
  updatedAt: string;
}

export interface QueueConstraints {
  availability: AvailabilitySlot[];
  goalLevel: GoalLevel;
  workingStyle: WorkingStyle;
  strictness: "must" | "prefer";
}

export interface QueueSession {
  id: string;
  userId: string;
  projectId: string;
  primaryRole?: ProjectRole;
  secondaryRole?: ProjectRole;
  constraints?: QueueConstraints;
  etaSeconds: number;
  inQueue: boolean;
  requeueCount: number;
  startedAt?: string;
  lastMatch?: MatchSuggestion;
  updatedAt: string;
}

export interface TeamRecord {
  id: string;
  classId: string;
  projectId: string;
  memberIds: string[];
  roles: Record<string, ProjectRole>;
  createdByMode: MatchingMode;
  status: TeamStatus;
  compatibilitySummary: string[];
  meetingTime?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface TeamChatBucket {
  teamId: string;
  messages: ChatMessage[];
}

export interface TeamTask {
  id: string;
  title: string;
  status: "todo" | "done";
}

export interface TeamTaskBucket {
  teamId: string;
  tasks: TeamTask[];
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ReportAction {
  id: string;
  action: "warn" | "mute" | "restrict matching" | "remove from project";
  adminId: string;
  note: string;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: TargetType;
  targetId: string;
  category: ReportCategory;
  severity: ReportSeverity;
  description: string;
  evidence?: string;
  status: ReportStatus;
  createdAt: string;
  context?: {
    messageSnippet?: string;
    teamId?: string;
    userId?: string;
  };
  actionsLog: ReportAction[];
}

export interface AppState {
  auth: AuthState | null;
  users: User[];
  classes: ClassRecord[];
  projects: ProjectRecord[];
  memberships: Membership[];
  aiSessions: AiSession[];
  queueSessions: QueueSession[];
  teams: TeamRecord[];
  teamChat: TeamChatBucket[];
  teamTasks: TeamTaskBucket[];
  notifications: NotificationRecord[];
  reports: ReportRecord[];
}

export interface ReportFormInput {
  targetType: TargetType;
  targetId: string;
  category: ReportCategory;
  severity: ReportSeverity;
  description: string;
  evidence?: string;
}
