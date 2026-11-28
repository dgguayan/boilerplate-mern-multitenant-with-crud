import { useEffect } from "react"
import { Link } from "react-router-dom"
import { DateTime } from "luxon"
import { CalendarDays } from "lucide-react"

import { StatusBadge } from "@/components/calendar/ui"

/** The visitor's own time zone; public pages show times where the reader is. */
export const visitorZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

export const toDT = (value, allDay) =>
  allDay ? DateTime.fromISO(new Date(value).toISOString(), { zone: "utc" }) : DateTime.fromJSDate(new Date(value)).setZone(visitorZone())

/** "Tue, Dec 1 · 10:00 AM – 11:00 AM", or a date range for all-day and multi-day events. */
export function formatWhen(o) {
  const start = toDT(o.start, o.allDay)
  const end = toDT(o.end, o.allDay)
  if (o.allDay) {
    const last = end.minus({ days: 1 })
    return last > start ? `${start.toFormat("ccc, LLL d")} – ${last.toFormat("ccc, LLL d")} · All day` : `${start.toFormat("ccc, LLL d")} · All day`
  }
  const sameDay = start.hasSame(end, "day")
  return sameDay
    ? `${start.toFormat("ccc, LLL d · t")} – ${end.toFormat("t")}`
    : `${start.toFormat("ccc, LLL d · t")} – ${end.toFormat("ccc, LLL d · t")}`
}

export function formatPrice(price) {
  if (!price) return null
  if (!(price.amount > 0)) return "Free"
  return new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency || "USD" }).format(price.amount)
}

/** Cancelled / postponed, the same marker the app's calendar uses. Published shows nothing. */
export function StatusPill({ status }) {
  return ["cancelled", "postponed"].includes(status) ? <StatusBadge status={status} /> : null
}

export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}

/** Slim header for pages anyone can open: the workspace name and a way into the app. */
export function PublicHeader({ tenant, tenantName }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4">
        <Link to={`/p/${tenant}`} className="flex min-w-0 items-center gap-2 font-semibold">
          <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{tenantName ? `${tenantName} events` : "Events"}</span>
        </Link>
        <Link to="/login" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Member sign in
        </Link>
      </div>
    </header>
  )
}

export function PublicNotFound({ message = "This calendar is not public, or the link is wrong." }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-24 text-center">
      <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-semibold">Nothing to show here</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
