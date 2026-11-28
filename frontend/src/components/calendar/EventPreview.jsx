import { createPortal } from "react-dom"
import { MapPin, Repeat, Users, Video } from "lucide-react"

import { useCalendar } from "./CalendarContext"
import { CategoryIcon, StatusBadge, eventColor } from "./ui"
import { formatEventTime, relativeLabel } from "./lib/dates"

const WIDTH = 288

/** Floating summary shown while an event is hovered or focused. */
export function EventPreview({ occurrence: o, anchorRect }) {
  const { categoriesById, prefs } = useCalendar()
  const category = categoriesById.get(o.categoryId)
  const color = eventColor(o, categoriesById)

  const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - WIDTH - 8)
  const below = anchorRect.bottom + 8 + 180 < window.innerHeight
  const style = below
    ? { left, top: anchorRect.bottom + 6 }
    : { left, bottom: window.innerHeight - anchorRect.top + 6 }

  return createPortal(
    <div
      role="tooltip"
      style={{ ...style, width: WIDTH }}
      className="pointer-events-none fixed z-[60] rounded-xl bg-popover/95 p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95 supports-backdrop-filter:bg-popover/80 supports-backdrop-filter:backdrop-blur-md motion-reduce:animate-none"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium leading-snug">{o.title}</p>
          <p className="text-xs text-muted-foreground">{formatEventTime(o, prefs.timeZone, { hour12: prefs.hour12, withDate: true })}</p>
        </div>
      </div>
      {o.summary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{o.summary}</p>}
      <ul className="mt-2 space-y-1 text-xs">
        {category && (
          <li className="flex items-center gap-1.5">
            <CategoryIcon category={category} className="size-3.5 text-muted-foreground" />
            {category.name}
          </li>
        )}
        {o.location?.name && (
          <li className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{o.location.name}</span>
          </li>
        )}
        {o.virtualUrl && (
          <li className="flex items-center gap-1.5">
            <Video className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Online
          </li>
        )}
        {o.capacity != null && (
          <li className="flex items-center gap-1.5">
            <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Capacity {o.capacity}
          </li>
        )}
        {o.isRecurring && (
          <li className="flex items-center gap-1.5">
            <Repeat className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Recurring event
          </li>
        )}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{relativeLabel(o)}</span>
        <StatusBadge status={o.status} />
      </div>
    </div>,
    document.body
  )
}
