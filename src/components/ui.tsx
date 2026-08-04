/** Shared presentational primitives used across every dashboard page. */

import type { ReactNode } from "react";
import type { Unavailable } from "@/lib/github/client";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  info: "border-info/40 bg-info/10 text-info",
  accent: "border-accent/40 bg-accent/10 text-accent",
  muted: "border-border bg-surface-2 text-muted",
};

export function Badge({
  tone = "muted",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** Yes/no cell used throughout the repo tables. */
export function YesNo({
  value,
  yes = "yes",
  no = "no",
  invert = false,
  title,
}: {
  value: boolean;
  yes?: string;
  no?: string;
  /** When true, `false` is the good outcome (e.g. "force pushes allowed"). */
  invert?: boolean;
  title?: string;
}) {
  const good = invert ? !value : value;
  return (
    <Badge tone={good ? "ok" : "bad"} title={title}>
      {value ? yes : no}
    </Badge>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "info",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  const color: Record<Tone, string> = {
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
    info: "text-info",
    accent: "text-accent",
    muted: "text-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Rendered when a section is blocked by permissions or the org's plan. */
export function UnavailableNotice({ info }: { info: Unavailable }) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm">
      <div className="font-medium text-warn">Unavailable</div>
      <p className="mt-1 text-muted">{info.reason}</p>
      {info.hint && <p className="mt-1 text-xs text-muted">{info.hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border-b border-border/60 px-3 py-2 align-middle ${className}`}>
      {children}
    </td>
  );
}

/** Green when nearly everything passes, amber in the middle, red when most fail. */
export function ratioTone(passed: number, total: number): Tone {
  if (total === 0) return "muted";
  const ratio = passed / total;
  if (ratio >= 0.95) return "ok";
  if (ratio >= 0.6) return "warn";
  return "bad";
}

export function formatAge(timestamp: number | null | undefined): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
