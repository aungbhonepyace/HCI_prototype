import { useDeferredValue, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, EmptyState, Field, OptionChip, PageIntro, RolePill, StatCard, VerifiedBadge } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { resolveMatchingProfile } from "@/lib/matching";
import { defaultProjectPayload, validatePasswordStrength } from "@/lib/storage";
import type {
  ContactMethod,
  MeetingPreference,
  ReportCategory,
  ReportSeverity,
  ReportStatus,
  ResponseTime,
  User,
} from "@/lib/types";
import {
  CONTACT_METHOD_OPTIONS,
  MEETING_PREFERENCE_OPTIONS,
  RESPONSE_TIME_OPTIONS,
  ROLE_OPTIONS,
  cn,
  formatDate,
  formatDeadline,
  sentenceCase,
} from "@/lib/utils";

interface StudentFormState {
  name: string;
  email: string;
  verified: boolean;
  bio: string;
  major: string;
  year: string;
  preferredContactMethod: ContactMethod;
  responseTime: ResponseTime;
  meetingPreference: MeetingPreference;
  timeZone: string;
  notes: string;
}

function buildStudentForm(student?: User): StudentFormState {
  return {
    name: student?.name || "",
    email: student?.email || "",
    verified: student?.verified ?? true,
    bio: student?.profile.bio || "",
    major: student?.profile.major || "",
    year: student?.profile.year || "",
    preferredContactMethod: student?.profile.preferredContactMethod || "Email",
    responseTime: student?.profile.responseTime || "same day",
    meetingPreference: student?.profile.meetingPreference || "Mixed",
    timeZone: student?.profile.timeZone || "Asia/Bangkok",
    notes: student?.profile.notes || "",
  };
}

function getMatchingSnapshot(state: ReturnType<typeof useApp>["state"], userId: string) {
  return resolveMatchingProfile(state, userId);
}

function getProjectSettingSnapshot(
  state: ReturnType<typeof useApp>["state"],
  projectId: string,
  teamSize: number,
  deadline: string,
) {
  return (
    state.projectSettings.find((setting) => setting.projectId === projectId) || {
      projectId,
      teamSize,
      proposalExpiryMinutes: 30,
      overflowTeamsAllowed: 0,
      formationDeadline: deadline,
      forceOverflowAtDeadline: true,
    }
  );
}

