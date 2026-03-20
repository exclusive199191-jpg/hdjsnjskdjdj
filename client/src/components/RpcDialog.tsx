import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useUpdateBot } from "@/hooks/use-bots";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CyberInput } from "./CyberInput";
import { Activity, X, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BotConfig } from "@shared/schema";

interface RpcDialogProps {
  bot: BotConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RpcDialog({ bot, open, onOpenChange }: RpcDialogProps) {
  const updateBot = useUpdateBot();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      rpcType: bot.rpcType || "PLAYING",
      rpcAppName: bot.rpcAppName || "",
      rpcTitle: bot.rpcTitle || "",
      rpcSubtitle: bot.rpcSubtitle || "",
      rpcImage: bot.rpcImage || "",
      rpcStartTimestamp: bot.rpcStartTimestamp || "",
      rpcEndTimestamp: bot.rpcEndTimestamp || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        rpcType: bot.rpcType || "PLAYING",
        rpcAppName: bot.rpcAppName || "",
        rpcTitle: bot.rpcTitle || "",
        rpcSubtitle: bot.rpcSubtitle || "",
        rpcImage: bot.rpcImage || "",
        rpcStartTimestamp: bot.rpcStartTimestamp || "",
        rpcEndTimestamp: bot.rpcEndTimestamp || "",
      });
    }
  }, [open, bot]);

  const onSubmit = (data: any) => {
    updateBot.mutate(
      {
        id: bot.id,
        rpcType: data.rpcType,
        rpcAppName: data.rpcAppName,
        rpcTitle: data.rpcTitle,
        rpcSubtitle: data.rpcSubtitle,
        rpcImage: data.rpcImage,
        rpcStartTimestamp: data.rpcStartTimestamp ? String(data.rpcStartTimestamp) : "",
        rpcEndTimestamp: data.rpcEndTimestamp ? String(data.rpcEndTimestamp) : "",
      },
      {
        onSuccess: () => {
          toast({ title: "RPC updated", description: "Rich Presence settings saved." });
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/10 sm:max-w-lg p-0 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="px-6 py-5 flex items-center justify-between border-b border-white/8">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-white">
              Configure RPC — {bot.name}
            </DialogTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Activity Type
              </label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                {...form.register("rpcType")}
              >
                <option value="PLAYING">PLAYING</option>
                <option value="STREAMING">STREAMING</option>
                <option value="LISTENING">LISTENING</option>
                <option value="WATCHING">WATCHING</option>
              </select>
            </div>
            <CyberInput
              label="App Name"
              placeholder="Application Name"
              {...form.register("rpcAppName")}
            />
          </div>

          <CyberInput
            label="Title / Details"
            placeholder="Rich Presence Title"
            {...form.register("rpcTitle")}
          />

          <CyberInput
            label="Subtitle / State"
            placeholder="Rich Presence Subtitle"
            {...form.register("rpcSubtitle")}
          />

          <CyberInput
            label="Large Image URL"
            placeholder="https://..."
            {...form.register("rpcImage")}
          />

          <div className="space-y-1.5">
            <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
              Progress Bar / Seek Bar
            </label>
            <div className="grid grid-cols-2 gap-4">
              <CyberInput
                label="Start Position (seconds)"
                placeholder="0"
                type="number"
                min="0"
                {...form.register("rpcStartTimestamp")}
              />
              <CyberInput
                label="Total Duration (seconds)"
                placeholder="214"
                type="number"
                min="1"
                {...form.register("rpcEndTimestamp")}
              />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed pt-0.5">
              Creates a seek bar like music players. <span className="text-primary/70">Start</span> = where the bar begins (seconds elapsed). <span className="text-primary/70">Duration</span> = total length in seconds. Example: start&nbsp;37&nbsp;/&nbsp;duration&nbsp;214 shows 0:37 of 3:34. Works with Streaming too.
            </p>
          </div>

          <button
            type="submit"
            disabled={updateBot.isPending}
            className="w-full h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold font-mono text-sm rounded-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
          >
            {updateBot.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {updateBot.isPending ? "Saving..." : "Save RPC Settings"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
