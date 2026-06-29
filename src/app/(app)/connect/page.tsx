"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isLinked = searchParams.get("linked") === "true";

  useEffect(() => {
    if (isLinked) {
      setConnected(true);
    }
  }, [isLinked]);

  async function handleConnect() {
    setLoading(true);
    try {
      const data = await api.post<{ requisitionId: string; consentLink: string }>(
        "/api/banking/requisition"
      );
      
      // For mock provider, redirect to callback
      if (data.consentLink) {
        window.location.href = data.consentLink;
      }
    } catch (error: any) {
      console.error("Error connecting:", error);
      alert(error.message || "Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const data = await api.post<{ imported: number; new: number; accounts: number }>(
        "/api/banking/sync"
      );
      alert(`Sync complete! Imported ${data.imported} transactions (${data.new} new).`);
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Error syncing:", error);
      alert(error.message || "Failed to sync. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <div className="flex-shrink-0 mb-6">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Connect Revolut
        </h1>
        <p className="text-muted-foreground mt-2">
          Connect your Revolut account to start tracking transactions
        </p>
      </div>

      <div className="flex-1 overflow-auto space-y-8">

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Bank Connection</CardTitle>
          <CardDescription>
            Connect your Revolut account via Open Banking to sync transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to connect your Revolut account. You'll be redirected to
                complete the connection.
              </p>
              <Button 
                onClick={handleConnect} 
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {loading ? "Connecting..." : "Connect Revolut"}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <Badge variant="default" className="bg-primary text-primary-foreground">Connected</Badge>
                <span className="text-sm text-muted-foreground">
                  Your Revolut account is connected
                </span>
              </div>
              <Button 
                onClick={handleSync} 
                disabled={syncing}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

