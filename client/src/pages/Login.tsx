import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, User, Lock, ChevronRight, Activity } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.07)_0%,transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-primary/30 bg-primary/5 mb-4 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-primary via-emerald-400 to-primary">
            NETRUNNER
          </h1>
          <p className="font-mono text-muted-foreground text-xs mt-2 flex items-center justify-center gap-2">
            <Activity className="w-3 h-3 text-primary animate-pulse" />
            SELF-BOT HOSTING PLATFORM
          </p>
        </div>

        {/* Card */}
        <div className="relative bg-black/80 border border-primary/20 rounded-lg overflow-hidden backdrop-blur-xl shadow-[0_0_40px_rgba(34,197,94,0.1)]">
          {/* Top accent bar */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

          {/* Tab switcher */}
          <div className="flex border-b border-white/5">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-4 font-mono text-xs uppercase tracking-widest transition-colors ${
                  mode === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
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
                  <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      required
                      autoComplete="username"
                      className="w-full bg-white/5 border border-white/10 rounded h-12 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "Min. 6 characters" : "Enter password"}
                      required
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="w-full bg-white/5 border border-white/10 rounded h-12 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold font-mono uppercase tracking-widest text-sm rounded transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                >
                  {isPending ? (
                    <span className="animate-pulse">
                      {mode === "login" ? "Authenticating..." : "Creating Account..."}
                    </span>
                  ) : (
                    <>
                      {mode === "login" ? "Access System" : "Create Account"}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            </AnimatePresence>
          </form>

          <div className="px-8 pb-6 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-primary hover:underline"
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>

        <p className="text-center font-mono text-xs text-muted-foreground/40 mt-6">
          Your bots, your data. No one else can see your account.
        </p>
      </motion.div>
    </div>
  );
}
