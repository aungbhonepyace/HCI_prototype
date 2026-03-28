import type {
  AppState,
  AvailabilitySlot,
  ContactMethod,
  GoalLevel,
  Membership,
  MatchingProfile,
  MeetingPreference,
  NotificationRecord,
  NotificationType,
  OverflowState,
  ProjectSetting,
  ProjectRecord,
  ProjectRole,
  ResponseTime,
  TeamMeetingOption,
  TeamProposal,
  TeamRecord,
  User,
  UserProfile,
  WorkingStyle,
} from "@/lib/types";
import { createId, generateJoinCode, unique } from "@/lib/utils";

type StorageKey =
  | "gf_auth"
  | "gf_users"
  | "gf_matching_profile"
  | "gf_classes"
  | "gf_projects"
  | "gf_project_settings"
  | "gf_overflow_state"
  | "gf_memberships"
  | "gf_ai_sessions"
  | "gf_queue_sessions"
  | "gf_team_proposals"
  | "gf_teams"
  | "gf_team_chat"
  | "gf_team_tasks"
  | "gf_notifications"
  | "gf_reports";

const STORAGE_KEYS: StorageKey[] = [
  "gf_auth",
  "gf_users",
  "gf_matching_profile",
  "gf_classes",
  "gf_projects",
  "gf_project_settings",
  "gf_overflow_state",
  "gf_memberships",
  "gf_ai_sessions",
  "gf_queue_sessions",
  "gf_team_proposals",
  "gf_teams",
  "gf_team_chat",
  "gf_team_tasks",
  "gf_notifications",
  "gf_reports",
];

const SEED_VERSION_KEY = "gf_seed_version";
const SEED_VERSION = "2026-03-28-v6";
export const DEMO_ACCOUNT_PASSWORD = "GroupFinder123!";
const DEFAULT_PROPOSAL_EXPIRY_MINUTES = 30;

const CONTACT_METHODS: ContactMethod[] = ["Line", "Discord", "WhatsApp", "Email", "Other"];
const RESPONSE_TIMES: ResponseTime[] = ["<2h", "same day", "1-2 days"];
const MEETING_PREFERENCES: MeetingPreference[] = ["Online", "On campus", "Mixed"];
const GOAL_LEVELS: GoalLevel[] = ["aiming-for-a", "balanced", "pass-focus"];
const WORKING_STYLES: WorkingStyle[] = ["quiet", "collab", "async"];
const AVAILABILITY_VALUES: AvailabilitySlot[] = ["weekdays", "weekends", "evenings"];

const EMPTY_STATE: AppState = {
  auth: null,
  users: [],
  matchingProfiles: [],
  classes: [],
  projects: [],
  projectSettings: [],
  overflowState: [],
  memberships: [],
  aiSessions: [],
  queueSessions: [],
  teamProposals: [],
  teams: [],
  teamChat: [],
  teamTasks: [],
  notifications: [],
  reports: [],
};

type SeedUserEntry = {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  volunteer?: boolean;
  profile: UserProfile;
  matchingProfile: Omit<MatchingProfile, "userId" | "updatedAt">;
};

function readStorage<T>(key: StorageKey, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: StorageKey, value: T): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readSeedVersion(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SEED_VERSION_KEY);
}

function writeSeedVersion(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

function buildUserProfile(bio: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    bio,
    major: "",
    year: "",
    preferredContactMethod: "Email",
    responseTime: "same day",
    meetingPreference: "Mixed",
    timeZone: "Asia/Bangkok",
    notes: "",
    ...overrides,
  };
}

export function hashPassword(password: string): string {
  let hash = 5381;

  for (const char of password) {
    hash = (hash * 33) ^ char.charCodeAt(0);
  }

  return (hash >>> 0).toString(16);
}

export function validatePasswordStrength(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
  };
}

export function isPasswordStrong(password: string): boolean {
  const checks = validatePasswordStrength(password);
  return checks.minLength && checks.uppercase && checks.lowercase && checks.digit;
}

function normalizePasswordHash(passwordHash: unknown): string {
  return typeof passwordHash === "string" && passwordHash
    ? passwordHash
    : hashPassword(DEMO_ACCOUNT_PASSWORD);
}