function getOverflowSnapshot(
  state: ReturnType<typeof useApp>["state"],
  projectId: string,
  overflowTeamsAllowed: number,
) {
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

function getProjectMetrics(
  state: ReturnType<typeof useApp>["state"],
  projectId: string,
) {
  const memberships = state.memberships.filter(
    (membership) => membership.projectId === projectId && membership.status === "active",
  );
  const uniqueMemberIds = [...new Set(memberships.map((membership) => membership.userId))];
  const unmatchedIds = [
    ...new Set(
      memberships
        .filter((membership) => membership.matchingStatus !== "confirmed")
        .map((membership) => membership.userId),
    ),
  ];

  return {
    enrollmentCount: uniqueMemberIds.length,
    confirmedTeamCount: state.teams.filter((team) => team.projectId === projectId).length,
    unmatchedCount: unmatchedIds.length,
    volunteersAvailable: uniqueMemberIds.filter((userId) => {
      const user = state.users.find((entry) => entry.id === userId);
      return Boolean(user?.volunteer && !state.memberships.some(
        (membership) =>
          membership.userId === userId &&
          membership.projectId === projectId &&
          membership.matchingStatus === "confirmed",
      ));
    }).length,
  };
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function ProjectPolicyCard({ project }: { project: ReturnType<typeof useApp>["state"]["projects"][number] }) {
  const { regenerateJoinCode, state, updateProjectSettings } = useApp();
  const setting = getProjectSettingSnapshot(state, project.id, project.teamSize, project.deadline);
  const overflow = getOverflowSnapshot(state, project.id, setting.overflowTeamsAllowed);
  const metrics = getProjectMetrics(state, project.id);
  const [overflowTeamsAllowed, setOverflowTeamsAllowed] = useState(setting.overflowTeamsAllowed);
  const [formationDeadline, setFormationDeadline] = useState(
    toDateTimeLocalValue(setting.formationDeadline),
  );
  const [forceOverflowAtDeadline, setForceOverflowAtDeadline] = useState(
    setting.forceOverflowAtDeadline,
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setOverflowTeamsAllowed(setting.overflowTeamsAllowed);
    setFormationDeadline(toDateTimeLocalValue(setting.formationDeadline));
    setForceOverflowAtDeadline(setting.forceOverflowAtDeadline);
  }, [setting.forceOverflowAtDeadline, setting.formationDeadline, setting.overflowTeamsAllowed]);

  return (
    <article className="panel p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="subtle-label">Join code</p>
          <h2 className="mt-3 break-all font-heading text-2xl font-semibold text-ink md:text-3xl">
            {project.joinCode}
          </h2>
          <p className="mt-3 text-sm text-ink/65">{project.name}</p>
        </div>
        <button className="btn-secondary self-start md:shrink-0" onClick={() => regenerateJoinCode(project.id)}>
          Regenerate code
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {project.roleTemplates.map((role) => (
          <RolePill key={role} role={role} />
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Students</p>
          <p className="mt-4 font-heading text-3xl font-semibold leading-[1.05] text-ink">
            {metrics.enrollmentCount}
          </p>
        </div>
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Confirmed teams</p>
          <p className="mt-4 font-heading text-3xl font-semibold leading-[1.05] text-ink">
            {metrics.confirmedTeamCount}
          </p>
        </div>
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Unmatched</p>
          <p className="mt-4 font-heading text-3xl font-semibold leading-[1.05] text-ink">
            {metrics.unmatchedCount}
          </p>
        </div>
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Volunteers</p>
          <p className="mt-4 font-heading text-3xl font-semibold leading-[1.05] text-ink">
            {metrics.volunteersAvailable}
          </p>
        </div>
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Overflow</p>
          <p className="mt-4 font-heading text-3xl font-semibold leading-[1.05] text-ink">
            {overflow.overflowSlotsFilled}/{setting.overflowTeamsAllowed}
          </p>
        </div>
        <div className="panel-muted flex min-h-[126px] flex-col justify-between p-4">
          <p className="subtle-label">Finalized</p>
          <p className="mt-4 font-heading text-2xl font-semibold leading-[1.05] text-ink">
            {overflow.deadlineFinalized ? "Yes" : "Not yet"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink/65">
        Project deadline {formatDeadline(project.deadline)} • Formation deadline{" "}
        {formatDeadline(setting.formationDeadline)} • Team size {project.teamSize}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Overflow teams allowed">
          <input
            type="number"
            min={0}
            className="input"
            value={overflowTeamsAllowed}
            onChange={(event) => setOverflowTeamsAllowed(Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="Formation deadline">
          <input
            type="datetime-local"
            className="input"
            value={formationDeadline}
            onChange={(event) => setFormationDeadline(event.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <label className="flex min-h-[68px] items-center justify-between rounded-[24px] border border-ink/10 px-5 py-4">
            <div>
              <p className="font-semibold text-ink">Force overflow at deadline</p>
              <p className="mt-1 text-sm text-ink/55">
                If volunteers are still missing, unmatched students are placed into the remaining allowed overflow slots.
              </p>
            </div>
            <input
              type="checkbox"
              checked={forceOverflowAtDeadline}
              onChange={(event) => setForceOverflowAtDeadline(event.target.checked)}
              className="h-5 w-5 accent-ink"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="btn-primary"
          onClick={() => {
            const result = updateProjectSettings({
              projectId: project.id,
              overflowTeamsAllowed,
              formationDeadline,
              forceOverflowAtDeadline,
            });
            setMessage(result.message);
          }}
        >
          Save overflow policy
        </button>
        {overflow.forcedOverflowMemberIds.length ? (
          <Badge tone="warn">{overflow.forcedOverflowMemberIds.length} forced placements</Badge>
        ) : null}
      </div>

      {message ? <p className="mt-3 text-sm text-ink/65">{message}</p> : null}
    </article>
  );
}

export function AdminDashboardPage() {
  const { state } = useApp();

  const studentCount = state.users.filter((user) => user.role === "student").length;
  const newReports = state.reports.filter((report) => report.status === "New").length;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Instructor / TA"
        title="Monitor matching, join access, rosters, and moderation."
        description="The admin console covers class setup, join codes, student oversight, and report actions without a backend."
        actions={
          <>
            <Link to="/admin/classes" className="btn-primary">
              Create class
            </Link>
            <Link to="/admin/account" className="btn-secondary">
              Account
            </Link>
            <Link to="/admin/reports" className="btn-secondary">
              Review reports
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Classes" value={state.classes.length} detail="Configured course spaces" />
        <StatCard label="Projects" value={state.projects.length} detail="Project instances with join codes" />
        <StatCard label="Students" value={studentCount} detail="Verified student accounts in storage" />
        <StatCard label="New reports" value={newReports} detail="Open moderation items waiting on action" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Project overview</p>
          <div className="mt-4 space-y-4">
            {state.projects.map((project) => (
              (() => {
                const setting = getProjectSettingSnapshot(state, project.id, project.teamSize, project.deadline);
                const overflow = getOverflowSnapshot(state, project.id, setting.overflowTeamsAllowed);
                const metrics = getProjectMetrics(state, project.id);

                return (
                  <article key={project.id} className="rounded-[24px] border border-ink/10 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h2 className="font-heading text-2xl font-semibold text-ink">{project.name}</h2>
                        <p className="mt-2 text-sm text-ink/65">{project.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone="soft">{project.joinCode}</Badge>
                          <Badge tone="soft">Team size {project.teamSize}</Badge>
                          <Badge tone="soft">
                            Overflow {overflow.overflowSlotsFilled}/{setting.overflowTeamsAllowed}
                          </Badge>
                          <span className="text-xs text-ink/45">
                            Formation deadline {formatDeadline(setting.formationDeadline)}
                          </span>
                        </div>
                      </div>
                      <Link
                        to={`/admin/classes/${project.classId}/projects`}
                        className="btn-secondary self-start md:shrink-0"
                      >
                        Manage project
                      </Link>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[20px] bg-sand/70 px-4 py-4">
                        <p className="subtle-label">Students</p>
                        <p className="mt-4 font-heading text-2xl font-semibold leading-[1.05] text-ink">
                          {metrics.enrollmentCount}
                        </p>
                      </div>
                      <div className="rounded-[20px] bg-sand/70 px-4 py-4">
                        <p className="subtle-label">Confirmed teams</p>
                        <p className="mt-4 font-heading text-2xl font-semibold leading-[1.05] text-ink">
                          {metrics.confirmedTeamCount}
                        </p>
                      </div>
                      <div className="rounded-[20px] bg-sand/70 px-4 py-4">
                        <p className="subtle-label">Unmatched</p>
                        <p className="mt-4 font-heading text-2xl font-semibold leading-[1.05] text-ink">
                          {metrics.unmatchedCount}
                        </p>
                      </div>
                      <div className="rounded-[20px] bg-sand/70 px-4 py-4">
                        <p className="subtle-label">Volunteers</p>
                        <p className="mt-4 font-heading text-2xl font-semibold leading-[1.05] text-ink">
                          {metrics.volunteersAvailable}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-ink/55">
                      Deadline finalized: {overflow.deadlineFinalized ? "Yes" : "No"} • Project deadline {formatDeadline(project.deadline)}
                    </p>
                  </article>
                );
              })()
            ))}
          </div>
        </section>

        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Moderation snapshot</p>
          <div className="mt-4 space-y-4">
            {state.reports.slice(0, 4).map((report) => (
              <article key={report.id} className="rounded-[24px] border border-ink/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={report.status === "Resolved" ? "success" : "warn"}>{report.status}</Badge>
                  <Badge tone="soft">{report.category}</Badge>
                  <Badge tone="soft">{report.severity}</Badge>
                </div>
                <p className="mt-3 text-sm text-ink/70">{report.description}</p>
                <p className="mt-3 text-xs text-ink/45">{formatDate(report.createdAt)}</p>
              </article>
            ))}
            {!state.reports.length ? (
              <p className="text-sm text-ink/55">No reports yet. Student submissions will appear here.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AdminAccountPage() {
  const { adminCreateAdmin, changeCurrentPassword, currentUser, updateCurrentUser } = useApp();
  const [accountName, setAccountName] = useState(currentUser?.name || "");
  const [accountEmail, setAccountEmail] = useState(currentUser?.email || "");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityTone, setSecurityTone] = useState<"success" | "error">("error");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminMessageTone, setAdminMessageTone] = useState<"success" | "error">("error");
  const nextPasswordChecks = validatePasswordStrength(nextPassword);
  const adminPasswordChecks = validatePasswordStrength(adminPassword);

  useEffect(() => {
    setAccountName(currentUser?.name || "");
    setAccountEmail(currentUser?.email || "");
  }, [currentUser]);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Account"
        title="Manage admin access and password security."
        description="Update your own password here and create additional admin accounts for instructors or TAs."
      />

      <section className="panel p-6 md:p-8">
        <p className="subtle-label">Your account</p>
        <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">Update your admin profile</h2>
        <p className="mt-3 text-sm text-ink/65">
          Keep your admin identity fields current for the workspace.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Full name">
            <input
              className="input"
              value={accountName}
              onChange={(event) => {
                setAccountName(event.target.value);
                setAccountMessage(null);
              }}
            />
          </Field>
          <Field label="University email">
            <input
              className="input"
              value={accountEmail}
              onChange={(event) => {
                setAccountEmail(event.target.value);
                setAccountMessage(null);
              }}
            />
          </Field>
        </div>

        <button
          className="btn-primary mt-6"
          onClick={() => {
            updateCurrentUser({
              name: accountName,
              email: accountEmail,
            });
            setAccountMessage("Admin account updated locally.");
          }}
        >
          Save account info
        </button>

        {accountMessage ? <p className="mt-4 text-sm text-tide">{accountMessage}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Account security</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">Update your admin password</h2>
          <p className="mt-3 text-sm text-ink/65">
            Signed in as {currentUser?.email}. Use your current password first, then set a stronger replacement.
          </p>

          <div className="mt-6 grid gap-4">
            <Field label="Current password">
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setSecurityMessage(null);
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
                  setSecurityMessage(null);
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
                  setSecurityMessage(null);
                }}
              />
            </Field>
          </div>

          <div className="mt-5 rounded-[24px] border border-ink/10 bg-white/60 p-4">
            <p className="text-sm font-semibold text-ink">Password policy</p>
            <div className="mt-3 grid gap-2 text-sm text-ink/65">
              <p>{nextPasswordChecks.minLength ? "Passed" : "Needed"}: at least 8 characters</p>
              <p>{nextPasswordChecks.uppercase ? "Passed" : "Needed"}: one uppercase letter</p>
              <p>{nextPasswordChecks.lowercase ? "Passed" : "Needed"}: one lowercase letter</p>
              <p>{nextPasswordChecks.digit ? "Passed" : "Needed"}: one number</p>
              <p>{confirmPassword && confirmPassword === nextPassword ? "Passed" : "Needed"}: confirmation matches</p>
            </div>
          </div>

          <button
            className="btn-primary mt-6"
            onClick={() => {
              if (nextPassword !== confirmPassword) {
                setSecurityMessage("New password and confirmation do not match.");
                setSecurityTone("error");
                return;
              }

              const result = changeCurrentPassword(currentPassword, nextPassword);
              setSecurityMessage(result.message);
              setSecurityTone(result.ok ? "success" : "error");
              if (result.ok) {
                setCurrentPassword("");
                setNextPassword("");
                setConfirmPassword("");
              }
            }}
          >
            Update password
          </button>

          {securityMessage ? (
            <p className={cn("mt-4 text-sm", securityTone === "success" ? "text-tide" : "text-coral")}>
              {securityMessage}
            </p>
          ) : null}
        </section>

        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Admin accounts</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">Create another admin</h2>
          <p className="mt-3 text-sm text-ink/65">
            Add another instructor or TA account with its own login password.
          </p>

          <div className="mt-6 grid gap-4">
            <Field label="Full name">
              <input
                className="input"
                value={adminName}
                onChange={(event) => {
                  setAdminName(event.target.value);
                  setAdminMessage(null);
                }}
                placeholder="Avery Quinn"
              />
            </Field>
            <Field label="University email">
              <input
                className="input"
                value={adminEmail}
                onChange={(event) => {
                  setAdminEmail(event.target.value);
                  setAdminMessage(null);
                }}
                placeholder="avery.quinn@groupfinder.edu"
              />
            </Field>
            <Field label="Initial password">
              <input
                type="password"
                className="input"
                value={adminPassword}
                onChange={(event) => {
                  setAdminPassword(event.target.value);
                  setAdminMessage(null);
                }}
                placeholder="Set a password"
              />
            </Field>
          </div>

          <div className="mt-5 rounded-[24px] border border-ink/10 bg-white/60 p-4">
            <p className="text-sm font-semibold text-ink">Password policy</p>
            <div className="mt-3 grid gap-2 text-sm text-ink/65">
              <p>{adminPasswordChecks.minLength ? "Passed" : "Needed"}: at least 8 characters</p>
              <p>{adminPasswordChecks.uppercase ? "Passed" : "Needed"}: one uppercase letter</p>
              <p>{adminPasswordChecks.lowercase ? "Passed" : "Needed"}: one lowercase letter</p>
              <p>{adminPasswordChecks.digit ? "Passed" : "Needed"}: one number</p>
            </div>
          </div>

          <button
            className="btn-primary mt-6"
            onClick={() => {
              const result = adminCreateAdmin({
                name: adminName,
                email: adminEmail,
                password: adminPassword,
              });
              setAdminMessage(result.message);
              setAdminMessageTone(result.ok ? "success" : "error");
              if (result.ok) {
                setAdminName("");
                setAdminEmail("");
                setAdminPassword("");
              }
            }}
          >
            Create admin account
          </button>

          {adminMessage ? (
            <p className={cn("mt-4 text-sm", adminMessageTone === "success" ? "text-tide" : "text-coral")}>
              {adminMessage}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function AdminNotificationsPage() {
  const { currentUser, markAllNotificationsRead, markNotificationRead, state } = useApp();

  if (!currentUser) {
    return null;
  }

  const notifications = state.notifications.filter((item) => item.userId === currentUser.id);

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Notifications"
        title="Review roster activity, project updates, and moderation events."
        description="Admin notifications persist in localStorage and collect the events that need instructor or TA attention."
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
          <EmptyState
            title="No notifications yet"
            body="Class creation, student joins, seeded project updates, and moderation events will appear here."
          />
        )}
      </section>
    </div>
  );
}

export function AdminClassesPage() {
  const { createClass, state } = useApp();
  const [name, setName] = useState("HCI 410 Studio");
  const [term, setTerm] = useState("Fall 2026");

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Classes"
        title="Create a class, then attach projects to it."
        description="Classes group projects and help students land in the correct workspace when they enter a join code."
      />

      <div className="grid gap-4 xl:grid-cols-[0.7fr,1.3fr]">
        <section className="panel p-6 md:p-8">
          <Field label="Class name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Term">
            <input className="input mt-4" value={term} onChange={(event) => setTerm(event.target.value)} />
          </Field>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => createClass({ name, term })}
          >
            Create class
          </button>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {state.classes.map((classRecord) => (
            <article key={classRecord.id} className="panel p-6">
              <p className="subtle-label">{classRecord.term}</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">{classRecord.name}</h2>
              <p className="mt-3 text-sm text-ink/65">Course code {classRecord.code}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Badge tone="soft">
                  {state.projects.filter((project) => project.classId === classRecord.id).length} projects
                </Badge>
                <Link to={`/admin/classes/${classRecord.id}/projects`} className="btn-secondary">
                  Manage projects
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

export function AdminClassProjectsPage() {
  const { id } = useParams();
  const { createProject, state } = useApp();
  const classRecord = state.classes.find((entry) => entry.id === id);
  const classProjects = state.projects.filter((project) => project.classId === id);
  const [form, setForm] = useState(defaultProjectPayload());
  const [customRole, setCustomRole] = useState("");

  if (!classRecord) {
    return <EmptyState title="Class not found" body="Select a class from the classes page first." />;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow={classRecord.term}
        title={`${classRecord.name} projects`}
        description="Configure project settings, role templates, deadlines, and the join code students will use to enter the project."
      />

      <div className="grid gap-4 xl:grid-cols-[0.75fr,1.25fr]">
        <section className="panel p-6 md:p-8">
          <Field label="Project name">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="textarea mt-4"
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, description: event.target.value }))
              }
            />
          </Field>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Team size">
              <input
                type="number"
                min={2}
                max={6}
                className="input"
                value={form.teamSize}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    teamSize: Number(event.target.value) || previous.teamSize,
                  }))
                }
              />
            </Field>
            <Field label="Deadline">
              <input
                type="date"
                className="input"
                value={form.deadline}
                onChange={(event) => setForm((previous) => ({ ...previous, deadline: event.target.value }))}
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Overflow teams allowed">
              <input
                type="number"
                min={0}
                className="input"
                value={form.overflowTeamsAllowed}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    overflowTeamsAllowed: Number(event.target.value) || 0,
                  }))
                }
              />
            </Field>
            <Field label="Formation deadline">
              <input
                type="datetime-local"
                className="input"
                value={form.formationDeadline}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, formationDeadline: event.target.value }))
                }
              />
            </Field>
          </div>
          <label className="mt-4 flex min-h-[68px] items-center justify-between rounded-[24px] border border-ink/10 px-5 py-4">
            <div>
              <p className="font-semibold text-ink">Force overflow at deadline</p>
              <p className="mt-1 text-sm text-ink/55">
                Remaining unmatched students can be placed into the allowed overflow slots after the formation deadline.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.forceOverflowAtDeadline}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  forceOverflowAtDeadline: event.target.checked,
                }))
              }
              className="h-5 w-5 accent-ink"
            />
          </label>
          <Field label="Role templates">
            <div className="mt-4 flex flex-wrap gap-3">
              {ROLE_OPTIONS.map((role) => (
                <OptionChip
                  key={role}
                  selected={form.roleTemplates.includes(role)}
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      roleTemplates: previous.roleTemplates.includes(role)
                        ? previous.roleTemplates.filter((item) => item !== role)
                        : [...previous.roleTemplates, role],
                    }))
                  }
                >
                  {role}
                </OptionChip>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1"
                value={customRole}
                onChange={(event) => setCustomRole(event.target.value)}
                placeholder="Add custom role, for example QA Lead"
              />
              <button
                type="button"
                className="btn-secondary sm:self-end"
                onClick={() => {
                  const nextRole = customRole.trim();
                  if (!nextRole) {
                    return;
                  }

                  setForm((previous) => ({
                    ...previous,
                    roleTemplates: previous.roleTemplates.some(
                      (role) => role.toLowerCase() === nextRole.toLowerCase(),
                    )
                      ? previous.roleTemplates
                      : [...previous.roleTemplates, nextRole],
                  }));
                  setCustomRole("");
                }}
              >
                Add custom
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {form.roleTemplates
                .filter((role) => !ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number]))
                .map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="transition hover:-translate-y-0.5"
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        roleTemplates: previous.roleTemplates.filter((item) => item !== role),
                      }))
                    }
                  >
                    <RolePill role={role} />
                  </button>
                ))}
            </div>
          </Field>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => {
              if (form.roleTemplates.length === 0) {
                return;
              }
              createProject(classRecord.id, {
                ...form,
                roleTemplates: form.roleTemplates,
              });
              setForm(defaultProjectPayload());
              setCustomRole("");
            }}
          >
            Create project
          </button>
        </section>

        <section className="grid gap-4">
          {classProjects.map((project) => (
            <ProjectPolicyCard key={project.id} project={project} />
          ))}

          {!classProjects.length ? (
            <EmptyState title="No projects yet" body="Create the first project for this class using the form." />
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function AdminReportsPage() {
  const { adminActOnReport, state } = useApp();
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<ReportCategory | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<ReportSeverity | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(state.reports[0]?.id);
  const [note, setNote] = useState("Instructor follow-up logged in GroupFinder.");
  const deferredSearch = useDeferredValue(search);

  const filtered = state.reports.filter((report) => {
    if (statusFilter !== "all" && report.status !== statusFilter) {
      return false;
    }
    if (categoryFilter !== "all" && report.category !== categoryFilter) {
      return false;
    }
    if (severityFilter !== "all" && report.severity !== severityFilter) {
      return false;
    }
    if (
      deferredSearch &&
      !`${report.description} ${report.category} ${report.targetType}`
        .toLowerCase()
        .includes(deferredSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const selected = filtered.find((report) => report.id === selectedId) || filtered[0];
  const selectedTargetUser = state.users.find((user) => user.id === selected?.context?.userId || user.id === selected?.targetId);
  const selectedTargetMatching = selectedTargetUser
    ? getMatchingSnapshot(state, selectedTargetUser.id)
    : undefined;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Reports"
        title="Review flagged behavior and take moderation action."
        description="Each action is written into the report audit log and can also update user flags, chat access, matching access, or membership status."
      />

      <div className="grid gap-4 xl:grid-cols-[0.85fr,1.15fr]">
        <section className="panel p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Status">
              <select
                className="input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "all")}
              >
                <option value="all">All</option>
                <option value="New">New</option>
                <option value="Investigating">Investigating</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as ReportCategory | "all")}
              >
                <option value="all">All</option>
                <option value="harassment">Harassment</option>
                <option value="inappropriate content">Inappropriate content</option>
                <option value="spam/misuse">Spam / misuse</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Severity">
              <select
                className="input"
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value as ReportSeverity | "all")}
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Search">
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search descriptions"
              />
            </Field>
          </div>

          <div className="mt-5 space-y-3">
            {filtered.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                className={cn(
                  "w-full rounded-[24px] border p-4 text-left transition",
                  selected?.id === report.id
                    ? "border-ink bg-ink text-white"
                    : "border-ink/10 bg-white text-ink hover:border-tide",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={report.status === "Resolved" ? "success" : "warn"}>{report.status}</Badge>
                  <Badge tone="soft">{report.category}</Badge>
                  <Badge tone="soft">{report.severity}</Badge>
                </div>
                <p className={cn("mt-3 text-sm", selected?.id === report.id ? "text-white/80" : "text-ink/65")}>
                  {report.description}
                </p>
              </button>
            ))}
            {!filtered.length ? (
              <p className="text-sm text-ink/55">No reports match the current filters.</p>
            ) : null}
          </div>
        </section>

        {selected ? (
          <section className="panel space-y-5 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selected.status === "Resolved" ? "success" : "warn"}>{selected.status}</Badge>
              <Badge tone="soft">{selected.targetType}</Badge>
              <Badge tone="soft">{selected.category}</Badge>
              <Badge tone="soft">{selected.severity}</Badge>
            </div>

            <div>
              <p className="subtle-label">Description</p>
              <p className="mt-3 text-sm text-ink/70">{selected.description}</p>
              {selected.evidence ? (
                <p className="mt-3 rounded-[20px] bg-sand/70 px-4 py-3 text-sm text-ink/65">
                  Evidence: {selected.evidence}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="panel-muted p-5">
                <p className="subtle-label">Context</p>
                <p className="mt-3 text-sm text-ink/70">Created {formatDate(selected.createdAt)}</p>
                {selected.context?.messageSnippet ? (
                  <p className="mt-3 rounded-[20px] bg-white px-4 py-3 text-sm text-ink/65">
                    Message snippet: {selected.context.messageSnippet}
                  </p>
                ) : null}
                {selected.context?.teamId ? (
                  <p className="mt-3 text-sm text-ink/65">Team id: {selected.context.teamId}</p>
                ) : null}
              </article>
              <article className="panel-muted p-5">
                <p className="subtle-label">Target user</p>
                {selectedTargetUser ? (
                  <>
                    <p className="mt-3 font-semibold text-ink">{selectedTargetUser.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <VerifiedBadge />
                      <RolePill role={selectedTargetMatching?.rolePreference || "UI/Design"} />
                    </div>
                    <p className="mt-3 text-sm text-ink/65">
                      Flags:{" "}
                      {[
                        selectedTargetUser.flags.warned && "warned",
                        selectedTargetUser.flags.chatMuted && "chat muted",
                        selectedTargetUser.flags.matchingRestricted && "matching restricted",
                      ]
                        .filter(Boolean)
                        .join(", ") || "none"}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink/55">No direct user attached to this report.</p>
                )}
              </article>
            </div>

            <Field label="Audit note">
              <textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => adminActOnReport(selected.id, "warn", note)}>
                Warn
              </button>
              <button className="btn-secondary" onClick={() => adminActOnReport(selected.id, "mute", note)}>
                Mute chat
              </button>
              <button
                className="btn-secondary"
                onClick={() => adminActOnReport(selected.id, "restrict matching", note)}
              >
                Restrict matching
              </button>
              <button
                className="btn-secondary"
                onClick={() => adminActOnReport(selected.id, "remove from project", note)}
              >
                Remove from project
              </button>
            </div>

            <div>
              <p className="subtle-label">Action log</p>
              <div className="mt-4 space-y-3">
                {selected.actionsLog.map((entry) => (
                  <article key={entry.id} className="rounded-[20px] border border-ink/10 px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{entry.action}</p>
                    <p className="mt-1 text-sm text-ink/65">{entry.note}</p>
                    <p className="mt-2 text-xs text-ink/45">{formatDate(entry.createdAt)}</p>
                  </article>
                ))}
                {!selected.actionsLog.length ? (
                  <p className="text-sm text-ink/55">No actions logged yet.</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <EmptyState title="No reports" body="Student reports will appear here for moderation." />
        )}
      </div>
    </div>
  );
}

export function AdminStudentsPage() {
  const {
    adminAddStudentToClass,
    adminCreateStudent,
    adminRemoveStudentFromClass,
    adminUpdateStudent,
    state,
  } = useApp();
  const allStudents = state.users.filter((user) => user.role === "student");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentForm, setStudentForm] = useState<StudentFormState>(() => buildStudentForm());
  const [membershipStudentId, setMembershipStudentId] = useState("");
  const [membershipClassId, setMembershipClassId] = useState<string>(state.classes[0]?.id || "");
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [enrollmentMessage, setEnrollmentMessage] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const selectedStudent = allStudents.find((student) => student.id === selectedStudentId);

  useEffect(() => {
    setStudentForm(buildStudentForm(selectedStudent));
  }, [selectedStudent]);

  const students = allStudents
    .filter((user) => {
      const matching = getMatchingSnapshot(state, user.id);
      const memberships = state.memberships.filter(
        (membership) => membership.userId === user.id && membership.status === "active",
      );
      if (classFilter !== "all" && !memberships.some((membership) => membership.classId === classFilter)) {
        return false;
      }
      if (
        projectFilter !== "all" &&
        !memberships.some((membership) => membership.projectId === projectFilter)
      ) {
        return false;
      }
      if (
        deferredSearch &&
        !`${user.name} ${user.email} ${user.profile.major} ${user.profile.year} ${matching.skills.join(" ")} ${matching.rolePreference}`
          .toLowerCase()
          .includes(deferredSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

  return (
    <div className="space-y-4 md:space-y-6">
      <PageIntro
        eyebrow="Students"
        title="Review and manage the student roster."
        description="Create students, edit profile details, add them to a class, remove them from a class, and inspect team or moderation state in one place."
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="panel p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="subtle-label">Student editor</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">
                {selectedStudent ? "Update existing student" : "Create new student"}
              </h2>
            </div>
            <button
              className="btn-secondary self-start"
              onClick={() => {
                setSelectedStudentId("");
                setStudentForm(buildStudentForm());
                setManagementMessage(null);
              }}
            >
              New student
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Load existing student">
              <select
                className="input"
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setManagementMessage(null);
                }}
              >
                <option value="">Create new</option>
                {allStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Verified">
              <select
                className="input"
                value={studentForm.verified ? "true" : "false"}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    verified: event.target.value === "true",
                  }))
                }
              >
                <option value="true">Verified</option>
                <option value="false">Unverified</option>
              </select>
            </Field>
            <Field label="Full name">
              <input
                className="input"
                value={studentForm.name}
                onChange={(event) =>
                  setStudentForm((previous) => ({ ...previous, name: event.target.value }))
                }
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                value={studentForm.email}
                onChange={(event) =>
                  setStudentForm((previous) => ({ ...previous, email: event.target.value }))
                }
              />
            </Field>
            <Field label="Preferred contact method">
              <select
                className="input"
                value={studentForm.preferredContactMethod}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    preferredContactMethod: event.target.value as ContactMethod,
                  }))
                }
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
                value={studentForm.responseTime}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    responseTime: event.target.value as ResponseTime,
                  }))
                }
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
                value={studentForm.meetingPreference}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    meetingPreference: event.target.value as MeetingPreference,
                  }))
                }
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
                value={studentForm.timeZone}
                onChange={(event) =>
                  setStudentForm((previous) => ({ ...previous, timeZone: event.target.value }))
                }
                placeholder="Asia/Bangkok"
              />
            </Field>
            <Field label="Major (optional)">
              <input
                className="input"
                value={studentForm.major}
                onChange={(event) =>
                  setStudentForm((previous) => ({ ...previous, major: event.target.value }))
                }
              />
            </Field>
            <Field label="Year (optional)">
              <input
                className="input"
                value={studentForm.year}
                onChange={(event) =>
                  setStudentForm((previous) => ({ ...previous, year: event.target.value }))
                }
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Bio">
                <textarea
                  className="textarea"
                  value={studentForm.bio}
                  onChange={(event) =>
                    setStudentForm((previous) => ({ ...previous, bio: event.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Notes / boundaries">
                <textarea
                  className="textarea"
                  value={studentForm.notes}
                  onChange={(event) =>
                    setStudentForm((previous) => ({ ...previous, notes: event.target.value }))
                  }
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                const payload = {
                  name: studentForm.name,
                  email: studentForm.email,
                  verified: studentForm.verified,
                  profile: {
                    bio: studentForm.bio,
                    major: studentForm.major,
                    year: studentForm.year,
                    preferredContactMethod: studentForm.preferredContactMethod,
                    responseTime: studentForm.responseTime,
                    meetingPreference: studentForm.meetingPreference,
                    timeZone: studentForm.timeZone,
                    notes: studentForm.notes,
                  },
                };

                if (selectedStudent) {
                  const result = adminUpdateStudent(selectedStudent.id, payload);
                  setManagementMessage(result.message);
                } else {
                  const result = adminCreateStudent(payload);
                  setManagementMessage(result.message);
                  if (result.ok && result.userId) {
                    setSelectedStudentId(result.userId);
                    setMembershipStudentId(result.userId);
                  }
                }
              }}
            >
              {selectedStudent ? "Update student" : "Create student"}
            </button>
          </div>

          {managementMessage ? (
            <p className="mt-4 text-sm text-ink/65">{managementMessage}</p>
          ) : null}
        </section>

        <section className="panel p-6 md:p-8">
          <p className="subtle-label">Class membership</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold text-ink">
            Add or remove a student from a class
          </h2>

          <div className="mt-6 grid gap-4">
            <Field label="Student">
              <select
                className="input"
                value={membershipStudentId}
                onChange={(event) => {
                  setMembershipStudentId(event.target.value);
                  if (event.target.value) {
                    setSelectedStudentId(event.target.value);
                  }
                }}
              >
                <option value="">Select student</option>
                {allStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class">
              <select
                className="input"
                value={membershipClassId}
                onChange={(event) => setMembershipClassId(event.target.value)}
              >
                {state.classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {classRecord.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                const result = adminAddStudentToClass(membershipStudentId, membershipClassId);
                setEnrollmentMessage(result.message);
              }}
            >
              Add to class
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                const result = adminRemoveStudentFromClass(
                  membershipStudentId,
                  membershipClassId,
                );
                setEnrollmentMessage(result.message);
              }}
            >
              Remove from class
            </button>
          </div>

          {enrollmentMessage ? (
            <p className="mt-4 text-sm text-ink/65">{enrollmentMessage}</p>
          ) : null}

          <div className="mt-6 space-y-3">
            <p className="subtle-label">Selected student memberships</p>
            {membershipStudentId ? (
              state.memberships.some(
                (membership) =>
                  membership.userId === membershipStudentId && membership.status === "active",
              ) ? (
                state.memberships
                  .filter(
                    (membership) =>
                      membership.userId === membershipStudentId && membership.status === "active",
                  )
                  .map((membership) => {
                    const classRecord = state.classes.find((entry) => entry.id === membership.classId);
                    const project = state.projects.find((entry) => entry.id === membership.projectId);
                    return (
                      <div key={membership.id} className="rounded-[20px] border border-ink/10 px-4 py-3 text-sm">
                        <p className="font-semibold text-ink">{classRecord?.name || "Unknown class"}</p>
                        <p className="mt-1 text-ink/65">
                          {project ? project.name : "Not assigned to a project yet"}
                        </p>
                      </div>
                    );
                  })
              ) : (
                <p className="text-sm text-ink/55">This student has no active class memberships.</p>
              )
            ) : (
              <p className="text-sm text-ink/55">Select a student to manage enrollments.</p>
            )}
          </div>
        </section>
      </div>

      <section className="panel p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Class">
            <select
              className="input"
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
            >
              <option value="all">All classes</option>
              {state.classes.map((classRecord) => (
                <option key={classRecord.id} value={classRecord.id}>
                  {classRecord.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              className="input"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
            >
              <option value="all">All projects</option>
              {state.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, skill"
            />
          </Field>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {students.map((student) => {
            const matching = getMatchingSnapshot(state, student.id);
            const memberships = state.memberships.filter(
              (membership) => membership.userId === student.id,
            );
            const activeProjectMembership = memberships.find(
              (membership) => membership.status === "active" && membership.projectId,
            );
            const activeProject = state.projects.find((project) => project.id === activeProjectMembership?.projectId);
            const team = state.teams.find((entry) => entry.id === activeProjectMembership?.teamId);
            const activeClassMemberships = memberships.filter((membership) => membership.status === "active");

            return (
              <article key={student.id} className="rounded-[24px] border border-ink/10 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-2xl font-semibold text-ink">{student.name}</h2>
                      <VerifiedBadge />
                    </div>
                    <p className="mt-2 text-sm text-ink/65">{student.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RolePill role={matching.rolePreference} />
                      {matching.secondaryRole ? <RolePill role={matching.secondaryRole} /> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Badge tone="soft">{activeProject?.name || "Class only"}</Badge>
                    <Badge tone={team ? "success" : "soft"}>{team ? "Team assigned" : "No team"}</Badge>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink/70">{student.profile.bio}</p>
                <p className="mt-4 text-sm text-ink/65">
                  {student.profile.major || "Major optional"}
                  {student.profile.year ? ` • ${student.profile.year}` : ""}
                  {" • "}
                  {student.profile.preferredContactMethod} • {student.profile.responseTime}
                </p>
                <p className="mt-2 text-sm text-ink/65">
                  Matching: {matching.skills.join(", ") || "No skills yet"} •{" "}
                  {matching.availability.map(sentenceCase).join(", ") || "Flexible"}
                </p>
                <p className="mt-2 text-sm text-ink/65">
                  {sentenceCase(matching.goalLevel)} • {sentenceCase(matching.workingStyle)} • {student.profile.timeZone}
                </p>
                <p className="mt-3 text-sm text-ink/65">
                  Flags:{" "}
                  {[
                    student.flags.warned && "warned",
                    student.flags.chatMuted && "chat muted",
                    student.flags.matchingRestricted && "matching restricted",
                  ]
                    .filter(Boolean)
                    .join(", ") || "none"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeClassMemberships.map((membership) => {
                    const classRecord = state.classes.find((entry) => entry.id === membership.classId);
                    return (
                      <Badge key={membership.id} tone="soft">
                        {classRecord?.name || "Class"}
                      </Badge>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      setMembershipStudentId(student.id);
                      setManagementMessage(null);
                      setEnrollmentMessage(null);
                    }}
                  >
                    Edit student
                  </button>
                </div>
              </article>
            );
          })}

          {!students.length ? (
            <p className="text-sm text-ink/55">No students match the current filters.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
