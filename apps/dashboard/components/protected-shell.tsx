"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@hypercore/ui/components/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@hypercore/ui/components/sidebar";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const TITLES: Record<string, string> = {
  "/deployments": "Deployments",
  "/machines": "Machines",
  "/logs": "Logs",
  "/create": "Create",
  "/settings": "Settings",
};

export function ProtectedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = pathname.startsWith("/deployments/")
    ? "Deployment Details"
    : (Object.entries(TITLES).find(([href]) => pathname.startsWith(href))?.[1] ??
      "Console");

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <DashboardSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
