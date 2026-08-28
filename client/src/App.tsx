import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { R } from "@/lib/r";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import BotDetail from "@/pages/BotDetail";
import Admin from "@/pages/Admin";
import Accounts from "@/pages/Accounts";
import Support from "@/pages/Support";
import Login from "@/pages/Login";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSession } from "@/hooks/use-session";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[bothost] Uncaught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="mt-5">
              <h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">
                The workspace hit an unexpected error.
              </p>
              {this.state.message && (
                <p className="mt-4 text-xs text-destructive/80 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3 text-left break-all">
                  {this.state.message}
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Reload System
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path={R.routeBot} component={BotDetail} />
      <Route path={R.routeAdmin} component={Admin} />
      <Route path={R.routeAccounts} component={Accounts} />
      <Route path={R.routeSupport} component={Support} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { data: session, isLoading, isError } = useSession();

  if (isLoading) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="text-primary/70 text-sm animate-pulse">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div className="mt-5">
            <h1 className="text-xl font-semibold text-foreground mb-2">Can’t connect</h1>
            <p className="text-muted-foreground text-sm">
              We couldn’t establish a session with the server.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 h-10 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Admin has its own PIN gate and must remain reachable even when there is
  // no regular workspace session.
  if (!session && window.location.pathname !== R.routeAdmin) return <Login />;

  return <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <AppInner />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
