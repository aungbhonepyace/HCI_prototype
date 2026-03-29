import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { LogoMark, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const [role, setRole] = useState<"student" | "admin">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("error");

  return (
    <div className="min-h-screen bg-mesh px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="panel px-5 py-4 md:px-6">
          <LogoMark />
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="panel p-6 md:p-8">
            <h1 className="font-heading text-4xl font-semibold text-ink">Sign in</h1>

            <div className="mt-8 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {(["student", "admin"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={cn(
                      "rounded-[24px] border px-5 py-4 text-left transition",
                      role === value
                        ? "border-ink bg-ink text-white"
                        : "border-ink/10 bg-white text-ink hover:border-tide",
                    )}
                  >
                    <p className="font-semibold">
                      Login as {value === "student" ? "Student" : "Admin"}
                    </p>
                    <p className={cn("mt-2 text-sm", role === value ? "text-white/75" : "text-ink/55")}>
                      {value === "student"
                        ? "Complete profile, join a project, match, and collaborate."
                        : "Create classes, generate join codes, and moderate reports."}
                    </p>
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink">University email</span>
                <input
                  className="input"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setMessage(null);
                  }}
                  placeholder="name@groupfinder.edu"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-ink">Password</span>
                <div className="flex gap-3">
                  <input
                    className="input flex-1"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setMessage(null);
                    }}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {message ? (
                <p className={cn("text-sm", messageTone === "success" ? "text-tide" : "text-coral")}>
                  {message}
                </p>
              ) : null}

              <button
                className="btn-primary w-full"
                onClick={() => {
                  const result = login(email, password, role);
                  setMessage(result.message);
                  setMessageTone(result.ok ? "success" : "error");
                  if (result.ok) {
                    navigate(role === "student" ? "/student/dashboard" : "/admin");
                  }
                }}
              >
                Verify and continue
              </button>
            </div>
          </div>

          <div className="grid content-start gap-4 md:grid-cols-2">
            <StatCard label="Verified" value="Yes" detail="Transparent profiles always show verification." />
            <StatCard label="Join flow" value="Code based" detail="Students enter a project code from admin." />
            <StatCard label="Reports" value="New → Resolved" detail="Moderation actions are logged inside each report." />
            <StatCard label="Workspace" value="Persistent" detail="Chat, tasks, and meeting slot survive refresh." />
          </div>
        </div>
      </div>
    </div>
  );
}
