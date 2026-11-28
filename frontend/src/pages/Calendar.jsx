import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { TriangleAlert } from "lucide-react"

import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as calendarApi from "@/api/calendar.api"
import { CalendarProvider, useCalendar } from "@/components/calendar/CalendarContext"
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar"
import { ActiveFilters, CalendarSidebar } from "@/components/calendar/CalendarSidebar"
import { EventDetailsSheet } from "@/components/calendar/EventDetailsSheet"
import { EventFormSheet } from "@/components/calendar/EventFormSheet"
import { CategoryManager, ImportExportDialog, ResourceManager, SettingsDialog } from "@/components/calendar/ManageDialogs"
import { EventListView, UpcomingView } from "@/components/calendar/views/ListViews"
import YearView from "@/components/calendar/views/YearView"
import LaneView from "@/components/calendar/views/LaneView"
import { useCalendarData, useUndoRedo } from "@/components/calendar/hooks/useCalendarData"
import { MAX_RANGE_DAYS, rangeForView, stepDate, viewTitle } from "@/components/calendar/lib/dates"
import { EMPTY_FILTERS, activeFilterChips, applyFilters, facets as getFacets } from "@/components/calendar/lib/filters"
import { VIEWS, VIEW_VALUES, loadPrefs, savePrefs } from "@/components/calendar/lib/prefs"

// FullCalendar is the heaviest dependency: load it only for the grid views.
const FullCalendarView = lazy(() => import("@/components/calendar/views/FullCalendarView"))
const FC_VIEWS = new Set(["month", "week", "workWeek", "day", "agenda", "multiMonth"])

const FILTERS_KEY = "calendar:filters"
function loadFilters() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || "null")
    if (stored) return { ...EMPTY_FILTERS, ...stored }
  } catch {
    /* ignore */
  }
  return EMPTY_FILTERS
}

const SHORTCUTS = [
  ["T", "Go to today"],
  ["N / →", "Next period"],
  ["P / ←", "Previous period"],
  ["C", "New event"],
  ["/", "Search"],
  ["F", "Filters"],
  ["Ctrl+Z", "Undo"],
  ["Ctrl+Shift+Z", "Redo"],
  ...VIEWS.map((v) => [v.key.toUpperCase(), `${v.label} view`]),
  ["Esc", "Close panels and dialogs"],
]

function ViewSkeleton({ view }) {
  if (["list", "upcoming", "agenda"].includes(view)) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-2 p-1" aria-busy="true" aria-label="Loading events">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid h-full grid-cols-7 grid-rows-[auto_repeat(5,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border bg-border" aria-busy="true" aria-label="Loading calendar">
      {Array.from({ length: 42 }, (_, i) => (
        <div key={i} className="bg-background p-2">
          <Skeleton className={cn("h-3", i < 7 ? "w-8" : "w-5")} />
          {i >= 7 && i % 3 === 0 && <Skeleton className="mt-2 h-4 w-4/5" />}
        </div>
      ))}
    </div>
  )
}

