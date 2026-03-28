import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AccessBanner } from "@/components/layouts";
import {
  Avatar,
  Badge,
  EmptyState,
  Field,
  OptionChip,
  PageIntro,
  RolePill,
  StatCard,
  VerifiedBadge,
} from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { resolveMatchingProfile, shouldFastTrackQueueMatch } from "@/lib/matching";
import type {
  AiAnswers,
  AvailabilitySlot,
  ContactMethod,
  GoalLevel,
  NotificationType,
  MeetingPreference,
  TeamProposal,
  ResponseTime,
  ProjectRole,
  QueueConstraints,
  ReportCategory,
  ReportSeverity,
  TargetType,
  User,
  WorkingStyle,
} from "@/lib/types";
import {
  AI_CHAT_STEPS,
  AVAILABILITY_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  GOAL_OPTIONS,
  MEETING_PREFERENCE_OPTIONS,
  ROLE_OPTIONS,
  RESPONSE_TIME_OPTIONS,
  STYLE_OPTIONS,
  cn,
  formatDate,
  formatDeadline,
  sentenceCase,
  toggleInArray,
} from "@/lib/utils";
import { validatePasswordStrength } from "@/lib/storage";

function getCurrentAiSession(userId: string | undefined, projectId: string | undefined, aiSessions: ReturnType<typeof useApp>["state"]["aiSessions"]) {
  return aiSessions.find((session) => session.userId === userId && session.projectId === projectId);
}

function getCurrentQueueSession(userId: string | undefined, projectId: string | undefined, queueSessions: ReturnType<typeof useApp>["state"]["queueSessions"]) {
  return queueSessions.find((session) => session.userId === userId && session.projectId === projectId);
}

function getProjectPeers(projectId: string | undefined, memberships: ReturnType<typeof useApp>["state"]["memberships"], users: ReturnType<typeof useApp>["state"]["users"]) {
  if (!projectId) {
    return [];
  }

  const memberIds = memberships
    .filter((membership) => membership.projectId === projectId && membership.status === "active")
    .map((membership) => membership.userId);

  return users.filter((user) => memberIds.includes(user.id));
}

function getMatchingSnapshot(state: ReturnType<typeof useApp>["state"], userId: string) {
  return resolveMatchingProfile(state, userId);
}

function getProjectSettingSnapshot(
  state: ReturnType<typeof useApp>["state"],
  projectId: string | undefined,
  teamSize?: number,
  deadline?: string,
) {
  if (!projectId) {
    return undefined;
  }

  return (
    state.projectSettings.find((setting) => setting.projectId === projectId) ||
    (teamSize && deadline
      ? {
          projectId,
          teamSize,
          proposalExpiryMinutes: 30,
          overflowTeamsAllowed: 0,
          formationDeadline: deadline,
          forceOverflowAtDeadline: true,
        }
      : undefined)
  );
}

function getOverflowSnapshot(
  state: ReturnType<typeof useApp>["state"],
  projectId: string | undefined,
  overflowTeamsAllowed: number = 0,
) {
  if (!projectId) {
    return undefined;
  }

  return (
    state.overflowState.find((entry) => entry.projectId === projectId) || {
      projectId,
      overflowTeamsAllowed,
      overflowSlotsNeeded: overflowTeamsAllowed,
      overflowSlotsFilled: 0,
      overflowMemberIds: [],
      forcedOverflowMemberIds: [],
      deadlineFinalized: false,
    }
  );
}

function OverflowQueueBanner({
  overflowTeamsAllowed,
  formationDeadline,
  volunteer,
}: {
  overflowTeamsAllowed: number;
  formationDeadline: string;
  volunteer?: boolean;
}) {
  if (!overflowTeamsAllowed) {
    return null;
  }

  return (
    <AccessBanner
      title={`Overflow policy enabled: up to ${overflowTeamsAllowed} team${overflowTeamsAllowed === 1 ? "" : "s"} may add +1 member`}
      description={
        volunteer
          ? `You are in Flex volunteer mode, so GroupFinder may place you into the extra slot before the formation deadline on ${formatDeadline(formationDeadline)}.`
          : `Volunteers can be placed faster into the extra slot. Formation deadline: ${formatDeadline(formationDeadline)}.`
      }
    />
  );
}