function buildSeedEntries(): SeedUserEntry[] {
  return [
    {
      id: "admin_mina",
      name: "Dr. Mina Hart",
      email: "mina.hart@groupfinder.edu",
      role: "admin",
      profile: buildUserProfile("Leads the studio and reviews moderation actions across classes.", {
        major: "Human-Computer Interaction",
        year: "Faculty",
        preferredContactMethod: "Email",
        responseTime: "same day",
        meetingPreference: "Mixed",
        timeZone: "Asia/Bangkok",
        notes: "Prefers concise updates with clear action items.",
      }),
      matchingProfile: {
        rolePreference: "Analyst",
        secondaryRole: "Writer/Presenter",
        skills: ["Evaluation", "Facilitation", "Course Design"],
        availability: ["weekdays"],
        goalLevel: "balanced",
        workingStyle: "collab",
      },
    },
    {
      id: "admin_elijah",
      name: "Elijah Park",
      email: "elijah.park@groupfinder.edu",
      role: "admin",
      profile: buildUserProfile("TA account for roster ops, queue checks, and report triage.", {
        major: "Information Science",
        year: "Teaching Assistant",
        preferredContactMethod: "Discord",
        responseTime: "<2h",
        meetingPreference: "Online",
        timeZone: "Asia/Seoul",
        notes: "Available for quick follow-up during weekday afternoons.",
      }),
      matchingProfile: {
        rolePreference: "Backend/SQL",
        secondaryRole: "Analyst",
        skills: ["Coordination", "SQL", "QA"],
        availability: ["weekdays", "evenings"],
        goalLevel: "balanced",
        workingStyle: "async",
      },
    },
    {
      id: "student_priya",
      name: "Priya Nair",
      email: "priya.nair@groupfinder.edu",
      role: "student",
      volunteer: true,
      profile: buildUserProfile("Product-minded designer who likes clear sprint plans.", {
        major: "Human-Computer Interaction",
        year: "3rd Year",
        preferredContactMethod: "Discord",
        responseTime: "<2h",
        meetingPreference: "Mixed",
        timeZone: "Asia/Bangkok",
        notes: "Happy to lead early ideation and wireframing.",
      }),
      matchingProfile: {
        rolePreference: "UI/Design",
        secondaryRole: "Writer/Presenter",
        skills: ["Figma", "Design Systems", "Prototyping"],
        availability: ["weekdays", "evenings"],
        goalLevel: "aiming-for-a",
        workingStyle: "collab",
      },
    },
    {
      id: "student_lucas",
      name: "Lucas Reed",
      email: "lucas.reed@groupfinder.edu",
      role: "student",
      volunteer: true,
      profile: buildUserProfile("Builds quickly and documents decisions well.", {
        major: "Computer Science",
        year: "4th Year",
        preferredContactMethod: "Line",
        responseTime: "same day",
        meetingPreference: "Online",
        timeZone: "Asia/Bangkok",
        notes: "Prefers shipping a draft early, then iterating.",
      }),
      matchingProfile: {
        rolePreference: "Backend/SQL",
        secondaryRole: "Analyst",
        skills: ["React", "TypeScript", "SQL", "API Design"],
        availability: ["weekdays", "evenings"],
        goalLevel: "balanced",
        workingStyle: "async",
      },
    },
    {
      id: "student_zoe",
      name: "Zoe Martinez",
      email: "zoe.martinez@groupfinder.edu",
      role: "student",
      volunteer: true,
      profile: buildUserProfile("Enjoys framing the problem before diving into execution.", {
        major: "Psychology",
        year: "3rd Year",
        preferredContactMethod: "WhatsApp",
        responseTime: "1-2 days",
        meetingPreference: "Online",
        timeZone: "Asia/Bangkok",
        notes: "Prefers having agendas before meetings.",
      }),
      matchingProfile: {
        rolePreference: "Analyst",
        secondaryRole: "Writer/Presenter",
        skills: ["User Research", "Survey Design", "Data Analysis"],
        availability: ["weekends", "evenings"],
        goalLevel: "aiming-for-a",
        workingStyle: "quiet",
      },
    },
    {
      id: "student_marcus",
      name: "Marcus Chen",
      email: "marcus.chen@groupfinder.edu",
      role: "student",
      volunteer: true,
      profile: buildUserProfile("Comfortable leading meetings and polishing final narratives.", {
        major: "Communication Arts",
        year: "4th Year",
        preferredContactMethod: "Email",
        responseTime: "same day",
        meetingPreference: "On campus",
        timeZone: "Asia/Bangkok",
        notes: "Can take point on demos, scripts, and presentation flow.",
      }),
      matchingProfile: {
        rolePreference: "Writer/Presenter",
        secondaryRole: "UI/Design",
        skills: ["Writing", "Slide Design", "Facilitation"],
        availability: ["weekdays", "weekends"],
        goalLevel: "balanced",
        workingStyle: "collab",
      },
    },
    {
      id: "student_samira",
      name: "Samira Ali",
      email: "samira.ali@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Reliable builder who likes crisp requirements and smaller check-ins.", {
        major: "Information Systems",
        year: "2nd Year",
        preferredContactMethod: "Discord",
        responseTime: "<2h",
        meetingPreference: "Mixed",
        timeZone: "Asia/Bangkok",
        notes: "Prefers async updates between meetings.",
      }),
      matchingProfile: {
        rolePreference: "Backend/SQL",
        secondaryRole: "Backend/SQL",
        skills: ["Supabase", "SQL", "Testing"],
        availability: ["weekends", "evenings"],
        goalLevel: "pass-focus",
        workingStyle: "quiet",
      },
    },
    {
      id: "student_aisha",
      name: "Aisha Khan",
      email: "aisha.khan@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Strong on flows, storyboards, and keeping the team centered on the user.", {
        major: "Industrial Design",
        year: "3rd Year",
        preferredContactMethod: "WhatsApp",
        responseTime: "<2h",
        meetingPreference: "Mixed",
        timeZone: "Asia/Kuala_Lumpur",
        notes: "Longer meetings work best after 6 PM.",
      }),
      matchingProfile: {
        rolePreference: "UI/Design",
        secondaryRole: "Analyst",
        skills: ["Service Design", "Wireframing", "Journey Mapping"],
        availability: ["weekdays", "evenings"],
        goalLevel: "aiming-for-a",
        workingStyle: "collab",
      },
    },
    {
      id: "student_daniel",
      name: "Daniel Wu",
      email: "daniel.wu@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Practical engineer who likes stable scopes and measurable milestones.", {
        major: "Software Engineering",
        year: "4th Year",
        preferredContactMethod: "Discord",
        responseTime: "same day",
        meetingPreference: "Online",
        timeZone: "Asia/Singapore",
        notes: "Prefers sharing tickets and owners before each build session.",
      }),
      matchingProfile: {
        rolePreference: "Backend/SQL",
        secondaryRole: "Writer/Presenter",
        skills: ["Node.js", "SQL", "Testing", "Deployment"],
        availability: ["weekdays", "weekends"],
        goalLevel: "balanced",
        workingStyle: "async",
      },
    },
    {
      id: "student_nora",
      name: "Nora Patel",
      email: "nora.patel@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Research-heavy teammate who enjoys synthesis and evidence-backed decisions.", {
        major: "Sociology",
        year: "2nd Year",
        preferredContactMethod: "Line",
        responseTime: "1-2 days",
        meetingPreference: "Online",
        timeZone: "Asia/Bangkok",
        notes: "Appreciates written context before switching tasks.",
      }),
      matchingProfile: {
        rolePreference: "Analyst",
        secondaryRole: "UI/Design",
        skills: ["Interviews", "Affinity Mapping", "Thematic Analysis"],
        availability: ["weekends", "evenings"],
        goalLevel: "aiming-for-a",
        workingStyle: "quiet",
      },
    },
    {
      id: "student_ethan",
      name: "Ethan Brooks",
      email: "ethan.brooks@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Comfortable turning messy drafts into something the class can actually present.", {
        major: "Media Studies",
        year: "3rd Year",
        preferredContactMethod: "Email",
        responseTime: "same day",
        meetingPreference: "On campus",
        timeZone: "Asia/Bangkok",
        notes: "Happy to MC the presentation but prefers early rehearsal.",
      }),
      matchingProfile: {
        rolePreference: "Writer/Presenter",
        secondaryRole: "Analyst",
        skills: ["Public Speaking", "Editing", "Slide Design"],
        availability: ["weekdays", "evenings"],
        goalLevel: "balanced",
        workingStyle: "collab",
      },
    },
    {
      id: "student_mei",
      name: "Mei Lin",
      email: "mei.lin@groupfinder.edu",
      role: "student",
      profile: buildUserProfile("Front-end focused teammate who likes clean systems and predictable handoff points.", {
        major: "Interactive Media",
        year: "4th Year",
        preferredContactMethod: "Discord",
        responseTime: "<2h",
        meetingPreference: "Mixed",
        timeZone: "Asia/Taipei",
        notes: "Prefers prototypes and annotated UI before implementation starts.",
      }),
      matchingProfile: {
        rolePreference: "UI/Design",
        secondaryRole: "Backend/SQL",
        skills: ["Tailwind CSS", "React", "Component Systems"],
        availability: ["weekdays", "weekends"],
        goalLevel: "balanced",
        workingStyle: "async",
      },
    },
  ];
}

