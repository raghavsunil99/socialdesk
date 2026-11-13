"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "dark", dark: "light", light: "system" };
const ICON: Record<Mode, string> = { system: "◐", dark: "☾", light: "☀" };

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") setMode(t); } catch {}
  }, []);
  const apply = (m: Mode) => {
    setMode(m);
    if (m === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = m;
    try { if (m === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", m); } catch {}
  };
  return (
    <button onClick={() => apply(NEXT[mode])} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-bg hover:text-ink" title={`Theme: ${mode} (click to change)`} aria-label={`Theme: ${mode}`}>
      {ICON[mode]}
    </button>
  );
}
