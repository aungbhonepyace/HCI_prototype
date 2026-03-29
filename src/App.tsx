import { Link, Route, Routes } from "react-router-dom";
import { AdminShell, AuthRedirect, RequireRole, StudentShell } from "@/components/layouts";
import { AppProvider } from "@/lib/app-context";
import {
  AdminAccountPage,
  AdminClassProjectsPage,
  AdminClassesPage,
  AdminDashboardPage,
  AdminNotificationsPage,
  AdminReportsPage,
  AdminStudentsPage,
} from "@/pages/admin/pages";
import { LoginPage } from "@/pages/public";
import {
  AIChatPage,
  AIResultPage,
  MatchModePickerPage,
  NotificationsPage,
  ProposalDetailPage,
  ProposalsPage,
  QueueConstraintsPage,
  QueueMatchPage,
  QueueRolePage,
  QueueStatusPage,
  ReportPage,
  StudentDashboardPage,
  StudentJoinPage,
  StudentProfilePage,
  TeamWorkspacePage,
} from "@/pages/student/pages";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh px-4">
      <div className="panel max-w-xl p-8 text-center">
        <p className="subtle-label">404</p>
        <h1 className="mt-3 font-heading text-4xl font-semibold text-ink">Route not found</h1>
        <p className="mt-3 text-sm text-ink/65">
          Jump back to the login page to continue with the prototype.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="btn-primary">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<AuthRedirect />}>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<RequireRole role="student" />}>
          <Route element={<StudentShell />}>
            <Route path="/student/dashboard" element={<StudentDashboardPage />} />
            <Route path="/student/join" element={<StudentJoinPage />} />
            <Route path="/student/profile" element={<StudentProfilePage />} />
            <Route path="/student/match" element={<MatchModePickerPage />} />
            <Route path="/student/match/ai" element={<AIChatPage />} />
            <Route path="/student/match/ai/result" element={<AIResultPage />} />
            <Route path="/student/proposals" element={<ProposalsPage />} />
            <Route path="/student/proposals/:id" element={<ProposalDetailPage />} />
            <Route path="/student/match/queue/roles" element={<QueueRolePage />} />
            <Route path="/student/match/queue/constraints" element={<QueueConstraintsPage />} />
            <Route path="/student/match/queue/status" element={<QueueStatusPage />} />
            <Route path="/student/match/queue/match" element={<QueueMatchPage />} />
            <Route path="/student/team" element={<TeamWorkspacePage />} />
            <Route path="/student/notifications" element={<NotificationsPage />} />
            <Route path="/student/report" element={<ReportPage />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="admin" />}>
          <Route element={<AdminShell />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/account" element={<AdminAccountPage />} />
            <Route path="/admin/classes" element={<AdminClassesPage />} />
            <Route path="/admin/classes/:id/projects" element={<AdminClassProjectsPage />} />
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/students" element={<AdminStudentsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppProvider>
  );
}
