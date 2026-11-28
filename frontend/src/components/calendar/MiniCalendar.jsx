import { memo, useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { WEEKDAYS, startOfWeek } from "./lib/dates"

/**
 * Accessible month grid (date picker pattern). Arrow keys move by day/week, Page Up/Down by
 * month, Home/End to the week's ends; Enter or Space selects.
 *
 * Reusable on its own: pass `counts` (Map of yyyy-mm-dd → number) to show event markers.
 */
export const MiniCalendar = memo(function MiniCalendar({
  value,
  onSelect,
  zone,
  firstDay = 1,
  weekNumbers = false,
  counts,
  month: controlledMonth,
  onMonthChange,
  showNavigation = true,
  heatmap = false,
  className,
  label = "Choose a date",
}) {
  const [ownMonth, setOwnMonth] = useState(() => value.startOf("month"))
  const month = controlledMonth ?? ownMonth
  const setMonth = (m) => (onMonthChange ? onMonthChange(m) : setOwnMonth(m))
  const [focusDate, setFocusDate] = useState(value)
  const gridRef = useRef(null)
  const pendingFocus = useRef(false)
  const today = DateTime.now().setZone(zone).startOf("day")

  // Follow the selected date when it moves outside the shown month.
  useEffect(() => {
    if (!controlledMonth && !value.hasSame(ownMonth, "month")) setOwnMonth(value.startOf("month"))
    setFocusDate(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.toISODate()])

  const weeks = useMemo(() => {
    const first = startOfWeek(month.startOf("month"), firstDay)
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => first.plus({ days: w * 7 + d })))
  }, [month, firstDay])

  const headers = useMemo(() => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(firstDay - 1 + i) % 7]), [firstDay])
  const maxCount = heatmap && counts ? Math.max(1, ...counts.values()) : 1

  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    gridRef.current?.querySelector(`[data-date="${focusDate.toISODate()}"]`)?.focus()
  }, [focusDate, month])

  const moveFocus = (next) => {
    pendingFocus.current = true
    setFocusDate(next)
    if (!next.hasSame(month, "month")) setMonth(next.startOf("month"))
  }

  const onKeyDown = (event) => {
    const keys = {
      ArrowLeft: () => focusDate.minus({ days: 1 }),
      ArrowRight: () => focusDate.plus({ days: 1 }),
      ArrowUp: () => focusDate.minus({ weeks: 1 }),
      ArrowDown: () => focusDate.plus({ weeks: 1 }),
      PageUp: () => focusDate.minus(event.shiftKey ? { years: 1 } : { months: 1 }),
      PageDown: () => focusDate.plus(event.shiftKey ? { years: 1 } : { months: 1 }),
      Home: () => startOfWeek(focusDate, firstDay),
      End: () => startOfWeek(focusDate, firstDay).plus({ days: 6 }),
    }
    if (keys[event.key]) {
      event.preventDefault()
      moveFocus(keys[event.key]())
    }
  }

  return (
    <div className={cn("select-none", className)}>
      {showNavigation && (
        <div className="mb-1 flex items-center justify-between gap-1">
          <p className="pl-1 text-sm font-medium" aria-live="polite">
            {month.toFormat("LLLL yyyy")}
          </p>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(month.minus({ months: 1 }))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(month.plus({ months: 1 }))}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
      <table ref={gridRef} role="grid" aria-label={`${label}, ${month.toFormat("LLLL yyyy")}`} className="w-full border-collapse" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {weekNumbers && (
              <th scope="col" className="w-6 pb-1 text-[0.65rem] font-normal text-muted-foreground/70">
                <abbr title="Week number">Wk</abbr>
              </th>
            )}
            {headers.map((d) => (
              <th key={d.iso} scope="col" className="pb-1 text-[0.7rem] font-normal text-muted-foreground">
                <abbr title={d.long} className="no-underline">
                  {d.narrow}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].toISODate()}>
              {weekNumbers && <td className="text-center text-[0.65rem] text-muted-foreground/70 tabular-nums">{week[0].plus({ days: 3 }).weekNumber}</td>}
              {week.map((day) => {
                const iso = day.toISODate()
                const inMonth = day.hasSame(month, "month")
                const selected = day.hasSame(value, "day")
                const isToday = day.hasSame(today, "day")
                const count = counts?.get(iso) || 0
                const focusable = day.hasSame(focusDate, "day") && inMonth
                return (
                  <td key={iso} role="gridcell" aria-selected={selected} className="p-0 text-center">
                    <button
                      type="button"
                      data-date={iso}
                      tabIndex={focusable || (!focusDate.hasSame(month, "month") && day.day === 1 && inMonth) ? 0 : -1}
                      onClick={() => onSelect(day)}
                      onFocus={() => setFocusDate(day)}
                      aria-label={`${day.toFormat("cccc, LLLL d, yyyy")}${isToday ? ", today" : ""}${count ? `, ${count} event${count === 1 ? "" : "s"}` : ""}`}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "relative mx-auto flex size-8 flex-col items-center justify-center rounded-lg text-xs tabular-nums outline-none transition-colors",
                        "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                        !inMonth && "text-muted-foreground/45",
                        isToday && !selected && "font-semibold text-primary ring-1 ring-primary/40",
                        selected && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                      )}
                      style={
                        heatmap && count && !selected
                          ? { backgroundColor: `color-mix(in oklch, var(--chart-2) ${Math.round(15 + (count / maxCount) * 45)}%, transparent)` }
                          : undefined
                      }
                    >
                      {day.day}
                      {!heatmap && count > 0 && (
                        <span
                          aria-hidden="true"
                          className={cn("absolute bottom-1 size-1 rounded-full", selected ? "bg-primary-foreground" : "bg-foreground/50")}
                        />
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
