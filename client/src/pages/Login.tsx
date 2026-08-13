import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { LockKeyhole, UserRound, ArrowRight, CircleDot, ShieldCheck, Command, Activity } from "lucide-react";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useLogin();
  const register = useRegister();

  const isPending = login.isPending || register.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      login.mutate({ username, password });
    } else {
      register.mutate({ username, password });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/.16)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/.16)_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(217_91%_60%_/_0.14),transparent_55%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-4xl"
      >
        <div className="grid lg:grid-cols-[1.05fr_.95fr] rounded-3xl border border-white/10 bg-card/85 overflow-hidden backdrop-blur-xl shadow-2xl shadow-black/30">
          <div className="hidden lg:flex flex-col justify-between p-10 border-r border-white/8 bg-white/[0.02]">
            <div>
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <CircleDot className="w-5 h-5" />
                </div>
                <span className="text-lg font-semibold tracking-tight text-white">bothost</span>
              </div>
              <div className="mt-20 max-w-sm">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary/70">Account workspace</p>
                <h1 className="mt-4 text-4xl font-display font-semibold tracking-tight text-white leading-tight">
                  Your accounts,<br />in one calm view.
                </h1>
                <p className="mt-5 text-sm leading-6 text-white/40">
                  Keep connected accounts, command controls and public context tools close without the clutter.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                [Activity, "Live connection status"],
                [Command, "Compact command reference"],
                [ShieldCheck, "Private workspace by default"],
              ].map(([Icon, label]) => (
                <div key={label as string} className="flex items-center gap-3 text-xs text-white/45">
                  <span className="w-7 h-7 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-primary/70" />
                  </span>
                  {label as string}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="lg:hidden flex items-center gap-3 px-6 pt-7">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground">
                <CircleDot className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">bothost</p>
                <p className="text-xs text-white/35">Account workspace</p>
              </div>
            </div>

          {/* Tab switcher */}
          <div className="flex border-b border-white/10 px-6 pt-7 gap-6">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  mode === tab
                    ? "text-white after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Username
                  </label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      required
                      autoComplete="username"
                      className="w-full bg-black/10 border border-white/10 rounded-xl h-11 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "Min. 6 characters" : "Enter password"}
                      required
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="w-full bg-black/10 border border-white/10 rounded-xl h-11 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <span className="animate-pulse">
                      {mode === "login" ? "Authenticating..." : "Creating Account..."}
                    </span>
                  ) : (
                    <>
                      {mode === "login" ? "Sign in" : "Create account"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            </AnimatePresence>
          </form>

          <div className="px-6 sm:px-8 pb-8 text-center">
            <p className="text-xs text-muted-foreground">
              {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-primary hover:underline"
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          </div>

          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-5">
          Your workspace is isolated to your account.
        </p>
      </motion.div>
    </div>
  );
}
