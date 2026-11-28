import { useEffect, useState } from "react"
import { DateTime } from "luxon"
import { ChevronLeft, ChevronRight, CircleCheck, CircleSlash, Crown, ShieldCheck, User, UserCog } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50 dark:bg-input/30"

export const ROLE_META = {
  superadmin: { label: "Super admin", icon: Crown, rank: 4 },
  admin: { label: "Admin", icon: ShieldCheck, rank: 3 },
  manager: { label: "Manager", icon: UserCog, rank: 2 },
  user: { label: "User", icon: User, rank: 1 },
}
export const ROLE_ORDER = ["superadmin", "admin", "manager", "user"]

export function RoleBadge({ role, className }) {
  const meta = ROLE_META[role] || ROLE_META.user
  return (
    <Badge variant={meta.rank >= 3 ? "default" : "secondary"} className={cn("gap-1", className)}>
      <meta.icon className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

/** Active / inactive with an icon, never colour alone. */
export function ActiveBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <CircleSlash className="size-3.5" aria-hidden="true" />
      Inactive
    </span>
  )
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function initials(name = "") {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"
}

/** "3 hours ago" with the exact time available as a tooltip. */
export function RelativeTime({ value, fallback = "Never" }) {
  if (!value) return <span className="text-muted-foreground">{fallback}</span>
  const dt = DateTime.fromISO(value)
  return (
    <time dateTime={dt.toISO()} title={dt.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)}>
      {dt.toRelative()}
    </time>
  )
}

export function Pagination({ page, pages, total, label = "results", onPage }) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
      <span aria-live="polite">
        {total} {label} · page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}

/** Debounced value for search boxes. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
