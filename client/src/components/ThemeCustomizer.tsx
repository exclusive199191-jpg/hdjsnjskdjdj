import { useState, useRef, useEffect } from "react";
import { Palette, Check, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeCustomizer() {
  const { presets, settings, setPreset } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="button-theme-customizer"
        onClick={() => setOpen((o) => !o)}
        title="Customize theme color"
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-mono"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Theme</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-64 bg-black/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

            <div className="px-4 py-3 flex items-center justify-between border-b border-white/8">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-xs uppercase tracking-widest text-white">
                  Accent Color
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Saved to this browser only
              </p>
              <div className="grid grid-cols-4 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    data-testid={`button-theme-${preset.name}`}
                    onClick={() => setPreset(preset.name)}
                    title={preset.label}
                    className="relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all"
                    style={{
                      borderColor: settings.preset === preset.name
                        ? preset.color
                        : "rgba(255,255,255,0.08)",
                      background: settings.preset === preset.name
                        ? `${preset.color}18`
                        : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: preset.color,
                        borderColor: settings.preset === preset.name
                          ? "white"
                          : "transparent",
                        boxShadow: settings.preset === preset.name
                          ? `0 0 10px ${preset.color}80`
                          : "none",
                      }}
                    >
                      {settings.preset === preset.name && (
                        <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                      )}
                    </div>
                    <span
                      className="font-mono text-[9px] uppercase tracking-wide"
                      style={{
                        color: settings.preset === preset.name
                          ? preset.color
                          : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="font-mono text-[9px] text-muted-foreground/50 text-center">
                  Color applies to accents, buttons & badges
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
