import { useMemo, useState } from "react"
import { DateTime } from "luxon"
import { CalendarPlus, MapPin, Repeat, SearchX, Ticket, Users, Video } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCalendar } from "../CalendarContext"
import { CategoryIcon, EmptyState, StatusBadge, eventColor } from "../ui"
import { formatEventTime, fromJS, relativeLabel, timeState } from "../lib/dates"
import { SORTS, attendanceMode, registrationOpen, sortOccurrences } from "../lib/filters"

const PAGE = 30

/** One event as a compact card. Reused by the list, upcoming and agenda-style widgets. */
export function EventRow({ occurrence: o, showDate = true, compact = false }) {
  const { categoriesById, prefs, openDetails } = useCalendar()
  const category = categoriesById.get(o.categoryId)
  const color = eventColor(o, categoriesById)
  const state = timeState(o)
  const start = o.allDay ? fromJS(o.start, "utc") : fromJS(o.start, prefs.timeZone)
  const mode = attendanceMode(o)
  const price = o.price?.amount > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency: o.price.currency || "USD" }).format(o.price.amount) : null

  return (
    <li>
      <button
        type="button"
        onClick={() => openDetails(o)}
        className={cn(
          "group flex w-full items-stretch gap-3 rounded-xl border bg-card/80 p-3 text-left shadow-xs outline-none transition-all",
          "hover:-translate-y-px hover:border-foreground/15 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          state === "past" && "opacity-65 hover:opacity-100"
        )}
      >
        {showDate && (
          <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-background/70 py-1.5" aria-hidden="true">
            <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{start.toFormat("LLL")}</span>
            <span className="text-lg leading-none font-semibold tabular-nums">{start.toFormat("d")}</span>
            <span className="text-[0.65rem] text-muted-foreground">{start.toFormat("ccc")}</span>
          </div>
        )}
        <div className="w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn("font-medium leading-snug", o.status === "cancelled" && "line-through decoration-muted-foreground")}>{o.title}</span>
            {state === "ongoing" && (
              <Badge className="gap-1 bg-emerald-600 text-white">
                <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden="true" />
                Live now
              </Badge>
            )}
            <StatusBadge status={o.status} />
            {o.isRecurring && <Repeat className="size-3.5 text-muted-foreground" aria-label="Recurring" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatEventTime(o, prefs.timeZone, { hour12: prefs.hour12, withDate: !showDate })}
            <span aria-hidden="true"> · </span>
            {relativeLabel(o)}
          </p>
          {!compact && o.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{o.summary}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {category && (
              <span className="inline-flex items-center gap-1">
                <CategoryIcon category={category} className="size-3.5" />
                {category.name}
              </span>
            )}
            {o.location?.name && (
              <span className="inline-flex max-w-48 items-center gap-1 truncate">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {o.location.name}
              </span>
            )}
            {(mode === "online" || mode === "hybrid") && (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3.5" aria-hidden="true" />
                {mode === "hybrid" ? "Hybrid" : "Online"}
              </span>
            )}
            {(price || o.price) && (
              <span className="inline-flex items-center gap-1">
                <Ticket className="size-3.5" aria-hidden="true" />
                {price || "Free"}
              </span>
            )}
            {o.capacity != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden="true" />
                {o.capacity} places
              </span>
            )}
            {o.registrationDeadline && state === "upcoming" && (
              <span>{registrationOpen(o) ? `Register by ${fromJS(o.registrationDeadline, prefs.timeZone).toFormat("LLL d")}` : "Registration closed"}</span>
            )}
            {!compact && o.tags?.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
          </div>
        </div>
      </button>
    </li>
  )
}

function ListEmpty({ hasFilters, onClearFilters }) {
  const { permissions, openCreate } = useCalendar()
  return hasFilters ? (
    <EmptyState icon={SearchX} title="No events match your filters" description="Try other words or remove a filter.">
      <Button variant="outline" onClick={onClearFilters}>
        Clear all filters
      </Button>
    </EmptyState>
  ) : (
    <EmptyState title="No events in this period" description="Events you add will appear here.">
      {permissions.canCreate && (
        <Button onClick={() => openCreate()}>
          <CalendarPlus data-icon="inline-start" />
          New event
        </Button>
      )}
    </EmptyState>
  )
}

/** Searchable, sortable list of every event in the range. */
export function EventListView({ occurrences, sort, onSortChange, hasFilters, onClearFilters }) {
  const [limit, setLimit] = useState(PAGE)
  const sorted = useMemo(() => sortOccurrences(occurrences, sort), [occurrences, sort])
  if (!occurrences.length) return <ListEmpty hasFilters={hasFilters} onClearFilters={onClearFilters} />

  return (
    <div className="mx-auto w-full max-w-3xl p-1">
      <div className="mb-3 flex items-center justify-end gap-2">
        <label htmlFor="cal-sort" className="text-xs text-muted-foreground">
          Sort by
        </label>
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger id="cal-sort" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="space-y-2" aria-label="Events">
        {sorted.slice(0, limit).map((o) => (
          <EventRow key={o.id} occurrence={o} />
        ))}
      </ul>
      {sorted.length > limit && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({sorted.length - limit} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}

/** Events from now on, grouped by when they happen. */
export function UpcomingView({ occurrences, hasFilters, onClearFilters }) {
  const { prefs } = useCalendar()
  const [limit, setLimit] = useState(PAGE)
  const groups = useMemo(() => {
    const now = DateTime.now().setZone(prefs.timeZone)
    const today = now.startOf("day")
    const upcoming = occurrences.filter((o) => new Date(o.end) > now.toJSDate()).sort((a, b) => new Date(a.start) - new Date(b.start))
    const label = (o) => {
      const start = o.allDay ? fromJS(o.start, "utc").setZone(prefs.timeZone, { keepLocalTime: true }) : fromJS(o.start, prefs.timeZone)
      if (start < today.plus({ days: 1 })) return "Today"
      if (start < today.plus({ days: 2 })) return "Tomorrow"
      if (start < today.plus({ days: 7 })) return "This week"
      if (start < today.plus({ days: 14 })) return "Next week"
      if (start < today.plus({ months: 1 })) return "Later this month"
      return "Later"
    }
    const map = new Map()
    for (const o of upcoming.slice(0, limit)) {
      const key = label(o)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(o)
    }
    return { list: [...map.entries()], total: upcoming.length }
  }, [occurrences, prefs.timeZone, limit])

  if (!groups.total) return <ListEmpty hasFilters={hasFilters} onClearFilters={onClearFilters} />

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-1">
      {groups.list.map(([label, items]) => (
        <section key={label} aria-labelledby={`up-${label}`}>
          <h3 id={`up-${label}`} className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label} <span className="font-normal">· {items.length}</span>
          </h3>
          <ul className="space-y-2">
            {items.map((o) => (
              <EventRow key={o.id} occurrence={o} />
            ))}
          </ul>
        </section>
      ))}
      {groups.total > limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({groups.total - limit} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}
