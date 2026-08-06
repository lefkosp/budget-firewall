"use client";

import { ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  ArrowLeftRight,
  Repeat,
  PiggyBank,
  ShieldAlert,
  Target,
  Users,
  Landmark,
  Upload,
  ChevronsUpDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/budgets", label: "Budgets", icon: PiggyBank },
    ],
  },
  {
    label: "Firewall",
    items: [
      { href: "/rules", label: "Rules", icon: ShieldAlert },
      { href: "/intents", label: "Intents", icon: Target },
      { href: "/collaborators", label: "Collaborators", icon: Users },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/connect", label: "Connect Revolut", icon: Landmark },
      { href: "/import", label: "Import CSV", icon: Upload },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen flex bg-background text-foreground overflow-hidden">
        <aside className="w-64 border-r border-border bg-card/50 px-4 py-6 flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
          <div className="flex-1 space-y-2 pt-2">
            {navItems.map((item) => (
              <Skeleton key={item.href} className="h-9 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 overflow-hidden bg-background p-8 space-y-6">
          <Skeleton className="h-9 w-64" />
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-2 py-3">
          <div className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent px-2">
            Budget Firewall
          </div>
        </SidebarHeader>
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={pathname === item.href}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden text-left">
                  <span className="truncate text-sm font-medium">
                    {user.name || user.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem onClick={handleLogout} variant="destructive">
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2 md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-hidden bg-background">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
