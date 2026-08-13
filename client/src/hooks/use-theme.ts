import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { createElement } from "react";

export type ThemePreset = {
  name: string;
  label: string;
  color: string;
  primary: string;
  primaryFg: string;
};

export type BgPreset = {
  name: string;
  label: string;
  swatch: string;
  cssValue: string;
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

export const BG_PRESETS: BgPreset[] = [
  { name: "void",    label: "Void",      swatch: "#000000", cssValue: "#000000" },
  { name: "navy",    label: "Navy",      swatch: "#060b18", cssValue: "#060b18" },
  { name: "dpurple", label: "D.Purple", swatch: "#0d0814", cssValue: "#0d0814" },
  { name: "charcoal",label: "Coal",      swatch: "#0a0a0c", cssValue: "#0a0a0c" },
  { name: "dgreen",  label: "Forest",   swatch: "#060f0a", cssValue: "#060f0a" },
  { name: "maroon",  label: "Maroon",   swatch: "#0f060a", cssValue: "#0f060a" },
];

export interface ThemeSettings {
  preset: string;
  bg: string;
}

export interface ThemeContextValue {
  settings: ThemeSettings;
  setPreset: (preset: string) => void;
  setBg: (bg: string) => void;
  presets: ThemePreset[];
  bgPresets: BgPreset[];
  currentPreset: ThemePreset;
  currentBg: BgPreset;
}

const STORAGE_KEY = "netrunner_theme_v2";

function applyTheme(settings: ThemeSettings) {
  const preset = THEME_PRESETS.find((p) => p.name === settings.preset) ?? THEME_PRESETS[0];
  const bg = BG_PRESETS.find((b) => b.name === settings.bg) ?? BG_PRESETS[0];
  const root = document.documentElement;
  // The product is intentionally dark-first. The customizer changes accent and
  // background without switching the readable foreground/card token set.
  root.classList.add("dark");
  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--ring", preset.primary);
  root.style.setProperty("--primary-foreground", preset.primaryFg);
  root.style.setProperty("--sidebar-primary", preset.primary);
  root.style.setProperty("--sidebar-ring", preset.primary);
  root.style.setProperty("--chart-1", preset.primary);
  root.style.setProperty("--bg-override", bg.cssValue);
  document.body.style.backgroundColor = bg.cssValue;
}

function loadSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validPreset = THEME_PRESETS.some((p) => p.name === parsed.preset);
      const validBg = BG_PRESETS.some((b) => b.name === parsed.bg);
      if (validPreset) return { preset: parsed.preset, bg: validBg ? parsed.bg : "void" };
    }
  } catch {}
  return { preset: "green", bg: "void" };
}

export const ThemeContext = createContext<ThemeContextValue>({
  settings: { preset: "green", bg: "void" },
  setPreset: () => {},
  setBg: () => {},
  presets: THEME_PRESETS,
  bgPresets: BG_PRESETS,
  currentPreset: THEME_PRESETS[0],
  currentBg: BG_PRESETS[0],
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings);

  useEffect(() => {
    applyTheme(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const setPreset = (preset: string) => setSettings((s) => ({ ...s, preset }));
  const setBg = (bg: string) => setSettings((s) => ({ ...s, bg }));

  const currentPreset = THEME_PRESETS.find((p) => p.name === settings.preset) ?? THEME_PRESETS[0];
  const currentBg = BG_PRESETS.find((b) => b.name === settings.bg) ?? BG_PRESETS[0];

  return createElement(
    ThemeContext.Provider,
    { value: { settings, setPreset, setBg, presets: THEME_PRESETS, bgPresets: BG_PRESETS, currentPreset, currentBg } },
    children
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
