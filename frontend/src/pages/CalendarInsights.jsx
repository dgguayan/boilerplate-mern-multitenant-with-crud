import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { ArrowLeft, Eye, Table2 } from "lucide-react"

import * as calendarApi from "@/api/calendar.api"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/admin/shared"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const RANGES = [
  { value: "last30", label: "Last 30 days", get: (now) => [now.minus({ days: 30 }), now] },
  { value: "last90", label: "Last 90 days", get: (now) => [now.minus({ days: 90 }), now] },
  { value: "next30", label: "Next 30 days", get: (now) => [now, now.plus({ days: 30 })] },
  { value: "next90", label: "Next 90 days", get: (now) => [now, now.plus({ days: 90 })] },
  { value: "year", label: "This year so far", get: (now) => [now.startOf("year"), now] },
]

const integer = new Intl.NumberFormat()
const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 })
const compact = (n) => (n >= 10_000 ? new Intl.NumberFormat(undefined, { notation: "compact" }).format(n) : integer.format(n))

/* ── Pieces ───────────────────────────────────────────── */

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A chart with a title, and a table view that shows the same numbers. */
function ChartCard({ title, description, table, children, className }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card p-4", className)} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {table && (
          <Button variant="ghost" size="sm" className="-mt-1 shrink-0 text-muted-foreground" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            <Table2 data-icon="inline-start" />
            {showTable ? "Chart" : "Table"}
          </Button>
        )}
      </div>
      {showTable && table ? (
        <Table>
          <TableHeader>
            <TableRow>
              {table.columns.map((c, i) => (
                <TableHead key={c} className={cn(i > 0 && "text-right")}>
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row) => (
              <TableRow key={row[0]}>
                {row.map((cell, i) => (
                  <TableCell key={i} className={cn(i > 0 && "text-right tabular-nums")}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        children
      )}
    </section>
  )
}

/**
 * Horizontal bars: one hue (the chart token), thin, rounded at the data end, value at the tip.
 * Each bar is focusable and has a tooltip; names come from labels, never from colour.
 */
function BarList({ items, format = integer.format, max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this range.</p>
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const width = top ? (item.value / top) * 100 : 0
        const text = `${item.label}: ${format(item.value)}${item.hint ? ` (${item.hint})` : ""}`
        return (
          <li key={item.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 text-sm" title={text}>
            <span className="truncate text-muted-foreground">{item.label}</span>
            <div className="flex items-center gap-2" tabIndex={0} aria-label={text}>
              <div className="relative h-3 flex-1">
                <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(width, item.value ? 1.5 : 0)}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums">{format(item.value)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Columns over time with a recessive baseline; the peak and last week are labelled. */
function Columns({ items }) {
  const top = Math.max(1, ...items.map((i) => i.value))
  const peak = items.reduce((best, i, idx) => (i.value > items[best].value ? idx : best), 0)
  return (
    <div>
      <div className="flex h-40 items-end gap-[2px] border-b" role="img" aria-label={`Events per week, peak ${items[peak]?.value ?? 0} in the week of ${items[peak]?.label ?? ""}`}>
        {items.map((item, idx) => (
          <div key={item.label} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`Week of ${item.label}: ${item.value}`} tabIndex={0}>
            {(idx === peak || idx === items.length - 1) && item.value > 0 && (
              <span className="mb-1 text-[0.7rem] tabular-nums text-muted-foreground">{item.value}</span>
            )}
            <div className="w-full max-w-6 rounded-t-[4px] bg-chart-1 group-hover:opacity-80 group-focus:opacity-80" style={{ height: `${(item.value / top) * 85}%`, minHeight: item.value ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] text-muted-foreground">
        <span>{items[0]?.label}</span>
        <span>{items[items.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────── */

/** /calendar/insights — attendance, busiest times, categories and room use, for organizers. */
export default function CalendarInsights() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rangeValue = RANGES.some((r) => r.value === searchParams.get("range")) ? searchParams.get("range") : "last90"
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    const now = DateTime.now().setZone(ZONE)
    const [start, end] = RANGES.find((r) => r.value === rangeValue).get(now)
    calendarApi
      .getAnalytics({ start: start.toUTC().toISO(), end: end.toUTC().toISO(), tz: ZONE })
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(calendarApi.errorMessage(err, "Couldn't load insights.")))
    return () => {
      cancelled = true
    }
  }, [rangeValue])

  const weeks = useMemo(
    () => (data?.perWeek || []).map((w) => ({ label: DateTime.fromISO(w.week).toFormat("LLL d"), value: w.count })),
    [data]
  )

  const t = data?.totals
  const responded = data ? data.replies.going + data.replies.maybe + data.replies.declined + data.replies.waitlist : 0

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="Calendar insights" description="How events are attended, when they happen, and how rooms and equipment are used.">
        <Button variant="outline" asChild>
          <Link to="/calendar">
            <ArrowLeft data-icon="inline-start" />
            Back to calendar
          </Link>
        </Button>
      </PageHeader>

      {/* Filters sit in one row above the charts. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={rangeValue} onValueChange={(value) => setSearchParams({ range: value }, { replace: true })}>
          <SelectTrigger size="sm" className="min-w-44" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Times in {ZONE.replace(/_/g, " ")} · only events you can see</span>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!data && !error && (
        <div className="grid gap-3 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-24 lg:col-span-2" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {data.truncated && <p className="text-xs text-muted-foreground">This range has more events than can be counted at once; numbers cover the first 5,000.</p>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Events" value={compact(t.events)} hint={t.cancelled ? `${t.cancelled} cancelled` : "None cancelled"} />
            <StatTile label="People going" value={compact(t.going)} hint={`${compact(responded)} replies in all`} />
            <StatTile label="Average fill" value={t.averageFill == null ? "—" : percent.format(t.averageFill)} hint={t.eventsWithCapacity ? `of ${t.eventsWithCapacity} events with a capacity` : "No events with a capacity"} />
            <StatTile label="Full events" value={compact(t.fullEvents)} hint={t.waitlist ? `${t.waitlist} people waiting` : "Nobody waiting"} />
            <StatTile label="Postponed" value={compact(t.postponed)} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard
              title="Events per week"
              description="Published and postponed events, by the week they start"
              className="lg:col-span-2"
              table={{ columns: ["Week of", "Events"], rows: weeks.map((w) => [w.label, w.value]) }}
            >
              <Columns items={weeks} />
            </ChartCard>

            <ChartCard
              title="Busiest weekdays"
              table={{ columns: ["Weekday", "Events"], rows: data.perWeekday.map((d) => [WEEKDAYS[d.weekday - 1], d.count]) }}
            >
              <BarList items={data.perWeekday.map((d) => ({ label: WEEKDAYS[d.weekday - 1], value: d.count }))} />
            </ChartCard>

            <ChartCard title="Events by category" table={{ columns: ["Category", "Events"], rows: data.perCategory.map((c) => [c.name, c.count]) }}>
              <BarList items={data.perCategory.map((c) => ({ label: c.name, value: c.count }))} />
            </ChartCard>

            <ChartCard
              title="Room and equipment use"
              description="Booked share of working hours (Mon–Fri, 9:00–18:00)"
              table={{
                columns: ["Resource", "Booked hours", "Available hours", "Use"],
                rows: data.resources.map((r) => [r.name, r.bookedHours, r.availableHours, percent.format(r.utilization)]),
              }}
            >
              <BarList
                max={1}
                format={percent.format}
                items={data.resources.map((r) => ({ label: r.name, value: r.utilization, hint: `${r.bookedHours} of ${r.availableHours} h` }))}
              />
            </ChartCard>

            <ChartCard title="Replies" description="Answers to events in this range">
              <BarList
                items={[
                  { label: "Going", value: data.replies.going },
                  { label: "Maybe", value: data.replies.maybe },
                  { label: "Waitlist", value: data.replies.waitlist },
                  { label: "Can't go", value: data.replies.declined },
                ]}
              />
            </ChartCard>

            <section className="rounded-xl border bg-card p-4" aria-labelledby="most-replied">
              <h2 id="most-replied" className="mb-2 text-sm font-semibold">
                Most replied
              </h2>
              {data.mostReplied.length ? (
                <ol className="divide-y text-sm">
                  {data.mostReplied.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <Link
                        to={`/calendar?event=${e.eventId}${e.recurrenceKey ? `&occurrence=${e.recurrenceKey}&date=${e.recurrenceKey}` : ""}`}
                        className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                      >
                        {e.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {DateTime.fromISO(e.start).setZone(e.allDay ? "utc" : ZONE).toFormat("LLL d")}
                      </span>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums">
                        {e.going} going{e.capacity ? ` / ${e.capacity}` : ""}
                        {e.waitlist ? ` +${e.waitlist}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No replies in this range.</p>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4" aria-labelledby="most-viewed">
              <h2 id="most-viewed" className="mb-2 text-sm font-semibold">
                Most viewed
              </h2>
              {data.mostViewed.length ? (
                <ol className="divide-y text-sm">
                  {data.mostViewed.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <Link to={`/calendar?event=${e.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
                        {e.title}
                      </Link>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Eye className="size-3.5" aria-hidden="true" />
                        {integer.format(e.views)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No views yet.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
