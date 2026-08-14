import { useQuery } from "@tanstack/react-query";
import { R } from "@/lib/r";

const STORAGE_KEY = "bothost_user_id";

export function getUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function userIdHeaders(): Record<string, string> {
  const id = getUserId();
  return id ? { "X-User-Id": id } : {};
}

export function useSession() {
  return useQuery<{ id: string; username?: string } | null>({
    queryKey: [R.apiAuthInit],
    queryFn: async () => {
      const storedId = getUserId();
      const res = await fetch(R.apiAuthInit, {
        credentials: "include",
        headers: storedId ? { "X-User-Id": storedId } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to initialize session");
      const data: { id: string; username?: string } = await res.json();
      try {
        localStorage.setItem(STORAGE_KEY, data.id);
      } catch {}
      return data;
    },
    staleTime: Infinity,
    retry: 3,
  });
}