export default function CalendarPage() {
  const { hasRole } = useAuth()
  const [prefs, setPrefsState] = useState(loadPrefs)
  const setPrefs = useCallback((next) => {
    setPrefsState(next)
    savePrefs(next)
  }, [])
  const [searchParams, setSearchParams] = useSearchParams()
  const [isNarrow] = useState(() => window.matchMedia?.("(max-width: 767px)").matches ?? false)

  // View and date live in the URL so reloads, back/forward and shared links keep them.
  const urlView = searchParams.get("view")
  const view = VIEW_VALUES.has(urlView) ? urlView : isNarrow && ["month", "week", "workWeek", "multiMonth", "timeline", "resources"].includes(prefs.defaultView) ? "agenda" : prefs.defaultView
  const urlDate = DateTime.fromISO(searchParams.get("date") || "", { zone: prefs.timeZone })
  const date = urlDate.isValid ? urlDate.startOf("day") : DateTime.now().setZone(prefs.timeZone).startOf("day")

  const updateParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value == null) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )
  const setView = useCallback((v) => updateParams({ view: v }), [updateParams])
  const setDate = useCallback((d) => updateParams({ date: d.toISODate() }), [updateParams])

  const [filters, setFiltersState] = useState(loadFilters)
  const setFilters = useCallback((update) => {
    setFiltersState((prev) => {
      const next = typeof update === "function" ? update(prev) : update
      try {
        sessionStorage.setItem(FILTERS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  const [query, setQuery] = useState(filters.q)
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 200)
    return () => clearTimeout(timer)
  }, [query, setFilters])
  const [sort, setSort] = useState("date")

  // Fetch only the visible range (the list view follows the date filter, up to the API limit).
  const range = useMemo(() => {
    if (view === "list" && filters.from && filters.to) {
      const start = DateTime.fromISO(filters.from, { zone: prefs.timeZone }).startOf("day")
      let end = DateTime.fromISO(filters.to, { zone: prefs.timeZone }).plus({ days: 1 }).startOf("day")
      if (start.isValid && end.isValid && end > start) {
        if (end.diff(start, "days").days > MAX_RANGE_DAYS) end = start.plus({ days: MAX_RANGE_DAYS })
        return { start, end }
      }
    }
    return rangeForView(view, date, prefs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date.toISODate(), prefs.firstDay, prefs.timeZone, filters.from, filters.to])

  const data = useCalendarData(range)
  const undo = useUndoRedo({ onApplied: data.reload })

  const categoriesById = useMemo(() => new Map(data.categories.map((c) => [c._id, c])), [data.categories])
  const resourcesById = useMemo(() => new Map(data.resources.map((r) => [r._id, r])), [data.resources])
  const filtered = useMemo(() => applyFilters(data.occurrences, filters, categoriesById), [data.occurrences, filters, categoriesById])
  const eventFacets = useMemo(() => getFacets(data.occurrences), [data.occurrences])
  const chipCount = activeFilterChips(filters, { categoriesById, resourcesById }).length

  const permissions = useMemo(() => ({ canCreate: hasRole("manager"), isAdmin: hasRole("admin") }), [hasRole])
  const contextValue = useMemo(
    () => ({ prefs, setPrefs, categories: data.categories, categoriesById, resources: data.resources, resourcesById, permissions }),
    [prefs, setPrefs, data.categories, categoriesById, data.resources, resourcesById, permissions]
  )

  return (
    <CalendarProvider value={contextValue} undo={undo} reload={data.reload}>
      <CalendarScreen
        view={view}
        setView={setView}
        date={date}
        setDate={setDate}
        data={data}
        filtered={filtered}
        filters={filters}
        setFilters={setFilters}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        eventFacets={eventFacets}
        chipCount={chipCount}
        range={range}
        eventParam={searchParams.get("event")}
        occurrenceParam={searchParams.get("occurrence")}
        clearEventParam={() => updateParams({ event: null, occurrence: null })}
      />
    </CalendarProvider>
  )
}

function CalendarScreen({ view, setView, date, setDate, data, filtered, filters, setFilters, query, setQuery, sort, setSort, eventFacets, chipCount, range, eventParam, occurrenceParam, clearEventParam }) {
  const ctx = useCalendar()
  const { prefs, permissions, openCreate, openDetails, undo, details, form } = ctx
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("calendar:sidebar") !== "closed"
    } catch {
      return true
    }
  })
  const [filtersSheet, setFiltersSheet] = useState(false)
  const [dialog, setDialog] = useState(null)
  const searchRef = useRef(null)

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem("calendar:sidebar", open ? "closed" : "open")
      } catch {
        /* ignore */
      }
      return !open
    })
  }

  const step = useCallback((direction) => setDate(stepDate(view, date, direction)), [view, date, setDate])
  const today = useCallback(() => setDate(DateTime.now().setZone(prefs.timeZone)), [prefs.timeZone, setDate])
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setQuery("")
  }

  // Deep link: /calendar?event=<id> opens that event's details; &occurrence=<yyyy-mm-dd> picks one
  // occurrence of a recurring event (notifications link to the date they are about).
  useEffect(() => {
    if (!eventParam || data.status !== "ready") return
    const matches = (o) => o.eventId === eventParam || o.seriesId === eventParam
    const found =
      (occurrenceParam && data.occurrences.find((o) => matches(o) && o.recurrenceKey === occurrenceParam)) ||
      data.occurrences.find(matches)
    if (found) {
      openDetails(found)
      clearEventParam()
      return
    }
    calendarApi
      .getEvent(eventParam)
      .then((res) => {
        const e = res.data.data.event
        openDetails({
          id: e._id, eventId: e._id, seriesId: e.seriesId || null, recurrenceKey: e.recurrenceKey || null,
          isRecurring: Boolean(e.recurrence?.freq || e.seriesId), isOverride: Boolean(e.seriesId),
          start: e.start, end: e.end, allDay: e.allDay, title: e.title, summary: e.summary, categoryId: e.categoryId || null,
          color: e.color, location: e.location, virtualUrl: e.virtualUrl, status: e.status, visibility: e.visibility,
          tags: e.tags || [], resourceIds: e.resourceIds || [], canEdit: e.canEdit, price: e.price, capacity: e.capacity,
        })
        setDate(DateTime.fromISO(e.start, { zone: prefs.timeZone }))
      })
      .catch(() => {})
      .finally(clearEventParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventParam, data.status])

  // Keyboard shortcuts (ignored while typing or when a dialog/panel is open).
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target
      const typing = target.closest?.("input, textarea, select, [contenteditable='true']")
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault()
        if (e.shiftKey) undo.runRedo()
        else undo.run()
        return
      }
      if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault()
        undo.runRedo()
        return
      }
      if (typing || mod || e.altKey || details || form || dialog || filtersSheet || document.querySelector("[role='dialog'],[role='menu']")) return
      const key = e.key
      const viewMatch = VIEWS.find((v) => v.key === key.toLowerCase())
      if (key === "t") today()
      else if (key === "n" || (key === "ArrowRight" && !target.closest?.(".fc, [role='grid'], [role='list']"))) step(1)
      else if (key === "p" || (key === "ArrowLeft" && !target.closest?.(".fc, [role='grid'], [role='list']"))) step(-1)
      else if (key === "c" && permissions.canCreate) openCreate({ start: date.toISODate(), allDay: true })
      else if (key === "/") searchRef.current?.focus()
      else if (key === "f") (window.matchMedia("(min-width: 1024px)").matches ? toggleSidebar() : setFiltersSheet(true))
      else if (key === "?") setDialog("shortcuts")
      else if (viewMatch) setView(viewMatch.value)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const sidebar = (
    <CalendarSidebar
      date={date}
      onSelectDate={(d) => {
        setDate(d)
        setFiltersSheet(false)
      }}
      occurrences={data.occurrences}
      filters={filters}
      setFilters={setFilters}
      facets={eventFacets}
    />
  )

  const listProps = { hasFilters: chipCount > 0, onClearFilters: clearFilters }
  let body
  if (data.status === "loading") body = <ViewSkeleton view={view} />
  else if (data.status === "error")
    body = (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <TriangleAlert className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">{data.error}</p>
        <Button variant="outline" onClick={() => data.reload({ taxonomy: true })}>
          Try again
        </Button>
      </div>
    )
  else if (FC_VIEWS.has(view))
    body = (
      <Suspense fallback={<ViewSkeleton view={view} />}>
        <FullCalendarView view={view} date={date} occurrences={filtered} onNavigateDay={(d) => (setDate(d), setView("day"))} onSwipe={step} />
      </Suspense>
    )
  else if (view === "year") body = <YearView date={date} occurrences={filtered} onSelectDay={(d) => (setDate(d), setView("day"))} onSelectMonth={(m) => (setDate(m), setView("month"))} />
  else if (view === "list") body = <EventListView occurrences={filtered} sort={query ? (sort === "date" ? "relevance" : sort) : sort} onSortChange={setSort} {...listProps} />
  else if (view === "upcoming") body = <UpcomingView occurrences={filtered} {...listProps} />
  else body = <LaneView mode={view === "resources" ? "resources" : "timeline"} date={date} occurrences={filtered} />

  const scrolls = !["month", "week", "workWeek", "day", "timeline", "resources"].includes(view)

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-140 w-full min-w-0 flex-col">
      <CalendarToolbar
        view={view}
        onViewChange={setView}
        date={date}
        onDateChange={setDate}
        title={viewTitle(view, date, prefs)}
        onStep={step}
        onToday={today}
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onOpenFilters={() => setFiltersSheet(true)}
        activeFilterCount={chipCount}
        refreshing={data.refreshing}
        onOpenDialog={setDialog}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside aria-label="Calendar navigation and filters" className="hidden w-72 shrink-0 overflow-y-auto border-r bg-muted/20 p-4 lg:block">
            {sidebar}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col gap-2 p-2 sm:p-3" aria-label="Calendar">
          {(chipCount > 0 || data.truncated || (data.error && data.status === "ready")) && (
            <div className="space-y-1 px-1">
              <ActiveFilters filters={filters} setFilters={setFilters} count={filtered.length} total={data.occurrences.length} onClear={clearFilters} />
              {data.truncated && <p className="text-xs text-amber-700 dark:text-amber-400">This period has more than 5,000 events; only the first 5,000 are shown. Narrow the dates or filters.</p>}
              {data.error && data.status === "ready" && <p role="alert" className="text-xs text-destructive">{data.error}</p>}
            </div>
          )}
          <div className={cn("min-h-0 flex-1", scrolls ? "overflow-y-auto" : "overflow-hidden")}>{body}</div>
        </main>
      </div>

      <Sheet open={filtersSheet} onOpenChange={setFiltersSheet}>
        <SheetContent side="left" className="w-[88vw] overflow-y-auto data-[side=left]:sm:max-w-sm">
          <SheetHeader className="px-0 pt-0">
            <SheetTitle>Calendar and filters</SheetTitle>
            <SheetDescription>{filtered.length} matching events</SheetDescription>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <EventDetailsSheet />
      <EventFormSheet />
      <CategoryManager open={dialog === "categories"} onOpenChange={(o) => !o && setDialog(null)} />
      <ResourceManager open={dialog === "resources"} onOpenChange={(o) => !o && setDialog(null)} />
      <ImportExportDialog open={dialog === "importExport"} onOpenChange={(o) => !o && setDialog(null)} defaultRange={range} />
      <SettingsDialog open={dialog === "settings"} onOpenChange={(o) => !o && setDialog(null)} />
      <Dialog open={dialog === "shortcuts"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Inside the date grids use the arrow keys; Alt + arrows move events in Timeline and Resources.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className="contents">
                <dt>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  )
}
