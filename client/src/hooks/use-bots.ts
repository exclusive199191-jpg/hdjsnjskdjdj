import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateBotInput, type UpdateBotConfig } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useBots() {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: [api.bots.list.path],
    queryFn: async () => {
      const res = await fetch(api.bots.list.path, { credentials: "include" });
      if (!res.ok) {
        toast({
          title: "System Error",
          description: "Failed to fetch bot configurations",
          variant: "destructive"
        });
        throw new Error("Failed to fetch bots");
      }
      return api.bots.list.responses[200].parse(await res.json());
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useBot(id: number) {
  const { toast } = useToast();

  return useQuery({
    queryKey: [api.bots.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.bots.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) {
        toast({
          title: "System Error",
          description: "Failed to fetch bot details",
          variant: "destructive"
        });
        throw new Error("Failed to fetch bot");
      }
      return api.bots.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateBot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBotInput) => {
      const validated = api.bots.create.input.parse(data);
      const res = await fetch(api.bots.create.path, {
        method: api.bots.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });
      
      if (!res.ok) {
        if (res.status === 400) {
           const error = api.bots.create.responses[400].parse(await res.json());
           throw new Error(error.message);
        }
        throw new Error("Failed to initialize bot");
      }
      return api.bots.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      toast({
        title: "Bot Initialized",
        description: "New bot instance has been successfully deployed.",
        className: "border-primary text-primary"
      });
    },
    onError: (error) => {
      toast({
        title: "Deployment Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
}

export function useUpdateBot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateBotConfig) => {
      const validated = api.bots.update.input.parse(updates);
      const url = buildUrl(api.bots.update.path, { id });
      
      const res = await fetch(url, {
        method: api.bots.update.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(validated),
      });

      if (!res.ok) throw new Error("Failed to update bot configuration");
      return api.bots.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bots.get.path, variables.id] });
      toast({
        title: "Configuration Updated",
        description: "Bot settings have been synchronized.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
}

export function useDeleteBot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.bots.delete.path, { id });
      const res = await fetch(url, { method: api.bots.delete.method, credentials: "include" });
      if (!res.ok) throw new Error("Failed to terminate bot");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      toast({
        title: "Bot Terminated",
        description: "Instance has been removed from the network.",
        variant: "destructive"
      });
    },
  });
}

export function useBotAction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "restart" | "stop" }) => {
      const path = action === "restart" ? api.bots.restart.path : api.bots.stop.path;
      const url = buildUrl(path, { id });
      
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`Failed to ${action} bot`);
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.bots.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bots.get.path, variables.id] });
      toast({
        title: "Command Executed",
        description: `Bot ${variables.action} sequence completed.`,
        className: "border-primary text-primary"
      });
    },
    onError: (error) => {
      toast({
        title: "Command Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
}