function formatMeetingOption(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatExpiresIn(expiresAt: string, now: number) {
  const diff = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getProposalStatusTone(status: TeamProposal["status"]) {
  switch (status) {
    case "confirmed":
      return "success" as const;
    case "expired":
    case "cancelled":
      return "warn" as const;
    default:
      return "soft" as const;
  }
}

function getMemberStatusTone(status: TeamProposal["memberStatuses"][string]) {
  switch (status) {
    case "accepted":
      return "success" as const;
    case "declined":
      return "warn" as const;
    default:
      return "soft" as const;
  }
}

function getNotificationTypeLabel(type: NotificationType) {
  switch (type) {
    case "PROPOSAL_INVITE":
      return "Proposal invite";
    case "PROPOSAL_ACCEPTED":
      return "Accepted";
    case "PROPOSAL_DECLINED":
      return "Declined";
    case "PROPOSAL_REFILLING":
      return "Refilling";
    case "PROPOSAL_EXPIRED":
      return "Expired";
    case "TEAM_CONFIRMED":
      return "Team confirmed";
    default:
      return "Update";
  }
}

function ProjectScopePicker({
  currentProjectId,
  projects,
  state,
  userId,
  onSelect,
  title = "Your projects",
  description = "Switch the active project to open a different team workspace or run matching for another class.",
}: {
  currentProjectId?: string;
  projects: ReturnType<typeof useApp>["studentProjects"];
  state: ReturnType<typeof useApp>["state"];
  userId: string;
  onSelect: (projectId: string) => void;
  title?: string;
  description?: string;
}) {
  if (projects.length <= 1) {
    return null;
  }

  return (
    <section className="panel p-6 md:p-8">
      <p className="subtle-label">{title}</p>
      <p className="mt-3 max-w-3xl text-sm text-ink/65">{description}</p>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {projects.map((project) => {
          const membership = state.memberships.find(
            (entry) =>
              entry.userId === userId &&
              entry.projectId === project.id &&
              entry.status === "active",
          );
          const classRecord = state.classes.find((entry) => entry.id === project.classId);
          const team = membership?.teamId
            ? state.teams.find((entry) => entry.id === membership.teamId)
            : undefined;

          return (
            <article
              key={project.id}
              className={cn(
                "rounded-[24px] border p-5 transition",
                currentProjectId === project.id ? "border-ink bg-sand/50" : "border-ink/10 bg-white",
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-2xl font-semibold text-ink">{project.name}</h3>
                    {currentProjectId === project.id ? <Badge tone="soft">Selected</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-ink/65">{classRecord?.name || "Class project"}</p>
                  <p className="mt-2 text-sm text-ink/55">Deadline {formatDeadline(project.deadline)}</p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Badge tone={team ? "success" : "soft"}>{team ? "Team active" : "No team yet"}</Badge>
                  <Badge tone="soft">{project.joinCode}</Badge>
                </div>
              </div>
              <p className="mt-4 text-sm text-ink/65">{project.description}</p>
              <button
                type="button"
                className="btn-secondary mt-5"
                onClick={() => onSelect(project.id)}
              >
                {currentProjectId === project.id ? "Currently active" : "Switch to this project"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function completionScore({
  hasProfile,
  hasProject,
  hasTeam,
}: {
  hasProfile: boolean;
  hasProject: boolean;
  hasTeam: boolean;
}) {
  return [true, hasProfile, hasProject, hasTeam].filter(Boolean).length;
}

export function StudentDashboardPage() {
  const {
    activeProjectId,
    currentProject,
    currentTeam,
    currentUser,
    setActiveProject,
    state,
    studentProjects,
    studentTeams,
  } = useApp();

  if (!currentUser) {
    return null;
  }

  const currentMatching = getMatchingSnapshot(state, currentUser.id);
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );
  const overflow = getOverflowSnapshot(
    state,
    currentProject?.id,
    projectSetting?.overflowTeamsAllowed || 0,
  );
  const profileReady =
    Boolean(currentUser.profile.bio.trim()) &&
    Boolean(currentUser.profile.timeZone.trim()) &&
    Boolean(currentUser.profile.preferredContactMethod) &&
    Boolean(currentUser.profile.responseTime) &&
    Boolean(currentUser.profile.meetingPreference);
  const progress = completionScore({
    hasProfile: profileReady,
    hasProject: studentProjects.length > 0,
    hasTeam: studentTeams.length > 0,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Student dashboard"
        title="Move from verified profile to active project team."
        description="Track your onboarding, jump into a class by code, and choose the matching mode that fits how you want to form a team."
        actions={
          <>
            <Link to={currentProject ? "/student/match" : "/student/join"} className="btn-primary">
              {currentProject ? "Start matching" : "Join a project"}
            </Link>
            <Link to="/student/profile" className="btn-secondary">
              Edit profile
            </Link>
          </>
        }
      />

      {currentUser.flags.matchingRestricted ? (
        <AccessBanner
          tone="warn"
          title="Matching is restricted on this account"
          description="An instructor has temporarily blocked AI and queue matching. You can still review your project and notifications."
        />
      ) : null}

      {currentUser.flags.chatMuted ? (
        <AccessBanner
          title="Chat is muted"
          description="You can still view team activity, tasks, and meeting details, but sending messages is disabled."
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Onboarding" value={`${progress}/4`} detail="Verified, profile, project, team" />
        <StatCard label="Projects" value={studentProjects.length} detail="Active memberships on this account" />
        <StatCard
          label="Deadline"
          value={projectSetting ? formatDeadline(projectSetting.formationDeadline) : "Join first"}
          detail={currentProject ? `${currentProject.name} formation deadline` : "No active project selected"}
        />
        <StatCard
          label="Teams"
          value={studentTeams.length}
          detail={currentTeam ? `Selected project: ${sentenceCase(currentTeam.createdByMode)}` : "No team on selected project yet"}
        />
      </div>

      {currentProject && projectSetting ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="panel p-6">
            <p className="subtle-label">Volunteer status</p>
            <p className="mt-3 text-2xl font-semibold text-ink">
              {currentUser.volunteer ? "ON" : "OFF"}
            </p>
            <p className="mt-2 text-sm text-ink/65">
              {currentUser.volunteer
                ? "You can be placed into an overflow slot to help balance uneven enrollment."
                : "Turn on Flex volunteer in your profile if you want to help fill extra +1 slots."}
            </p>
          </article>
          <article className="panel p-6">
            <p className="subtle-label">Overflow policy</p>
            <p className="mt-3 text-2xl font-semibold text-ink">
              Up to {projectSetting.overflowTeamsAllowed}
            </p>
            <p className="mt-2 text-sm text-ink/65">
              team{projectSetting.overflowTeamsAllowed === 1 ? "" : "s"} may have +1 member. Filled: {overflow?.overflowSlotsFilled || 0}/{projectSetting.overflowTeamsAllowed}.
            </p>
          </article>
          <article className="panel p-6">
            <p className="subtle-label">Deadline policy</p>
            <p className="mt-3 text-2xl font-semibold text-ink">
              {formatDeadline(projectSetting.formationDeadline)}
            </p>
            <p className="mt-2 text-sm text-ink/65">
              {projectSetting.forceOverflowAtDeadline
                ? "If volunteers are missing, remaining allowed overflow slots can be finalized automatically at the deadline."
                : "Overflow is volunteer-only for this project."}
            </p>
          </article>
        </section>
      ) : null}

      <ProjectScopePicker
        currentProjectId={activeProjectId}
        projects={studentProjects}
        state={state}
        userId={currentUser.id}
        onSelect={setActiveProject}
      />

      {!currentProject ? (
        <EmptyState
          title="You haven’t joined a project yet"
          body="Use the join code from your instructor or TA to unlock matching. A seeded demo project is already available if you want to run the prototype immediately."
          action={
            <div className="flex flex-wrap gap-3">
              <Link to="/student/join" className="btn-primary">
                Enter join code
              </Link>
              {state.projects[0] ? <Badge tone="soft">{state.projects[0].joinCode}</Badge> : null}
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="panel p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="soft">Current project</Badge>
              <VerifiedBadge />
              {projectSetting?.overflowTeamsAllowed ? (
                <Badge tone="soft">
                  {projectSetting.overflowTeamsAllowed} overflow slot
                  {projectSetting.overflowTeamsAllowed === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-4 font-heading text-3xl font-semibold text-ink">{currentProject.name}</h2>
            <p className="mt-3 max-w-2xl text-sm text-ink/65">{currentProject.description}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="panel-muted p-5">
                <p className="subtle-label">Join code</p>
                <p className="mt-3 text-2xl font-semibold text-ink">{currentProject.joinCode}</p>
                <p className="mt-2 text-sm text-ink/55">Share this only with classmates in the same project.</p>
              </div>
              <div className="panel-muted p-5">
                <p className="subtle-label">Team target</p>
                <p className="mt-3 text-2xl font-semibold text-ink">{currentProject.teamSize} members</p>
                <p className="mt-2 text-sm text-ink/55">
                  Roles: {currentProject.roleTemplates.join(", ")}
                </p>
                {projectSetting?.overflowTeamsAllowed ? (
                  <p className="mt-2 text-sm text-ink/55">
                    Overflow allowed on up to {projectSetting.overflowTeamsAllowed} team
                    {projectSetting.overflowTeamsAllowed === 1 ? "" : "s"} by the formation deadline.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="panel grid gap-4 p-6">
            <div className="rounded-[24px] bg-ink p-5 text-white">
              <p className="subtle-label text-white/50">Next best action</p>
              <p className="mt-3 font-heading text-2xl font-semibold">
                {currentTeam ? "Open your workspace" : "Form your team"}
              </p>
              <p className="mt-3 text-sm text-white/75">
                {currentTeam
                  ? "Your team already exists and will persist after refresh."
                  : "Choose between guided AI matching or the role queue to generate a transparent roster."}
              </p>
              <Link to={currentTeam ? "/student/team" : "/student/match"} className="btn-secondary mt-5 bg-white text-ink">
                {currentTeam ? "Go to team" : "Choose match mode"}
              </Link>
            </div>

            <div className="panel-muted p-5">
              <p className="subtle-label">Profile readiness</p>
              <p className="mt-3 text-sm text-ink/70">
                Bio: {currentUser.profile.bio.trim() ? "Added" : "Add a short introduction"}
              </p>
              <p className="mt-2 text-sm text-ink/70">
                Contact: {currentUser.profile.preferredContactMethod} • {currentUser.profile.responseTime}
              </p>
              <p className="mt-2 text-sm text-ink/70">
                Matching snapshot: {currentMatching.rolePreference} •{" "}
                {currentMatching.availability.map(sentenceCase).join(", ") || "Set in AI chat or queue"}
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function StudentJoinPage() {
  const { joinProject, state } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Join by code"
        title="Connect yourself to a class project."
        description="Join codes attach your verified account to a project, which unlocks matching and the team workspace."
      />

      <div className="grid gap-4 xl:grid-cols-[0.8fr,1.2fr]">
        <section className="panel p-6 md:p-8">
          <Field label="Project join code">
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="GF-MOBIL-7X3A"
            />
          </Field>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => {
              const result = joinProject(code);
              setMessage(result.message);
              if (result.ok) {
                navigate("/student/dashboard");
              }
            }}
          >
            Join project
          </button>
          {message ? <p className="mt-4 text-sm text-ink/65">{message}</p> : null}
        </section>

        <section className="panel grid gap-4 p-6 md:grid-cols-2 md:p-8">
          {state.projects.map((project) => (
            <article key={project.id} className="panel-muted p-5">
              <p className="subtle-label">Seeded demo project</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">{project.name}</h2>
              <p className="mt-3 text-sm text-ink/65">{project.description}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Badge tone="soft">{project.joinCode}</Badge>
                <span className="text-xs text-ink/45">Deadline {formatDeadline(project.deadline)}</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

export function StudentProfilePage() {
  const { changeCurrentPassword, currentUser, updateCurrentUser } = useApp();
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [bio, setBio] = useState(currentUser?.profile.bio || "");
  const [major, setMajor] = useState(currentUser?.profile.major || "");
  const [year, setYear] = useState(currentUser?.profile.year || "");
  const [preferredContactMethod, setPreferredContactMethod] = useState<ContactMethod>(
    currentUser?.profile.preferredContactMethod || "Email",
  );
  const [responseTime, setResponseTime] = useState<ResponseTime>(
    currentUser?.profile.responseTime || "same day",
  );
  const [meetingPreference, setMeetingPreference] = useState<MeetingPreference>(
    currentUser?.profile.meetingPreference || "Mixed",
  );
  const [timeZone, setTimeZone] = useState(currentUser?.profile.timeZone || "");
  const [notes, setNotes] = useState(currentUser?.profile.notes || "");
  const [volunteer, setVolunteer] = useState(Boolean(currentUser?.volunteer));
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordTone, setPasswordTone] = useState<"success" | "error">("error");
  const passwordChecks = validatePasswordStrength(nextPassword);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    setName(currentUser.name);
    setEmail(currentUser.email);
    setBio(currentUser.profile.bio);
    setMajor(currentUser.profile.major);
    setYear(currentUser.profile.year);
    setPreferredContactMethod(currentUser.profile.preferredContactMethod);
    setResponseTime(currentUser.profile.responseTime);
    setMeetingPreference(currentUser.profile.meetingPreference);
    setTimeZone(currentUser.profile.timeZone);
    setNotes(currentUser.profile.notes);
    setVolunteer(Boolean(currentUser.volunteer));
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Transparent profile"
        title="Keep your teammate profile current."
        description="This page covers identity, communication preferences, and meeting logistics. Matching preferences now live only inside the AI chat and Lucky Draw flows."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr,0.8fr]">
        <section className="panel grid gap-5 p-6 md:grid-cols-2 md:p-8">
          <Field label="Full name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="University email">
            <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Verified status">
            <div className="flex min-h-[68px] items-center rounded-[24px] border border-ink/10 px-5">
              <VerifiedBadge />
            </div>
          </Field>
          <Field label="Preferred contact method">
            <select
              className="input"
              value={preferredContactMethod}
              onChange={(event) => setPreferredContactMethod(event.target.value as ContactMethod)}
            >
              {CONTACT_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Typical response time">
            <select
              className="input"
              value={responseTime}
              onChange={(event) => setResponseTime(event.target.value as ResponseTime)}
            >
              {RESPONSE_TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meeting preference">
            <select
              className="input"
              value={meetingPreference}
              onChange={(event) => setMeetingPreference(event.target.value as MeetingPreference)}
            >
              {MEETING_PREFERENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone">
            <input
              className="input"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              placeholder="Asia/Bangkok"
            />
          </Field>
          <Field label="Major (optional)">
            <input className="input" value={major} onChange={(event) => setMajor(event.target.value)} />
          </Field>
          <Field label="Year (optional)">
            <input className="input" value={year} onChange={(event) => setYear(event.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Bio">
              <textarea
                className="textarea"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Short about me"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <label className="flex min-h-[68px] items-center justify-between rounded-[24px] border border-ink/10 px-5 py-4">
              <div className="pr-4">
                <p className="font-semibold text-ink">Flex volunteer</p>
                <p className="mt-1 text-sm text-ink/55">
                  Opt in to help balance uneven class sizes by taking an overflow +1 slot when needed.
                </p>
              </div>
              <input
                type="checkbox"
                checked={volunteer}
                onChange={(event) => setVolunteer(event.target.checked)}
                className="h-5 w-5 accent-ink"
              />
            </label>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes / boundaries">
              <textarea
                className="textarea"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything classmates should know before planning meetings or communication."
              />
            </Field>
          </div>
          <button
            className="btn-primary md:col-span-2"
            onClick={() => {
              updateCurrentUser({
                name,
                email,
                volunteer,
                profile: {
                  bio,
                  major,
                  year,
                  preferredContactMethod,
                  responseTime,
                  meetingPreference,
                  timeZone,
                  notes,
                },
              });
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1600);
            }}
          >
            Save profile
          </button>
          {saved ? <p className="md:col-span-2 text-sm text-tide">Profile saved locally.</p> : null}
        </section>

        <section className="panel space-y-4 p-6 md:p-8">
          <div className="flex items-center gap-4">
            <Avatar user={currentUser} />
            <div>
              <p className="font-semibold text-ink">{name || currentUser.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VerifiedBadge />
                <Badge tone="soft">{meetingPreference}</Badge>
                {volunteer ? <Badge tone="success">Flex volunteer</Badge> : null}
              </div>
            </div>
          </div>
          <div className="panel-muted p-5">
            <p className="subtle-label">Preview</p>
            <p className="mt-3 text-sm text-ink/70">{bio || "Add a short teammate bio."}</p>
            <p className="mt-4 text-sm text-ink/70">
              {email || "Add a university email"} • {preferredContactMethod} • {responseTime}
            </p>
            <p className="mt-2 text-sm text-ink/70">
              {major || "Major optional"} {year ? `• ${year}` : ""} • {timeZone || "Add a time zone"}
            </p>
            <p className="mt-2 text-sm text-ink/70">
              Volunteer status: {volunteer ? "ON" : "OFF"}
            </p>
            <p className="mt-2 text-sm text-ink/70">{notes || "No extra boundaries or notes added yet."}</p>
          </div>
          <div className="panel-muted p-5">
            <p className="subtle-label">Password</p>
            <div className="mt-4 grid gap-4">
              <Field label="Current password">
                <input
                  type="password"
                  className="input"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    setPasswordMessage(null);
                  }}
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  className="input"
                  value={nextPassword}
                  onChange={(event) => {
                    setNextPassword(event.target.value);
                    setPasswordMessage(null);
                  }}
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setPasswordMessage(null);
                  }}
                />
              </Field>
            </div>

            <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-ink">Password policy</p>
              <div className="mt-3 grid gap-2 text-sm text-ink/65">
                <p>{passwordChecks.minLength ? "Passed" : "Needed"}: at least 8 characters</p>
                <p>{passwordChecks.uppercase ? "Passed" : "Needed"}: one uppercase letter</p>
                <p>{passwordChecks.lowercase ? "Passed" : "Needed"}: one lowercase letter</p>
                <p>{passwordChecks.digit ? "Passed" : "Needed"}: one number</p>
                <p>{confirmPassword && confirmPassword === nextPassword ? "Passed" : "Needed"}: confirmation matches</p>
              </div>
            </div>

            <button
              className="btn-secondary mt-5"
              onClick={() => {
                if (nextPassword !== confirmPassword) {
                  setPasswordMessage("New password and confirmation do not match.");
                  setPasswordTone("error");
                  return;
                }

                const result = changeCurrentPassword(currentPassword, nextPassword);
                setPasswordMessage(result.message);
                setPasswordTone(result.ok ? "success" : "error");
                if (result.ok) {
                  setCurrentPassword("");
                  setNextPassword("");
                  setConfirmPassword("");
                }
              }}
            >
              Update password
            </button>

            {passwordMessage ? (
              <p className={cn("mt-4 text-sm", passwordTone === "success" ? "text-tide" : "text-coral")}>
                {passwordMessage}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function MatchModePickerPage() {
  const {
    activeProjectId,
    currentProject,
    currentTeam,
    currentUser,
    setActiveProject,
    state,
    studentProjects,
  } = useApp();
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );

  if (!currentProject) {
    return (
      <EmptyState
        title="Join a project before matching"
        body="Matching is only available once your verified account is attached to a project by join code."
        action={<Link to="/student/join" className="btn-primary">Join a project</Link>}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Match mode picker"
        title="Choose how you want GroupFinder to build your roster."
        description="Both flows are transparent and deterministic. You can accept a result or cycle again before locking in a team."
      />

      <ProjectScopePicker
        currentProjectId={activeProjectId}
        projects={studentProjects}
        state={state}
        userId={currentUser?.id || ""}
        onSelect={setActiveProject}
        title="Match for a specific project"
        description="Each class project keeps its own team. Switch the active project here before starting AI chat or Lucky Draw."
      />

      {currentTeam ? (
        <AccessBanner
          title={`A team already exists for ${currentProject.name}`}
          description="You can open the workspace for this selected project, or switch projects above to form a team somewhere else."
        />
      ) : null}

      {currentUser?.flags.matchingRestricted ? (
        <AccessBanner
          tone="warn"
          title="Matching is currently unavailable"
          description="An instructor has restricted this account from forming new teams. You can still switch projects and review any existing team workspaces."
        />
      ) : null}

      {projectSetting ? (
        <OverflowQueueBanner
          overflowTeamsAllowed={projectSetting.overflowTeamsAllowed}
          formationDeadline={projectSetting.formationDeadline}
          volunteer={currentUser?.volunteer}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="panel p-6 md:p-8">
          <Badge tone="soft">AI chat matcher</Badge>
          <h2 className="mt-4 font-heading text-3xl font-semibold text-ink">Guided Q&A</h2>
          <p className="mt-3 text-sm text-ink/65">
            Step through a scripted chat about role preference, skills, schedule, goals, and working style. GroupFinder then explains why the roster fits.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink/65">
            <li>Role-first match summary with reasons</li>
            <li>Accept or rematch with saved history</li>
            <li>Best when you want a more reflective prompt flow</li>
          </ul>
          <Link
            to="/student/match/ai"
            className={cn("btn-primary mt-8", currentTeam || currentUser?.flags.matchingRestricted ? "pointer-events-none opacity-60" : "")}
          >
            Start AI chat
          </Link>
        </article>

        <article className="panel p-6 md:p-8">
          <Badge tone="soft">Lucky Draw role queue</Badge>
          <h2 className="mt-4 font-heading text-3xl font-semibold text-ink">Role queue</h2>
          <p className="mt-3 text-sm text-ink/65">
            Pick your primary role, add optional backup coverage, then join a queue with compatibility constraints and a fake live ETA.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink/65">
            <li>Role cards with primary and secondary selection</li>
            <li>Queue status, health counts, re-queue controls</li>
            <li>Best when you want a faster, role-anchored path</li>
          </ul>
          <Link
            to="/student/match/queue/roles"
            className={cn("btn-primary mt-8", currentTeam || currentUser?.flags.matchingRestricted ? "pointer-events-none opacity-60" : "")}
          >
            Join Lucky Draw
          </Link>
        </article>
      </div>

      {currentTeam ? (
        <Link to="/student/team" className="btn-secondary">
          Open current project team
        </Link>
      ) : null}
    </div>
  );
}

export function AIChatPage() {
  const { currentProject, currentUser, runAiMatch, state } = useApp();
  const navigate = useNavigate();
  const currentMatching = currentUser ? getMatchingSnapshot(state, currentUser.id) : undefined;
  const currentSession = getCurrentAiSession(currentUser?.id, currentProject?.id, state.aiSessions);
  const [stepIndex, setStepIndex] = useState(0);
  const [skillsDraft, setSkillsDraft] = useState<string[]>(
    currentSession?.answers?.skills || currentMatching?.skills || [],
  );
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilitySlot[]>(
    currentSession?.answers?.availability || currentMatching?.availability || [],
  );
  const [answers, setAnswers] = useState<Partial<AiAnswers>>({
    rolePreference: currentSession?.answers?.rolePreference || currentMatching?.rolePreference || "UI/Design",
    goalLevel: currentSession?.answers?.goalLevel || currentMatching?.goalLevel || "balanced",
    workingStyle: currentSession?.answers?.workingStyle || currentMatching?.workingStyle || "collab",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const nextMatching = getMatchingSnapshot(state, currentUser.id);
    const nextSession = getCurrentAiSession(currentUser.id, currentProject?.id, state.aiSessions);
    setSkillsDraft(nextSession?.answers?.skills || nextMatching.skills);
    setAvailabilityDraft(nextSession?.answers?.availability || nextMatching.availability);
    setAnswers({
      rolePreference: nextSession?.answers?.rolePreference || nextMatching.rolePreference,
      goalLevel: nextSession?.answers?.goalLevel || nextMatching.goalLevel,
      workingStyle: nextSession?.answers?.workingStyle || nextMatching.workingStyle,
      skills: nextSession?.answers?.skills,
      availability: nextSession?.answers?.availability,
    });
  }, [currentProject?.id, currentUser, state]);

  const currentStep = AI_CHAT_STEPS[stepIndex];
  const isCurrentStepComplete =
    currentStep.id === "skills"
      ? skillsDraft.length > 0
      : currentStep.id === "availability"
        ? availabilityDraft.length > 0
        : currentStep.id === "rolePreference"
          ? Boolean(answers.rolePreference)
          : currentStep.id === "goalLevel"
            ? Boolean(answers.goalLevel)
            : Boolean(answers.workingStyle);

  function submitCurrentStep() {
    const nextAnswers: Partial<AiAnswers> = { ...answers };

    if (currentStep.id === "skills") {
      if (skillsDraft.length === 0) {
        setError("Pick at least one skill to continue.");
        return;
      }
      nextAnswers.skills = skillsDraft;
    }

    if (currentStep.id === "availability") {
      if (availabilityDraft.length === 0) {
        setError("Pick at least one availability window to continue.");
        return;
      }
      nextAnswers.availability = availabilityDraft;
    }

    if (currentStep.id === "rolePreference" && !nextAnswers.rolePreference) {
      setError("Choose a role before continuing.");
      return;
    }

    if (currentStep.id === "goalLevel" && !nextAnswers.goalLevel) {
      setError("Choose a goal level before continuing.");
      return;
    }

    if (currentStep.id === "workingStyle" && !nextAnswers.workingStyle) {
      setError("Choose a collaboration style before generating a match.");
      return;
    }

    setAnswers(nextAnswers);
    setError(null);

    if (stepIndex === AI_CHAT_STEPS.length - 1) {
      const result = runAiMatch({
        rolePreference: (nextAnswers.rolePreference || "UI/Design") as ProjectRole,
        skills: nextAnswers.skills || skillsDraft,
        availability: nextAnswers.availability || availabilityDraft,
        goalLevel: (nextAnswers.goalLevel || "balanced") as GoalLevel,
        workingStyle: (nextAnswers.workingStyle || "collab") as WorkingStyle,
      });
      if (result) {
        navigate("/student/match/ai/result");
      } else {
        setError("No eligible classmates are available for this project right now. Try a different project or add more students.");
      }
      return;
    }

    setStepIndex((index) => index + 1);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="AI chat matcher"
        title="Answer a short guided questionnaire."
        description="This is a scripted chat flow, not a live model. Your answers still persist and shape the deterministic team suggestion."
      />

      <div className="panel p-4 md:p-8">
        <div className="space-y-6">
          {AI_CHAT_STEPS.slice(0, stepIndex + 1).map((step, index) => {
            const answer =
              step.id === "skills"
                ? answers.skills?.join(", ")
                : step.id === "availability"
                  ? answers.availability?.map(sentenceCase).join(", ")
                  : step.id === "goalLevel"
                    ? answers.goalLevel && sentenceCase(answers.goalLevel)
                    : step.id === "workingStyle"
                      ? answers.workingStyle && sentenceCase(answers.workingStyle)
                      : answers.rolePreference;

            return (
              <div key={step.id} className="space-y-3">
                <div className="max-w-xl rounded-[28px] bg-sand px-5 py-4 text-sm text-ink">
                  {index + 1}. {step.label}
                </div>
                {index < stepIndex && answer ? (
                  <div className="ml-auto max-w-xl rounded-[28px] bg-ink px-5 py-4 text-sm text-white">
                    {answer}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="subtle-label">Current step</p>
          <p className="mt-3 text-lg font-semibold text-ink">{currentStep.label}</p>

          <div className="mt-5 flex flex-wrap gap-3">
            {currentStep.id === "skills"
              ? currentStep.options.map((option) => (
                  <OptionChip
                    key={option}
                    selected={skillsDraft.includes(option)}
                    onClick={() => setSkillsDraft(toggleInArray(skillsDraft, option))}
                  >
                    {option}
                  </OptionChip>
                ))
                : currentStep.id === "availability"
                  ? currentStep.options.map((option) => (
                      <OptionChip
                        key={option}
                      selected={availabilityDraft.includes(option)}
                      onClick={() => setAvailabilityDraft(toggleInArray(availabilityDraft, option))}
                    >
                      {sentenceCase(option)}
                    </OptionChip>
                  ))
                : currentStep.options.map((option) => (
                    <OptionChip
                      key={option}
                      selected={
                        (currentStep.id === "rolePreference" &&
                          answers.rolePreference === option) ||
                        (currentStep.id === "goalLevel" && answers.goalLevel === option) ||
                        (currentStep.id === "workingStyle" && answers.workingStyle === option)
                      }
                      onClick={() => {
                        setAnswers((previous) => ({
                          ...previous,
                          [currentStep.id]: option,
                        }));
                        setError(null);
                      }}
                    >
                      {option.includes("-") ? sentenceCase(option) : option}
                    </OptionChip>
                  ))}
          </div>

          <p className="mt-4 text-sm text-ink/55">
            Select your answer, then continue to the next step.
          </p>

          {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

          <button
            className={cn("btn-primary mt-6", !isCurrentStepComplete ? "opacity-70" : "")}
            onClick={submitCurrentStep}
          >
            {stepIndex === AI_CHAT_STEPS.length - 1 ? "Generate match" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AIResultPage() {
  const { currentProject, currentUser, proposeAiTeam, rematchAi, state } = useApp();
  const navigate = useNavigate();
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);

  const session = getCurrentAiSession(currentUser?.id, currentProject?.id, state.aiSessions);
  const result = session?.lastResult;
  const existingActiveProposal = state.teamProposals.find(
    (proposal) =>
      proposal.projectId === currentProject?.id &&
      proposal.createdByUserId === currentUser?.id &&
      (proposal.status === "pending" || proposal.status === "refilling"),
  );

  if (!currentProject || !currentUser || !result) {
    return (
      <EmptyState
        title="No AI match yet"
        body="Run the guided Q&A first so GroupFinder can generate a roster suggestion."
        action={<Link to="/student/match/ai" className="btn-primary">Start AI chat</Link>}
      />
    );
  }

  const roster = [currentUser, ...state.users.filter((user) => result.candidateIds.includes(user.id))];

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="AI match result"
        title="Review the suggested roster before you commit."
        description="The roster is transparent by design. You can see roles, verification, and compatibility notes before proposing the team for mutual confirmation."
      />

      {existingActiveProposal ? (
        <AccessBanner
          title="Active proposal already exists"
          description="You already have a live AI proposal for this project. Open it instead of sending another invite set."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="panel p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            {roster.map((user) => (
              <article key={user.id} className="panel-muted p-5">
                {(() => {
                  const matching = getMatchingSnapshot(state, user.id);
                  return (
                    <>
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{user.name}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <VerifiedBadge />
                            <RolePill role={result.roleAssignments[user.id]} />
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-ink/65">{user.profile.bio}</p>
                      <p className="mt-3 text-sm text-ink/65">
                        Skills: {matching.skills.slice(0, 3).join(", ") || "None listed"}
                      </p>
                      <p className="mt-2 text-sm text-ink/65">
                        {matching.availability.map(sentenceCase).join(", ") || "Flexible"} •{" "}
                        {sentenceCase(matching.goalLevel)} • {sentenceCase(matching.workingStyle)}
                      </p>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        </section>

        <section className="panel space-y-4 p-6 md:p-8">
          <div>
            <p className="subtle-label">Why this match</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {result.reasons.map((reason) => (
                <li key={reason} className="rounded-[20px] bg-sand/70 px-4 py-3">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="subtle-label">Compatibility summary</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {result.compatibilitySummary.map((item) => (
                <li key={item} className="rounded-[20px] border border-ink/10 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                const result = proposeAiTeam();
                setProposalMessage(result.message);
                if (result.ok && result.proposalId) {
                  navigate(`/student/proposals/${result.proposalId}`);
                }
              }}
            >
              Propose team
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                rematchAi();
              }}
            >
              Rematch
            </button>
          </div>
          {proposalMessage ? <p className="text-sm text-ink/65">{proposalMessage}</p> : null}
        </section>
      </div>
    </div>
  );
}

export function ProposalsPage() {
  const { currentUser, state } = useApp();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!currentUser) {
    return null;
  }

  const relevantProposals = state.teamProposals
    .filter(
      (proposal) =>
        proposal.createdByUserId === currentUser.id || Boolean(proposal.memberStatuses[currentUser.id]),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const activeProposals = relevantProposals.filter(
    (proposal) => proposal.status === "pending" || proposal.status === "refilling",
  );
  const recentProposals = relevantProposals.filter(
    (proposal) => proposal.status !== "pending" && proposal.status !== "refilling",
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Team proposals"
        title="Review open invites and confirmation progress."
        description="AI team suggestions now require mutual confirmation. Accepted members stay together while declined slots refill."
      />

      {activeProposals.length ? (
        <section className="space-y-4">
          {activeProposals.map((proposal) => {
            const project = state.projects.find((entry) => entry.id === proposal.projectId);
            const currentStatus = proposal.memberStatuses[currentUser.id];
            const roster = state.users.filter((user) => proposal.memberIds.includes(user.id));

            return (
              <article key={proposal.id} className="panel p-6 md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getProposalStatusTone(proposal.status)}>
                        {sentenceCase(proposal.status)}
                      </Badge>
                      {currentStatus ? (
                        <Badge tone={getMemberStatusTone(currentStatus)}>
                          {sentenceCase(currentStatus)}
                        </Badge>
                      ) : null}
                      {proposal.status === "refilling" ? (
                        <Badge tone="soft">
                          {proposal.slotsNeeded
                            ? `${proposal.slotsNeeded} slot${proposal.slotsNeeded === 1 ? "" : "s"} open`
                            : "Waiting on refill replies"}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-4 font-heading text-2xl font-semibold text-ink">
                      {project?.name || "Project proposal"}
                    </h2>
                    <p className="mt-2 text-sm text-ink/65">
                      Expires in: {formatExpiresIn(proposal.expiresAt, now)}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {roster.map((user) => (
                        <div key={user.id} className="rounded-[20px] border border-ink/10 p-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <Avatar user={user} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-ink">{user.name}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge tone={getMemberStatusTone(proposal.memberStatuses[user.id])}>
                                  {sentenceCase(proposal.memberStatuses[user.id])}
                                </Badge>
                                <RolePill role={proposal.roleAssignments[user.id]} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Link to={`/student/proposals/${proposal.id}`} className="btn-primary self-start">
                    Open proposal
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="No active proposals"
          body="When you propose an AI team or receive an invite, it will show up here."
          action={<Link to="/student/match/ai" className="btn-primary">Open AI matcher</Link>}
        />
      )}

      {recentProposals.length ? (
        <section className="space-y-4">
          <p className="subtle-label">Recent proposal outcomes</p>
          {recentProposals.slice(0, 6).map((proposal) => {
            const project = state.projects.find((entry) => entry.id === proposal.projectId);
            return (
              <article key={proposal.id} className="panel p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getProposalStatusTone(proposal.status)}>
                        {sentenceCase(proposal.status)}
                      </Badge>
                      <p className="font-semibold text-ink">{project?.name || "Project proposal"}</p>
                    </div>
                    <p className="mt-2 text-sm text-ink/65">{formatDate(proposal.createdAt)}</p>
                  </div>
                  <Link to={`/student/proposals/${proposal.id}`} className="btn-secondary self-start">
                    View detail
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

export function ProposalDetailPage() {
  const { id } = useParams();
  const { currentUser, respondToProposal, state } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!currentUser) {
    return null;
  }

  const proposal = state.teamProposals.find((entry) => entry.id === id);
  if (!proposal) {
    return (
      <EmptyState
        title="Proposal not found"
        body="This invite may have expired or been removed."
        action={<Link to="/student/proposals" className="btn-primary">Back to proposals</Link>}
      />
    );
  }

  const project = state.projects.find((entry) => entry.id === proposal.projectId);
  const currentStatus = proposal.memberStatuses[currentUser.id];
  const isCurrentUserInConfirmedTeam = state.memberships.some(
    (membership) =>
      membership.userId === currentUser.id &&
      membership.projectId === proposal.projectId &&
      membership.status === "active" &&
      Boolean(membership.teamId),
  );
  const participantIds = [
    ...proposal.memberIds,
    ...Object.keys(proposal.memberStatuses).filter((userId) => !proposal.memberIds.includes(userId)),
  ];
  const participants = participantIds
    .map((userId) => state.users.find((user) => user.id === userId))
    .filter((user): user is User => Boolean(user));

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Proposal detail"
        title={project?.name || "Team proposal"}
        description="Review the roster, respond to the invite, and track refill progress if anyone declines."
        actions={
          proposal.status === "confirmed" ? (
            <Link to="/student/team" className="btn-primary">
              Open team
            </Link>
          ) : (
            <Link to="/student/proposals" className="btn-secondary">
              All proposals
            </Link>
          )
        }
      />

      <section className="panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={getProposalStatusTone(proposal.status)}>
                {sentenceCase(proposal.status)}
              </Badge>
              {currentStatus ? (
                <Badge tone={getMemberStatusTone(currentStatus)}>
                  {sentenceCase(currentStatus)}
                </Badge>
              ) : null}
              {proposal.status === "refilling" ? (
                <Badge tone="soft">
                  {proposal.slotsNeeded
                    ? `${proposal.slotsNeeded} slot${proposal.slotsNeeded === 1 ? "" : "s"} still needed`
                    : "Replacement invites sent"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-4 text-sm text-ink/65">
              Expires in:{" "}
              {proposal.status === "pending" || proposal.status === "refilling"
                ? formatExpiresIn(proposal.expiresAt, now)
                : "00:00"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {proposal.status === "pending" || proposal.status === "refilling" ? (
              currentStatus === "pending" ? (
                <>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const result = respondToProposal(proposal.id, "accepted");
                      setActionMessage(result.message);
                      if (result.teamId) {
                        navigate("/student/team");
                      }
                    }}
                    disabled={isCurrentUserInConfirmedTeam}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const result = respondToProposal(proposal.id, "declined");
                      setActionMessage(result.message);
                    }}
                  >
                    Decline
                  </button>
                </>
              ) : currentStatus === "accepted" ? (
                <Badge tone="success">Waiting for others...</Badge>
              ) : currentStatus === "declined" ? (
                <Badge tone="warn">You declined</Badge>
              ) : null
            ) : null}
          </div>
        </div>

        {isCurrentUserInConfirmedTeam && (proposal.status === "pending" || proposal.status === "refilling") ? (
          <div className="mt-4">
            <AccessBanner
              tone="warn"
              title="You already joined a confirmed team"
              description="This proposal can no longer be accepted from your account."
            />
          </div>
        ) : null}
        {actionMessage ? <p className="mt-4 text-sm text-ink/65">{actionMessage}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Proposed roster</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {participants.map((user) => (
              <article key={user.id} className="panel-muted p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar user={user} />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{user.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <VerifiedBadge />
                      <Badge tone={getMemberStatusTone(proposal.memberStatuses[user.id])}>
                        {sentenceCase(proposal.memberStatuses[user.id])}
                      </Badge>
                      <RolePill role={proposal.roleAssignments[user.id]} />
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink/65">{user.profile.bio}</p>
                <p className="mt-3 text-sm text-ink/65">
                  Skills: {getMatchingSnapshot(state, user.id).skills.slice(0, 3).join(", ") || "None listed"}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel space-y-5 p-6 md:p-8">
          <div>
            <p className="subtle-label">Why this match</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {proposal.reasons.map((reason) => (
                <li key={reason} className="rounded-[20px] bg-sand/70 px-4 py-3">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="subtle-label">Compatibility summary</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {proposal.compatibilitySummary.map((item) => (
                <li key={item} className="rounded-[20px] border border-ink/10 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  "Backend/SQL": "Own data structure, implementation, and integration details.",
  "UI/Design": "Shape interface decisions, flows, and visual cohesion.",
  Analyst: "Lead research framing, synthesis, and validation.",
  "Writer/Presenter": "Drive narrative clarity, slides, and final presentation polish.",
};

export function QueueRolePage() {
  const { currentProject, currentUser, saveQueueRoles, state } = useApp();
  const navigate = useNavigate();
  const queue = getCurrentQueueSession(currentUser?.id, currentProject?.id, state.queueSessions);
  const currentMatching = currentUser ? getMatchingSnapshot(state, currentUser.id) : undefined;
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );
  const roleOptions = currentProject?.roleTemplates.length ? currentProject.roleTemplates : ROLE_OPTIONS;
  const [primaryRole, setPrimaryRole] = useState<ProjectRole>(
    queue?.primaryRole || currentMatching?.rolePreference || roleOptions[0] || "UI/Design",
  );
  const [secondaryRole, setSecondaryRole] = useState<ProjectRole | "">(queue?.secondaryRole || "");

  if (!currentProject) {
    return (
      <EmptyState
        title="Join a project before using Lucky Draw"
        body="Queue-based matching only works once your account is attached to an active project."
        action={<Link to="/student/join" className="btn-primary">Join a project</Link>}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Lucky Draw role queue"
        title="Claim the role you want to own first."
        description="Primary role is required. Secondary role is optional and helps the queue cover gaps without hiding identities."
      />

      {projectSetting ? (
        <OverflowQueueBanner
          overflowTeamsAllowed={projectSetting.overflowTeamsAllowed}
          formationDeadline={projectSetting.formationDeadline}
          volunteer={currentUser?.volunteer}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {roleOptions.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setPrimaryRole(role)}
            className={cn(
              "panel p-6 text-left transition",
              primaryRole === role ? "border-ink ring-2 ring-ink/10" : "",
            )}
          >
            <RolePill role={role} />
            <h2 className="mt-4 font-heading text-2xl font-semibold text-ink">{role}</h2>
            <p className="mt-3 text-sm text-ink/65">
              {ROLE_DESCRIPTIONS[role] || "Custom role configured for this project template."}
            </p>
          </button>
        ))}
      </div>

      <section className="panel p-6 md:p-8">
        <Field label="Secondary role (optional)">
          <div className="flex flex-wrap gap-3">
            {roleOptions.map((role) => (
              <OptionChip
                key={role}
                selected={secondaryRole === role}
                onClick={() => setSecondaryRole(secondaryRole === role ? "" : role)}
              >
                {role}
              </OptionChip>
            ))}
          </div>
        </Field>
        <button
          className="btn-primary mt-6"
          onClick={() => {
            saveQueueRoles(primaryRole, secondaryRole || undefined);
            navigate("/student/match/queue/constraints");
          }}
        >
          Continue to constraints
        </button>
      </section>
    </div>
  );
}

export function QueueConstraintsPage() {
  const { currentProject, currentUser, enterQueue, saveQueueConstraints, state } = useApp();
  const navigate = useNavigate();
  const queue = getCurrentQueueSession(currentUser?.id, currentProject?.id, state.queueSessions);
  const currentMatching = currentUser ? getMatchingSnapshot(state, currentUser.id) : undefined;
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    queue?.constraints?.availability || currentMatching?.availability || [],
  );
  const [goalLevel, setGoalLevel] = useState<GoalLevel>(
    queue?.constraints?.goalLevel || currentMatching?.goalLevel || "balanced",
  );
  const [workingStyle, setWorkingStyle] = useState<WorkingStyle>(
    queue?.constraints?.workingStyle || currentMatching?.workingStyle || "collab",
  );
  const [strictness, setStrictness] = useState<QueueConstraints["strictness"]>(
    queue?.constraints?.strictness || "prefer",
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Queue constraints"
        title="Set the compatibility rules for your queue draw."
        description="Use must when you need strict alignment. Use prefer when you want more flexibility and a broader pool."
      />

      {projectSetting ? (
        <OverflowQueueBanner
          overflowTeamsAllowed={projectSetting.overflowTeamsAllowed}
          formationDeadline={projectSetting.formationDeadline}
          volunteer={currentUser?.volunteer}
        />
      ) : null}

      <section className="panel grid gap-5 p-6 md:grid-cols-2 md:p-8">
        <div className="md:col-span-2">
          <Field label="Availability">
            <div className="flex flex-wrap gap-3">
              {AVAILABILITY_OPTIONS.map((slot) => (
                <OptionChip
                  key={slot}
                  selected={availability.includes(slot)}
                  onClick={() => setAvailability(toggleInArray(availability, slot))}
                >
                  {sentenceCase(slot)}
                </OptionChip>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Goal level">
          <div className="flex flex-wrap gap-3">
            {GOAL_OPTIONS.map((goal) => (
              <OptionChip key={goal} selected={goalLevel === goal} onClick={() => setGoalLevel(goal)}>
                {sentenceCase(goal)}
              </OptionChip>
            ))}
          </div>
        </Field>
        <Field label="Working style">
          <div className="flex flex-wrap gap-3">
            {STYLE_OPTIONS.map((style) => (
              <OptionChip
                key={style}
                selected={workingStyle === style}
                onClick={() => setWorkingStyle(style)}
              >
                {sentenceCase(style)}
              </OptionChip>
            ))}
          </div>
        </Field>
        <div className="md:col-span-2">
          <Field label="Constraint strength">
            <div className="flex flex-wrap gap-3">
              <OptionChip selected={strictness === "must"} onClick={() => setStrictness("must")}>
                Must match
              </OptionChip>
              <OptionChip selected={strictness === "prefer"} onClick={() => setStrictness("prefer")}>
                Prefer match
              </OptionChip>
            </div>
          </Field>
        </div>
        <button
          className="btn-primary md:col-span-2"
          onClick={() => {
            saveQueueConstraints({ availability, goalLevel, workingStyle, strictness });
            enterQueue();
            navigate("/student/match/queue/status");
          }}
        >
          Join queue
        </button>
      </section>
    </div>
  );
}

export function QueueStatusPage() {
  const { currentProject, currentUser, enterQueue, leaveQueue, resolveQueueMatch, state } = useApp();
  const navigate = useNavigate();
  const queue = getCurrentQueueSession(currentUser?.id, currentProject?.id, state.queueSessions);
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isInactive = Boolean(queue && !queue.inQueue && !queue.lastMatch);
  const queueStart = queue?.startedAt ? new Date(queue.startedAt).getTime() : now;
  const queueEnd = queueStart + (queue?.etaSeconds || 45) * 1000;
  const elapsedSeconds = queue?.startedAt ? Math.max(0, Math.floor((now - queueStart) / 1000)) : 0;
  const remaining = isInactive ? queue?.etaSeconds || 45 : Math.max(0, Math.ceil((queueEnd - now) / 1000));
  const shouldResolveEarly = Boolean(
    currentProject &&
      currentUser &&
      queue?.inQueue &&
      !queue.lastMatch &&
      queue.primaryRole &&
      queue.constraints &&
      shouldFastTrackQueueMatch(
        state,
        currentProject,
        currentUser,
        queue.primaryRole,
        queue.secondaryRole,
        queue.constraints,
        queue.requeueCount,
        elapsedSeconds,
      ),
  );

  useEffect(() => {
    if (!queue || !queue.inQueue || queue.lastMatch || (remaining > 0 && !shouldResolveEarly)) {
      return;
    }
    resolveQueueMatch();
  }, [queue, remaining, resolveQueueMatch, shouldResolveEarly]);

  if (!currentProject || !queue) {
    return (
      <EmptyState
        title="Queue setup is incomplete"
        body="Pick roles and constraints first so GroupFinder can stage a queue match."
        action={<Link to="/student/match/queue/roles" className="btn-primary">Start Lucky Draw</Link>}
      />
    );
  }

  const peers = getProjectPeers(currentProject.id, state.memberships, state.users).filter(
    (user) => user.id !== currentUser?.id,
  );
  const roleOptions = currentProject.roleTemplates.length ? currentProject.roleTemplates : ROLE_OPTIONS;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Queue status"
        title={isInactive ? "You are currently out of the queue." : "Your role queue is active."}
        description={
          isInactive
            ? "Leaving the queue now fully removes this session from active matching. Rejoin only when you want to start the timer again."
            : "This screen simulates live queueing with an ETA, health counts, and the ability to tweak your role setup or leave the queue."
        }
      />

      {projectSetting ? (
        <OverflowQueueBanner
          overflowTeamsAllowed={projectSetting.overflowTeamsAllowed}
          formationDeadline={projectSetting.formationDeadline}
          volunteer={currentUser?.volunteer}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="panel p-6 md:p-8">
          <Badge tone={queue.lastMatch ? "success" : isInactive ? "warn" : "soft"}>
            {queue.lastMatch ? "Match ready" : isInactive ? "Queue inactive" : "Finding roster"}
          </Badge>
          <p className="mt-4 font-heading text-5xl font-semibold text-ink">
            {isInactive ? "Paused" : `${remaining}s`}
          </p>
          <p className="mt-3 text-sm text-ink/65">
            {isInactive
              ? `You left the queue. Primary role: ${queue.primaryRole}`
              : `ETA based on your role and constraints. Primary role: ${queue.primaryRole}`}
            {queue.secondaryRole ? ` • Secondary role: ${queue.secondaryRole}` : ""}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/student/match/queue/roles" className="btn-secondary">
              Add secondary role
            </Link>
            {isInactive ? (
              <button className="btn-primary" onClick={() => enterQueue()}>
                Rejoin queue
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => leaveQueue()}>
                Leave queue
              </button>
            )}
            {queue.lastMatch ? (
              <button className="btn-primary" onClick={() => navigate("/student/match/queue/match")}>
                Review match
              </button>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="panel p-6">
            <p className="subtle-label">Queue health</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <StatCard label="Peers available" value={peers.length} detail="Students currently active in project" />
              <StatCard
                label="Strictness"
                value={sentenceCase(queue.constraints?.strictness || "prefer")}
                detail="How strongly constraints are applied"
              />
            </div>
          </article>
          <article className="panel p-6">
            <p className="subtle-label">Role demand</p>
            <div className="mt-4 space-y-3">
              {roleOptions.map((role) => (
                <div key={role} className="flex items-center justify-between rounded-[20px] border border-ink/10 px-4 py-3 text-sm">
                  <span>{role}</span>
                  <span className="font-semibold text-ink/70">
                    {
                      peers.filter(
                        (user) => {
                          const matching = getMatchingSnapshot(state, user.id);
                          return matching.rolePreference === role || matching.secondaryRole === role;
                        },
                      ).length
                    }
                  </span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

export function QueueMatchPage() {
  const { acceptQueueMatch, currentProject, currentUser, requeueQueueMatch, state } = useApp();
  const navigate = useNavigate();
  const [reasons, setReasons] = useState<string[]>([]);
  const queue = getCurrentQueueSession(currentUser?.id, currentProject?.id, state.queueSessions);
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );
  const result = queue?.lastMatch;

  if (!currentProject || !currentUser || !result) {
    return (
      <EmptyState
        title="No queue match ready"
        body="Wait for the queue ETA to finish or go back and complete your role and constraint setup."
        action={<Link to="/student/match/queue/status" className="btn-primary">Check queue status</Link>}
      />
    );
  }

  const roster = [currentUser, ...state.users.filter((user) => result.candidateIds.includes(user.id))];
  const requeueChips = ["Need more evening overlap", "Prefer quieter workflow", "Want stronger role spread"];

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Queue match found"
        title="Lucky Draw generated a role-balanced roster."
        description="Review role coverage and compatibility notes, then accept the team or re-queue for a different draw."
      />

      {projectSetting ? (
        <OverflowQueueBanner
          overflowTeamsAllowed={projectSetting.overflowTeamsAllowed}
          formationDeadline={projectSetting.formationDeadline}
          volunteer={currentUser?.volunteer}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
        <section className="panel p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            {roster.map((user) => (
              <article key={user.id} className="panel-muted p-5">
                {(() => {
                  const matching = getMatchingSnapshot(state, user.id);
                  return (
                    <>
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{user.name}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <VerifiedBadge />
                            <RolePill role={result.roleAssignments[user.id]} />
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-ink/65">
                        Skills: {matching.skills.slice(0, 3).join(", ") || "None listed"}
                      </p>
                      <p className="mt-2 text-sm text-ink/65">
                        {matching.availability.map(sentenceCase).join(", ") || "Flexible"} •{" "}
                        {sentenceCase(matching.goalLevel)} • {sentenceCase(matching.workingStyle)}
                      </p>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        </section>

        <section className="panel space-y-5 p-6 md:p-8">
          <div>
            <p className="subtle-label">Compatibility summary</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {result.compatibilitySummary.map((item) => (
                <li key={item} className="rounded-[20px] border border-ink/10 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="subtle-label">Optional re-queue reason</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {requeueChips.map((item) => (
                <OptionChip
                  key={item}
                  selected={reasons.includes(item)}
                  onClick={() => setReasons(toggleInArray(reasons, item))}
                >
                  {item}
                </OptionChip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                const teamId = acceptQueueMatch();
                if (teamId) {
                  navigate("/student/team");
                }
              }}
            >
              Accept team
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                requeueQueueMatch();
                navigate("/student/match/queue/status");
              }}
            >
              Re-queue
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function TeamWorkspacePage() {
  const {
    addTeamTask,
    addMeetingOption,
    activeProjectId,
    currentProject,
    currentTeam,
    currentUser,
    removeTeamTask,
    sendTeamMessage,
    setActiveProject,
    state,
    studentProjects,
    studentTeams,
    toggleTask,
    updateTeamTask,
    voteMeetingOption,
  } = useApp();
  const [message, setMessage] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskFeedback, setTaskFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [meetingDraft, setMeetingDraft] = useState("");
  const [meetingFeedback, setMeetingFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const projectSetting = getProjectSettingSnapshot(
    state,
    currentProject?.id,
    currentProject?.teamSize,
    currentProject?.deadline,
  );

  useEffect(() => {
    setTaskDraft("");
    setTaskFeedback(null);
    setEditingTaskId(null);
    setEditingTaskTitle("");
    setMeetingDraft("");
    setMeetingFeedback(null);
  }, [currentTeam?.id]);

  if (!currentUser) {
    return null;
  }

  if (!currentProject) {
    return (
      <div className="space-y-4 md:space-y-6">
        <EmptyState
          title="No project selected yet"
          body="Join a project first, then you can form or open a team for that class workspace."
          action={<Link to="/student/join" className="btn-primary">Join a project</Link>}
        />
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="space-y-4 md:space-y-6">
        <PageIntro
          eyebrow="Team workspace"
          title={`No team is active for ${currentProject.name}.`}
          description="Each project keeps its own workspace. Switch projects below if you already have another team elsewhere, or start matching for the selected project."
        />

        <ProjectScopePicker
          currentProjectId={activeProjectId}
          projects={studentProjects}
          state={state}
          userId={currentUser.id}
          onSelect={setActiveProject}
          title="Project workspaces"
          description="Select the project whose team workspace you want to open."
        />

        <EmptyState
          title="No team on this project yet"
          body={
            studentTeams.length
              ? "You do have team workspaces on other projects. Switch above to open them, or form a new team for this selected project."
              : "Accept an AI or queue match to create the first team workspace."
          }
          action={<Link to="/student/match" className="btn-primary">Open matching</Link>}
        />
      </div>
    );
  }

  const teamMembers = state.users.filter((user) => currentTeam.memberIds.includes(user.id));
  const chatBucket = state.teamChat.find((bucket) => bucket.teamId === currentTeam.id);
  const taskBucket = state.teamTasks.find((bucket) => bucket.teamId === currentTeam.id);
  const tasks = taskBucket?.tasks || [];
  const meetingOptions = [...(currentTeam.meetingOptions || [])].sort(
    (left, right) =>
      right.voterIds.length - left.voterIds.length || left.startsAt.localeCompare(right.startsAt),
  );
  const leadingMeetingOption = meetingOptions[0];
  const currentVoteId = meetingOptions.find((option) => option.voterIds.includes(currentUser.id))?.id;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Team workspace"
        title={`Workspace for ${currentProject.name}`}
        description="Everything here is stored locally and survives refresh. Use the project switcher when you need to jump between multiple class teams."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="panel p-5 md:p-6">
          <p className="subtle-label">Team size</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {currentTeam.memberIds.length} member{currentTeam.memberIds.length === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-sm text-ink/65">
            {currentTeam.isOverflowTeam
              ? "Team size exception (+1) – admin allowed."
              : `Standard size target: ${projectSetting?.teamSize || currentProject.teamSize}.`}
          </p>
        </article>
        <article className="panel p-5 md:p-6">
          <p className="subtle-label">Formation mode</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {currentTeam.createdByMode === "ai" ? "AI proposal" : "Lucky Draw"}
          </p>
          <p className="mt-2 text-sm text-ink/65">
            {currentTeam.isOverflowTeam && currentTeam.overflowMemberId
              ? "An extra member was attached after team confirmation."
              : "This roster is confirmed and stored locally."}
          </p>
        </article>
        <article className="panel p-5 md:p-6">
          <p className="subtle-label">Overflow policy</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {projectSetting?.overflowTeamsAllowed || 0} allowed
          </p>
          <p className="mt-2 text-sm text-ink/65">
            Formation deadline {projectSetting ? formatDeadline(projectSetting.formationDeadline) : formatDeadline(currentProject.deadline)}
          </p>
        </article>
      </section>

      <ProjectScopePicker
        currentProjectId={activeProjectId}
        projects={studentProjects}
        state={state}
        userId={currentUser.id}
        onSelect={setActiveProject}
        title="Switch team workspace"
        description="A student can belong to multiple project teams. Select another project here to open its roster, chat, tasks, and meeting vote."
      />

      {currentUser.flags.chatMuted ? (
        <AccessBanner
          tone="warn"
          title="Chat is disabled for this account"
          description="You can still review messages, tasks, and meeting votes, but sending new messages is blocked."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.35fr,1fr,0.9fr]">
        <section className="panel flex min-h-[560px] flex-col p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="subtle-label">Team chat</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold text-ink">Conversation</h2>
            </div>
            <Link
              to={`/student/report?targetType=team&targetId=${currentTeam.id}`}
              className="btn-secondary"
            >
              Report team
            </Link>
          </div>
          <div className="mt-5 flex-1 space-y-3 overflow-y-auto rounded-[24px] bg-sand/45 p-4">
            {chatBucket?.messages.length ? (
              chatBucket.messages.map((entry) => {
                const author = teamMembers.find((member) => member.id === entry.userId);
                const mine = entry.userId === currentUser.id;
                const isSystem = entry.userId === "system";
                return (
                  <div
                    key={entry.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] rounded-[24px] px-4 py-3 text-sm",
                        mine ? "bg-ink text-white" : isSystem ? "bg-sand text-ink" : "bg-white text-ink",
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className={cn("font-semibold", mine ? "text-white/90" : "text-ink")}>
                          {isSystem ? "System" : author?.name || "Unknown"}
                        </span>
                        <span className={cn("text-xs", mine ? "text-white/60" : "text-ink/45")}>
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2">{entry.content}</p>
                      {!isSystem ? (
                        <Link
                          to={`/student/report?targetType=message&targetId=${entry.id}`}
                          className={cn(
                            "mt-3 inline-flex text-xs font-semibold",
                            mine ? "text-white/70" : "text-coral",
                          )}
                        >
                          Report message
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-ink/50">No messages yet. Start the kickoff.</p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="input flex-1"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Send a kickoff update"
            />
            <button
              className="btn-primary"
              onClick={() => {
                const result = sendTeamMessage(message);
                if (result.ok) {
                  setMessage("");
                }
              }}
            >
              Send
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <article className="panel p-5 md:p-6">
            <p className="subtle-label">To-do list</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1"
                value={taskDraft}
                onChange={(event) => {
                  setTaskDraft(event.target.value);
                  setTaskFeedback(null);
                }}
                placeholder="Add a team to-do item"
              />
              <button
                className="btn-primary"
                onClick={() => {
                  const result = addTeamTask(taskDraft);
                  setTaskFeedback({
                    tone: result.ok ? "success" : "error",
                    message: result.message,
                  });
                  if (result.ok) {
                    setTaskDraft("");
                  }
                }}
              >
                Add item
              </button>
            </div>
            {taskFeedback ? (
              <p
                className={cn(
                  "mt-3 text-sm",
                  taskFeedback.tone === "success" ? "text-mint" : "text-coral",
                )}
              >
                {taskFeedback.message}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {tasks.length ? (
                tasks.map((task) => {
                  const isEditing = editingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className="rounded-[20px] border border-ink/10 px-4 py-4"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <input
                                className="input"
                                value={editingTaskTitle}
                                onChange={(event) => {
                                  setEditingTaskTitle(event.target.value);
                                  setTaskFeedback(null);
                                }}
                              />
                            ) : (
                              <p className={task.status === "done" ? "text-ink/45 line-through" : "text-ink/75"}>
                                {task.title}
                              </p>
                            )}
                          </div>
                          <Badge tone={task.status === "done" ? "success" : "soft"}>
                            {task.status === "done" ? "Done" : "Todo"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            className={task.status === "done" ? "btn-secondary" : "btn-primary"}
                            onClick={() => toggleTask(task.id)}
                          >
                            {task.status === "done" ? "Mark todo" : "Mark done"}
                          </button>

                          {isEditing ? (
                            <>
                              <button
                                className="btn-primary"
                                onClick={() => {
                                  const result = updateTeamTask(task.id, editingTaskTitle);
                                  setTaskFeedback({
                                    tone: result.ok ? "success" : "error",
                                    message: result.message,
                                  });
                                  if (result.ok) {
                                    setEditingTaskId(null);
                                    setEditingTaskTitle("");
                                  }
                                }}
                              >
                                Save
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => {
                                  setEditingTaskId(null);
                                  setEditingTaskTitle("");
                                  setTaskFeedback(null);
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn-secondary"
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setEditingTaskTitle(task.title);
                                setTaskFeedback(null);
                              }}
                            >
                              Edit
                            </button>
                          )}

                          <button
                            className="btn-secondary"
                            onClick={() => {
                              const result = removeTeamTask(task.id);
                              setTaskFeedback({
                                tone: result.ok ? "success" : "error",
                                message: result.message,
                              });
                              if (result.ok && editingTaskId === task.id) {
                                setEditingTaskId(null);
                                setEditingTaskTitle("");
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-ink/50">
                  No to-do items yet. Add the first one for this team.
                </p>
              )}
            </div>
          </article>

          <article className="panel p-5 md:p-6">
            <p className="subtle-label">Meeting vote</p>
            <Field label="Suggest a meeting option">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="datetime-local"
                  className="input flex-1"
                  value={meetingDraft}
                  onChange={(event) => setMeetingDraft(event.target.value)}
                />
                <button
                  className="btn-primary"
                  onClick={() => {
                    const result = addMeetingOption(meetingDraft);
                    setMeetingFeedback({
                      tone: result.ok ? "success" : "error",
                      message: result.message,
                    });
                    if (result.ok) {
                      setMeetingDraft("");
                    }
                  }}
                >
                  Add option
                </button>
              </div>
            </Field>
            <p className="mt-4 text-sm text-ink/65">
              Each teammate gets one vote. Adding the same time again moves your vote there.
            </p>
            {meetingFeedback ? (
              <p
                className={cn(
                  "mt-3 text-sm",
                  meetingFeedback.tone === "success" ? "text-mint" : "text-coral",
                )}
              >
                {meetingFeedback.message}
              </p>
            ) : null}
            {leadingMeetingOption ? (
              <div className="mt-5 rounded-[20px] bg-sand/60 px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  Current leader: {formatMeetingOption(leadingMeetingOption.startsAt)}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {leadingMeetingOption.voterIds.length} vote
                  {leadingMeetingOption.voterIds.length === 1 ? "" : "s"} so far.
                </p>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {meetingOptions.length ? (
                meetingOptions.map((option) => {
                  const proposer = teamMembers.find((member) => member.id === option.proposedBy);
                  const hasMyVote = option.id === currentVoteId;
                  const isLeading = option.id === leadingMeetingOption?.id;

                  return (
                    <div key={option.id} className="rounded-[20px] border border-ink/10 px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{formatMeetingOption(option.startsAt)}</p>
                            {isLeading ? <Badge tone="success">Leading</Badge> : null}
                            {hasMyVote ? <Badge tone="soft">Your vote</Badge> : null}
                          </div>
                          <p className="mt-2 text-sm text-ink/65">
                            Proposed by {proposer?.name || "Team lead"} • {option.voterIds.length} vote
                            {option.voterIds.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <button
                          className={hasMyVote ? "btn-primary" : "btn-secondary"}
                          onClick={() => voteMeetingOption(option.id)}
                        >
                          {hasMyVote ? "Voted" : "Vote"}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-ink/50">
                  No meeting options yet. Add the first option to start the vote.
                </p>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <article className="panel p-5 md:p-6">
            <p className="subtle-label">Roster</p>
            {currentTeam.isOverflowTeam ? (
              <p className="mt-3 text-sm text-ink/65">
                {currentTeam.memberIds.length} members (overflow +1)
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              {teamMembers.map((member) => (
                <div key={member.id} className="rounded-[20px] border border-ink/10 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar user={member} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{member.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <VerifiedBadge />
                        <RolePill role={currentTeam.roles[member.id]} />
                        {currentTeam.overflowMemberId === member.id ? (
                          <Badge tone="soft">Overflow +1</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/student/report?targetType=user&targetId=${member.id}`}
                    className="mt-4 inline-flex text-xs font-semibold text-coral"
                  >
                    Report user
                  </Link>
                </div>
              ))}
            </div>
          </article>

          <article className="panel p-5 md:p-6">
            <p className="subtle-label">Compatibility summary</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/65">
              {currentTeam.compatibilitySummary.map((item) => (
                <li key={item} className="rounded-[20px] bg-sand/60 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const { currentUser, markAllNotificationsRead, markNotificationRead, removeNotification, state } = useApp();

  if (!currentUser) {
    return null;
  }

  const notifications = state.notifications.filter((item) => item.userId === currentUser.id);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Notifications"
        title="Watch proposal invites, team confirmations, and moderation updates."
        description="Notifications are personal to the logged-in account and persist in localStorage."
        actions={
          <button className="btn-secondary" onClick={() => markAllNotificationsRead()}>
            Mark all read
          </button>
        }
      />

      <section className="space-y-4">
        {notifications.length ? (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className={cn(
                "panel p-6",
                notification.read ? "opacity-80" : "ring-2 ring-gold/30",
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    {!notification.read ? <Badge tone="warn">New</Badge> : <Badge tone="soft">Read</Badge>}
                    <Badge tone="soft">{getNotificationTypeLabel(notification.type)}</Badge>
                    <p className="font-semibold text-ink">{notification.title}</p>
                  </div>
                  <p className="mt-3 text-sm text-ink/65">{notification.body}</p>
                  <p className="mt-3 text-xs text-ink/45">{formatDate(notification.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-3 md:justify-end">
                  {notification.link ? (
                    <Link to={notification.link} className="btn-secondary">
                      Open
                    </Link>
                  ) : null}
                  {!notification.read ? (
                    <button className="btn-primary" onClick={() => markNotificationRead(notification.id)}>
                      Mark read
                    </button>
                  ) : null}
                  <button className="btn-secondary" onClick={() => removeNotification(notification.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="No notifications yet" body="Proposal invites, project joins, team creation, and report updates will appear here." />
        )}
      </section>
    </div>
  );
}

export function ReportPage() {
  const { currentTeam, currentUser, state, submitReport } = useApp();
  const [params] = useSearchParams();
  const [targetType, setTargetType] = useState<TargetType>(
    (params.get("targetType") as TargetType) || "user",
  );
  const [targetId, setTargetId] = useState(params.get("targetId") || "");
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [severity, setSeverity] = useState<ReportSeverity>("medium");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const teamMessages = state.teamChat.find((bucket) => bucket.teamId === currentTeam?.id)?.messages || [];
  const targetOptions =
    targetType === "team"
        ? currentTeam
          ? [{ id: currentTeam.id, label: "Current team workspace" }]
          : []
      : targetType === "message"
        ? teamMessages.map((message) => ({
            id: message.id,
            label: `${state.users.find((user) => user.id === message.userId)?.name || "Unknown"}: ${message.content.slice(0, 30)}`,
          }))
        : state.users
            .filter((user) => user.role === "student" && user.id !== currentUser?.id)
            .map((user) => ({ id: user.id, label: user.name }));

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Report"
        title="Flag behavior, content, or team issues."
        description="Reports are never anonymous in this prototype. Moderators can review context, take action, and the audit log is stored inside each report."
      />

      <section className="panel grid gap-5 p-6 md:grid-cols-2 md:p-8">
        <Field label="Target type">
          <select
            className="input"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setTargetId("");
            }}
          >
            <option value="user">User</option>
            <option value="message">Message</option>
            <option value="profile">Profile</option>
            <option value="team">Team</option>
          </select>
        </Field>
        <Field label="Target">
          {targetOptions.length ? (
            <select className="input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select target</option>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder="Enter target id"
            />
          )}
        </Field>
        <Field label="Category">
          <select
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value as ReportCategory)}
          >
            <option value="harassment">Harassment</option>
            <option value="inappropriate content">Inappropriate content</option>
            <option value="spam/misuse">Spam / misuse</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Severity">
          <select
            className="input"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as ReportSeverity)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what happened and why it should be reviewed."
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Optional evidence">
            <textarea
              className="textarea"
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="Any supporting notes, copied text, or timeline."
            />
          </Field>
        </div>
        {submitState !== "idle" ? (
          <div
            className={cn(
              "rounded-[20px] px-4 py-3 text-sm md:col-span-2",
              submitState === "success"
                ? "bg-tide/10 text-tide"
                : "bg-coral/10 text-coral",
            )}
          >
            {submitMessage}
          </div>
        ) : null}
        <button
          className="btn-primary md:col-span-2"
          onClick={() => {
            if (!targetId || !description.trim()) {
              setSubmitState("error");
              setSubmitMessage("Choose a target and add a description before submitting.");
              return;
            }
            const result = submitReport({
              targetType,
              targetId,
              category,
              severity,
              description,
              evidence,
            });
            setSubmitState(result.ok ? "success" : "error");
            setSubmitMessage(result.message);
            if (result.ok) {
              setDescription("");
              setEvidence("");
            }
          }}
        >
          {submitState === "success" ? "Report sent" : "Submit report"}
        </button>
      </section>
    </div>
  );
}
