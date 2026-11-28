import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { Boxes, Repeat, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { useCalendar } from "../CalendarContext"
import { EventPreview } from "../EventPreview"
import { CategoryIcon, EmptyState, STATUS_META, eventColor, tintClass, tintStyle } from "../ui"
import { occurrenceSpan, startOfWeek, timeState } from "../lib/dates"

const LANE_HEIGHT = 34
const ROW_PADDING = 6
const LABEL_WIDTH = 168

/**
 * Horizontal planning views.
 *   timeline  — one row per category across a week
 *   resources — one row per room / equipment / person across a day (with conflict marks)
 * Bars can be dragged (move, change resource) and resized; Alt+Arrow keys do the same.
 */
export default function LaneView({ mode, date, occurrences }) {
  const { prefs, categories, categoriesById, resources, permissions, openDetails, openCreate, moveOccurrence } = useCalendar()
  const isResources = mode === "resources"
  const zone = prefs.timeZone
  const rangeStart = isResources ? date.startOf("day") : startOfWeek(date, prefs.firstDay)
  const rangeEnd = isResources ? rangeStart.plus({ days: 1 }) : rangeStart.plus({ weeks: 1 })
  const totalMinutes = rangeEnd.diff(rangeStart, "minutes").minutes // 23–25 h on DST days
  const pxPerMinute = isResources ? 120 / 60 : 168 / 1440 // 120px per hour keeps 30-minute bookings readable
  const width = Math.round(totalMinutes * pxPerMinute)
  const snap = isResources ? 15 : 30
  const scrollRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [drag, setDrag] = useState(null)

  const rows = useMemo(() => {
    if (isResources) return resources.map((r) => ({ id: r._id, name: r.name, meta: r.capacity ? `${r.type} · ${r.capacity}` : r.type, color: r.color }))
    const used = new Set(occurrences.map((o) => o.categoryId || "none"))
    const list = categories.map((c) => ({ id: c._id, name: c.name, category: c, color: c.color }))
    if (used.has("none")) list.push({ id: "none", name: "Uncategorised" })
    return list
  }, [isResources, resources, categories, occurrences])

  // Place each row's bars in non-overlapping lanes and flag resource double-bookings.
  const layout = useMemo(() => {
    return rows.map((row) => {
      const items = occurrences
        .filter((o) => (isResources ? o.resourceIds?.includes(row.id) : (o.categoryId || "none") === row.id))
        .map((o) => {
          const span = occurrenceSpan(o, zone)
          const s = span.start < rangeStart ? rangeStart : span.start
          const e = span.end > rangeEnd ? rangeEnd : span.end
          return { o, left: s.diff(rangeStart, "minutes").minutes * pxPerMinute, minutes: Math.max(e.diff(s, "minutes").minutes, 0), s: span.start, e: span.end }
        })
        .sort((a, b) => a.s - b.s)
      const laneEnds = []
      for (const item of items) {
        let lane = laneEnds.findIndex((end) => end <= item.s)
        if (lane === -1) lane = laneEnds.length
        laneEnds[lane] = item.e
        item.lane = lane
      }
      if (isResources) {
        const active = items.filter((i) => !["cancelled", "draft"].includes(i.o.status))
        for (const a of active) {
          a.conflict = active.some((b) => b !== a && b.s < a.e && a.s < b.e)
        }
      }
      return { row, items, lanes: Math.max(1, laneEnds.length) }
    })
  }, [rows, occurrences, isResources, zone, rangeStart, rangeEnd, pxPerMinute])

  // Start the resource view at business hours.
  useEffect(() => {
    if (!isResources || !scrollRef.current) return
    const hour = Math.max(0, parseInt(prefs.businessHours.start, 10) - 1)
    scrollRef.current.scrollLeft = hour * 60 * pxPerMinute
  }, [isResources, rangeStart.toISODate(), prefs.businessHours.start, pxPerMinute])

  const columns = useMemo(() => {
    const list = []
    if (isResources) {
      for (let t = rangeStart; t < rangeEnd; t = t.plus({ hours: 1 })) list.push({ key: t.toISO(), label: t.toFormat(prefs.hour12 ? "h a" : "HH:mm"), left: t.diff(rangeStart, "minutes").minutes * pxPerMinute, at: t })
    } else {
      for (let d = rangeStart; d < rangeEnd; d = d.plus({ days: 1 })) list.push({ key: d.toISODate(), label: d.toFormat("ccc d"), left: d.diff(rangeStart, "minutes").minutes * pxPerMinute, at: d })
    }
    return list
  }, [isResources, rangeStart, rangeEnd, pxPerMinute, prefs.hour12])

  const now = DateTime.now().setZone(zone)
  const nowLeft = now >= rangeStart && now < rangeEnd ? now.diff(rangeStart, "minutes").minutes * pxPerMinute : null
  const today = now.startOf("day")
  const [bhStart, bhEnd] = [prefs.businessHours.start, prefs.businessHours.end].map((t) => {
    const [h, m] = t.split(":").map(Number)
    return (h * 60 + m) * pxPerMinute
  })

  const commit = (o, { deltaStart, deltaEnd, toRow, fromRow }) => {
    const start = new Date(new Date(o.start).getTime() + deltaStart * 60_000)
    const end = new Date(new Date(o.end).getTime() + deltaEnd * 60_000)
    if (end <= start) return
    const patch = { start, end }
    if (o.allDay) {
      // Keep all-day events on whole days.
      patch.start = DateTime.fromJSDate(start, { zone: "utc" }).startOf("day").toISODate()
      patch.end = DateTime.fromJSDate(end, { zone: "utc" }).startOf("day").toISODate()
      if (patch.end <= patch.start) patch.end = DateTime.fromISO(patch.start).plus({ days: 1 }).toISODate()
    }
    if (isResources && toRow && toRow !== fromRow) {
      patch.resourceIds = [...new Set(o.resourceIds.map((r) => (r === fromRow ? toRow : r)))]
    }
    moveOccurrence(o, patch, deltaStart !== deltaEnd ? "Event duration changed" : patch.resourceIds ? "Event moved to another resource" : "Event rescheduled")
  }

  const onPointerDown = (event, item, rowId, kind) => {
    if (!item.o.canEdit || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setPreview(null)
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    const state = { item, rowId, kind, dx: 0, dy: 0 }
    const onMove = (e) => {
      state.dx = e.clientX - startX
      state.dy = isResources && kind === "move" ? e.clientY - startY : 0
      if (!moved && Math.hypot(state.dx, state.dy) > 4) moved = true
      if (moved) setDrag({ ...state })
    }
    const onUp = (e) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      setDrag(null)
      if (!moved) {
        if (kind === "move") openDetails(item.o)
        return
      }
      const minutes = Math.round(state.dx / pxPerMinute / snap) * snap
      const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.dataset?.rowId)?.dataset.rowId
      if (kind === "resize") commit(item.o, { deltaStart: 0, deltaEnd: minutes })
      else if (minutes || (target && target !== rowId)) commit(item.o, { deltaStart: minutes, deltaEnd: minutes, toRow: target, fromRow: rowId })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const onBarKeyDown = (event, item, rowId) => {
    if (!event.altKey || !item.o.canEdit) return
    const step = isResources ? snap : 24 * 60
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (dir) {
      event.preventDefault()
      if (event.shiftKey) commit(item.o, { deltaStart: 0, deltaEnd: dir * (isResources ? snap : 60) })
      else commit(item.o, { deltaStart: dir * step, deltaEnd: dir * step })
    }
    if (isResources && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      const index = rows.findIndex((r) => r.id === rowId)
      const next = rows[index + (event.key === "ArrowUp" ? -1 : 1)]
      if (next) commit(item.o, { deltaStart: 0, deltaEnd: 0, toRow: next.id, fromRow: rowId })
    }
  }

  const onRowClick = (event, row) => {
    if (!permissions.canCreate || event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const minutes = Math.floor((event.clientX - rect.left) / pxPerMinute / 30) * 30
    const start = rangeStart.plus({ minutes })
    openCreate({
      start: start.toISO(),
      end: start.plus({ hours: 1 }).toISO(),
      allDay: false,
      ...(isResources ? { resourceIds: [row.id] } : row.id !== "none" ? { categoryId: row.id } : {}),
    })
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={Boxes}
        title={isResources ? "No resources yet" : "No categories yet"}
        description={
          isResources
            ? "Administrators can add rooms, equipment and people under Manage → Resources."
            : "Administrators can add categories under Manage → Categories."
        }
      />
    )
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-xl border bg-card/60">
      <div ref={scrollRef} className="h-full overflow-auto overscroll-contain">
        <div style={{ width: width + LABEL_WIDTH }} className="relative">
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b bg-background/85 backdrop-blur-md">
            <div style={{ width: LABEL_WIDTH }} className="sticky left-0 z-10 shrink-0 border-r bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
              {isResources ? "Resource" : "Category"}
            </div>
            <div className="relative h-9" style={{ width }}>
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "absolute top-0 flex h-full items-center border-l px-2 text-xs whitespace-nowrap text-muted-foreground",
                    !isResources && c.at.hasSame(today, "day") && "font-semibold text-primary"
                  )}
                  style={{ left: c.left }}
                  aria-current={!isResources && c.at.hasSame(today, "day") ? "date" : undefined}
                >
                  {c.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div role="list" aria-label={isResources ? "Resources" : "Categories"}>
            {layout.map(({ row, items, lanes }) => (
              <div key={row.id} role="listitem" className="flex border-b last:border-b-0">
                <div style={{ width: LABEL_WIDTH }} className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3 py-2">
                  {row.category ? (
                    <CategoryIcon category={row.category} className="size-4 shrink-0" />
                  ) : (
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.color || "var(--muted-foreground)" }} aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    {row.meta && <p className="truncate text-xs text-muted-foreground capitalize">{row.meta}</p>}
                  </div>
                </div>
                <div
                  data-row-id={row.id}
                  className={cn("relative", permissions.canCreate && "cursor-cell")}
                  style={{ width, height: lanes * LANE_HEIGHT + ROW_PADDING * 2 }}
                  onClick={(e) => onRowClick(e, row)}
                  aria-label={`${row.name}: ${items.length} event${items.length === 1 ? "" : "s"}`}
                >
                  {isResources && (
                    <div className="pointer-events-none absolute inset-y-0 bg-primary/3" style={{ left: bhStart, width: bhEnd - bhStart }} aria-hidden="true" />
                  )}
                  {columns.map((c) => (
                    <div key={c.key} className="pointer-events-none absolute inset-y-0 border-l border-border/60" style={{ left: c.left }} aria-hidden="true" />
                  ))}
                  {nowLeft != null && <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-destructive/80" style={{ left: nowLeft }} aria-hidden="true" />}
                  {items.map((item) => {
                    const { o } = item
                    const dragging = drag?.item === item && drag.rowId === row.id
                    const barWidth = Math.max(22, item.minutes * pxPerMinute + (dragging && drag.kind === "resize" ? drag.dx : 0))
                    const status = o.status !== "published" ? STATUS_META[o.status] : null
                    const color = eventColor(o, categoriesById)
                    const state = timeState(o)
                    return (
                      <button
                        key={`${o.id}-${row.id}`}
                        type="button"
                        className={cn(
                          "group absolute flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs shadow-xs outline-none transition-shadow",
                          tintClass,
                          "hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50",
                          o.canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          state === "past" && "opacity-60",
                          state === "ongoing" && "ring-2 ring-primary/50",
                          o.status === "draft" && "border-dashed",
                          item.conflict && "outline-2 outline-offset-0 outline-destructive",
                          dragging && "z-30 opacity-90 shadow-lg"
                        )}
                        style={{
                          ...tintStyle(color),
                          left: item.left,
                          top: ROW_PADDING + item.lane * LANE_HEIGHT,
                          height: LANE_HEIGHT - 4,
                          width: barWidth,
                          transform: dragging && drag.kind === "move" ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                          touchAction: o.canEdit ? "none" : undefined,
                        }}
                        aria-label={`${o.title}, ${item.s.toFormat(o.allDay ? "ccc LLL d" : "ccc h:mm a")}${item.conflict ? ", conflicts with another booking" : ""}${o.canEdit ? ". Alt plus arrow keys to move, Alt Shift to resize" : ""}`}
                        onPointerDown={(e) => onPointerDown(e, item, row.id, "move")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            openDetails(o)
                          } else onBarKeyDown(e, item, row.id)
                        }}
                        onMouseEnter={(e) => !drag && setPreview({ occurrence: o, rect: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setPreview(null)}
                        onFocus={(e) => setPreview({ occurrence: o, rect: e.currentTarget.getBoundingClientRect() })}
                        onBlur={() => setPreview(null)}
                      >
                        {item.conflict && <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />}
                        <span className={cn("truncate font-medium", o.status === "cancelled" && "line-through")}>{o.title}</span>
                        {o.isRecurring && <Repeat className="size-3 shrink-0 opacity-60" aria-hidden="true" />}
                        {status && <span className="shrink-0 text-[0.6rem] font-semibold uppercase opacity-75">{status.label}</span>}
                        {item.conflict && <span className="shrink-0 text-[0.6rem] font-semibold text-destructive uppercase">Conflict</span>}
                        {o.canEdit && (
                          <span
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover:bg-foreground/15 group-hover:opacity-100"
                            onPointerDown={(e) => onPointerDown(e, item, row.id, "resize")}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {preview && !drag && <EventPreview occurrence={preview.occurrence} anchorRect={preview.rect} />}
    </div>
  )
}
