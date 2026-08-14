import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { LockKeyhole, UserRound, ArrowRight, CircleDot } from "lucide-react";

const SNOWFLAKES = Array.from({ length: 44 }, (_, index) => ({
  left: `${(index * 37) % 101}%`,
  size: `${2 + (index % 4)}px`,
  duration: `${8 + (index % 9)}s`,
  delay: `${-(index % 12)}s`,
  opacity: 0.3 + (index % 6) * 0.1,
}));

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const register = useRegister();
  const isPending = login.isPending || register.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "login") login.mutate({ username, password });
    else register.mutate({ username, password });
  };

  return (
    <div className="ios-safe-bottom relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#05020b] px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_10%,rgba(124,58,237,0.28),transparent_38%),radial-gradient(ellipse_at_85%_85%,rgba(76,29,149,0.20),transparent_42%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_35%,rgba(139,92,246,0.08))]" />
      <div className="absolute inset-0" aria-hidden="true">
        {SNOWFLAKES.map((flake, index) => (
          <span
            key={index}
            className="snowflake"
            style={{
              left: flake.left,
              opacity: flake.opacity,
              ["--snow-size" as string]: flake.size,
              ["--snow-duration" as string]: flake.duration,
              ["--snow-delay" as string]: flake.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative z-10 w-full max-w-[390px]">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/15 shadow-[0_0_28px_rgba(139,92,246,0.28)]">
            <CircleDot className="h-5 w-5 text-violet-200" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">bothost</h1>
          <p className="mt-2 text-sm text-violet-100/60">A calmer way to manage your workspace.</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-violet-300/15 bg-[#0c0716]/90 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex border-b border-violet-200/10 px-2 pt-2">
            {(["login", "register"] as const).map(tab => (
              <button key={tab} onClick={() => setMode(tab)} className={`flex-1 rounded-xl py-3 text-sm font-medium transition-colors ${mode === tab ? "bg-violet-300/15 text-white" : "text-violet-100/55 hover:text-white"}`}>
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-7">
            <AnimatePresence mode="wait">
              <motion.div key={mode} initial={{ opacity: 0, x: mode === "login" ? -10 : 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-violet-100/65">Username</label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-100/40" />
                    <input type="text" value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter username" required autoComplete="username" className="h-11 w-full rounded-xl border border-violet-200/15 bg-black/25 pl-10 pr-4 text-sm text-white outline-none transition-all placeholder:text-violet-100/35 focus:border-violet-300/50 focus:ring-2 focus:ring-violet-400/15" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-violet-100/65">Password</label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-100/40" />
                    <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "Min. 6 characters" : "Enter password"} required autoComplete={mode === "login" ? "current-password" : "new-password"} className="h-11 w-full rounded-xl border border-violet-200/15 bg-black/25 pl-10 pr-4 text-sm text-white outline-none transition-all placeholder:text-violet-100/35 focus:border-violet-300/50 focus:ring-2 focus:ring-violet-400/15" />
                  </div>
                </div>
                <button type="submit" disabled={isPending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)] transition-all hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {isPending ? <span className="animate-pulse">{mode === "login" ? "Authenticating..." : "Creating Account..."}</span> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight className="h-4 w-4" /></>}
                </button>
              </motion.div>
            </AnimatePresence>
          </form>

          <div className="px-7 pb-7 text-center">
            <p className="text-xs text-violet-100/45">{mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
              <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-violet-300 hover:text-violet-200 hover:underline">{mode === "login" ? "Create one" : "Sign in"}</button>
            </p>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-violet-100/35">Your workspace is isolated to your account.</p>
      </motion.div>
    </div>
  );
}