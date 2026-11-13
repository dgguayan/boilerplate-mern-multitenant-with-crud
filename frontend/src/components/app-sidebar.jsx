import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Activity, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays,
  ChevronsUpDown, FileText, FolderGit2, FolderKanban, Landmark,
  LayoutDashboard, LogOut, Settings, ShieldCheck, Users,
} from "lucide-react"

import { useAuth } from "@/hooks/useAuth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"

const mainGroups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Projects", url: "/projects", icon: FolderKanban },
      { title: "Documents", url: "/documents", icon: FileText },
      { title: "Calendar", url: "/calendar", icon: CalendarDays },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Organization",
    items: [
      { title: "Teams", url: "/teams", icon: Users },
      { title: "Clients", url: "/clients", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Members", url: "/members", icon: Users },
      { title: "Access Control", url: "/access-control", icon: ShieldCheck },
      { title: "Audit Trail", url: "/audit-trail", icon: Activity },
    ],
  },
]

const footerItems = [
  { title: "Resources", url: "/resources", icon: FolderGit2 },
  { title: "Help Center", url: "/help", icon: BookOpen },
]

function initials(name = "Administrator") {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

function AppLogo({ name }) {
  return (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Landmark className="size-4" />
      </div>
      <div className="ml-1 grid flex-1 text-left text-sm">
        <span className="mb-0.5 truncate leading-tight font-semibold">{name}</span>
      </div>
    </>
  )
}

function NavMain({ groups, pathname }) {
  return groups.map((group) => (
    <SidebarGroup key={group.label} className="px-2 py-0">
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={{ children: item.title }}>
              <Link to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  ))
}

function NavFooter({ items, pathname }) {
  return (
    <SidebarGroup className="mt-auto group-data-[collapsible=icon]:p-0">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.url}
                tooltip={{ children: item.title }}
                className="text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
              >
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function UserInfo({ user, showEmail = false }) {
  return (
    <>
      <Avatar className="size-8 overflow-hidden rounded-full">
        <AvatarFallback className="rounded-lg bg-neutral-200 text-xs text-black dark:bg-neutral-700 dark:text-white">
          {initials(user?.name)}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user?.name || "Administrator"}</span>
        {showEmail && (
          <span className="truncate text-xs text-muted-foreground">{user?.email || "account@example.com"}</span>
        )}
      </div>
    </>
  )
}

function NavUser({ user, onLogout }) {
  const { state, isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <SidebarMenuButton asChild size="lg" className="group text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent">
            <DropdownMenuTrigger>
              <UserInfo user={user} />
              <ChevronsUpDown className="ml-auto size-4" />
            </DropdownMenuTrigger>
          </SidebarMenuButton>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="end"
            sideOffset={8}
            side={isMobile ? "top" : state === "collapsed" ? "right" : "top"}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserInfo user={user} showEmail />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/settings/profile" className="block w-full" onClick={() => setOpenMobile(false)}>
                  <Settings className="mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar(props) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate("/login")
  }

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <AppLogo name={user?.tenantName || "Acme Corp"} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={mainGroups} pathname={pathname} />
      </SidebarContent>

      <SidebarFooter>
        <NavFooter items={footerItems} pathname={pathname} />
        <NavUser user={user} onLogout={handleLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