function buildSeedUsers(timestamp: string): { users: User[]; matchingProfiles: MatchingProfile[] } {
  const entries = buildSeedEntries();

  return {
    users: entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      passwordHash: hashPassword(DEMO_ACCOUNT_PASSWORD),
      role: entry.role,
      verified: true,
      profile: entry.profile,
      flags: {},
      volunteer: entry.volunteer ?? false,
      volunteerEnabledAt: entry.volunteer ? timestamp : undefined,
      createdAt: timestamp,
    })),
    matchingProfiles: entries.map((entry) => ({
      userId: entry.id,
      rolePreference: entry.matchingProfile.rolePreference,
      secondaryRole: entry.matchingProfile.secondaryRole,
      skills: entry.matchingProfile.skills,
      availability: entry.matchingProfile.availability,
      goalLevel: entry.matchingProfile.goalLevel,
      workingStyle: entry.matchingProfile.workingStyle,
      updatedAt: timestamp,
    })),
  };
}

function buildSeedProject(classId: string, timestamp: string): ProjectRecord {
  return {
    id: "project_mobility",
    classId,
    name: "Neighborhood Mobility Challenge",
    description:
      "Form interdisciplinary teams to design a campus mobility coordination tool for local neighborhoods.",
    roleTemplates: ["Backend/SQL", "UI/Design", "Analyst", "Writer/Presenter"],
    teamSize: 4,
    deadline: "2026-05-08T23:59:00.000Z",
    joinCode: "GF-MOBIL-7X3A",
    createdAt: timestamp,
  };
}

export function buildProjectSetting(
  projectId: string,
  teamSize: number = 4,
  proposalExpiryMinutes: number = DEFAULT_PROPOSAL_EXPIRY_MINUTES,
  overflowTeamsAllowed: number = 0,
  formationDeadline: string = new Date().toISOString(),
  forceOverflowAtDeadline: boolean = true,
): ProjectSetting {
  return {
    projectId,
    teamSize,
    proposalExpiryMinutes,
    overflowTeamsAllowed: Math.max(0, Math.round(overflowTeamsAllowed)),
    formationDeadline,
    forceOverflowAtDeadline,
  };
}

function buildOverflowStateEntry(
  projectId: string,
  overflowTeamsAllowed: number = 0,
  patch: Partial<OverflowState> = {},
): OverflowState {
  const overflowMemberIds = Array.isArray(patch.overflowMemberIds)
    ? unique(patch.overflowMemberIds.filter((value): value is string => typeof value === "string"))
    : [];

  return {
    projectId,
    overflowTeamsAllowed: Math.max(0, Math.round(overflowTeamsAllowed)),
    overflowSlotsFilled:
      typeof patch.overflowSlotsFilled === "number"
        ? Math.max(0, Math.round(patch.overflowSlotsFilled))
        : overflowMemberIds.length,
    overflowSlotsNeeded:
      typeof patch.overflowSlotsNeeded === "number"
        ? Math.max(0, Math.round(patch.overflowSlotsNeeded))
        : Math.max(0, Math.round(overflowTeamsAllowed) - overflowMemberIds.length),
    overflowMemberIds,
    forcedOverflowMemberIds: Array.isArray(patch.forcedOverflowMemberIds)
      ? unique(
          patch.forcedOverflowMemberIds.filter((value): value is string => typeof value === "string"),
        )
      : [],
    deadlineFinalized: Boolean(patch.deadlineFinalized),
  };
}

function buildSeedState(): AppState {
  const timestamp = new Date().toISOString();
  const classId = "class_hci401";
  const { users, matchingProfiles } = buildSeedUsers(timestamp);
  const project = buildSeedProject(classId, timestamp);
  const adminIds = users.filter((user) => user.role === "admin").map((user) => user.id);

  return {
    auth: null,
    users,
    matchingProfiles,
    classes: [
      {
        id: classId,
        name: "HCI 401 Team Formation Studio",
        code: "HCI401",
        term: "Spring 2026",
        instructorIds: adminIds,
        createdAt: timestamp,
      },
    ],
    projects: [project],
    projectSettings: [
      buildProjectSetting(project.id, project.teamSize, DEFAULT_PROPOSAL_EXPIRY_MINUTES, 2, project.deadline, true),
    ],
    overflowState: [buildOverflowStateEntry(project.id, 2)],
    memberships: users
      .filter((user) => user.role === "student")
      .map((user) => ({
        id: createId("membership"),
        userId: user.id,
        classId,
        projectId: project.id,
        status: "active" as const,
        matchingStatus: "unmatched" as const,
        joinedAt: timestamp,
      })),
    aiSessions: [],
    queueSessions: [],
    teamProposals: [],
    teams: [],
    teamChat: [],
    teamTasks: [],
    notifications: [
      ...adminIds.map((userId) => ({
        id: createId("notification"),
        userId,
        type: "GENERAL" as const,
        title: "Demo project seeded",
        body: "A starter class and project were created so you can jump straight into the prototype.",
        read: false,
        link: "/admin/classes/class_hci401/projects",
        createdAt: timestamp,
      })),
    ],
    reports: [],
  };
}

