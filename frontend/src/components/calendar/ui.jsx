import {
  Archive,
  Ban,
  Briefcase,
  Calendar,
  CalendarX2,
  CircleCheck,
  Clock,
  GraduationCap,
  HeartPulse,
  MapPin,
  Megaphone,
  Music,
  PartyPopper,
  PencilLine,
  Plane,
  Presentation,
  Star,
  Trophy,
  Users,
  Utensils,
  Video,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"

export const CATEGORY_ICONS = {
  calendar: Calendar,
  users: Users,
  presentation: Presentation,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  "party-popper": PartyPopper,
  "heart-pulse": HeartPulse,
  megaphone: Megaphone,
  video: Video,
  "map-pin": MapPin,
  trophy: Trophy,
  music: Music,
  utensils: Utensils,
  plane: Plane,
  wrench: Wrench,
  star: Star,
}

export const CATEGORY_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#0d9488", "#475569",
]

export const DEFAULT_EVENT_COLOR = "#64748b"

export function CategoryIcon({ category, className }) {
  const Icon = CATEGORY_ICONS[category?.icon] || Calendar
  return <Icon className={className} aria-hidden="true" />
}

export function eventColor(occurrence, categoriesById) {
  return occurrence.color || categoriesById.get(occurrence.categoryId)?.color || DEFAULT_EVENT_COLOR
}

// Every status has an icon and a label — never colour alone.
export const STATUS_META = {
  published: { label: "Published", icon: CircleCheck, tone: "text-emerald-700 dark:text-emerald-400" },
  draft: { label: "Draft", icon: PencilLine, tone: "text-muted-foreground" },
  postponed: { label: "Postponed", icon: Clock, tone: "text-amber-700 dark:text-amber-400" },
  cancelled: { label: "Cancelled", icon: Ban, tone: "text-red-700 dark:text-red-400" },
  archived: { label: "Archived", icon: Archive, tone: "text-muted-foreground" },
}

export function StatusBadge({ status, className, hidePublished = true }) {
  if (hidePublished && status === "published") return null
  const meta = STATUS_META[status] || STATUS_META.published
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.tone, className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/** Card styling tinted with the event colour; text keeps the theme's foreground for contrast. */
export function tintStyle(color) {
  return { "--ev": color }
}
export const tintClass =
  "border-l-[3px] border-(--ev) bg-[color-mix(in_oklch,var(--ev)_13%,var(--background))] text-foreground"

export function EmptyState({ icon: Icon = CalendarX2, title, description, children, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl border bg-background/60 shadow-xs">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}
