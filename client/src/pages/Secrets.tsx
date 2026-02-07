import { useQuery, useMutation } from "@tanstack/react-query";
import { BotConfig } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { Shield, Save, RefreshCcw } from "lucide-react";
import { z } from "zod";

const settingsSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export default function Secrets() {
  const { toast } = useToast();
  const { data: bots, isLoading } = useQuery<BotConfig[]>({ 
    queryKey: ["/api/bots"] 
  });

  const mainBot = bots?.find(b => b.name === "Main User Account");

  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      token: mainBot?.token || "",
    },
    values: {
      token: mainBot?.token || "",
    }
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof settingsSchema>) => {
      if (!mainBot) throw new Error("Main bot not found");
      const res = await apiRequest("PUT", `/api/bots/${mainBot.id}`, {
        ...mainBot,
        token: values.token
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
      toast({
        title: "Success",
        description: "Bot token updated successfully. The bot will restart to apply the new token.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCcw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Secrets Management</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Autohosted User Settings</CardTitle>
          <CardDescription>
            Manage the authentication token for your main autohosted account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mainBot ? (
            <div className="text-sm text-destructive">
              Main user account not found. Please ensure the bot is initialized.
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discord Token</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="text"
                          placeholder="Enter Discord Token"
                          data-testid="input-token"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={mutation.isPending}
                  data-testid="button-save-secrets"
                >
                  {mutation.isPending ? (
                    <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Security Note</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Your Discord token provides full access to your account. Never share it with anyone. 
            The selfbot uses this token to authenticate and perform actions on your behalf.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