function normalizeUserProfile(profile: unknown): UserProfile {
  const source = typeof profile === "object" && profile ? (profile as Record<string, unknown>) : {};

  return {
    bio: typeof source.bio === "string" ? source.bio : "",
    major: typeof source.major === "string" ? source.major : "",
    year: typeof source.year === "string" ? source.year : "",
    preferredContactMethod: CONTACT_METHODS.includes(source.preferredContactMethod as ContactMethod)
      ? (source.preferredContactMethod as ContactMethod)
      : "Email",
    responseTime: RESPONSE_TIMES.includes(source.responseTime as ResponseTime)
      ? (source.responseTime as ResponseTime)
      : "same day",
    meetingPreference: MEETING_PREFERENCES.includes(source.meetingPreference as MeetingPreference)
      ? (source.meetingPreference as MeetingPreference)
      : "Mixed",
    timeZone:
      typeof source.timeZone === "string" && source.timeZone
        ? source.timeZone
        : "Asia/Bangkok",
    notes: typeof source.notes === "string" ? source.notes : "",
  };
}

function normalizeMatchingProfile(
  userId: string,
  existing: MatchingProfile | undefined,
  legacyProfile: unknown,
): MatchingProfile {
  const legacy =
    typeof legacyProfile === "object" && legacyProfile ? (legacyProfile as Record<string, unknown>) : {};

  return {
    userId,
    rolePreference:
      typeof existing?.rolePreference === "string"
        ? existing.rolePreference
        : typeof legacy.rolePreference === "string" && legacy.rolePreference
          ? legacy.rolePreference
          : "UI/Design",
    secondaryRole:
      typeof existing?.secondaryRole === "string"
        ? existing.secondaryRole
        : typeof legacy.secondaryRole === "string" && legacy.secondaryRole
          ? legacy.secondaryRole
          : undefined,
    skills:
      Array.isArray(existing?.skills)
        ? existing.skills
        : Array.isArray(legacy.skills)
          ? legacy.skills.filter((value): value is string => typeof value === "string")
          : [],
    availability:
      Array.isArray(existing?.availability)
        ? existing.availability
        : Array.isArray(legacy.availability)
          ? legacy.availability.filter((value): value is AvailabilitySlot =>
              typeof value === "string" && AVAILABILITY_VALUES.includes(value as AvailabilitySlot),
            )
          : [],
    goalLevel:
      existing?.goalLevel && GOAL_LEVELS.includes(existing.goalLevel)
        ? existing.goalLevel
        : typeof legacy.goalLevel === "string" && GOAL_LEVELS.includes(legacy.goalLevel as GoalLevel)
          ? (legacy.goalLevel as GoalLevel)
          : "balanced",
    workingStyle:
      existing?.workingStyle && WORKING_STYLES.includes(existing.workingStyle)
        ? existing.workingStyle
        : typeof legacy.workingStyle === "string" &&
            WORKING_STYLES.includes(legacy.workingStyle as WorkingStyle)
          ? (legacy.workingStyle as WorkingStyle)
          : "collab",
    updatedAt:
      typeof existing?.updatedAt === "string" && existing.updatedAt
        ? existing.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeNotificationType(type: unknown): NotificationType {
  switch (type) {
    case "PROPOSAL_INVITE":
    case "PROPOSAL_ACCEPTED":
    case "PROPOSAL_DECLINED":
    case "PROPOSAL_REFILLING":
    case "PROPOSAL_EXPIRED":
    case "TEAM_CONFIRMED":
      return type;
    default:
      return "GENERAL";
  }
}

function normalizeProjectSetting(
  setting: unknown,
  projects: ProjectRecord[],
): ProjectSetting | undefined {
  const source = typeof setting === "object" && setting ? (setting as Record<string, unknown>) : {};
  if (typeof source.projectId !== "string" || !source.projectId) {
    return undefined;
  }

  const project = projects.find((entry) => entry.id === source.projectId);
  const fallbackTeamSize = project?.teamSize || 4;

  return {
    projectId: source.projectId,
    teamSize:
      typeof source.teamSize === "number" && source.teamSize > 0
        ? Math.round(source.teamSize)
        : fallbackTeamSize,
    proposalExpiryMinutes:
      typeof source.proposalExpiryMinutes === "number" && source.proposalExpiryMinutes > 0
        ? Math.round(source.proposalExpiryMinutes)
        : DEFAULT_PROPOSAL_EXPIRY_MINUTES,
    overflowTeamsAllowed:
      typeof source.overflowTeamsAllowed === "number" && source.overflowTeamsAllowed >= 0
        ? Math.round(source.overflowTeamsAllowed)
        : 0,
    formationDeadline:
      typeof source.formationDeadline === "string" && source.formationDeadline
        ? source.formationDeadline
        : project?.deadline || new Date().toISOString(),
    forceOverflowAtDeadline:
      typeof source.forceOverflowAtDeadline === "boolean"
        ? source.forceOverflowAtDeadline
        : true,
  };
}

function normalizeNotification(notification: unknown): NotificationRecord | undefined {
  const source =
    typeof notification === "object" && notification
      ? (notification as Record<string, unknown>)
      : {};

  if (
    typeof source.id !== "string" ||
    typeof source.userId !== "string" ||
    typeof source.title !== "string" ||
    typeof source.body !== "string" ||
    typeof source.createdAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: source.id,
    userId: source.userId,
    type: normalizeNotificationType(source.type),
    title: source.title,
    body: source.body,
    link: typeof source.link === "string" ? source.link : undefined,
    read: Boolean(source.read),
    createdAt: source.createdAt,
  };
}

function normalizeMeetingOption(
  option: unknown,
  fallbackProposerId: string,
): TeamMeetingOption | undefined {
  const source = typeof option === "object" && option ? (option as Record<string, unknown>) : {};
  const startsAt = typeof source.startsAt === "string" ? source.startsAt : "";

  if (!startsAt) {
    return undefined;
  }

  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : createId("meeting"),
    startsAt,
    proposedBy:
      typeof source.proposedBy === "string" && source.proposedBy
        ? source.proposedBy
        : fallbackProposerId,
    voterIds: Array.isArray(source.voterIds)
      ? [...new Set(source.voterIds.filter((value): value is string => typeof value === "string"))]
      : [],
    createdAt:
      typeof source.createdAt === "string" && source.createdAt
        ? source.createdAt
        : new Date().toISOString(),
  };
}

function normalizeTeamRecord(team: unknown): TeamRecord | undefined {
  const source = typeof team === "object" && team ? (team as Record<string, unknown>) : {};
  const memberIds = Array.isArray(source.memberIds)
    ? source.memberIds.filter((value): value is string => typeof value === "string")
    : [];

  const roles =
    typeof source.roles === "object" && source.roles
      ? Object.fromEntries(
          Object.entries(source.roles as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string",
          ),
        )
      : {};

  const compatibilitySummary = Array.isArray(source.compatibilitySummary)
    ? source.compatibilitySummary.filter((value): value is string => typeof value === "string")
    : [];

  if (
    typeof source.id !== "string" ||
    typeof source.classId !== "string" ||
    typeof source.projectId !== "string" ||
    typeof source.createdByMode !== "string" ||
    typeof source.status !== "string" ||
    typeof source.createdAt !== "string"
  ) {
    return undefined;
  }

  const fallbackProposerId = memberIds[0] || "";
  const normalizedOptions = Array.isArray(source.meetingOptions)
    ? source.meetingOptions
        .map((option) => normalizeMeetingOption(option, fallbackProposerId))
        .filter((option): option is TeamMeetingOption => Boolean(option))
    : [];

  const legacyMeetingTime =
    typeof source.meetingTime === "string" && source.meetingTime ? source.meetingTime : undefined;

  const meetingOptions =
    normalizedOptions.length || !legacyMeetingTime
      ? normalizedOptions
      : [
          {
            id: createId("meeting"),
            startsAt: legacyMeetingTime,
            proposedBy: fallbackProposerId,
            voterIds: memberIds,
            createdAt: source.createdAt,
          },
        ];

  return {
    id: source.id,
    classId: source.classId,
    projectId: source.projectId,
    memberIds,
    roles,
    createdByMode: source.createdByMode === "queue" ? "queue" : "ai",
    createdFrom:
      source.createdFrom === "AI_PROPOSAL"
        ? "AI_PROPOSAL"
        : source.createdFrom === "QUEUE_MATCH"
          ? "QUEUE_MATCH"
          : source.createdByMode === "queue"
            ? "QUEUE_MATCH"
            : "AI_MATCH",
    status:
      source.status === "active" || source.status === "paused" || source.status === "forming"
        ? source.status
        : "active",
    compatibilitySummary,
    meetingOptions,
    maxSize:
      typeof source.maxSize === "number" && source.maxSize >= memberIds.length
        ? Math.round(source.maxSize)
        : memberIds.length,
    isOverflowTeam: Boolean(source.isOverflowTeam || source.overflowMemberId),
    overflowMemberId:
      typeof source.overflowMemberId === "string" && source.overflowMemberId
        ? source.overflowMemberId
        : undefined,
    createdAt: source.createdAt,
  };
}

function normalizeMembership(membership: unknown): Membership | undefined {
  const source =
    typeof membership === "object" && membership ? (membership as Record<string, unknown>) : {};

  if (
    typeof source.id !== "string" ||
    typeof source.userId !== "string" ||
    typeof source.classId !== "string" ||
    typeof source.joinedAt !== "string"
  ) {
    return undefined;
  }

  const confirmedTeamId =
    typeof source.confirmedTeamId === "string" && source.confirmedTeamId
      ? source.confirmedTeamId
      : typeof source.teamId === "string" && source.teamId
        ? source.teamId
        : undefined;
  const matchingStatus =
    source.matchingStatus === "proposed" || source.matchingStatus === "unmatched" || source.matchingStatus === "confirmed"
      ? source.matchingStatus
      : confirmedTeamId
        ? "confirmed"
        : "unmatched";

  return {
    id: source.id,
    userId: source.userId,
    classId: source.classId,
    projectId: typeof source.projectId === "string" ? source.projectId : undefined,
    status: source.status === "removed" ? "removed" : "active",
    matchingStatus,
    joinedAt: source.joinedAt,
    teamId: typeof source.teamId === "string" ? source.teamId : undefined,
    confirmedTeamId,
  };
}

function normalizeOverflowState(
  overflow: unknown,
  projectId: string,
  overflowTeamsAllowed: number,
  teams: TeamRecord[],
): OverflowState {
  const source =
    typeof overflow === "object" && overflow ? (overflow as Record<string, unknown>) : {};
  const overflowMemberIds = unique(
    teams
      .filter(
        (team) =>
          team.projectId === projectId &&
          team.isOverflowTeam &&
          typeof team.overflowMemberId === "string" &&
          team.overflowMemberId,
      )
      .map((team) => team.overflowMemberId as string),
  );

  return buildOverflowStateEntry(projectId, overflowTeamsAllowed, {
    overflowMemberIds,
    overflowSlotsFilled: overflowMemberIds.length,
    overflowSlotsNeeded: Math.max(0, overflowTeamsAllowed - overflowMemberIds.length),
    forcedOverflowMemberIds: Array.isArray(source.forcedOverflowMemberIds)
      ? source.forcedOverflowMemberIds.filter(
          (value): value is string => typeof value === "string" && overflowMemberIds.includes(value),
        )
      : [],
    deadlineFinalized: Boolean(source.deadlineFinalized),
  });
}

function normalizeProposalStatus(status: unknown): TeamProposal["status"] {
  switch (status) {
    case "pending":
    case "refilling":
    case "confirmed":
    case "expired":
    case "cancelled":
      return status;
    default:
      return "pending";
  }
}

function normalizeProposalMemberStatus(status: unknown): TeamProposal["memberStatuses"][string] {
  switch (status) {
    case "accepted":
    case "declined":
      return status;
    default:
      return "pending";
  }
}

function normalizeTeamProposal(proposal: unknown, projects: ProjectRecord[]): TeamProposal | undefined {
  const source = typeof proposal === "object" && proposal ? (proposal as Record<string, unknown>) : {};

  if (
    typeof source.id !== "string" ||
    typeof source.projectId !== "string" ||
    typeof source.createdByUserId !== "string" ||
    typeof source.createdAt !== "string" ||
    typeof source.expiresAt !== "string"
  ) {
    return undefined;
  }

  const memberIds = Array.isArray(source.memberIds)
    ? source.memberIds.filter((value): value is string => typeof value === "string")
    : [];
  const memberStatuses =
    typeof source.memberStatuses === "object" && source.memberStatuses
      ? Object.fromEntries(
          Object.entries(source.memberStatuses as Record<string, unknown>).map(([userId, status]) => [
            userId,
            normalizeProposalMemberStatus(status),
          ]),
        )
      : {};
  const roleAssignments =
    typeof source.roleAssignments === "object" && source.roleAssignments
      ? Object.fromEntries(
          Object.entries(source.roleAssignments as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string",
          ),
        )
      : {};
  const reasons = Array.isArray(source.reasons)
    ? source.reasons.filter((value): value is string => typeof value === "string")
    : [];
  const compatibilitySummary = Array.isArray(source.compatibilitySummary)
    ? source.compatibilitySummary.filter((value): value is string => typeof value === "string")
    : [];
  const lockedAcceptedMemberIds = Array.isArray(source.lockedAcceptedMemberIds)
    ? source.lockedAcceptedMemberIds.filter((value): value is string => typeof value === "string")
    : [];
  const project = projects.find((entry) => entry.id === source.projectId);

  return {
    id: source.id,
    projectId: source.projectId,
    createdByUserId: source.createdByUserId,
    createdAt: source.createdAt,
    expiresAt: source.expiresAt,
    teamSize:
      typeof source.teamSize === "number" && source.teamSize > 0
        ? Math.round(source.teamSize)
        : project?.teamSize || 4,
    memberIds,
    memberStatuses,
    roleAssignments,
    reasons,
    compatibilitySummary,
    status: normalizeProposalStatus(source.status),
    slotsNeeded:
      typeof source.slotsNeeded === "number" && source.slotsNeeded >= 0
        ? Math.round(source.slotsNeeded)
        : 0,
    lockedAcceptedMemberIds,
    finalTeamId: typeof source.finalTeamId === "string" ? source.finalTeamId : undefined,
  };
}

function preferExistingEnum<T extends string>(existing: T, fallbackValue: T, seedValue: T): T {
  return existing !== fallbackValue || seedValue === fallbackValue ? existing : seedValue;
}

function mergeSeedProfile(existingProfile: UserProfile | undefined, seedProfile: UserProfile): UserProfile {
  const existing = normalizeUserProfile(existingProfile);

  return {
    bio: existing.bio || seedProfile.bio,
    major: existing.major || seedProfile.major,
    year: existing.year || seedProfile.year,
    preferredContactMethod: preferExistingEnum(
      existing.preferredContactMethod,
      "Email",
      seedProfile.preferredContactMethod,
    ),
    responseTime: preferExistingEnum(existing.responseTime, "same day", seedProfile.responseTime),
    meetingPreference: preferExistingEnum(
      existing.meetingPreference,
      "Mixed",
      seedProfile.meetingPreference,
    ),
    timeZone:
      existing.timeZone !== "Asia/Bangkok" || seedProfile.timeZone === "Asia/Bangkok"
        ? existing.timeZone
        : seedProfile.timeZone,
    notes: existing.notes || seedProfile.notes,
  };
}

function mergeSeedMatchingProfile(
  userId: string,
  existingProfile: MatchingProfile | undefined,
  seedProfile: MatchingProfile,
): MatchingProfile {
  const existing = normalizeMatchingProfile(userId, existingProfile, {});

  return {
    userId,
    rolePreference: preferExistingEnum(existing.rolePreference, "UI/Design", seedProfile.rolePreference),
    secondaryRole: existing.secondaryRole || seedProfile.secondaryRole,
    skills: existing.skills.length ? existing.skills : seedProfile.skills,
    availability: existing.availability.length ? existing.availability : seedProfile.availability,
    goalLevel: preferExistingEnum(existing.goalLevel, "balanced", seedProfile.goalLevel),
    workingStyle: preferExistingEnum(existing.workingStyle, "collab", seedProfile.workingStyle),
    updatedAt: existing.updatedAt || seedProfile.updatedAt,
  };
}

function mergeSeedState(state: AppState): AppState {
  const seed = buildSeedState();
  const timestamp = new Date().toISOString();
  const usersById = new Map(state.users.map((user) => [user.id, user]));

  seed.users.forEach((seedUser) => {
    const existing = usersById.get(seedUser.id);
    usersById.set(seedUser.id, {
      ...(existing || seedUser),
      id: seedUser.id,
      name: seedUser.name,
      email: seedUser.email,
      passwordHash: seedUser.passwordHash,
      role: seedUser.role,
      verified: true,
      volunteer: existing?.volunteer ?? seedUser.volunteer ?? false,
      volunteerEnabledAt:
        existing?.volunteerEnabledAt ||
        (existing?.volunteer ?? seedUser.volunteer ? timestamp : undefined),
      profile: mergeSeedProfile(existing?.profile, seedUser.profile),
      flags: existing?.flags || seedUser.flags,
      createdAt: existing?.createdAt || seedUser.createdAt,
    });
  });

  const matchingById = new Map(state.matchingProfiles.map((profile) => [profile.userId, profile]));
  seed.matchingProfiles.forEach((seedProfile) => {
    matchingById.set(
      seedProfile.userId,
      mergeSeedMatchingProfile(seedProfile.userId, matchingById.get(seedProfile.userId), seedProfile),
    );
  });

  const classesById = new Map(state.classes.map((classRecord) => [classRecord.id, classRecord]));
  seed.classes.forEach((seedClass) => {
    const existing = classesById.get(seedClass.id);
    classesById.set(
      seedClass.id,
      existing
        ? {
            ...existing,
            instructorIds: [...new Set([...existing.instructorIds, ...seedClass.instructorIds])],
          }
        : seedClass,
    );
  });

  const projectsById = new Map(state.projects.map((project) => [project.id, project]));
  seed.projects.forEach((seedProject) => {
    if (!projectsById.has(seedProject.id)) {
      projectsById.set(seedProject.id, seedProject);
    }
  });

  const projectSettingsById = new Map(
    state.projectSettings.map((setting) => [setting.projectId, setting]),
  );
  seed.projectSettings.forEach((seedSetting) => {
    if (!projectSettingsById.has(seedSetting.projectId)) {
      projectSettingsById.set(seedSetting.projectId, seedSetting);
    }
  });

  const overflowStateByProjectId = new Map(
    state.overflowState.map((overflow) => [overflow.projectId, overflow]),
  );
  seed.overflowState.forEach((seedOverflow) => {
    if (!overflowStateByProjectId.has(seedOverflow.projectId)) {
      overflowStateByProjectId.set(seedOverflow.projectId, seedOverflow);
    }
  });

  const memberships = [...state.memberships];
  const seedProject = seed.projects[0];
  seed.users
    .filter((user) => user.role === "student")
    .forEach((user) => {
      const exists = memberships.some(
        (membership) =>
          membership.userId === user.id &&
          membership.classId === seedProject.classId &&
          membership.projectId === seedProject.id &&
          membership.status === "active",
      );

      if (!exists) {
        memberships.unshift({
          id: createId("membership"),
          userId: user.id,
          classId: seedProject.classId,
          projectId: seedProject.id,
          status: "active",
          matchingStatus: "unmatched",
          joinedAt: timestamp,
        });
      }
    });

  const notifications = [...state.notifications];
  seed.users
    .filter((user) => user.role === "admin")
    .forEach((admin) => {
      const exists = notifications.some(
        (notification) =>
          notification.userId === admin.id &&
          notification.title === "Demo project seeded" &&
          notification.link === "/admin/classes/class_hci401/projects",
      );

      if (!exists) {
        notifications.unshift({
          id: createId("notification"),
          userId: admin.id,
          type: "GENERAL",
          title: "Demo project seeded",
          body: "A starter class and project were created so you can jump straight into the prototype.",
          read: false,
          link: "/admin/classes/class_hci401/projects",
          createdAt: timestamp,
        });
      }
    });

  return {
    ...state,
    users: [...usersById.values()],
    matchingProfiles: [...matchingById.values()],
    classes: [...classesById.values()],
    projects: [...projectsById.values()],
    projectSettings: [...projectSettingsById.values()],
    overflowState: [...overflowStateByProjectId.values()],
    memberships,
    notifications,
  };
}

function migrateState(state: AppState): AppState {
  const existingProfiles = new Map(state.matchingProfiles.map((profile) => [profile.userId, profile]));
  const projects = state.projects;
  const projectSettings = [
    ...new Map(
      [
        ...projects.map((project) => buildProjectSetting(project.id, project.teamSize)),
        ...state.projectSettings
          .map((setting) => normalizeProjectSetting(setting, projects))
          .filter((setting): setting is ProjectSetting => Boolean(setting)),
      ].map((setting) => [setting.projectId, setting]),
    ).values(),
  ];
  const teams = state.teams
    .map((team) => normalizeTeamRecord(team))
    .filter((team): team is TeamRecord => Boolean(team));
  const overflowState = projects.map((project) => {
    const setting =
      projectSettings.find((entry) => entry.projectId === project.id) ||
      buildProjectSetting(project.id, project.teamSize, DEFAULT_PROPOSAL_EXPIRY_MINUTES, 0, project.deadline, true);
    const existing = state.overflowState.find((entry) => entry.projectId === project.id);
    return normalizeOverflowState(existing, project.id, setting.overflowTeamsAllowed, teams);
  });

  return {
    ...state,
    users: state.users.map((user) => ({
      ...user,
      passwordHash: normalizePasswordHash(user.passwordHash),
      volunteer: Boolean(user.volunteer),
      volunteerEnabledAt:
        typeof user.volunteerEnabledAt === "string" && user.volunteerEnabledAt
          ? user.volunteerEnabledAt
          : user.volunteer
            ? user.createdAt
            : undefined,
      profile: normalizeUserProfile(user.profile),
    })),
    memberships: state.memberships
      .map((membership) => normalizeMembership(membership))
      .filter((membership): membership is Membership => Boolean(membership)),
    matchingProfiles: state.users.map((user) =>
      normalizeMatchingProfile(user.id, existingProfiles.get(user.id), user.profile),
    ),
    projectSettings,
    overflowState,
    teamProposals: state.teamProposals
      .map((proposal) => normalizeTeamProposal(proposal, projects))
      .filter((proposal): proposal is TeamProposal => Boolean(proposal)),
    teams,
    notifications: state.notifications
      .map((notification) => normalizeNotification(notification))
      .filter((notification): notification is NotificationRecord => Boolean(notification)),
  };
}

export function ensureSeedData(): void {
  if (typeof window === "undefined") {
    return;
  }

  const hasUsers = window.localStorage.getItem("gf_users");
  if (!hasUsers) {
    const seed = buildSeedState();
    persistState(seed);
    writeSeedVersion();
    return;
  }

  STORAGE_KEYS.forEach((key) => {
    if (window.localStorage.getItem(key) !== null) {
      return;
    }

    const value = key === "gf_auth" ? null : (EMPTY_STATE[keyToStateKey(key)] as unknown);
    writeStorage(key, value);
  });
}

function keyToStateKey(key: StorageKey): keyof AppState {
  switch (key) {
    case "gf_auth":
      return "auth";
    case "gf_users":
      return "users";
    case "gf_matching_profile":
      return "matchingProfiles";
    case "gf_classes":
      return "classes";
    case "gf_projects":
      return "projects";
    case "gf_project_settings":
      return "projectSettings";
    case "gf_overflow_state":
      return "overflowState";
    case "gf_memberships":
      return "memberships";
    case "gf_ai_sessions":
      return "aiSessions";
    case "gf_queue_sessions":
      return "queueSessions";
    case "gf_team_proposals":
      return "teamProposals";
    case "gf_teams":
      return "teams";
    case "gf_team_chat":
      return "teamChat";
    case "gf_team_tasks":
      return "teamTasks";
    case "gf_notifications":
      return "notifications";
    case "gf_reports":
      return "reports";
  }
}

export function loadState(): AppState {
  ensureSeedData();

  const loaded: AppState = {
    auth: readStorage("gf_auth", null),
    users: readStorage("gf_users", []),
    matchingProfiles: readStorage("gf_matching_profile", []),
    classes: readStorage("gf_classes", []),
    projects: readStorage("gf_projects", []),
    projectSettings: readStorage("gf_project_settings", []),
    overflowState: readStorage("gf_overflow_state", []),
    memberships: readStorage("gf_memberships", []),
    aiSessions: readStorage("gf_ai_sessions", []),
    queueSessions: readStorage("gf_queue_sessions", []),
    teamProposals: readStorage("gf_team_proposals", []),
    teams: readStorage("gf_teams", []),
    teamChat: readStorage("gf_team_chat", []),
    teamTasks: readStorage("gf_team_tasks", []),
    notifications: readStorage("gf_notifications", []),
    reports: readStorage("gf_reports", []),
  };

  const migrated = migrateState(loaded);
  const seeded = readSeedVersion() === SEED_VERSION ? migrated : mergeSeedState(migrated);
  persistState(seeded);
  writeSeedVersion();
  return seeded;
}

export function persistState(state: AppState): void {
  writeStorage("gf_auth", state.auth);
  writeStorage("gf_users", state.users);
  writeStorage("gf_matching_profile", state.matchingProfiles);
  writeStorage("gf_classes", state.classes);
  writeStorage("gf_projects", state.projects);
  writeStorage("gf_project_settings", state.projectSettings);
  writeStorage("gf_overflow_state", state.overflowState);
  writeStorage("gf_memberships", state.memberships);
  writeStorage("gf_ai_sessions", state.aiSessions);
  writeStorage("gf_queue_sessions", state.queueSessions);
  writeStorage("gf_team_proposals", state.teamProposals);
  writeStorage("gf_teams", state.teams);
  writeStorage("gf_team_chat", state.teamChat);
  writeStorage("gf_team_tasks", state.teamTasks);
  writeStorage("gf_notifications", state.notifications);
  writeStorage("gf_reports", state.reports);
}

export function buildNewUser(
  email: string,
  role: "student" | "admin",
  password: string = DEMO_ACCOUNT_PASSWORD,
): User {
  const now = new Date().toISOString();
  const handle = email.split("@")[0] || `${role} demo`;
  const name = handle
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    id: createId(role),
    name: name || (role === "student" ? "New Student" : "New Admin"),
    email,
    passwordHash: hashPassword(password),
    role,
    verified: true,
    volunteer: false,
    profile: buildUserProfile(
      role === "admin"
        ? "Instructor or TA account created for demo access."
        : "Tell classmates how you like to work and how to contact you.",
      {
        preferredContactMethod: "Email",
        responseTime: "same day",
        meetingPreference: "Mixed",
        timeZone: "Asia/Bangkok",
      },
    ),
    flags: {},
    createdAt: now,
  };
}

