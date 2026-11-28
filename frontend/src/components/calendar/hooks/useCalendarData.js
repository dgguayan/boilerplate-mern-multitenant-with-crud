import { useCallback, useEffect, useRef, useState } from "react"
import * as calendarApi from "@/api/calendar.api"

const CACHE_TTL = 60_000

/**
 * Loads categories, resources and the occurrences of the visible range.
 * Ranges are cached briefly so switching views or going back and forth doesn't refetch.
 */
export function useCalendarData({ start, end }) {
  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [occurrences, setOccurrences] = useState([])
  const [status, setStatus] = useState("loading") // loading | ready | error
  const [refreshing, setRefreshing] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const cache = useRef(new Map())
  const hasData = useRef(false)

  const startISO = start.toUTC().toISO()
  const endISO = end.toUTC().toISO()

  const loadTaxonomy = useCallback(async () => {
    const [cats, res] = await Promise.all([calendarApi.getCategories(), calendarApi.getResources()])
    setCategories(cats.data.data.categories)
    setResources(res.data.data.resources)
  }, [])

  useEffect(() => {
    loadTaxonomy().catch((err) => setError(calendarApi.errorMessage(err, "Couldn't load categories.")))
  }, [loadTaxonomy])

  useEffect(() => {
    const key = `${startISO}|${endISO}`
    const cached = cache.current.get(key)
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setOccurrences(cached.occurrences)
      setTruncated(cached.truncated)
      setStatus("ready")
      return
    }
    const controller = new AbortController()
    if (hasData.current) setRefreshing(true)
    else setStatus("loading")
    calendarApi
      .getOccurrences({ start: startISO, end: endISO }, controller.signal)
      .then((res) => {
        const { occurrences: list, truncated: cut } = res.data.data
        cache.current.set(key, { occurrences: list, truncated: cut, at: Date.now() })
        if (cache.current.size > 24) cache.current.delete(cache.current.keys().next().value)
        hasData.current = true
        setOccurrences(list)
        setTruncated(cut)
        setError(null)
        setStatus("ready")
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(calendarApi.errorMessage(err, "Couldn't load events."))
        setStatus(hasData.current ? "ready" : "error")
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false)
      })
    return () => controller.abort()
  }, [startISO, endISO, version])

  /** Drops cached ranges and refetches (after any change). */
  const reload = useCallback(
    ({ taxonomy = false } = {}) => {
      cache.current.clear()
      setVersion((v) => v + 1)
      if (taxonomy) return loadTaxonomy()
    },
    [loadTaxonomy]
  )

  return { categories, resources, occurrences, status, refreshing, truncated, error, reload }
}

/**
 * Undo / redo of calendar changes. Every mutation returns before/after snapshots of the
 * documents it touched; undo restores the "before" states and redo the "after" states.
 */
export function useUndoRedo({ onApplied }) {
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [busy, setBusy] = useState(false)

  const push = useCallback((label, changes) => {
    if (!changes?.length) return
    setUndoStack((stack) => [...stack.slice(-49), { label, changes }])
    setRedoStack([])
  }, [])

  const run = useCallback(
    async (direction) => {
      const from = direction === "undo" ? undoStack : redoStack
      const entry = from[from.length - 1]
      if (!entry || busy) return null
      setBusy(true)
      try {
        const states = entry.changes.map((c) => ({ id: c.id, state: direction === "undo" ? c.before : c.after }))
        // Undo restores in reverse order so dependent documents come back consistently.
        await calendarApi.revertChanges(direction === "undo" ? states.reverse() : states)
        if (direction === "undo") {
          setUndoStack((s) => s.slice(0, -1))
          setRedoStack((s) => [...s, entry])
        } else {
          setRedoStack((s) => s.slice(0, -1))
          setUndoStack((s) => [...s, entry])
        }
        onApplied?.()
        return entry.label
      } finally {
        setBusy(false)
      }
    },
    [undoStack, redoStack, busy, onApplied]
  )

  return {
    push,
    undo: () => run("undo"),
    redo: () => run("redo"),
    canUndo: undoStack.length > 0 && !busy,
    canRedo: redoStack.length > 0 && !busy,
    undoLabel: undoStack[undoStack.length - 1]?.label,
    redoLabel: redoStack[redoStack.length - 1]?.label,
  }
}
