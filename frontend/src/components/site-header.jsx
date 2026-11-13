import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"
  const label = isDark ? "Switch to light mode" : "Switch to dark mode"

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

export function SiteHeader() {
  const { pathname } = useLocation()
  const page = {
    "/dashboard": "Dashboard",
    "/projects": "Projects",
    "/documents": "Documents",
    "/calendar": "Calendar",
    "/reports": "Reports",
    "/teams": "Teams",
    "/clients": "Clients",
    "/members": "Members",
    "/access-control": "Access Control",
    "/audit-trail": "Audit Trail",
    "/resources": "Resources",
    "/help": "Help Center",
    "/settings/profile": "Profile settings",
    "/settings/security": "Security settings",
    "/settings/appearance": "Appearance settings",
  }[pathname] || "Dashboard"

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/50 px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
      <div className="flex w-full items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:inline-flex"><BreadcrumbLink href="/dashboard">Workspace</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem><BreadcrumbPage>{page}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
