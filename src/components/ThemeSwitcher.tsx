"use client";

import { CaretDown, Check, Desktop, Moon, TerminalWindow } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "hacker";

const OPTIONS: { id: Theme; label: string; description: string; icon: typeof Desktop }[] = [
  { id: "light", label: "Light", description: "High-contrast operations", icon: Desktop },
  { id: "dark", label: "Dark", description: "Low-light workspace", icon: Moon },
  { id: "hacker", label: "Hacker", description: "Terminal green on black", icon: TerminalWindow },
];

const THEME_EVENT = "securigit-theme-change";

function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getThemeSnapshot(): Theme {
  const saved = localStorage.getItem("securigit-theme") as Theme | null;
  return saved && OPTIONS.some((option) => option.id === saved) ? saved : "light";
}

function setDocumentTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("securigit-theme", theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "light");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const select = (next: Theme) => {
    setDocumentTheme(next);
    setOpen(false);
  };

  const active = OPTIONS.find((option) => option.id === theme)!;
  const ActiveIcon = active.icon;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={active.label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-surface-2"
      >
        <ActiveIcon size={15} aria-hidden />
        <span className="hidden sm:inline">{active.label}</span>
        <CaretDown size={12} className="text-muted" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-lg">
          {OPTIONS.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={theme === id}
              onClick={() => select(id)}
              className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <Icon size={17} className={id === "hacker" ? "text-ok" : "text-muted"} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{label}</span>
                <span className="block text-[10px] text-muted">{description}</span>
              </span>
              {theme === id && <Check size={15} className="text-info" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
