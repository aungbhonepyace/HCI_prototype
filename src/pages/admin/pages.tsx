import { useDeferredValue, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, EmptyState, Field, OptionChip, PageIntro, RolePill, StatCard, VerifiedBadge } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { defaultProjectPayload } from "@/lib/storage";
import type {
  AvailabilitySlot,
  GoalLevel,
  ProjectRole,
  ReportCategory,
  ReportSeverity,
  ReportStatus,
  User,
  WorkingStyle,
} from "@/lib/types";
import {
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

interface StudentFormState {
  name: string;
  email: string;
  verified: boolean;
  rolePreference: ProjectRole;
  secondaryRole: ProjectRole | "";
  skills: string;
  availability: AvailabilitySlot[];
  goalLevel: GoalLevel;
  workingStyle: WorkingStyle;
  bio: string;
}

function buildStudentForm(student?: User): StudentFormState {
  return {
    name: student?.name || "",
    email: student?.email || "",
    verified: student?.verified ?? true,
    rolePreference: student?.profile.rolePreference || "UI/Design",
    secondaryRole: student?.profile.secondaryRole || "",
    skills: student?.profile.skills.join(", ") || "",
    availability: student?.profile.availability || ["weekdays", "evenings"],
    goalLevel: student?.profile.goalLevel || "balanced",
    workingStyle: student?.profile.workingStyle || "collab",
    bio: student?.profile.bio || "",
  };
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
              <article key={project.id} className="rounded-[24px] border border-ink/10 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-heading text-2xl font-semibold text-ink">{project.name}</h2>
                    <p className="mt-2 text-sm text-ink/65">{project.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="soft">{project.joinCode}</Badge>
                      <Badge tone="soft">Team size {project.teamSize}</Badge>
                      <span className="text-xs text-ink/45">Deadline {formatDeadline(project.deadline)}</span>
                    </div>
                  </div>
                  <Link
                    to={`/admin/classes/${project.classId}/projects`}
                    className="btn-secondary self-start md:shrink-0"
                  >
                    Manage project
                  </Link>
                </div>
              </article>
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
  const { createProject, regenerateJoinCode, state } = useApp();
  const classRecord = state.classes.find((entry) => entry.id === id);
  const classProjects = state.projects.filter((project) => project.classId === id);
  const [form, setForm] = useState(defaultProjectPayload());

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
          </Field>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => {
              if (form.roleTemplates.length === 0) {
                return;
              }
              createProject(classRecord.id, {
                ...form,
                roleTemplates: form.roleTemplates as ProjectRole[],
              });
            }}
          >
            Create project
          </button>
        </section>

        <section className="grid gap-4">
          {classProjects.map((project) => (
            <article key={project.id} className="panel p-6">
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
              <p className="mt-4 text-sm text-ink/65">
                Deadline {formatDeadline(project.deadline)} • Team size {project.teamSize}
              </p>
            </article>
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
                      <RolePill role={selectedTargetUser.profile.rolePreference} />
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
        !`${user.name} ${user.email} ${user.profile.skills.join(" ")}`
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
        description="Create students, edit profile data, add them to a class project, remove them from a class, and inspect team or moderation state in one place."
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
            <Field label="Primary role">
              <select
                className="input"
                value={studentForm.rolePreference}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    rolePreference: event.target.value as ProjectRole,
                  }))
                }
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
                value={studentForm.secondaryRole}
                onChange={(event) =>
                  setStudentForm((previous) => ({
                    ...previous,
                    secondaryRole: event.target.value as ProjectRole | "",
                  }))
                }
              >
                <option value="">Optional</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Skills">
                <input
                  className="input"
                  value={studentForm.skills}
                  onChange={(event) =>
                    setStudentForm((previous) => ({ ...previous, skills: event.target.value }))
                  }
                  placeholder="React, SQL, Figma"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Availability">
                <div className="flex flex-wrap gap-3">
                  {AVAILABILITY_OPTIONS.map((slot) => (
                    <OptionChip
                      key={slot}
                      selected={studentForm.availability.includes(slot)}
                      onClick={() =>
                        setStudentForm((previous) => ({
                          ...previous,
                          availability: toggleInArray(previous.availability, slot),
                        }))
                      }
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
                  <OptionChip
                    key={goal}
                    selected={studentForm.goalLevel === goal}
                    onClick={() =>
                      setStudentForm((previous) => ({ ...previous, goalLevel: goal }))
                    }
                  >
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
                    selected={studentForm.workingStyle === style}
                    onClick={() =>
                      setStudentForm((previous) => ({ ...previous, workingStyle: style }))
                    }
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
                  value={studentForm.bio}
                  onChange={(event) =>
                    setStudentForm((previous) => ({ ...previous, bio: event.target.value }))
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
                    skills: studentForm.skills
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    availability: studentForm.availability,
                    goalLevel: studentForm.goalLevel,
                    workingStyle: studentForm.workingStyle,
                    rolePreference: studentForm.rolePreference,
                    secondaryRole: studentForm.secondaryRole || undefined,
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
                      <RolePill role={student.profile.rolePreference} />
                      {student.profile.secondaryRole ? <RolePill role={student.profile.secondaryRole} /> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Badge tone="soft">{activeProject?.name || "Class only"}</Badge>
                    <Badge tone={team ? "success" : "soft"}>{team ? "Team assigned" : "No team"}</Badge>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink/70">{student.profile.bio}</p>
                <p className="mt-4 text-sm text-ink/65">
                  Skills: {student.profile.skills.join(", ")} • Availability{" "}
                  {student.profile.availability.map(sentenceCase).join(", ")}
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
