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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@hypercore/ui/components/sidebar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@hypercore/ui/components/avatar";
import {
  Boxes,
  ChevronsUpDown,
  FileCode2,
  LogOut,
  Monitor,
  Package,
  ScrollText,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/deployments", label: "Deployments", icon: Package },
  { href: "/machines", label: "Machines", icon: Monitor },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/create", label: "Create", icon: FileCode2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardSidebar(
  props: React.ComponentProps<typeof Sidebar>,
) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = authClient.useSession();
  const user = data?.user;

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/sign-in");
  };

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild isActive={pathname === "/"}>
              <Link href="/deployments">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Boxes className="size-4" />
                </span>
                <span className="grid flex-1 text-left">
                  <span className="truncate text-lg font-semibold">
                    HyperCore
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.label}
                  >
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
                  <Avatar className="size-8">
                    <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
                    <AvatarFallback>
                      {initials(user?.name, user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left text-sm leading-normal">
                    <span className="truncate font-medium">
                      {user?.name || "Account"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email || ""}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate font-medium">
                    {user?.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void signOut()}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
