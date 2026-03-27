import type {
  AvailabilitySlot,
  ContactMethod,
  GoalLevel,
  MeetingPreference,
  PresetProjectRole,
  ProjectRole,
  ResponseTime,
  WorkingStyle,
} from "@/lib/types";

export const ROLE_OPTIONS: PresetProjectRole[] = [
  "Backend/SQL",
  "UI/Design",
  "Analyst",
  "Writer/Presenter",
];

export const AVAILABILITY_OPTIONS: AvailabilitySlot[] = [
  "weekdays",
  "weekends",
  "evenings",
];

export const GOAL_OPTIONS: GoalLevel[] = [
  "aiming-for-a",
  "balanced",
  "pass-focus",
];

export const STYLE_OPTIONS: WorkingStyle[] = ["quiet", "collab", "async"];

export const CONTACT_METHOD_OPTIONS: ContactMethod[] = [
  "Line",
  "Discord",
  "WhatsApp",
  "Email",
  "Other",
];

export const RESPONSE_TIME_OPTIONS: ResponseTime[] = ["<2h", "same day", "1-2 days"];

export const MEETING_PREFERENCE_OPTIONS: MeetingPreference[] = [
  "Online",
  "On campus",
  "Mixed",
];

export const AI_CHAT_STEPS = [
  {
    id: "rolePreference",
    label: "Which role are you hoping to own?",
    options: ROLE_OPTIONS,
  },
  {
    id: "skills",
    label: "What skills do you want teammates to notice first?",
    options: [
      "Figma",
      "React",
      "SQL",
      "User Research",
      "Slide Design",
      "Data Analysis",
      "Writing",
      "Facilitation",
    ],
  },
  {
    id: "availability",
    label: "When can you reliably meet?",
    options: AVAILABILITY_OPTIONS,
  },
  {
    id: "goalLevel",
    label: "What outcome are you optimizing for?",
    options: GOAL_OPTIONS,
  },
  {
    id: "workingStyle",
    label: "Which collaboration style feels right?",
    options: STYLE_OPTIONS,
  },
] as const;

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function sentenceCase(value: string): string {
  return value
    .split("-")
    .join(" ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function toggleInArray<T>(items: T[], item: T): T[] {
  return items.includes(item)
    ? items.filter((existing) => existing !== item)
    : [...items, item];
}

export function generateJoinCode(label: string): string {
  const clean = label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return `GF-${clean || "CLASS"}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function inferRole(skills: string[]): ProjectRole {
  const normalized = skills.join(" ").toLowerCase();
  if (/(figma|ui|visual|design)/.test(normalized)) {
    return "UI/Design";
  }
  if (/(sql|api|backend|react|typescript|database)/.test(normalized)) {
    return "Backend/SQL";
  }
  if (/(research|analysis|data|survey)/.test(normalized)) {
    return "Analyst";
  }
  return "Writer/Presenter";
}

export function overlapCount<T>(left: T[], right: T[]): number {
  return left.filter((item) => right.includes(item)).length;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
