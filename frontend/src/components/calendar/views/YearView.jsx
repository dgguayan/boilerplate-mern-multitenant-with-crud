import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { useCalendar } from "../CalendarContext"
import { MiniCalendar } from "../MiniCalendar"
import { occurrenceSpan } from "../lib/dates"

/** Twelve month grids; shading shows how busy each day is. */
export default function YearView({ date, occurrences, onSelectDay, onSelectMonth }) {
  const { prefs } = useCalendar()

  const counts = useMemo(() => {
    const map = new Map()
    for (const o of occurrences) {
      const { start, end } = occurrenceSpan(o, prefs.timeZone)
      // Count every day a (multi-day) event touches.
      let day = start.startOf("day")
      const last = o.allDay ? end.minus({ days: 1 }).startOf("day") : end.minus({ milliseconds: 1 }).startOf("day")
      for (let i = 0; day <= last && i < 366; i++, day = day.plus({ days: 1 })) {
        const key = day.toISODate()
        map.set(key, (map.get(key) || 0) + 1)
      }
    }
    return map
  }, [occurrences, prefs.timeZone])

  const months = Array.from({ length: 12 }, (_, i) => date.startOf("year").plus({ months: i }))

  return (
    <div className="grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {months.map((month) => {
        const total = [...counts.entries()].filter(([k]) => k.startsWith(month.toFormat("yyyy-MM"))).reduce((sum, [, n]) => sum + n, 0)
        return (
          <section key={month.month} className="rounded-xl border bg-card/70 p-3 shadow-xs" aria-label={month.toFormat("LLLL yyyy")}>
            <div className="mb-1 flex items-center justify-between">
              <Button variant="link" className="h-auto px-1 text-sm font-semibold text-foreground" onClick={() => onSelectMonth(month)}>
                {month.toFormat("LLLL")}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {total} event{total === 1 ? "" : "s"}
              </span>
            </div>
            <MiniCalendar
              value={date}
              month={month}
              onMonthChange={() => {}}
              showNavigation={false}
              onSelect={onSelectDay}
              zone={prefs.timeZone}
              firstDay={prefs.firstDay}
              weekNumbers={prefs.weekNumbers}
              counts={counts}
              heatmap
              label={`${month.toFormat("LLLL")} days`}
            />
          </section>
        )
      })}
    </div>
  )
}
