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
import type {
  AiAnswers,
  AvailabilitySlot,
  GoalLevel,
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
  GOAL_OPTIONS,
  ROLE_OPTIONS,
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
  const { currentProject, currentTeam, currentUser, state } = useApp();

  if (!currentUser) {
    return null;
  }

  const profileReady =
    currentUser.profile.skills.length > 0 &&
    Boolean(currentUser.profile.bio.trim()) &&
    currentUser.profile.availability.length > 0;
  const progress = completionScore({
    hasProfile: profileReady,
    hasProject: Boolean(currentProject),
    hasTeam: Boolean(currentTeam),
  });
  const joinedProjects = state.projects.filter((project) =>
    state.memberships.some(
      (membership) =>
        membership.userId === currentUser.id &&
        membership.projectId === project.id &&
        membership.status === "active",
    ),
  );

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
        <StatCard label="Projects" value={joinedProjects.length} detail="Active memberships on this account" />
        <StatCard
          label="Deadline"
          value={currentProject ? formatDeadline(currentProject.deadline) : "Join first"}
          detail={currentProject ? currentProject.name : "No active project selected"}
        />
        <StatCard
          label="Team mode"
          value={currentTeam ? sentenceCase(currentTeam.createdByMode) : "Pending"}
          detail={currentTeam ? "Workspace is available now" : "Choose AI chat or Lucky Draw"}
        />
      </div>

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
                Skills: {currentUser.profile.skills.join(", ") || "Add 2-3 skills"}
              </p>
              <p className="mt-2 text-sm text-ink/70">
                Availability:{" "}
                {currentUser.profile.availability.length
                  ? currentUser.profile.availability.map(sentenceCase).join(", ")
                  : "Pick your meeting windows"}
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
  const [code, setCode] = useState(state.projects[0]?.joinCode || "");
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
          <Field label="Project join code" hint="Example: GF-MOBIL-7X3A">
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter join code"
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
  const [bio, setBio] = useState(currentUser?.profile.bio || "");
  const [skills, setSkills] = useState(currentUser?.profile.skills.join(", ") || "");
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    currentUser?.profile.availability || [],
  );
  const [goalLevel, setGoalLevel] = useState<GoalLevel>(
    currentUser?.profile.goalLevel || "balanced",
  );
  const [workingStyle, setWorkingStyle] = useState<WorkingStyle>(
    currentUser?.profile.workingStyle || "collab",
  );
  const [rolePreference, setRolePreference] = useState<ProjectRole>(
    currentUser?.profile.rolePreference || "UI/Design",
  );
  const [secondaryRole, setSecondaryRole] = useState<ProjectRole | "">(
    currentUser?.profile.secondaryRole || "",
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    setName(currentUser.name);
    setBio(currentUser.profile.bio);
    setSkills(currentUser.profile.skills.join(", "));
    setAvailability(currentUser.profile.availability);
    setGoalLevel(currentUser.profile.goalLevel);
    setWorkingStyle(currentUser.profile.workingStyle);
    setRolePreference(currentUser.profile.rolePreference);
    setSecondaryRole(currentUser.profile.secondaryRole || "");
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Transparent profile"
        title="Tell classmates how you work."
        description="Profiles are visible during matching and inside team rosters. Keep your role preference, availability, and working style current."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr,0.8fr]">
        <section className="panel grid gap-5 p-6 md:grid-cols-2 md:p-8">
          <Field label="Display name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Primary role">
            <select
              className="input"
              value={rolePreference}
              onChange={(event) => setRolePreference(event.target.value as ProjectRole)}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Secondary role">
            <select
              className="input"
              value={secondaryRole}
              onChange={(event) => setSecondaryRole(event.target.value as ProjectRole | "")}
            >
              <option value="">Optional</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Skills" hint="Comma-separated works well for the demo.">
            <input
              className="input"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="React, Figma, SQL"
            />
          </Field>
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
            <Field label="Bio">
              <textarea
                className="textarea"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="What kind of teammate are you?"
              />
            </Field>
          </div>
          <button
            className="btn-primary md:col-span-2"
            onClick={() => {
              updateCurrentUser({
                name,
                profile: {
                  bio,
                  skills: skills
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  availability,
                  goalLevel,
                  workingStyle,
                  rolePreference,
                  secondaryRole: secondaryRole || undefined,
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
              <p className="font-semibold text-ink">{currentUser.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VerifiedBadge />
                <RolePill role={rolePreference} />
              </div>
            </div>
          </div>
          <div className="panel-muted p-5">
            <p className="subtle-label">Preview</p>
            <p className="mt-3 text-sm text-ink/70">{bio || "Add a short teammate bio."}</p>
            <p className="mt-4 text-sm text-ink/70">
              Skills:{" "}
              {skills
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .join(", ") || "None listed"}
            </p>
            <p className="mt-2 text-sm text-ink/70">
              Availability: {availability.length ? availability.map(sentenceCase).join(", ") : "None"}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function MatchModePickerPage() {
  const { currentProject, currentTeam, currentUser } = useApp();

  if (!currentProject) {
    return (
      <EmptyState
        title="Join a project before matching"
        body="Matching is only available once your verified account is attached to a project by join code."
        action={<Link to="/student/join" className="btn-primary">Join a project</Link>}
      />
    );
  }

  if (currentTeam) {
    return (
      <EmptyState
        title="A team already exists for you"
        body="Open your workspace to continue with chat, tasks, meeting planning, or reporting."
        action={<Link to="/student/team" className="btn-primary">Open team workspace</Link>}
      />
    );
  }

  if (currentUser?.flags.matchingRestricted) {
    return (
      <EmptyState
        title="Matching is currently unavailable"
        body="An instructor has restricted this account from forming new teams. Check notifications for the moderation record."
        action={<Link to="/student/notifications" className="btn-primary">View notifications</Link>}
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
          <Link to="/student/match/ai" className="btn-primary mt-8">
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
          <Link to="/student/match/queue/roles" className="btn-primary mt-8">
            Join Lucky Draw
          </Link>
        </article>
      </div>
    </div>
  );
}

export function AIChatPage() {
  const { currentUser, runAiMatch } = useApp();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [skillsDraft, setSkillsDraft] = useState<string[]>(currentUser?.profile.skills || []);
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilitySlot[]>(
    currentUser?.profile.availability || [],
  );
  const [answers, setAnswers] = useState<Partial<AiAnswers>>({
    rolePreference: currentUser?.profile.rolePreference || "UI/Design",
    goalLevel: currentUser?.profile.goalLevel || "balanced",
    workingStyle: currentUser?.profile.workingStyle || "collab",
  });
  const [error, setError] = useState<string | null>(null);

  const currentStep = AI_CHAT_STEPS[stepIndex];

  function submitCurrentMultiSelect() {
    if (currentStep.id === "skills") {
      if (skillsDraft.length === 0) {
        setError("Pick at least one skill to continue.");
        return;
      }
      setAnswers((previous) => ({ ...previous, skills: skillsDraft }));
    }
    if (currentStep.id === "availability") {
      if (availabilityDraft.length === 0) {
        setError("Pick at least one availability window to continue.");
        return;
      }
      setAnswers((previous) => ({ ...previous, availability: availabilityDraft }));
    }
    setError(null);
    if (stepIndex === AI_CHAT_STEPS.length - 1) {
      const result = runAiMatch({
        rolePreference: (answers.rolePreference || "UI/Design") as ProjectRole,
        skills: currentStep.id === "skills" ? skillsDraft : answers.skills || skillsDraft,
        availability:
          currentStep.id === "availability"
            ? availabilityDraft
            : answers.availability || availabilityDraft,
        goalLevel: (answers.goalLevel || "balanced") as GoalLevel,
        workingStyle: (answers.workingStyle || "collab") as WorkingStyle,
      });
      if (result) {
        navigate("/student/match/ai/result");
      } else {
        setError("No match suggestion is available yet. Make sure you joined a project.");
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
                        if (stepIndex === AI_CHAT_STEPS.length - 1) {
                          const result = runAiMatch({
                            rolePreference:
                              currentStep.id === "rolePreference"
                                ? (option as ProjectRole)
                                : ((answers.rolePreference || "UI/Design") as ProjectRole),
                            skills: answers.skills || skillsDraft,
                            availability: answers.availability || availabilityDraft,
                            goalLevel:
                              currentStep.id === "goalLevel"
                                ? (option as GoalLevel)
                                : ((answers.goalLevel || "balanced") as GoalLevel),
                            workingStyle:
                              currentStep.id === "workingStyle"
                                ? (option as WorkingStyle)
                                : ((answers.workingStyle || "collab") as WorkingStyle),
                          });
                          if (result) {
                            navigate("/student/match/ai/result");
                          }
                        } else {
                          setStepIndex((index) => index + 1);
                        }
                      }}
                    >
                      {option.includes("-") ? sentenceCase(option) : option}
                    </OptionChip>
                  ))}
          </div>

          {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

          {(currentStep.id === "skills" || currentStep.id === "availability") ? (
            <button className="btn-primary mt-6" onClick={submitCurrentMultiSelect}>
              {stepIndex === AI_CHAT_STEPS.length - 1 ? "Generate match" : "Continue"}
            </button>
          ) : null}
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
  const [primaryRole, setPrimaryRole] = useState<ProjectRole>(
    queue?.primaryRole || currentUser?.profile.rolePreference || "UI/Design",
  );
  const [secondaryRole, setSecondaryRole] = useState<ProjectRole | "">(queue?.secondaryRole || "");

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Lucky Draw role queue"
        title="Claim the role you want to own first."
        description="Primary role is required. Secondary role is optional and helps the queue cover gaps without hiding identities."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ROLE_OPTIONS.map((role) => (
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
            <p className="mt-3 text-sm text-ink/65">{ROLE_DESCRIPTIONS[role]}</p>
          </button>
        ))}
      </div>

      <section className="panel p-6 md:p-8">
        <Field label="Secondary role (optional)">
          <div className="flex flex-wrap gap-3">
            {ROLE_OPTIONS.map((role) => (
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
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    queue?.constraints?.availability || currentUser?.profile.availability || [],
  );
  const [goalLevel, setGoalLevel] = useState<GoalLevel>(
    queue?.constraints?.goalLevel || currentUser?.profile.goalLevel || "balanced",
  );
  const [workingStyle, setWorkingStyle] = useState<WorkingStyle>(
    queue?.constraints?.workingStyle || currentUser?.profile.workingStyle || "collab",
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
              {ROLE_OPTIONS.map((role) => (
                <div key={role} className="flex items-center justify-between rounded-[20px] border border-ink/10 px-4 py-3 text-sm">
                  <span>{role}</span>
                  <span className="font-semibold text-ink/70">
                    {
                      peers.filter(
                        (user) =>
                          user.profile.rolePreference === role || user.profile.secondaryRole === role,
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
                  {user.profile.skills.slice(0, 3).join(", ")} • {sentenceCase(user.profile.workingStyle)}
                </p>
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
  const { currentTeam, currentUser, sendTeamMessage, setMeetingTime, state, toggleTask } = useApp();
  const [message, setMessage] = useState("");

  if (!currentTeam || !currentUser) {
    return (
      <EmptyState
        title="No active team yet"
        body="Accept an AI or queue match to create the team workspace."
        action={<Link to="/student/match" className="btn-primary">Open matching</Link>}
      />
    );
  }

  const teamMembers = state.users.filter((user) => currentTeam.memberIds.includes(user.id));
  const chatBucket = state.teamChat.find((bucket) => bucket.teamId === currentTeam.id);
  const taskBucket = state.teamTasks.find((bucket) => bucket.teamId === currentTeam.id);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Team workspace"
        title="One place for roster, chat, tasks, meeting, and reporting."
        description="Everything here is stored locally and survives refresh. Use the report links on the team or specific chat messages if something goes wrong."
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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [targetType, setTargetType] = useState<TargetType>(
    (params.get("targetType") as TargetType) || "user",
  );
  const [targetId, setTargetId] = useState(params.get("targetId") || "");
  const [category, setCategory] = useState<ReportCategory>("harassment");
  const [severity, setSeverity] = useState<ReportSeverity>("medium");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");

  const teamMembers = currentTeam
    ? state.users.filter((user) => currentTeam.memberIds.includes(user.id))
    : [];
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
        : teamMembers
            .filter((member) => member.id !== currentUser?.id)
            .map((member) => ({ id: member.id, label: member.name }));

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
        <button
          className="btn-primary md:col-span-2"
          onClick={() => {
            if (!targetId || !description.trim()) {
              return;
            }
            submitReport({ targetType, targetId, category, severity, description, evidence });
            navigate("/student/notifications");
          }}
        >
          Submit report
        </button>
      </section>
    </div>
  );
}
