import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { ArrowUpRight, CalendarDays } from "lucide-react"

import * as publicApi from "@/api/public.api"
import { Skeleton } from "@/components/ui/skeleton"
import { publicCalendarUrl, publicEventUrl } from "@/lib/public-urls"
import { StatusPill, formatWhen, toDT } from "./public-shared"

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

/**
 * /embed/:tenant?limit=5&category=<id>&theme=auto|light|dark — a compact list of upcoming
 * public events, made to sit in an <iframe> on another website. Links open in a new tab.
 */
export default function EmbedWidget() {
  const { tenant } = useParams()
  const [searchParams] = useSearchParams()
  const limit = clamp(Number(searchParams.get("limit")) || 5, 1, 20)
  const category = searchParams.get("category") || undefined
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const start = DateTime.now()
    publicApi
      .getPublicEvents(tenant, { start: start.toUTC().toISO(), end: start.plus({ days: 365 }).toUTC().toISO(), category })
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(err?.response?.status === 404 ? "This calendar is not public." : "Events couldn't be loaded."))
    return () => {
      cancelled = true
    }
  }, [tenant, category])

  const upcoming = useMemo(() => (data ? data.occurrences.filter((o) => new Date(o.end) > new Date()).slice(0, limit) : []), [data, limit])

  return (
    // Colours come from ?theme= (see embedTheme in App.jsx), not the visitor's app setting.
      <div className="min-h-svh bg-background p-3 text-foreground">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {data ? `Upcoming at ${data.tenant.name}` : "Upcoming events"}
          </h1>
          <a href={publicCalendarUrl(tenant)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            See all
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        </div>

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: Math.min(limit, 4) }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {data && upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events.</p>}
        <ul className="space-y-2">
          {upcoming.map((o) => {
            const start = toDT(o.start, o.allDay)
            return (
              <li key={o.id}>
                <a
                  href={publicEventUrl(tenant, o.slug, o.isRecurring && !o.isOverride ? o.recurrenceKey : null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 rounded-lg border bg-card p-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded-md border bg-background">
                    <span className="text-[0.6rem] font-medium text-muted-foreground uppercase">{start.toFormat("LLL")}</span>
                    <span className="text-base leading-none font-semibold tabular-nums">{start.toFormat("d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{o.title}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatWhen(o)}
                      {o.location?.name ? ` · ${o.location.name}` : o.virtualUrl ? " · Online" : ""}
                    </p>
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
  )
}
