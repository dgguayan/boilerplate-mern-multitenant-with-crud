import { useState } from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { WEEKDAYS } from "./lib/dates"
import { RECURRENCE_OPTIONS, describeRule, nthWeekdayLabel, optionFromRule, ruleFromOption } from "./lib/recurrence"

export const fieldClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:opacity-50 dark:bg-input/30"

/** Repeat settings: quick options plus a custom editor (interval, weekdays, monthly mode, end). */
export function RecurrenceEditor({ rule, onChange, start, exdates = [], onExdatesChange, disabled }) {
  // "Custom…" stays selected even while the custom rule still matches a quick option.
  const [customChosen, setCustomChosen] = useState(false)
  const matched = optionFromRule(rule, start)
  const option = rule && customChosen ? "custom" : matched
  const showCustom = option === "custom"
  const set = (patch) => onChange({ ...rule, ...patch, preset: null })

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="ev-repeat" className="mb-1 block text-sm font-medium">
          Repeat
        </label>
        <select
          id="ev-repeat"
          className={fieldClass}
          value={option}
          disabled={disabled}
          onChange={(e) => {
            setCustomChosen(e.target.value === "custom")
            onChange(ruleFromOption(e.target.value, start))
          }}
        >
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {showCustom && rule && (
        <fieldset className="space-y-3 rounded-lg border bg-muted/30 p-3" disabled={disabled}>
          <legend className="sr-only">Custom repeat</legend>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="ev-interval">Every</label>
            <input
              id="ev-interval"
              type="number"
              min={1}
              max={365}
              className={cn(fieldClass, "w-20")}
              value={rule.interval || 1}
              onChange={(e) => set({ interval: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
            />
            <label htmlFor="ev-freq" className="sr-only">
              Unit
            </label>
            <select id="ev-freq" className={cn(fieldClass, "w-32")} value={rule.freq} onChange={(e) => set({ freq: e.target.value, byWeekday: e.target.value === "weekly" ? [start.weekday] : undefined })}>
              <option value="daily">day(s)</option>
              <option value="weekly">week(s)</option>
              <option value="monthly">month(s)</option>
              <option value="yearly">year(s)</option>
            </select>
          </div>

          {rule.freq === "weekly" && (
            <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const active = (rule.byWeekday || []).includes(d.iso)
                return (
                  <Button
                    key={d.iso}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    aria-label={d.long}
                    className="w-10"
                    onClick={() => {
                      const days = new Set(rule.byWeekday || [])
                      if (active) days.delete(d.iso)
                      else days.add(d.iso)
                      set({ byWeekday: days.size ? [...days].sort() : [start.weekday] })
                    }}
                  >
                    {d.short.slice(0, 2)}
                  </Button>
                )
              })}
            </div>
          )}

          {rule.freq === "monthly" && (
            <div role="radiogroup" aria-label="Monthly on" className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="ev-monthly" checked={rule.monthlyMode !== "nthWeekday"} onChange={() => set({ monthlyMode: "dayOfMonth" })} />
                On day {start.day}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ev-monthly" checked={rule.monthlyMode === "nthWeekday"} onChange={() => set({ monthlyMode: "nthWeekday" })} />
                On the {nthWeekdayLabel(start)}
              </label>
            </div>
          )}

          <div role="radiogroup" aria-label="Ends" className="space-y-1.5 text-sm">
            <p className="font-medium">Ends</p>
            <label className="flex items-center gap-2">
              <input type="radio" name="ev-end" checked={(rule.end?.type || "never") === "never"} onChange={() => set({ end: { type: "never" } })} />
              Never
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input
                type="radio"
                name="ev-end"
                checked={rule.end?.type === "until"}
                onChange={() => set({ end: { type: "until", until: start.plus({ months: 3 }).toISODate() } })}
              />
              On
              <input
                type="date"
                aria-label="End date"
                className={cn(fieldClass, "w-40")}
                value={rule.end?.type === "until" ? rule.end.until : ""}
                min={start.toISODate()}
                disabled={rule.end?.type !== "until"}
                onChange={(e) => e.target.value && set({ end: { type: "until", until: e.target.value } })}
              />
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="ev-end" checked={rule.end?.type === "count"} onChange={() => set({ end: { type: "count", count: 10 } })} />
              After
              <input
                type="number"
                aria-label="Number of occurrences"
                min={1}
                max={1000}
                className={cn(fieldClass, "w-20")}
                value={rule.end?.type === "count" ? rule.end.count : 10}
                disabled={rule.end?.type !== "count"}
                onChange={(e) => set({ end: { type: "count", count: Math.min(1000, Math.max(1, Number(e.target.value) || 1)) } })}
              />
              occurrences
            </label>
          </div>
        </fieldset>
      )}

      {rule && <p className="text-xs text-muted-foreground">{describeRule(rule, start)}</p>}

      {rule && exdates.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium">Skipped dates</p>
          <ul className="flex flex-wrap gap-1">
            {exdates.map((d) => (
              <li key={d}>
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs">
                  {d}
                  {onExdatesChange && (
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-label={`Restore ${d}`}
                      onClick={() => onExdatesChange(exdates.filter((x) => x !== d))}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
