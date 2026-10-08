"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CreditCard, HandCoins, LayoutDashboard, Moon, PackageCheck, RefreshCcw, ScrollText, Sun, Tags, Users, Wallet, WalletCards } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { DIEU_AM_ROLE_CODE } from "@/lib/dieu-am-scope";
import { roleLabel, STAFF_ROLE_CODES } from "@/lib/roles";

const links = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "ACCOUNTANT", ...STAFF_ROLE_CODES, DIEU_AM_ROLE_CODE],
    children: [
      { href: "/dashboard", label: "Tổng quan", roles: ["ADMIN", "ACCOUNTANT", ...STAFF_ROLE_CODES, DIEU_AM_ROLE_CODE] },
      { href: "/dashboard/feline", label: "Feline", roles: ["ADMIN", "ACCOUNTANT"] },
      { href: "/dashboard/supplier", label: "Supplier", roles: ["ADMIN", "ACCOUNTANT"] },
    ],
  },
  { href: "/purchase-requests", label: "Yêu cầu mua", icon: PackageCheck, roles: [] as string[] },
  { href: "/operating-rules", label: "Quy định vận hành", icon: ScrollText, roles: [] as string[] },
  { href: "/currency-conversions", label: "Quy đổi tiền tệ", icon: RefreshCcw, roles: ["ADMIN", "ACCOUNTANT"] },
  { href: "/external-receivables", label: "Công nợ", icon: HandCoins, roles: ["ADMIN", "ACCOUNTANT"] },
  { href: "/transactions", label: "Sổ giao dịch", icon: CreditCard, roles: ["ADMIN", "ACCOUNTANT", ...STAFF_ROLE_CODES, DIEU_AM_ROLE_CODE] },
  { href: "/account-wallets", label: "Ví Account", icon: Wallet, roles: ["ADMIN", "ACCOUNTANT", "ACCOUNT"] },
  { href: "/categories", label: "Danh mục", icon: Tags, roles: ["ADMIN", "ACCOUNTANT"] },
  { href: "/payment-accounts", label: "Tài khoản thanh toán", icon: WalletCards, roles: ["ADMIN"] },
  { href: "/users", label: "Quản lý user", icon: Users, roles: ["ADMIN"] },
  // { href: "/logs", label: "Logs", icon: ClipboardList, roles: ["ADMIN"] },
];

const mapRoleLabel = roleLabel;

export function MainSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [roles, setRoles] = useState<string[]>([]);
  const [accountName, setAccountName] = useState("Tài khoản");
  const [pendingPurchaseRequestCount, setPendingPurchaseRequestCount] = useState(0);
  const [pendingAdjustmentCount, setPendingAdjustmentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (cancelled || !response.ok) return;
        const userRoles = Array.isArray(data.user?.roles) ? data.user.roles : [];
        setRoles(userRoles);
        setAccountName(typeof data.user?.fullName === "string" ? data.user.fullName : "Tài khoản");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canSeePendingBadge = roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
    if (!canSeePendingBadge) {
      return;
    }

    let cancelled = false;
    const loadPendingCount = async () => {
      const response = await fetch("/api/purchase-requests", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        rows?: Array<{ status?: string }>;
      };
      if (cancelled || !response.ok) return;
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const pendingCount = rows.filter((row) => row.status === "PENDING_APPROVAL").length;
      setPendingPurchaseRequestCount(pendingCount);
    };

    void loadPendingCount();
    const timer = setInterval(() => {
      void loadPendingCount();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roles]);

  useEffect(() => {
    if (!roles.includes("ADMIN")) {
      return;
    }

    let cancelled = false;
    const loadPendingAdjustmentCount = async () => {
      const response = await fetch("/api/transactions/adjustments?status=PENDING", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        rows?: Array<{ id?: string }>;
      };
      if (cancelled || !response.ok) return;
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setPendingAdjustmentCount(rows.length);
    };

    void loadPendingAdjustmentCount();
    const timer = setInterval(() => {
      void loadPendingAdjustmentCount();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roles]);

  const visibleLinks = useMemo(() => {
    return links.filter((link) => link.roles.length === 0 || link.roles.some((role) => roles.includes(role)));
  }, [roles]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="px-3 py-4">
          <Image
            src="/logo.png"
            alt="Logo"
            width={140}
            height={40}
            unoptimized
            className="h-10 w-auto object-contain"
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Điều hướng</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleLinks.map((link) => {
                  const visibleChildren = (link.children ?? []).filter(
                    (child) => child.roles.length === 0 || child.roles.some((role) => roles.includes(role))
                  );

                  if (visibleChildren.length > 0) {
                    const groupActive = visibleChildren.some((child) => pathname === child.href);
                    return (
                      <Collapsible key={link.href} defaultOpen={groupActive} className="group/collapsible">
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton isActive={groupActive}>
                              <link.icon className="size-4" />
                              <span>{link.label}</span>
                              <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {visibleChildren.map((child) => (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton isActive={pathname === child.href} asChild>
                                    <Link href={child.href}>
                                      <span>{child.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }

                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton isActive={pathname.startsWith(link.href)} asChild>
                        <Link href={link.href}>
                          <link.icon className="size-4" />
                          <span>{link.label}</span>
                          {link.href === "/purchase-requests" &&
                          pendingPurchaseRequestCount > 0 &&
                          (roles.includes("ADMIN") || roles.includes("ACCOUNTANT")) ? (
                            <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                              {pendingPurchaseRequestCount}
                            </span>
                          ) : null}
                          {link.href === "/transactions" && pendingAdjustmentCount > 0 && roles.includes("ADMIN") ? (
                            <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                              {pendingAdjustmentCount}
                            </span>
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="space-y-2 p-3">
          <Separator />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={toggleTheme}
          >
            <Sun className="mr-2 hidden size-4 dark:inline" />
            <Moon className="mr-2 inline size-4 dark:hidden" />
            Đổi giao diện
          </Button>
          <p className="text-sm font-medium">
            {accountName}
            {roles.length > 0 ? ` • ${roles.map(mapRoleLabel).join(", ")}` : ""}
          </p>
          <Button
            variant="ghost"
            className="h-auto w-fit justify-start p-0 text-sm font-medium hover:bg-transparent"
            onClick={onLogout}
          >
            Đăng xuất
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <p className="text-sm text-muted-foreground">Hệ thống thu chi doanh nghiệp</p>
        </header>
        <div className="min-w-0 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
