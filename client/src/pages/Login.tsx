import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { LockKeyhole, UserRound, ArrowRight, CircleDot } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(246_70%_60%_/_0.10),transparent_58%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-[390px]"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-primary/25 bg-primary/10 mb-4">
            <CircleDot className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-white">
            foundingnations
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            A calmer way to manage your workspace.
          </p>
        </div>

        {/* Card */}
        <div className="relative bg-card/90 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">

          {/* Tab switcher */}
          <div className="flex border-b border-white/10 px-2 pt-2">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className={`flex-1 py-3 text-sm font-medium rounded-xl transition-colors ${
                  mode === tab
                    ? "text-white bg-white/10"
                    : "text-muted-foreground hover:text-white"
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

          <div className="px-7 pb-7 text-center">
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

        <p className="text-center text-xs text-muted-foreground/50 mt-5">
          Your bots, your data. No one else can see your account.
        </p>
      </motion.div>
    </div>
  );
}
