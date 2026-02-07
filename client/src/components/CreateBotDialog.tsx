import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertBotConfigSchema } from "@shared/schema";
import { useCreateBot } from "@/hooks/use-bots";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CyberButton } from "./CyberButton";
import { CyberInput } from "./CyberInput";
import { Plus, X } from "lucide-react";

// Only require token for creation
const createSchema = insertBotConfigSchema.pick({ token: true, name: true });
type CreateFormValues = z.infer<typeof createSchema>;

export function CreateBotDialog() {
  const [open, setOpen] = useState(false);
  const createBot = useCreateBot();
  
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      token: ""
    }
  });

  const onSubmit = (data: CreateFormValues) => {
    createBot.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <CyberButton className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Deploy New Bot
        </CyberButton>
      </DialogTrigger>
      <DialogContent className="bg-black/95 border-primary/20 sm:max-w-md p-0 overflow-hidden">
        <div className="border-b border-primary/20 bg-primary/5 px-6 py-4 flex items-center justify-between">
          <DialogTitle className="font-display uppercase tracking-wider text-primary">
            New Instance Deployment
          </DialogTitle>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
          <CyberInput
            label="Instance Name"
            placeholder="e.g. Main Account"
            {...form.register("name")}
            error={form.formState.errors.name?.message}
          />
          
          <CyberInput
            label="User Token"
            type="password"
            placeholder="Discord Token"
            {...form.register("token")}
            error={form.formState.errors.token?.message}
          />

          <div className="flex justify-end pt-4">
            <CyberButton 
              type="submit" 
              isLoading={createBot.isPending}
              className="w-full"
            >
              {createBot.isPending ? "Initializing..." : "Deploy Instance"}
            </CyberButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
