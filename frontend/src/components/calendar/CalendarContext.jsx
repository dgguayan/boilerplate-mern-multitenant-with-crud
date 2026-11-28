import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CalendarContext = createContext(null)
export const useCalendar = () => useContext(CalendarContext)

const SCOPES = [
  { value: "this", label: "This event", hint: "Only this occurrence changes." },
  { value: "following", label: "This and following events", hint: "This occurrence and all later ones change." },
  { value: "all", label: "All events", hint: "Every occurrence in the series changes." },
]

/**
 * Shared calendar state and actions: event panels, prompts, and every mutation (with undo).
 */
export function CalendarProvider({ value, undo, reload, children }) {
  const [details, setDetails] = useState(null) // occurrence shown in the details panel
  const [form, setForm] = useState(null) // { mode: 'create' | 'edit', occurrence?, prefill? }
  const [prompt, setPrompt] = useState(null)
  const resolver = useRef(null)

  const ask = useCallback(
    (config) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setPrompt(config)
      }),
    []
  )
  const answer = (result) => {
    resolver.current?.(result)
    resolver.current = null
    setPrompt(null)
  }

  const confirm = useCallback((config) => ask({ type: "confirm", ...config }), [ask])
  const askScope = useCallback(
    (verb, { allowThis = true } = {}) => ask({ type: "scope", verb, allowThis }),
    [ask]
  )

  const afterChange = useCallback(
    (label, response, { quiet = false } = {}) => {
      const data = response?.data?.data || {}
      undo.push(label, data.changes)
      reload()
      if (!quiet) {
        toast.success(label, {
          action: data.changes?.length ? { label: "Undo", onClick: () => runUndo() } : undefined,
        })
      }
      if (data.conflicts?.length) {
        const names = data.conflicts.slice(0, 3).map((c) => c.title).join(", ")
        toast.warning(`Scheduling conflict with ${names}`, {
          description: "Another event uses the same resource at this time.",
        })
      }
      return data
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [undo, reload]
  )

  const runUndo = useCallback(async () => {
    try {
      const label = await undo.undo()
      if (label) toast(`Undone: ${label}`, { action: { label: "Redo", onClick: () => runRedo() } })
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't undo that change."))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo])
  const runRedo = useCallback(async () => {
    try {
      const label = await undo.redo()
      if (label) toast(`Redone: ${label}`)
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't redo that change."))
    }
  }, [undo])

  /** Which document and scope a change to `occurrence` targets. */
  const resolveTarget = useCallback(
    async (occurrence, verb, options) => {
      if (!occurrence.isRecurring) return { id: occurrence.eventId, scope: "all" }
      const scope = await askScope(verb, options)
      if (!scope) return null
      if (occurrence.isOverride && scope === "this") return { id: occurrence.eventId, scope: "all", override: true }
      return { id: occurrence.seriesId, scope, occurrenceKey: occurrence.recurrenceKey }
    },
    [askScope]
  )

  /**
   * Moves or resizes an occurrence (drag & drop, resize, keyboard). For a whole series the
   * series start shifts by the same amount; weekly rules follow a change of weekday.
   */
  const moveOccurrence = useCallback(
    async (occurrence, { start, end, allDay, resourceIds }, label = "Event rescheduled") => {
      const target = await resolveTarget(occurrence, "reschedule")
      if (!target) return false
      try {
        let data = { start, end, ...(allDay !== undefined && { allDay }), ...(resourceIds && { resourceIds }) }
        if (occurrence.isRecurring && target.scope !== "this" && !target.override) {
          const { data: res } = await calendarApi.getEvent(target.id)
          const series = res.data.event
          const zone = series.allDay ? "utc" : series.timeZone
          const oldStart = DateTime.fromJSDate(new Date(occurrence.start), { zone })
          const newStart = DateTime.fromJSDate(new Date(start), { zone })
          const dayShift = Math.round(newStart.startOf("day").diff(oldStart.startOf("day"), "days").days)
          if (target.scope === "all") {
            const delta = new Date(start) - new Date(occurrence.start)
            const duration = new Date(end) - new Date(start)
            const seriesStart = new Date(new Date(series.start).getTime() + delta)
            data = { ...data, start: seriesStart, end: new Date(seriesStart.getTime() + duration) }
          }
          if (dayShift && series.recurrence?.freq === "weekly" && series.recurrence.byWeekday?.length) {
            const byWeekday = series.recurrence.byWeekday.map((d) => ((((d - 1 + dayShift) % 7) + 7) % 7) + 1)
            data.recurrence = { ...series.recurrence, byWeekday, preset: null }
          }
        }
        const response = await calendarApi.updateEvent(target.id, {
          scope: target.scope,
          occurrenceKey: target.occurrenceKey,
          data,
        })
        afterChange(label, response)
        return true
      } catch (err) {
        toast.error(calendarApi.errorMessage(err, "Couldn't move the event."))
        return false
      }
    },
    [resolveTarget, afterChange]
  )

  const deleteOccurrence = useCallback(
    async (occurrence) => {
      let target
      if (occurrence.isRecurring) {
        target = await resolveTarget(occurrence, "delete")
        if (!target) return false
        // An edited single occurrence is removed with scope "this" (keeps its date skipped).
        if (target.override) target = { id: occurrence.eventId, scope: "this" }
      } else {
        const ok = await confirm({
          title: `Delete “${occurrence.title}”?`,
          description: "The event will be removed from the calendar. You can undo this right after.",
          confirmLabel: "Delete event",
          destructive: true,
        })
        if (!ok) return false
        target = { id: occurrence.eventId, scope: "all" }
      }
      try {
        const response = await calendarApi.deleteEvent(target.id, {
          scope: target.scope,
          occurrenceKey: target.occurrenceKey,
        })
        afterChange("Event deleted", response)
        setDetails(null)
        return true
      } catch (err) {
        toast.error(calendarApi.errorMessage(err, "Couldn't delete the event."))
        return false
      }
    },
    [resolveTarget, confirm, afterChange]
  )

  const duplicateOccurrence = useCallback(
    async (occurrence) => {
      try {
        const id = occurrence.isOverride ? occurrence.eventId : occurrence.seriesId || occurrence.eventId
        const response = await calendarApi.duplicateEvent(id)
        afterChange("Event duplicated", response)
        return response.data.data.event
      } catch (err) {
        toast.error(calendarApi.errorMessage(err, "Couldn't duplicate the event."))
        return null
      }
    },
    [afterChange]
  )

  const context = useMemo(
    () => ({
      ...value,
      details,
      openDetails: setDetails,
      closeDetails: () => setDetails(null),
      form,
      openCreate: (prefill = {}) => value.permissions.canCreate && setForm({ mode: "create", prefill }),
      openEdit: (occurrence) => setForm({ mode: "edit", occurrence }),
      closeForm: () => setForm(null),
      confirm,
      askScope,
      resolveTarget,
      moveOccurrence,
      deleteOccurrence,
      duplicateOccurrence,
      afterChange,
      undo: { ...undo, run: runUndo, runRedo },
      reload,
    }),
    [value, details, form, confirm, askScope, resolveTarget, moveOccurrence, deleteOccurrence, duplicateOccurrence, afterChange, undo, runUndo, runRedo, reload]
  )

  return (
    <CalendarContext.Provider value={context}>
      {children}
      <Dialog open={Boolean(prompt)} onOpenChange={(open) => !open && answer(prompt?.type === "scope" ? null : false)}>
        <DialogContent className="sm:max-w-md">
          {prompt?.type === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>{prompt.title}</DialogTitle>
                {prompt.description && <DialogDescription>{prompt.description}</DialogDescription>}
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => answer(false)}>
                  Cancel
                </Button>
                <Button variant={prompt.destructive ? "destructive" : "default"} onClick={() => answer(true)} autoFocus>
                  {prompt.confirmLabel || "Confirm"}
                </Button>
              </DialogFooter>
            </>
          )}
          {prompt?.type === "scope" && (
            <>
              <DialogHeader>
                <DialogTitle>{prompt.verb === "delete" ? "Delete recurring event" : "Change recurring event"}</DialogTitle>
                <DialogDescription>
                  {prompt.verb === "delete" ? "Which events do you want to delete?" : "Which events should this change apply to?"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2" role="group" aria-label="Apply to">
                {SCOPES.filter((s) => prompt.allowThis || s.value !== "this").map((scope, index) => (
                  <Button
                    key={scope.value}
                    variant={prompt.verb === "delete" && scope.value === "all" ? "destructive" : "outline"}
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left whitespace-normal"
                    onClick={() => answer(scope.value)}
                    autoFocus={index === 0}
                  >
                    <span>{scope.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{scope.hint}</span>
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => answer(null)}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </CalendarContext.Provider>
  )
}
