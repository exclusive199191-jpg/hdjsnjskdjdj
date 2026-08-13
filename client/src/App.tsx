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
    console.error("[NETRUNNER] Uncaught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h1 className="font-mono text-xl font-bold text-white mb-2">SYSTEM FAULT</h1>
              <p className="text-muted-foreground text-sm font-mono">
                An unexpected error occurred in the runtime.
              </p>
              {this.state.message && (
                <p className="mt-3 text-xs font-mono text-destructive/80 bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3 text-left break-all">
                  {this.state.message}
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 h-10 px-6 bg-primary hover:bg-primary/90 text-black font-bold font-mono text-sm rounded-lg transition-all"
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
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { data: session, isLoading, isError } = useSession();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="font-mono text-primary/60 text-xs animate-pulse">INITIALIZING SESSION...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h1 className="font-mono text-xl font-bold text-white mb-2">CONNECTION FAILED</h1>
            <p className="text-muted-foreground text-sm font-mono">
              Could not establish a session with the server.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 h-10 px-6 bg-primary hover:bg-primary/90 text-black font-bold font-mono text-sm rounded-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

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
