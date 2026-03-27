import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { resolveMatchingProfile } from "@/lib/matching";
import type {
  AiAnswers,
  AvailabilitySlot,
  ContactMethod,
  GoalLevel,
  MeetingPreference,
  ResponseTime,
  ProjectRole,
  QueueConstraints,
  ReportCategory,
  ReportSeverity,
  TargetType,
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
          value={currentProject ? formatDeadline(currentProject.deadline) : "Join first"}
          detail={currentProject ? currentProject.name : "No active project selected"}
        />
        <StatCard
          label="Teams"
          value={studentTeams.length}
          detail={currentTeam ? `Selected project: ${sentenceCase(currentTeam.createdByMode)}` : "No team on selected project yet"}
        />
      </div>

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
  const { currentUser, updateCurrentUser } = useApp();
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
  const [saved, setSaved] = useState(false);

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
            <p className="mt-2 text-sm text-ink/70">{notes || "No extra boundaries or notes added yet."}</p>
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
  const { acceptAiMatch, currentProject, currentUser, rematchAi, state } = useApp();
  const navigate = useNavigate();

  const session = getCurrentAiSession(currentUser?.id, currentProject?.id, state.aiSessions);
  const result = session?.lastResult;

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
        description="The roster is transparent by design. You can see roles, verification, and compatibility notes before accepting."
      />

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
                const teamId = acceptAiMatch();
                if (teamId) {
                  navigate("/student/team");
                }
              }}
            >
              Accept roster
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
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isInactive = Boolean(queue && !queue.inQueue && !queue.lastMatch);
  const queueStart = queue?.startedAt ? new Date(queue.startedAt).getTime() : now;
  const queueEnd = queueStart + (queue?.etaSeconds || 45) * 1000;
  const remaining = isInactive ? queue?.etaSeconds || 45 : Math.max(0, Math.ceil((queueEnd - now) / 1000));

  useEffect(() => {
    if (!queue || !queue.inQueue || queue.lastMatch || remaining > 0) {
      return;
    }
    resolveQueueMatch();
  }, [queue, remaining, resolveQueueMatch]);

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
    activeProjectId,
    currentProject,
    currentTeam,
    currentUser,
    sendTeamMessage,
    setActiveProject,
    setMeetingTime,
    state,
    studentProjects,
    studentTeams,
    toggleTask,
  } = useApp();
  const [message, setMessage] = useState("");

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

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Team workspace"
        title={`Workspace for ${currentProject.name}`}
        description="Everything here is stored locally and survives refresh. Use the project switcher when you need to jump between multiple class teams."
      />

      <ProjectScopePicker
        currentProjectId={activeProjectId}
        projects={studentProjects}
        state={state}
        userId={currentUser.id}
        onSelect={setActiveProject}
        title="Switch team workspace"
        description="A student can belong to multiple project teams. Select another project here to open its roster, chat, tasks, and meeting plan."
      />

      {currentUser.flags.chatMuted ? (
        <AccessBanner
          tone="warn"
          title="Chat is disabled for this account"
          description="You can still review messages, tasks, and meeting time, but sending new messages is blocked."
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
                return (
                  <div key={entry.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-[24px] px-4 py-3 text-sm",
                        mine ? "bg-ink text-white" : "bg-white text-ink",
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className={cn("font-semibold", mine ? "text-white/90" : "text-ink")}>
                          {author?.name || "Unknown"}
                        </span>
                        <span className={cn("text-xs", mine ? "text-white/60" : "text-ink/45")}>
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2">{entry.content}</p>
                      <Link
                        to={`/student/report?targetType=message&targetId=${entry.id}`}
                        className={cn(
                          "mt-3 inline-flex text-xs font-semibold",
                          mine ? "text-white/70" : "text-coral",
                        )}
                      >
                        Report message
                      </Link>
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
            <p className="subtle-label">Starter tasks</p>
            <div className="mt-4 space-y-3">
              {taskBucket?.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  className="flex w-full items-center justify-between rounded-[20px] border border-ink/10 px-4 py-3 text-left text-sm"
                >
                  <span className={task.status === "done" ? "line-through text-ink/45" : "text-ink/70"}>
                    {task.title}
                  </span>
                  <Badge tone={task.status === "done" ? "success" : "soft"}>
                    {task.status === "done" ? "Done" : "Todo"}
                  </Badge>
                </button>
              ))}
            </div>
          </article>

          <article className="panel p-5 md:p-6">
            <p className="subtle-label">Meeting</p>
            <Field label="Pick a meeting time">
              <input
                type="datetime-local"
                className="input"
                value={currentTeam.meetingTime || ""}
                onChange={(event) => setMeetingTime(event.target.value)}
              />
            </Field>
            {currentTeam.meetingTime ? (
              <p className="mt-4 text-sm text-ink/65">
                Saved locally for this team: {currentTeam.meetingTime.replace("T", " ")}
              </p>
            ) : null}
          </article>
        </section>

        <section className="space-y-4">
          <article className="panel p-5 md:p-6">
            <p className="subtle-label">Roster</p>
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
  const { currentUser, markAllNotificationsRead, markNotificationRead, state } = useApp();

  if (!currentUser) {
    return null;
  }

  const notifications = state.notifications.filter((item) => item.userId === currentUser.id);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Notifications"
        title="Watch join events, match confirmations, and moderation updates."
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
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="No notifications yet" body="Project joins, team creation, and report updates will appear here." />
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
