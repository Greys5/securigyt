"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Buildings,
  CaretDown,
  ChartLineUp,
  ChartPieSlice,
  CheckCircle,
  GitBranch,
  GithubLogo,
  ListChecks,
  MagnifyingGlass,
  ShieldCheck,
  SquaresFour,
  WarningOctagon,
} from "@phosphor-icons/react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const LINKS = [
  { href: "/", label: "Overview", icon: SquaresFour },
  { href: "/repos", label: "Repositories", icon: GithubLogo },
  { href: "/reports/governance", label: "Reports", icon: ChartPieSlice },
  { href: "/actions", label: "Actions", icon: GitBranch },
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/org", label: "Organization", icon: Buildings },
];

const SECONDARY = [
  { href: "/assessment", label: "Security assessment", icon: ListChecks },
  { href: "/security#findings", label: "Findings", icon: WarningOctagon },
  { href: "/security#coverage", label: "Controls", icon: ListChecks },
  { href: "/actions", label: "Supply chain", icon: ChartLineUp },
];

export function Nav({ org }: { org: string | null }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[208px] flex-col bg-sidebar text-sidebar-text lg:flex">
        <Link href="/" className="flex h-[62px] items-center gap-2.5 border-b border-white/10 px-5 text-[15px] font-semibold">
          <ShieldCheck size={23} weight="duotone" className="text-[#6fb6ff]" aria-hidden />
          <span>SecuriGit</span>
        </Link>

        <div className="px-3 py-5">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
            Organization
          </div>
          <button className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left text-xs hover:bg-white/[0.07]">
            <Buildings size={16} aria-hidden />
            <span className="truncate font-medium">{org ?? "Not configured"}</span>
            <CaretDown size={13} className="ml-auto text-sidebar-muted" aria-hidden />
          </button>
        </div>

        <nav className="space-y-0.5 px-3" aria-label="Primary navigation">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  active
                    ? "bg-sidebar-hover font-medium text-white"
                    : "text-sidebar-muted hover:bg-sidebar-hover/70 hover:text-sidebar-text"
                }`}
              >
                <Icon size={17} weight={active ? "duotone" : "regular"} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-5 my-4 border-t border-white/10" />
        <nav className="space-y-0.5 px-3" aria-label="Security navigation">
          {SECONDARY.map(({ href, label, icon: Icon }) => (
            <Link
              key={`${href}-${label}`}
              href={href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-sidebar-muted transition-colors hover:bg-sidebar-hover/70 hover:text-sidebar-text"
            >
              <Icon size={17} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] text-sidebar-muted">
            <CheckCircle size={15} weight="fill" className="text-[#51c999]" aria-hidden />
            GitHub App connected
          </div>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-20 h-[62px] border-b border-border bg-surface/95 lg:left-[208px]">
        <div className="flex h-full items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
            <ShieldCheck size={22} weight="duotone" className="text-info" aria-hidden />
            SecuriGit
          </Link>

          <label className="relative ml-auto hidden w-full max-w-[430px] md:block lg:ml-0">
            <span className="sr-only">Search repositories, owners, and controls</span>
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              placeholder="Search repositories, owners, controls…"
              className="h-9 w-full rounded-md border border-border bg-surface-2 pl-9 pr-12 text-xs text-foreground placeholder:text-subtle"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted">
              ⌘ K
            </kbd>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
              <CheckCircle size={15} weight="fill" className="text-ok" aria-hidden />
              Synced recently
            </div>
            <ThemeSwitcher />
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background" aria-label="User menu">
              GS
            </button>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-surface/95 px-1 py-1.5 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={`mobile-${href}`} href={href} className={`flex min-w-0 flex-col items-center gap-0.5 rounded-md py-1 text-[9px] ${active ? "font-semibold text-info" : "text-muted"}`}>
              <Icon size={17} weight={active ? "duotone" : "regular"} aria-hidden />
              <span className="max-w-full truncate">{label === "Organization" ? "Org" : label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
