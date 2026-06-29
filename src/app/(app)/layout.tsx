"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/analytics", label: "Analytics" },
  { href: "/connect", label: "Connect Revolut" },
  { href: "/import", label: "Import CSV" },
  { href: "/budgets", label: "Budgets" },
  { href: "/rules", label: "Rules" },
  { href: "/intents", label: "Intents" },
  { href: "/collaborators", label: "Collaborators" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <aside className="w-64 border-r border-border bg-card/50 px-4 py-6 flex flex-col gap-4">
        <div className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Budget Firewall
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className="w-full justify-start hover:bg-accent/20 hover:text-accent-foreground transition-colors"
              asChild
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden bg-background">{children}</main>
    </div>
  );
}
