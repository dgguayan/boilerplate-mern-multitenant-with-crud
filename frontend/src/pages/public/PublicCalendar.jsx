import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { CalendarPlus, ChevronDown, Copy, Download, ExternalLink, MapPin, Repeat, Search, SearchX, Ticket, Video } from "lucide-react"
import { toast } from "sonner"

import * as publicApi from "@/api/public.api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { feedUrl, googleSubscribeUrl, publicEventPath, webcalUrl } from "@/lib/public-urls"
import { PublicHeader, PublicNotFound, StatusPill, formatPrice, formatWhen, toDT, useDocumentTitle } from "./public-shared"

const WINDOW_DAYS = 180

function SubscribeMenu({ tenant }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl(tenant))
      toast.success("Subscribe link copied")
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus data-icon="inline-start" />
          Subscribe
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <a href={googleSubscribeUrl(tenant)} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={webcalUrl(tenant)}>
            <CalendarPlus />
            Apple / Outlook (webcal)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copy}>
          <Copy />
          Copy subscribe link
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={feedUrl(tenant)} download>
            <Download />
            Download .ics
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EventItem({ tenant, o }) {
  const start = toDT(o.start, o.allDay)
  const price = o.price ? formatPrice(o.price) : null
  return (
    <li>
      <Link
        to={publicEventPath(tenant, o.slug, o.isRecurring && !o.isOverride ? o.recurrenceKey : null)}
        className="flex gap-4 rounded-lg border bg-card p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-background py-1">
          <span className="text-[0.65rem] font-medium text-muted-foreground uppercase">{start.toFormat("LLL")}</span>
          <span className="text-lg leading-none font-semibold tabular-nums">{start.toFormat("d")}</span>
          <span className="text-[0.65rem] text-muted-foreground">{start.toFormat("ccc")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-medium", o.status === "cancelled" && "line-through decoration-muted-foreground")}>{o.title}</span>
            <StatusPill status={o.status} />
            {o.isRecurring && <Repeat className="size-3.5 text-muted-foreground" aria-label="Repeats" />}
          </div>
          <p className="text-sm text-muted-foreground">{formatWhen(o)}</p>
          {o.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{o.summary}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {o.location?.name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {o.location.name}
              </span>
            )}
            {o.virtualUrl && (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3.5" aria-hidden="true" />
                Online
              </span>
            )}
            {price && (
              <span className="inline-flex items-center gap-1">
                <Ticket className="size-3.5" aria-hidden="true" />
                {price}
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

/** /p/:tenant — a workspace's public events, upcoming first, grouped by month. */
export default function PublicCalendar() {
  const { tenant } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get("category") || ""
  const [query, setQuery] = useState(searchParams.get("q") || "")
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    const start = DateTime.now().startOf("day")
    publicApi
      .getPublicEvents(tenant, { start: start.toUTC().toISO(), end: start.plus({ days: WINDOW_DAYS }).toUTC().toISO(), category: category || undefined })
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(err?.response?.status === 404 ? "notFound" : "Couldn't load events. Please try again."))
    return () => {
      cancelled = true
    }
  }, [tenant, category])

  useDocumentTitle(data ? `${data.tenant.name} events` : "Events")

  const setParam = (key, value) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true }
    )

  const months = useMemo(() => {
    if (!data) return []
    const now = new Date()
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
    const list = data.occurrences.filter((o) => {
      if (new Date(o.end) < now) return false
      if (!terms.length) return true
      const text = `${o.title} ${o.summary} ${o.location?.name || ""} ${(o.tags || []).join(" ")}`.toLocaleLowerCase()
      return terms.every((t) => text.includes(t))
    })
    const groups = new Map()
    for (const o of list) {
      const key = toDT(o.start, o.allDay).toFormat("LLLL yyyy")
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(o)
    }
    return [...groups]
  }, [data, query])

  if (error === "notFound") {
    return (
      <div className="min-h-svh bg-background">
        <PublicHeader tenant={tenant} />
        <PublicNotFound />
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <PublicHeader tenant={tenant} tenantName={data?.tenant.name} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Upcoming events</h1>
            <p className="text-sm text-muted-foreground">Times are shown in your time zone.</p>
          </div>
          <SubscribeMenu tenant={tenant} />
        </div>

        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setParam("q", e.target.value)
              }}
              placeholder="Search events..."
              aria-label="Search events"
              className="pl-9"
            />
          </div>
          {data?.categories.length > 0 && (
            <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
              {[{ id: "", name: "All" }, ...data.categories].map((c) => (
                <Button key={c.id || "all"} variant={category === c.id ? "default" : "outline"} size="sm" aria-pressed={category === c.id} onClick={() => setParam("category", c.id)}>
                  {c.color && <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden="true" />}
                  {c.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {data && months.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">{query || category ? "No events match" : "No upcoming events"}</p>
            <p className="text-sm text-muted-foreground">{query || category ? "Try another search or category." : "Check back soon, or subscribe to hear about new ones."}</p>
          </div>
        )}
        {months.map(([month, list]) => (
          <section key={month} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{month}</h2>
            <ul className="space-y-2">
              {list.map((o) => (
                <EventItem key={o.id} tenant={tenant} o={o} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}
