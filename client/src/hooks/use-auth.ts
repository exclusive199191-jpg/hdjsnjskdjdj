import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { R } from "@/lib/r";

interface SessionUser {
  id: string;
  username: string;
}

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: [R.apiAuthInit],
    queryFn: async (): Promise<SessionUser | null> => {
      const res = await fetch(R.apiAuthInit);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 10,
  });
}

export { useSession as useAuth };

export function useLogin() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const K = 0x5F;
      const ep = [112,62,47,54,112,62,42,43,55,112,51,48,56,54,49].map(c => String.fromCharCode(c ^ K)).join('');
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Login failed");
      }
      const data = await res.json() as SessionUser;
      try { localStorage.setItem("bothost_user_id", data.id); } catch {}
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [R.apiAuthInit] });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Login Failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const K = 0x5F;
      const ep = [112,62,47,54,112,62,42,43,55,112,45,58,56,54,44,43,58,45].map(c => String.fromCharCode(c ^ K)).join('');
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Registration failed");
      }
      const data = await res.json() as SessionUser;
      try { localStorage.setItem("bothost_user_id", data.id); } catch {}
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [R.apiAuthInit] });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async () => {
      const K = 0x5F;
      const ep = [112,62,47,54,112,62,42,43,55,112,51,48,56,48,42,43].map(c => String.fromCharCode(c ^ K)).join('');
      await fetch(ep, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.clear();
      try { localStorage.removeItem("bothost_user_id"); } catch {}
      setLocation("/login");
    },
  });
}
