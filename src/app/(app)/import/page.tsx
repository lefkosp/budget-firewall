"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    new: number;
    skipped: number;
    nonEurCount: number;
  } | null>(null);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.endsWith(".csv")) {
        setError("Please select a CSV file");
        return;
      }
      setFile(selectedFile);
      setError("");
      setResult(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a CSV file");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("csvFile", file);
      if (accountName) {
        formData.append("accountName", accountName);
      }
      formData.append("currency", currency);

      // Use fetch directly since api client might not handle FormData well
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      const response = await fetch(`${apiUrl}/api/transactions/import-csv`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to import CSV");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to import CSV file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-8 overflow-hidden">
      <div className="flex-shrink-0 mb-6">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          Import Transactions
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload a CSV file with your bank statements to import transactions
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto space-y-8">

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Upload CSV File</CardTitle>
            <CardDescription>
              Supported formats: Revolut exports, generic bank statements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="csvFile">CSV File</Label>
                <Input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  required
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Required columns: Date, Description, Amount (or similar)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountName">Account Name (optional)</Label>
                <Input
                  id="accountName"
                  type="text"
                  placeholder="e.g., Main Account"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default "CSV Import Account"
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  type="text"
                  placeholder="EUR"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading || !file}
              >
                {loading ? "Importing..." : "Import Transactions"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Import Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2 text-accent">Supported Formats</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    <strong>Revolut:</strong> Export from Revolut app (CSV format)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    <strong>Generic:</strong> Date, Description, Amount columns
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-accent">Required Columns</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Date (various formats supported)</li>
                <li>• Description/Merchant</li>
                <li>• Amount (positive or negative)</li>
                <li>• Currency (optional, defaults to EUR)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2 text-accent">What Happens</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Transactions are parsed and imported</li>
                <li>• Rules are automatically applied</li>
                <li>• Budgets are checked</li>
                <li>• Duplicates are skipped</li>
                <li>• Full analytics are generated</li>
              </ul>
            </div>

            <div className="pt-4 border-t border-border/50">
              <a
                href="/sample-transactions.csv"
                download
                className="text-sm text-primary hover:text-accent transition-colors inline-flex items-center gap-2"
              >
                <span>📥</span>
                <span>Download Sample CSV</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg text-primary">Import Complete!</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="text-sm text-muted-foreground mb-1">Total Imported</div>
                <div className="text-2xl font-bold text-primary">{result.imported}</div>
              </div>
              <div className="p-4 rounded-lg bg-accent/10 border border-accent/20">
                <div className="text-sm text-muted-foreground mb-1">New Transactions</div>
                <div className="text-2xl font-bold text-accent">{result.new}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                <div className="text-sm text-muted-foreground mb-1">Skipped (Duplicates)</div>
                <div className="text-2xl font-bold text-secondary-foreground">{result.skipped}</div>
              </div>
            </div>
            {result.nonEurCount > 0 && (
              <div className="mt-4 p-4 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                {result.nonEurCount} transaction{result.nonEurCount === 1 ? "" : "s"} in other
                currencies {result.nonEurCount === 1 ? "was" : "were"} imported but{" "}
                {result.nonEurCount === 1 ? "is" : "are"} excluded from totals, budgets, and
                analytics (EUR only for now).
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => router.push("/transactions")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                View Transactions
              </Button>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                className="border-accent/50 hover:bg-accent/20"
              >
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

