import { Link, Outlet, Navigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { Badge, LogoMark, NavItem, VerifiedBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

const STUDENT_SIDEBAR_LINKS = [
  { to: "/student/dashboard", label: "Dashboard" },
  { to: "/student/join", label: "Join" },
  { to: "/student/match", label: "Match" },
  { to: "/student/proposals", label: "Proposals" },
  { to: "/student/team", label: "Team" },
  { to: "/student/notifications", label: "Notifications" },
  { to: "/student/profile", label: "Profile" },
  { to: "/student/report", label: "Report" },
];

const STUDENT_BOTTOM_LINKS = [
  { to: "/student/match", label: "Match" },
  { to: "/student/team", label: "Team" },
  { to: "/student/notifications", label: "Notifications" },
  { to: "/student/profile", label: "Profile" },
];

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/classes", label: "Classes" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/reports", label: "Reports" },
];

export function RequireRole({ role }: { role: "student" | "admin" }) {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== role) {
    return <Navigate to={currentUser.role === "student" ? "/student/dashboard" : "/admin"} replace />;
  }

  return <Outlet />;
}

export function AuthRedirect() {
  const { currentUser } = useApp();
  if (!currentUser) {
    return <Outlet />;
  }
  return <Navigate to={currentUser.role === "student" ? "/student/dashboard" : "/admin"} replace />;
}

function ShellFrame({
  sidebarLinks,
  footerLinks,
  roleLabel,
}: {
  sidebarLinks: { to: string; label: string }[];
  footerLinks?: { to: string; label: string }[];
  roleLabel: string;
}) {
  const { currentUser, currentProject, logout, state, studentProjects } = useApp();

  return (
    <div className="min-h-screen bg-mesh">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6 lg:flex-row lg:gap-6 lg:px-8">
        <aside className="hidden lg:flex lg:w-[280px] lg:flex-col">
          <div className="panel sticky top-6 flex min-h-[calc(100vh-3rem)] flex-col p-5">
            <LogoMark />
            <div className="mt-8 rounded-[24px] bg-sand/70 p-4">
              <p className="subtle-label">{roleLabel}</p>
              <p className="mt-2 font-heading text-2xl font-semibold text-ink">{currentUser?.name}</p>
              <div className="mt-3 flex min-w-0 flex-wrap items-start gap-2">
                <VerifiedBadge />
                {currentProject ? <Badge tone="soft">{currentProject.name}</Badge> : null}
                {currentUser?.role === "student" && studentProjects.length > 1 ? (
                  <Badge tone="soft">{studentProjects.length} projects</Badge>
                ) : null}
              </div>
            </div>
            <nav className="mt-8 grid gap-2">
              {sidebarLinks.map((item) => (
                <NavItem key={item.to} to={item.to} label={item.label} />
              ))}
            </nav>
            <div className="mt-auto pt-6">
              <div className="rounded-[24px] border border-ink/10 bg-ink p-5 text-white">
                <p className="subtle-label text-white/50">Unread</p>
                <p className="mt-3 text-3xl font-semibold">
                  {
                    state.notifications.filter(
                      (notification) => notification.userId === currentUser?.id && !notification.read,
                    ).length
                  }
                </p>
                <p className="mt-2 text-sm text-white/75">
                  Keep an eye on updates, report actions, and team activity.
                </p>
                <Link
                  to={currentUser?.role === "admin" ? "/admin/notifications" : "/student/notifications"}
                  className="btn-secondary mt-5 w-full bg-white text-ink"
                >
                  Open notifications
                </Link>
                <button className="btn-secondary mt-3 w-full bg-white text-ink" onClick={() => logout()}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="panel mb-4 flex items-start justify-between gap-3 px-4 py-4 sm:px-5 lg:hidden">
            <LogoMark />
            <div className="flex shrink-0 items-start gap-2">
              <button className="btn-secondary px-4 py-2" onClick={() => logout()}>
                Logout
              </button>
              <div className="min-w-0 text-right">
                <p className="text-sm font-semibold text-ink">{currentUser?.name}</p>
                <p className="text-xs text-ink/50">{roleLabel}</p>
              </div>
            </div>
          </header>
          <main className="space-y-4 md:space-y-6">
            <Outlet />
          </main>
        </div>
      </div>

      {footerLinks ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/90 px-3 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
            {footerLinks.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} compact />
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export function StudentShell() {
  return (
    <ShellFrame
      sidebarLinks={STUDENT_SIDEBAR_LINKS}
      footerLinks={STUDENT_BOTTOM_LINKS}
      roleLabel="Student Workspace"
    />
  );
}

export function AdminShell() {
  return <ShellFrame sidebarLinks={ADMIN_LINKS} roleLabel="Instructor / TA Console" />;
}

export function AccessBanner({
  tone = "default",
  title,
  description,
}: {
  tone?: "default" | "warn";
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border p-4 text-sm",
        tone === "warn"
          ? "border-coral/20 bg-coral/10 text-coral"
          : "border-ink/10 bg-white/70 text-ink/70",
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}
