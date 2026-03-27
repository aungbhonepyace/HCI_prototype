import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import type { ProjectRole, User } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const CUSTOM_ROLE_TONES = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-900",
  "bg-cyan-100 text-cyan-800",
  "bg-lime-100 text-lime-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

function getCustomRoleTone(role: string): string {
  const hash = role.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return CUSTOM_ROLE_TONES[hash % CUSTOM_ROLE_TONES.length];
}

export function LogoMark() {
  return (
    <Link to="/" className="inline-flex min-w-0 items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink font-heading text-lg font-semibold text-white shadow-panel">
        GF
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-heading font-semibold text-ink md:text-xl">GroupFinder</span>
        <span className="hidden text-xs uppercase tracking-[0.28em] text-ink/45 sm:block">
          Transparent team formation
        </span>
      </span>
    </Link>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warn" | "soft";
}) {
  const toneClass =
    tone === "success"
      ? "bg-tide/10 text-tide"
      : tone === "warn"
        ? "bg-coral/10 text-coral"
        : tone === "soft"
          ? "bg-sand text-ink/70"
          : "bg-ink/6 text-ink/70";

  return (
    <span
      className={cn(
        "inline-flex min-h-[2.25rem] max-w-full items-center justify-center rounded-full px-3 py-1.5 text-center text-xs font-semibold leading-tight align-middle",
        "whitespace-normal break-words",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

export function VerifiedBadge() {
  return <Badge tone="success">Verified</Badge>;
}

export function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" }) {
  const classes =
    size === "sm"
      ? "h-9 w-9 text-xs"
      : "h-12 w-12 text-sm";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-tide to-ink font-semibold text-white",
        classes,
      )}
    >
      {initials(user.name)}
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-[30px] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur md:flex-row md:items-end md:justify-between md:p-8">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <p className="subtle-label mb-3">{eyebrow}</p> : null}
        <h1 className="font-heading text-3xl font-semibold text-ink md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm text-ink/70 md:text-base">{description}</p>
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-start gap-3 md:justify-end">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="panel-muted p-5">
      <p className="subtle-label">{label}</p>
      <p className="mt-3 break-words font-heading text-2xl font-semibold leading-tight text-ink md:text-3xl">{value}</p>
      <p className="mt-2 text-sm text-ink/65">{detail}</p>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink/45">{hint}</span> : null}
    </label>
  );
}

export function OptionChip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] max-w-full items-center justify-center rounded-full border px-4 py-2 text-center text-sm font-semibold leading-tight transition",
        selected
          ? "border-ink bg-ink text-white"
          : "border-ink/10 bg-white text-ink hover:border-tide hover:text-tide",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-start gap-4 p-8">
      <p className="subtle-label">Need attention</p>
      <h2 className="font-heading text-2xl font-semibold text-ink">{title}</h2>
      <p className="max-w-lg text-sm text-ink/65">{body}</p>
      {action}
    </div>
  );
}

export function RolePill({ role }: { role: ProjectRole }) {
  const tone =
    role === "Backend/SQL"
      ? "bg-ink/90 text-white"
      : role === "UI/Design"
        ? "bg-coral/15 text-coral"
        : role === "Analyst"
          ? "bg-tide/15 text-tide"
          : role === "Writer/Presenter"
            ? "bg-gold/35 text-ink"
            : getCustomRoleTone(role);
  return (
    <span
      className={cn(
        "inline-flex min-h-[2.25rem] max-w-full items-center justify-center rounded-full px-3 py-1.5 text-center text-xs font-semibold leading-tight",
        "whitespace-normal break-words align-middle",
        tone,
      )}
    >
      {role}
    </span>
  );
}

export function NavItem({
  to,
  label,
  compact,
}: {
  to: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex min-h-[44px] items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold leading-tight transition",
          compact ? "px-2 py-2 text-center text-[11px] leading-tight" : "",
          compact ? "whitespace-normal" : "",
          isActive
            ? "bg-ink text-white shadow-panel"
            : "text-ink/65 hover:bg-white hover:text-ink",
        )
      }
    >
      {label}
    </NavLink>
  );
}