export function buildDefaultMatchingProfile(
  userId: string,
  overrides: Partial<MatchingProfile> = {},
): MatchingProfile {
  return {
    userId,
    rolePreference: "UI/Design",
    secondaryRole: "Writer/Presenter",
    skills: ["Figma", "Writing"],
    availability: ["weekdays", "evenings"],
    goalLevel: "balanced",
    workingStyle: "collab",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function defaultProjectPayload() {
  return {
    name: "New Project",
    description: "Short project brief",
    teamSize: 4,
    deadline: "2026-05-20",
    overflowTeamsAllowed: 0,
    formationDeadline: "2026-05-20T18:00",
    forceOverflowAtDeadline: true,
    roleTemplates: ["Backend/SQL", "UI/Design", "Analyst", "Writer/Presenter"] as ProjectRole[],
  };
}

export function createProjectRecord(
  classId: string,
  payload: {
    name: string;
    description: string;
    teamSize: number;
    deadline: string;
    roleTemplates: ProjectRole[];
  },
): ProjectRecord {
  const now = new Date().toISOString();

  return {
    id: createId("project"),
    classId,
    name: payload.name,
    description: payload.description,
    teamSize: payload.teamSize,
    deadline: `${payload.deadline}T23:59:00.000Z`,
    roleTemplates: payload.roleTemplates,
    joinCode: generateJoinCode(payload.name),
    createdAt: now,
  };
}
