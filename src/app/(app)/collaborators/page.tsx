"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

interface CollaboratorRow {
  id: string;
  email: string;
  name?: string;
  canApprove: boolean;
  status: "pending" | "active" | "revoked";
  createdAt: string;
}

interface OwnerRow {
  collaboratorRowId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName?: string;
  canApprove: boolean;
}

const inviteSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  canApprove: z.boolean(),
});

type InviteValues = z.infer<typeof inviteSchema>;

function statusBadge(status: CollaboratorRow["status"]) {
  if (status === "active") return <Badge className="bg-primary text-primary-foreground">Active</Badge>;
  if (status === "pending") return <Badge variant="outline">Pending</Badge>;
  return <Badge variant="secondary">Revoked</Badge>;
}

export default function CollaboratorsPage() {
  const [collaborators, setCollaborators] = useState<CollaboratorRow[] | null>(null);
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [devInviteUrl, setDevInviteUrl] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", canApprove: true },
  });

  const loadCollaborators = useCallback(async () => {
    try {
      setCollaborators(await api.get<CollaboratorRow[]>("/api/collaborators"));
    } catch (error: any) {
      toast.error(error.message || "Failed to load collaborators");
    }
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      setOwners(await api.get<OwnerRow[]>("/api/collaborators/owners"));
    } catch (error: any) {
      toast.error(error.message || "Failed to load owners");
    }
  }, []);

  useEffect(() => {
    loadCollaborators();
    loadOwners();
  }, [loadCollaborators, loadOwners]);

  async function onInvite(values: InviteValues) {
    setDevInviteUrl(null);
    try {
      const result = await api.post<{ message: string; devInviteUrl?: string }>(
        "/api/collaborators/invite",
        values
      );
      toast.success(result.message);
      if (result.devInviteUrl) {
        setDevInviteUrl(result.devInviteUrl);
      }
      form.reset({ email: "", canApprove: true });
      await loadCollaborators();
    } catch (error: any) {
      toast.error(error.message || "Failed to send invite");
    }
  }

  async function handleEnd(id: string) {
    setEndingId(id);
    try {
      await api.delete(`/api/collaborators/${id}`);
      toast.success("Removed");
      await Promise.all([loadCollaborators(), loadOwners()]);
    } catch (error: any) {
      toast.error(error.message || "Failed to remove");
    } finally {
      setEndingId(null);
    }
  }

  async function handleViewData(ownerUserId: string) {
    setSwitchingId(ownerUserId);
    try {
      await api.post("/api/me/switch-owner", { ownerUserId });
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast.error(error.message || "Failed to switch");
      setSwitchingId(null);
    }
  }

  const loading = collaborators === null || owners === null;
  const isEmpty = !loading && collaborators!.length === 0 && owners!.length === 0;

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Collaborators"
        description="Manage shared budgets and spending with others"
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-8">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Invite an accountability buddy</CardTitle>
            <CardDescription>
              They&apos;ll be able to view your data and approve or deny your flagged transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {devInviteUrl && (
              <Alert>
                <AlertDescription className="break-all">
                  Dev mode (no email provider configured yet):{" "}
                  <Link href={devInviteUrl} className="text-primary hover:text-accent transition-colors">
                    {devInviteUrl}
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            <Form {...form}>
              <form className="flex items-end gap-4 flex-wrap" onSubmit={form.handleSubmit(onInvite)}>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[240px]">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="buddy@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="canApprove"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 pb-2">
                      <FormLabel className="mb-0">Can approve/deny</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {form.formState.isSubmitting ? "Sending..." : "Send invite"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {isEmpty ? (
          <EmptyState
            icon={Users}
            title="No collaborators yet"
            description="Invite an accountability buddy above, or wait for someone to invite you."
          />
        ) : (
          <>
            {collaborators && collaborators.length > 0 && (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">People you&apos;ve added</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {collaborators.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-background/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="truncate text-sm">{c.name || c.email}</span>
                        {statusBadge(c.status)}
                        {c.status !== "revoked" && (
                          <span className="text-xs text-muted-foreground">
                            {c.canApprove ? "Can approve" : "View only"}
                          </span>
                        )}
                      </div>
                      {c.status !== "revoked" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={endingId === c.id}
                          onClick={() => handleEnd(c.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {owners && owners.length > 0 && (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Owners who&apos;ve added you</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {owners.map((o) => (
                    <div
                      key={o.collaboratorRowId}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-background/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="truncate text-sm">{o.ownerName || o.ownerEmail}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.canApprove ? "Can approve" : "View only"}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          disabled={switchingId === o.ownerUserId}
                          onClick={() => handleViewData(o.ownerUserId)}
                        >
                          View their data
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={endingId === o.collaboratorRowId}
                          onClick={() => handleEnd(o.collaboratorRowId)}
                        >
                          Leave
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
