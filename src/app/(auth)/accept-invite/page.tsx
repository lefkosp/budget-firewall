"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface InvitePreview {
  ownerEmail: string;
  ownerName?: string;
  email: string;
  canApprove: boolean;
}

const loginSchema = z.object({ password: z.string().min(1, "Password is required") });
type LoginValues = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  name: z.string().optional(),
  password: z.string().min(6, "Must be at least 6 characters"),
});
type RegisterValues = z.infer<typeof registerSchema>;

/** Loading fallback while useSearchParams() resolves -- same wrapper as the
 * page itself so there's no layout shift once the real content mounts. */
function AcceptInviteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Accept invite
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteForm />
    </Suspense>
  );
}

/** useSearchParams() requires a Suspense boundary for static prerendering --
 * the actual form lives here, wrapped by the page's default export above. */
function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const { user, login, register } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null | "loading">("loading");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { password: "" } });
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", password: "" },
  });

  useEffect(() => {
    if (!token) {
      setPreview(null);
      return;
    }
    api
      .get<InvitePreview>(`/api/collaborators/invite/${token}`)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [token]);

  async function acceptAndRedirect() {
    setAccepting(true);
    try {
      await api.post(`/api/collaborators/invite/${token}/accept`);
      setAccepted(true);
      setTimeout(() => router.push("/collaborators"), 1500);
    } catch (err: any) {
      setError(err.message || "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  }

  async function onLogin(values: LoginValues) {
    if (preview === "loading" || !preview) return;
    setError("");
    try {
      await login(preview.email, values.password);
      await acceptAndRedirect();
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    }
  }

  async function onRegister(values: RegisterValues) {
    if (preview === "loading" || !preview) return;
    setError("");
    try {
      await register(preview.email, values.password, values.name || undefined);
      await acceptAndRedirect();
    } catch (err: any) {
      setError(err.message || "Failed to register");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Accept invite
          </CardTitle>
        </CardHeader>
        <CardContent>
          {preview === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !preview ? (
            <Alert variant="destructive">
              <AlertDescription>
                This invite link is invalid or has expired. Ask for a new one from whoever invited you.
              </AlertDescription>
            </Alert>
          ) : accepted ? (
            <Alert>
              <AlertDescription>Invite accepted. Redirecting...</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <CardDescription>
                <strong>{preview.ownerName || preview.ownerEmail}</strong> invited you to{" "}
                {preview.canApprove ? "view and approve their transactions" : "view their data"}.
              </CardDescription>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {user ? (
                user.email.toLowerCase() === preview.email.toLowerCase() ? (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={accepting}
                    onClick={acceptAndRedirect}
                  >
                    {accepting ? "Accepting..." : "Accept invite"}
                  </Button>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      This invite was sent to {preview.email}, but you&apos;re signed in as {user.email}. Log
                      out and sign in as {preview.email} to accept it.
                    </AlertDescription>
                  </Alert>
                )
              ) : mode === "login" ? (
                <Form {...loginForm}>
                  <form className="space-y-4" onSubmit={loginForm.handleSubmit(onLogin)}>
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" value={preview.email} disabled />
                      </FormControl>
                    </FormItem>
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={loginForm.formState.isSubmitting}
                    >
                      {loginForm.formState.isSubmitting ? "Signing in..." : "Sign in and accept"}
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        className="text-primary hover:text-accent transition-colors"
                        onClick={() => setMode("register")}
                      >
                        Create one
                      </button>
                    </div>
                  </form>
                </Form>
              ) : (
                <Form {...registerForm}>
                  <form className="space-y-4" onSubmit={registerForm.handleSubmit(onRegister)}>
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" value={preview.email} disabled />
                      </FormControl>
                    </FormItem>
                    <FormField
                      control={registerForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name (optional)</FormLabel>
                          <FormControl>
                            <Input type="text" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={registerForm.formState.isSubmitting}
                    >
                      {registerForm.formState.isSubmitting ? "Creating account..." : "Create account and accept"}
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="text-primary hover:text-accent transition-colors"
                        onClick={() => setMode("login")}
                      >
                        Sign in
                      </button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          )}
          {!preview || preview === "loading" ? (
            <div className="text-center text-sm text-muted-foreground mt-4">
              <Link href="/login" className="text-primary hover:text-accent transition-colors">
                Back to sign in
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
