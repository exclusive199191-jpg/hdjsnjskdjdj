import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { createElement } from "react";

export type ThemePreset = {
  name: string;
  label: string;
  color: string;
  primary: string;
  primaryFg: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  { name: "green",  label: "Neon",    color: "#4ade80", primary: "142 69% 58%", primaryFg: "0 0% 5%" },
  { name: "blue",   label: "Cyber",   color: "#60a5fa", primary: "213 85% 64%", primaryFg: "0 0% 5%" },
  { name: "purple", label: "Matrix",  color: "#a78bfa", primary: "262 72% 70%", primaryFg: "0 0% 5%" },
  { name: "orange", label: "Blaze",   color: "#fb923c", primary: "25 90% 60%",  primaryFg: "0 0% 5%" },
  { name: "pink",   label: "Rose",    color: "#f472b6", primary: "330 85% 65%", primaryFg: "0 0% 5%" },
  { name: "cyan",   label: "Ice",     color: "#22d3ee", primary: "188 80% 55%", primaryFg: "0 0% 5%" },
  { name: "red",    label: "Danger",  color: "#f87171", primary: "0 75% 65%",   primaryFg: "0 0% 5%" },
  { name: "yellow", label: "Gold",    color: "#facc15", primary: "48 95% 55%",  primaryFg: "0 0% 5%" },
];

export interface ThemeSettings {
  preset: string;
}

export interface ThemeContextValue {
  settings: ThemeSettings;
  setPreset: (preset: string) => void;
  presets: ThemePreset[];
  currentPreset: ThemePreset;
}

const STORAGE_KEY = "netrunner_theme_v1";

function applyTheme(settings: ThemeSettings) {
  const preset = THEME_PRESETS.find((p) => p.name === settings.preset) ?? THEME_PRESETS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--ring", preset.primary);
  root.style.setProperty("--primary-foreground", preset.primaryFg);
  root.style.setProperty("--sidebar-primary", preset.primary);
  root.style.setProperty("--sidebar-ring", preset.primary);
  root.style.setProperty("--chart-1", preset.primary);
}

function loadSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (THEME_PRESETS.some((p) => p.name === parsed.preset)) return parsed;
    }
  } catch {}
  return { preset: "green" };
}

export const ThemeContext = createContext<ThemeContextValue>({
  settings: { preset: "green" },
  setPreset: () => {},
  presets: THEME_PRESETS,
  currentPreset: THEME_PRESETS[0],
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings);

  useEffect(() => {
    applyTheme(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const setPreset = (preset: string) => {
    setSettings({ preset });
  };

  const currentPreset = THEME_PRESETS.find((p) => p.name === settings.preset) ?? THEME_PRESETS[0];

  return createElement(
    ThemeContext.Provider,
    { value: { settings, setPreset, presets: THEME_PRESETS, currentPreset } },
    children
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
