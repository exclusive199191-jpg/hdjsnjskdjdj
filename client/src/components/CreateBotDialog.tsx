import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateBot } from "@/hooks/use-bots";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CyberInput } from "./CyberInput";
import { Plus, X, Zap } from "lucide-react";

const createSchema = z.object({
  token: z.string().min(10, "Token is required"),
  name: z.string().min(1, "Name is required").default("My Bot"),
});
type CreateFormValues = z.infer<typeof createSchema>;

export function CreateBotDialog() {
  const [open, setOpen] = useState(false);
  const createBot = useCreateBot();
  
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", token: "" }
  });

  const onSubmit = (data: CreateFormValues) => {
    createBot.mutate(
      { ...data, passcode: "", nitroSniper: false, bullyTargets: [], whitelistedGcs: [], gcAllowAll: false, commandPrefix: ".", rpcType: "PLAYING", isRunning: true },
      { onSuccess: () => { setOpen(false); form.reset(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="h-10 px-4 bg-primary hover:bg-primary/90 text-black font-bold font-mono text-sm rounded-lg flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)]">
          <Plus className="w-4 h-4" />
          Add Bot
        </button>
      </DialogTrigger>
      <DialogContent className="bg-black/95 border-white/10 sm:max-w-md p-0 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="px-6 py-5 flex items-center justify-between border-b border-white/8">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-white">
              Add New Bot
            </DialogTitle>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5">
          <CyberInput
            label="Display Name"
            placeholder="e.g. Main Account"
            {...form.register("name")}
            error={form.formState.errors.name?.message}
          />
          
          <CyberInput
            label="Discord Token"
            type="password"
            placeholder="Your user token"
            {...form.register("token")}
            error={form.formState.errors.token?.message}
          />

          <p className="text-xs text-muted-foreground font-mono bg-white/3 border border-white/8 rounded-lg p-3">
            Your token is stored securely and only visible to you. Never share it with anyone.
          </p>

          <button
            type="submit"
            disabled={createBot.isPending}
            className="w-full h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold font-mono text-sm rounded-lg flex items-center justify-center gap-2 transition-all"
          >
            {createBot.isPending ? "Connecting..." : "Connect Bot"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
