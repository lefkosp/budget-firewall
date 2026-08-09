"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordResponse {
  message: string;
  // Present only outside production -- no email provider is wired up yet,
  // so the dev flow surfaces the link directly instead of sending it.
  devResetUrl?: string;
}

export default function ForgotPasswordPage() {
  const [error, setError] = useState("");
  const [response, setResponse] = useState<ForgotPasswordResponse | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setError("");
    try {
      const result = await api.post<ForgotPasswordResponse>("/api/auth/forgot-password", values);
      setResponse(result);
    } catch (err: any) {
      setError(err.message || "Failed to request a password reset");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Reset password
          </CardTitle>
        </CardHeader>
        <CardContent>
          {response ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>{response.message}</AlertDescription>
              </Alert>
              {response.devResetUrl && (
                <Alert>
                  <AlertDescription className="break-all">
                    Dev mode (no email provider configured yet):{" "}
                    <Link href={response.devResetUrl} className="text-primary hover:text-accent transition-colors">
                      {response.devResetUrl}
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
              <div className="text-center text-sm">
                <Link href="/login" className="text-primary hover:text-accent transition-colors">
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  <Link href="/login" className="text-primary hover:text-accent transition-colors">
                    Back to sign in
                  </Link>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
