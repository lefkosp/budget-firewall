"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/PageHeader";

type RenewalState = "ok" | "expiring_soon" | "expired";

interface ConnectionAccount {
  id: string;
  name: string;
  currency: string;
  lastSyncedAt?: string;
}

interface Connection {
  id: string;
  provider: string;
  status: string;
  consentExpiresAt?: string;
  renewalState: RenewalState;
  createdAt: string;
  accounts: ConnectionAccount[];
}

function formatDateTime(iso?: string) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RenewalBadge({ state }: { state: RenewalState }) {
  if (state === "expired") {
    return <Badge variant="destructive">Consent expired</Badge>;
  }
  if (state === "expiring_soon") {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-500">
        Consent expiring soon
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="bg-primary text-primary-foreground">
      Connected
    </Badge>
  );
}

export default function ConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const data = await api.get<{ connections: Connection[] }>("/api/banking/connections");
      setConnections(data.connections);
    } catch (error: any) {
      toast.error(error.message || "Failed to load bank connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("linked") === "true") {
      toast.success("Bank account connected");
    }
    const errorParam = searchParams.get("error");
    if (errorParam) {
      toast.error(`Connection failed: ${errorParam.replace(/_/g, " ")}`);
    }
    if (errorParam || searchParams.get("linked")) {
      router.replace("/connect");
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const data = await api.post<{ requisitionId: string; consentLink: string }>(
        "/api/banking/requisition"
      );
      if (data.consentLink) {
        window.location.href = data.consentLink;
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to connect. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const data = await api.post<{ imported: number; new: number; accounts: number }>(
        "/api/banking/sync"
      );
      toast.success(`Sync complete! Imported ${data.imported} transactions (${data.new} new).`);
      await loadConnections();
    } catch (error: any) {
      toast.error(error.message || "Failed to sync. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setDisconnectingId(connectionId);
    try {
      await api.delete(`/api/banking/connections/${connectionId}`);
      toast.success("Bank connection disconnected");
      await loadConnections();
    } catch (error: any) {
      toast.error(error.message || "Failed to disconnect");
    } finally {
      setDisconnectingId(null);
    }
  }

  const linkedConnections = (connections || []).filter((c) => c.status === "LINKED");
  const hasLinkedConnection = linkedConnections.length > 0;

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <PageHeader
        title="Connect Revolut"
        description="Connect your Revolut account to start tracking transactions"
      />

      <div className="flex-1 min-h-0 overflow-auto space-y-8">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Bank Connection</CardTitle>
            <CardDescription>
              Connect your Revolut account via Open Banking to sync transactions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !hasLinkedConnection ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Click the button below to connect your Revolut account. You&apos;ll be redirected to
                  complete the connection.
                </p>
                <Button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {connecting ? "Connecting..." : "Connect Revolut"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                {linkedConnections.map((connection) => (
                  <div
                    key={connection.id}
                    className="space-y-3 p-4 rounded-lg bg-primary/5 border border-primary/20"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <RenewalBadge state={connection.renewalState} />
                      <span className="text-xs text-muted-foreground">
                        Consent expires {formatDateTime(connection.consentExpiresAt)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {connection.accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between text-sm py-2 px-3 rounded-md bg-background/50"
                        >
                          <span>
                            {account.name} <span className="text-muted-foreground">({account.currency})</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Last synced: {formatDateTime(account.lastSyncedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(connection.renewalState === "expiring_soon" ||
                        connection.renewalState === "expired") && (
                        <Button
                          onClick={handleConnect}
                          disabled={connecting}
                          variant="outline"
                          className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                        >
                          Renew consent
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDisconnect(connection.id)}
                        disabled={disconnectingId === connection.id}
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        {disconnectingId === connection.id ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
