import { useMemo } from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useCalendar } from "./CalendarContext"
import { MiniCalendar } from "./MiniCalendar"
import { fieldClass } from "./RecurrenceEditor"
import { CategoryIcon } from "./ui"
import { occurrenceSpan } from "./lib/dates"
import { STATUSES, activeFilterChips } from "./lib/filters"

/** Mini calendar, category legend (with toggles) and the advanced filters. */
export function CalendarSidebar({ date, onSelectDate, occurrences, filters, setFilters, facets, className }) {
  const { prefs, categories, resources } = useCalendar()

  const counts = useMemo(() => {
    const map = new Map()
    for (const o of occurrences) {
      const key = occurrenceSpan(o, prefs.timeZone).start.toISODate()
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [occurrences, prefs.timeZone])

  const perCategory = useMemo(() => {
    const map = new Map()
    for (const o of occurrences) map.set(o.categoryId || "none", (map.get(o.categoryId || "none") || 0) + 1)
    return map
  }, [occurrences])

  const hidden = new Set(filters.hiddenCategories)
  const toggleCategory = (id) =>
    setFilters((f) => ({ ...f, hiddenCategories: hidden.has(id) ? f.hiddenCategories.filter((c) => c !== id) : [...f.hiddenCategories, id] }))
  const legend = [...categories.map((c) => ({ id: c._id, category: c, name: c.name, description: c.description })), { id: "none", name: "Uncategorised" }]

  const toggleIn = (key, value) => setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }))

  return (
    <div className={cn("space-y-5", className)}>
      <MiniCalendar
        value={date}
        onSelect={onSelectDate}
        zone={prefs.timeZone}
        firstDay={prefs.firstDay}
        weekNumbers={prefs.weekNumbers}
        counts={counts}
        label="Go to date"
      />

      <section aria-labelledby="legend-title">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 id="legend-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Categories
          </h2>
          {hidden.size > 0 && (
            <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setFilters((f) => ({ ...f, hiddenCategories: [] }))}>
              Show all
            </Button>
          )}
        </div>
        <ul className="space-y-0.5">
          {legend.map((item) => {
            const on = !hidden.has(item.id)
            return (
              <li key={item.id}>
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  title={item.description || undefined}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCategory(item.id)} />
                  <span
                    aria-hidden="true"
                    className={cn("flex size-5 items-center justify-center rounded-md border transition-colors", on ? "border-transparent" : "bg-transparent")}
                    style={on ? { background: item.category?.color || "var(--muted-foreground)", color: "white" } : { borderColor: item.category?.color || "var(--border)" }}
                  >
                    {on && <CategoryIcon category={item.category} className="size-3" />}
                  </span>
                  <span className={cn("flex-1 truncate", !on && "text-muted-foreground line-through")}>{item.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{perCategory.get(item.id) || 0}</span>
                  <span className="sr-only">{on ? "shown" : "hidden"}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="filters-title" className="space-y-3">
        <h2 id="filters-title" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Filters
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="f-from" className="mb-0.5 block text-xs text-muted-foreground">
              From
            </label>
            <input id="f-from" type="date" className={fieldClass} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="f-to" className="mb-0.5 block text-xs text-muted-foreground">
              To
            </label>
            <input id="f-to" type="date" className={fieldClass} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
        </div>
        {[
          { id: "f-time", key: "time", label: "When", options: [["any", "Any time"], ["upcoming", "Upcoming"], ["ongoing", "Happening now"], ["past", "Past"]] },
          { id: "f-mode", key: "mode", label: "Attendance", options: [["any", "Online or in person"], ["online", "Online"], ["in-person", "In person"], ["hybrid", "Hybrid"]] },
          { id: "f-price", key: "price", label: "Price", options: [["any", "Free or paid"], ["free", "Free"], ["paid", "Paid"]] },
          { id: "f-avail", key: "availability", label: "Registration", options: [["any", "Any"], ["open", "Open"], ["closed", "Closed"]] },
          { id: "f-rsvp", key: "rsvp", label: "My replies", options: [["any", "Any"], ["going", "I'm going"], ["replied", "I replied"], ["unanswered", "Not replied"]] },
        ].map((select) => (
          <div key={select.key}>
            <label htmlFor={select.id} className="mb-0.5 block text-xs text-muted-foreground">
              {select.label}
            </label>
            <select id={select.id} className={fieldClass} value={filters[select.key]} onChange={(e) => setFilters((f) => ({ ...f, [select.key]: e.target.value }))}>
              {select.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label htmlFor="f-loc" className="mb-0.5 block text-xs text-muted-foreground">
            Location
          </label>
          <input id="f-loc" className={fieldClass} placeholder="Venue or address" value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} />
        </div>
        {facets.organizers.length > 0 && (
          <div>
            <label htmlFor="f-org" className="mb-0.5 block text-xs text-muted-foreground">
              Organizer
            </label>
            <select id="f-org" className={fieldClass} value={filters.organizer} onChange={(e) => setFilters((f) => ({ ...f, organizer: e.target.value }))}>
              <option value="">Anyone</option>
              {facets.organizers.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        )}
        <fieldset>
          <legend className="mb-1 text-xs text-muted-foreground">Status</legend>
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => {
              const on = filters.statuses.includes(s.value)
              return (
                <Button key={s.value} type="button" size="xs" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => toggleIn("statuses", s.value)}>
                  {s.label}
                </Button>
              )
            })}
          </div>
        </fieldset>
        {facets.tags.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-xs text-muted-foreground">Tags</legend>
            <div className="flex flex-wrap gap-1">
              {facets.tags.slice(0, 30).map((t) => {
                const on = filters.tags.includes(t)
                return (
                  <Button key={t} type="button" size="xs" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => toggleIn("tags", t)}>
                    #{t}
                  </Button>
                )
              })}
            </div>
          </fieldset>
        )}
        {resources.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-xs text-muted-foreground">Resources</legend>
            <div className="flex flex-wrap gap-1">
              {resources.map((r) => {
                const on = filters.resourceIds.includes(r._id)
                return (
                  <Button key={r._id} type="button" size="xs" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => toggleIn("resourceIds", r._id)}>
                    {r.name}
                  </Button>
                )
              })}
            </div>
          </fieldset>
        )}
      </section>
    </div>
  )
}

/** Active filter chips, the result count and "Clear all". */
export function ActiveFilters({ filters, setFilters, count, total, onClear }) {
  const { categoriesById, resourcesById } = useCalendar()
  const chips = activeFilterChips(filters, { categoriesById, resourcesById })
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="region" aria-label="Active filters">
      <span className="text-muted-foreground" aria-live="polite">
        {count} of {total} event{total === 1 ? "" : "s"}
      </span>
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border bg-background/70 py-0.5 pr-1 pl-2.5">
          {chip.label}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={() => setFilters(chip.remove)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="link" size="xs" className="h-auto" onClick={onClear}>
        Clear all filters
      </Button>
    </div>
  )
}
