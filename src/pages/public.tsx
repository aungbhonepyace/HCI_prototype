import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { Badge, LogoMark, PageIntro, StatCard } from "@/components/ui";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-mesh px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="panel flex items-center justify-between px-5 py-4 md:px-6">
          <LogoMark />
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn-primary">
              Open prototype
            </Link>
          </div>
        </header>

        <section className="grid gap-6 pt-6 lg:grid-cols-[1.2fr,0.8fr]">
          <PageIntro
            eyebrow="University Team Formation"
            title="Build transparent project teams with guided matching and moderated collaboration."
            description="GroupFinder helps students form project teams through a scripted AI chat matcher or a role-based lucky draw queue, while instructors keep classes, join codes, and reports in one place."
            actions={
              <>
                <Link to="/login" className="btn-primary">
                  Verify email
                </Link>
                <a href="#features" className="btn-secondary">
                  Explore features
                </a>
              </>
            }
          />

          <div className="panel grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[28px] bg-ink p-6 text-white">
              <p className="subtle-label text-white/50">Two match modes</p>
              <h2 className="mt-3 font-heading text-3xl font-semibold">
                AI chat or Lucky Draw
              </h2>
              <p className="mt-3 text-sm text-white/75">
                Students answer structured prompts, review transparent rosters, then accept or rematch.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              <StatCard label="Student views" value="11" detail="All core routes included" />
              <StatCard label="Persistence" value="localStorage" detail="Refresh-safe demo state" />
              <StatCard label="Moderation" value="Reports" detail="Audit log with admin actions" />
              <StatCard label="Layouts" value="3" detail="Mobile, tablet, desktop optimized" />
            </div>
          </div>
        </section>

        <section
          id="features"
          className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {[
            {
              title: "Guided AI chat matcher",
              body: "Finite-state Q&A collects role, skills, availability, goal level, and working style before producing a deterministic match with rationale.",
            },
            {
              title: "Lucky draw role queue",
              body: "Students choose a primary role, optional secondary role, and constraints, then join a queue with ETA, health indicators, and re-queue controls.",
            },
            {
              title: "Team workspace",
              body: "Accepted teams get a shared roster, local chat, starter tasks, meeting slot, and in-context reporting controls.",
            },
            {
              title: "Instructor oversight",
              body: "Admins create classes and projects, generate join codes, monitor rosters, and action reports with warnings, mutes, matching restrictions, or removals.",
            },
          ].map((item, index) => (
            <article
              key={item.title}
              className={cn("panel p-6", index % 2 === 0 ? "animate-float-in" : "")}
            >
              <Badge tone="soft">{`0${index + 1}`}</Badge>
              <h3 className="mt-4 font-heading text-2xl font-semibold text-ink">{item.title}</h3>
              <p className="mt-3 text-sm text-ink/65">{item.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

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
        <header className="panel flex items-center justify-between px-5 py-4 md:px-6">
          <LogoMark />
          <Link to="/" className="btn-secondary">
            Back to landing
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="panel p-6 md:p-8">
            <p className="subtle-label">Mock verification</p>
            <h1 className="mt-3 font-heading text-4xl font-semibold text-ink">
              Sign in with email, password, and role
            </h1>
            <p className="mt-3 max-w-md text-sm text-ink/65">
              Existing accounts require the correct password. New emails create a verified demo account instantly when the password meets the minimum policy.
            </p>

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
