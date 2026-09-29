"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@hypercore/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@hypercore/ui/components/sidebar";
import {
  Activity,
  Boxes,
  ChevronsUpDown,
  Copy,
  LogOut,
  Monitor,
  Package,
  ScrollText,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { shortId } from "../lib/activity";
import { Hashvatar } from "hashvatar/react";

export type AgentPage = "machine" | "logs" | "deployments" | "insights" | "settings";

export const AGENT_PAGE_TITLES: Record<AgentPage, string> = {
  machine: "Machine",
  logs: "Logs",
  deployments: "Deployments",
  insights: "Insights",
  settings: "Settings",
};

const NAV: { id: AgentPage; icon: typeof Monitor }[] = [
  { id: "machine", icon: Monitor },
  { id: "logs", icon: ScrollText },
  { id: "deployments", icon: Package },
  { id: "insights", icon: Activity },
  { id: "settings", icon: Settings2 },
];

export function AppSidebar({
  page,
  onNavigate,
  hostname,
  machineId,
  runningCount,
  deploymentCount,
  onDisconnect,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  page: AgentPage;
  onNavigate: (page: AgentPage) => void;
  hostname: string;
  machineId: string;
  runningCount: number;
  deploymentCount: number;
  onDisconnect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const badgeFor = (id: AgentPage) => {
    if (id === "logs" && runningCount > 0) return runningCount;
    if (id === "deployments" && deploymentCount > 0) return deploymentCount;
    return null;
  };

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              isActive={page === "machine"}
              tooltip="Machine"
              onClick={() => onNavigate("machine")}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Boxes className="size-4" />
              </div>
              <div className="grid flex-1 text-left">
                <span className="truncate font-semibold text-lg">HyperCore</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Node</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const count = badgeFor(item.id);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={page === item.id}
                      tooltip={AGENT_PAGE_TITLES[item.id]}
                      onClick={() => onNavigate(item.id)}
                    >
                      <item.icon />
                      <span>{AGENT_PAGE_TITLES[item.id]}</span>
                    </SidebarMenuButton>
                    {count !== null && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Hashvatar
                         className="cursor-pointer size-10"
                         hash={machineId}
                         mode="dither"
                         size={28}
                       />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{hostname || "Worker"}</span>
                    <span className="truncate font-mono text-xs">{shortId(machineId)}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
                <DropdownMenuLabel className="font-mono text-xs font-normal">
                  {shortId(machineId)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void copyId()}>
                  <Copy />
                  {copied ? "Copied!" : "Copy machine ID"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDisconnect}>
                  <LogOut />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
