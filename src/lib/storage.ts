import type {
  AppState,
  AvailabilitySlot,
  GoalLevel,
  ProjectRecord,
  ProjectRole,
  User,
  UserProfile,
  WorkingStyle,
} from "@/lib/types";
import { createId, generateJoinCode } from "@/lib/utils";

type StorageKey =
  | "gf_auth"
  | "gf_users"
  | "gf_classes"
  | "gf_projects"
  | "gf_memberships"
  | "gf_ai_sessions"
  | "gf_queue_sessions"
  | "gf_teams"
  | "gf_team_chat"
  | "gf_team_tasks"
  | "gf_notifications"
  | "gf_reports";

const STORAGE_KEYS: StorageKey[] = [
  "gf_auth",
  "gf_users",
  "gf_classes",
  "gf_projects",
  "gf_memberships",
  "gf_ai_sessions",
  "gf_queue_sessions",
  "gf_teams",
  "gf_team_chat",
  "gf_team_tasks",
  "gf_notifications",
  "gf_reports",
];

const EMPTY_STATE: AppState = {
  auth: null,
  users: [],
  classes: [],
  projects: [],
  memberships: [],
  aiSessions: [],
  queueSessions: [],
  teams: [],
  teamChat: [],
  teamTasks: [],
  notifications: [],
  reports: [],
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

function buildProfile(
  rolePreference: ProjectRole,
  skills: string[],
  availability: AvailabilitySlot[],
  goalLevel: GoalLevel,
  workingStyle: WorkingStyle,
  bio: string,
  secondaryRole?: ProjectRole,
): UserProfile {
  return {
    skills,
    availability,
    goalLevel,
    workingStyle,
    bio,
    rolePreference,
    secondaryRole,
  };
}

function buildSeedUsers(timestamp: string): User[] {
  return [
    {
      id: "admin_mina",
      name: "Dr. Mina Hart",
      email: "mina.hart@groupfinder.edu",
      role: "admin",
      verified: true,
      profile: buildProfile(
        "Analyst",
        ["Evaluation", "Facilitation", "Course Design"],
        ["weekdays"],
        "balanced",
        "collab",
        "Teaches the course and reviews moderation actions.",
      ),
      flags: {},
      createdAt: timestamp,
    },
    {
      id: "student_priya",
      name: "Priya Nair",
      email: "priya.nair@groupfinder.edu",
      role: "student",
      verified: true,
      profile: buildProfile(
        "UI/Design",
        ["Figma", "Design Systems", "Prototyping"],
        ["weekdays", "evenings"],
        "aiming-for-a",
        "collab",
        "Product-minded designer who likes clear sprint plans.",
        "Writer/Presenter",
      ),
      flags: {},
      createdAt: timestamp,
    },
    {
      id: "student_lucas",
      name: "Lucas Reed",
      email: "lucas.reed@groupfinder.edu",
      role: "student",
      verified: true,
      profile: buildProfile(
        "Backend/SQL",
        ["React", "TypeScript", "SQL", "API Design"],
        ["weekdays", "evenings"],
        "balanced",
        "async",
        "Builds quickly and documents decisions well.",
        "Analyst",
      ),
      flags: {},
      createdAt: timestamp,
    },
    {
      id: "student_zoe",
      name: "Zoe Martinez",
      email: "zoe.martinez@groupfinder.edu",
      role: "student",
      verified: true,
      profile: buildProfile(
        "Analyst",
        ["User Research", "Survey Design", "Data Analysis"],
        ["weekends", "evenings"],
        "aiming-for-a",
        "quiet",
        "Enjoys framing the problem before diving into execution.",
        "Writer/Presenter",
      ),
      flags: {},
      createdAt: timestamp,
    },
    {
      id: "student_marcus",
      name: "Marcus Chen",
      email: "marcus.chen@groupfinder.edu",
      role: "student",
      verified: true,
      profile: buildProfile(
        "Writer/Presenter",
        ["Writing", "Slide Design", "Facilitation"],
        ["weekdays", "weekends"],
        "balanced",
        "collab",
        "Comfortable leading meetings and polishing final narratives.",
        "UI/Design",
      ),
      flags: {},
      createdAt: timestamp,
    },
    {
      id: "student_samira",
      name: "Samira Ali",
      email: "samira.ali@groupfinder.edu",
      role: "student",
      verified: true,
      profile: buildProfile(
        "Backend/SQL",
        ["Supabase", "SQL", "Testing"],
        ["weekends", "evenings"],
        "pass-focus",
        "quiet",
        "Reliable builder who likes crisp requirements and smaller check-ins.",
        "Backend/SQL",
      ),
      flags: {},
      createdAt: timestamp,
    },
  ];
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

function buildSeedState(): AppState {
  const timestamp = new Date().toISOString();
  const classId = "class_hci401";
  const users = buildSeedUsers(timestamp);
  const project = buildSeedProject(classId, timestamp);

  return {
    auth: null,
    users,
    classes: [
      {
        id: classId,
        name: "HCI 401 Team Formation Studio",
        code: "HCI401",
        term: "Spring 2026",
        instructorIds: ["admin_mina"],
        createdAt: timestamp,
      },
    ],
    projects: [project],
    memberships: users
      .filter((user) => user.role === "student")
      .map((user) => ({
        id: createId("membership"),
        userId: user.id,
        classId,
        projectId: project.id,
        status: "active" as const,
        joinedAt: timestamp,
      })),
    aiSessions: [],
    queueSessions: [],
    teams: [],
    teamChat: [],
    teamTasks: [],
    notifications: [
      {
        id: createId("notification"),
        userId: "admin_mina",
        title: "Demo project seeded",
        body: "A starter class and project were created so you can jump straight into the prototype.",
        read: false,
        link: "/admin/classes/class_hci401/projects",
        createdAt: timestamp,
      },
    ],
    reports: [],
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
    case "gf_classes":
      return "classes";
    case "gf_projects":
      return "projects";
    case "gf_memberships":
      return "memberships";
    case "gf_ai_sessions":
      return "aiSessions";
    case "gf_queue_sessions":
      return "queueSessions";
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

  return {
    auth: readStorage("gf_auth", null),
    users: readStorage("gf_users", []),
    classes: readStorage("gf_classes", []),
    projects: readStorage("gf_projects", []),
    memberships: readStorage("gf_memberships", []),
    aiSessions: readStorage("gf_ai_sessions", []),
    queueSessions: readStorage("gf_queue_sessions", []),
    teams: readStorage("gf_teams", []),
    teamChat: readStorage("gf_team_chat", []),
    teamTasks: readStorage("gf_team_tasks", []),
    notifications: readStorage("gf_notifications", []),
    reports: readStorage("gf_reports", []),
  };
}

export function persistState(state: AppState): void {
  writeStorage("gf_auth", state.auth);
  writeStorage("gf_users", state.users);
  writeStorage("gf_classes", state.classes);
  writeStorage("gf_projects", state.projects);
  writeStorage("gf_memberships", state.memberships);
  writeStorage("gf_ai_sessions", state.aiSessions);
  writeStorage("gf_queue_sessions", state.queueSessions);
  writeStorage("gf_teams", state.teams);
  writeStorage("gf_team_chat", state.teamChat);
  writeStorage("gf_team_tasks", state.teamTasks);
  writeStorage("gf_notifications", state.notifications);
  writeStorage("gf_reports", state.reports);
}

export function buildNewUser(email: string, role: "student" | "admin"): User {
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
    role,
    verified: true,
    profile: buildProfile(
      role === "admin" ? "Analyst" : "UI/Design",
      role === "admin" ? ["Course Ops", "Moderation"] : ["Figma", "Writing"],
      ["weekdays", "evenings"],
      "balanced",
      "collab",
      role === "admin"
        ? "Instructor or TA account created for demo access."
        : "Tell classmates how you like to work and what you bring to a team.",
      role === "admin" ? "Writer/Presenter" : "Writer/Presenter",
    ),
    flags: {},
    createdAt: now,
  };
}

export function defaultProjectPayload() {
  return {
    name: "New Project",
    description: "Short project brief",
    teamSize: 4,
    deadline: "2026-05-20",
    roleTemplates: ["Backend/SQL", "UI/Design", "Analyst", "Writer/Presenter"] as ProjectRole[],
  };
}

export function createProjectRecord(classId: string, payload: {
  name: string;
  description: string;
  teamSize: number;
  deadline: string;
  roleTemplates: ProjectRole[];
}): ProjectRecord {
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
