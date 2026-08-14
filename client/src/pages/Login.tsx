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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      login.mutate({ username, password });
    } else {
      register.mutate({ username, password });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05020b] px-4 relative overflow-hidden">
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

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-[390px]"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-violet-300/25 bg-violet-400/15 mb-4 shadow-[0_0_28px_rgba(139,92,246,0.28)]">
            <CircleDot className="w-5 h-5 text-violet-200" />
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-white">
            foundingnations
          </h1>
          <p className="text-violet-100/60 text-sm mt-2">
            A calmer way to manage your workspace.
          </p>
        </div>

        {/* Card */}
        <div className="relative bg-[#0c0716]/90 border border-violet-300/15 rounded-2xl overflow-hidden backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)]">

          {/* Tab switcher */}
          <div className="flex border-b border-violet-200/10 px-2 pt-2">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-3 text-sm font-medium rounded-xl transition-colors ${
                  mode === tab
                    ? "text-white bg-violet-300/15"
                    : "text-violet-100/55 hover:text-white"
                }`}
              >
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
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
                    <label className="text-xs font-medium text-violet-100/65">
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
                      className="w-full bg-black/25 border border-violet-200/15 rounded-xl h-11 pl-10 pr-4 text-sm text-white placeholder:text-violet-100/35 focus:border-violet-300/50 focus:ring-2 focus:ring-violet-400/15 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-violet-100/65">
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
                      className="w-full bg-black/25 border border-violet-200/15 rounded-xl h-11 pl-10 pr-4 text-sm text-white placeholder:text-violet-100/35 focus:border-violet-300/50 focus:ring-2 focus:ring-violet-400/15 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(124,58,237,0.28)]"
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

          <div className="px-7 pb-7 text-center">
            <p className="text-xs text-muted-foreground">
              {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-violet-300 hover:text-violet-200 hover:underline"
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          </div>

        </div>

        <p className="text-center text-xs text-violet-100/35 mt-5">
          Your bots, your data. No one else can see your account.
        </p>
      </motion.div>
    </div>
  );
}
