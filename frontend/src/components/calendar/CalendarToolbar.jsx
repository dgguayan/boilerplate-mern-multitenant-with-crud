import { useState } from "react"
import { DateTime, Info } from "luxon"
import {
  CalendarSearch,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileDown,
  Keyboard,
  LayoutGrid,
  ListFilter,
  LoaderCircle,
  PanelLeft,
  Plus,
  Redo2,
  Search,
  Settings2,
  Shapes,
  Share2,
  Undo2,
  Warehouse,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCalendar } from "./CalendarContext"
import { MiniCalendar } from "./MiniCalendar"
import { fieldClass } from "./RecurrenceEditor"
import { VIEWS } from "./lib/prefs"

const QUICK_VIEWS = ["day", "week", "month"]

function JumpToDate({ date, onSelect }) {
  const { prefs } = useCalendar()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(date.startOf("month"))
  const years = Array.from({ length: 21 }, (_, i) => date.year - 10 + i)
  const pick = (d) => {
    onSelect(d)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={(next) => (setOpen(next), next && setMonth(date.startOf("month")))}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Jump to date" title="Jump to date">
          <CalendarSearch />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-76">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="jump-month">
            Month
          </label>
          <select id="jump-month" className={fieldClass} value={month.month} onChange={(e) => setMonth(month.set({ month: Number(e.target.value) }))}>
            {Info.months("long").map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="jump-year">
            Year
          </label>
          <select id="jump-year" className={fieldClass} value={month.year} onChange={(e) => setMonth(month.set({ year: Number(e.target.value) }))}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
        <MiniCalendar value={date} month={month} onMonthChange={setMonth} onSelect={pick} zone={prefs.timeZone} firstDay={prefs.firstDay} weekNumbers={prefs.weekNumbers} />
        <form
          className="mt-2 flex gap-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const value = new FormData(e.currentTarget).get("jump")
            const d = DateTime.fromISO(String(value), { zone: prefs.timeZone })
            if (d.isValid) pick(d)
          }}
        >
          <label htmlFor="jump-date" className="sr-only">
            Date
          </label>
          <input id="jump-date" name="jump" type="date" className={fieldClass} defaultValue={date.toISODate()} />
          <Button type="submit" size="sm" className="h-9">
            Go
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export function CalendarToolbar({
  view,
  onViewChange,
  date,
  onDateChange,
  title,
  onStep,
  onToday,
  query,
  onQueryChange,
  searchRef,
  sidebarOpen,
  onToggleSidebar,
  onOpenFilters,
  activeFilterCount,
  refreshing,
  onOpenDialog,
}) {
  const { permissions, openCreate, undo } = useCalendar()
  const currentView = VIEWS.find((v) => v.value === view)
  const groups = [...new Set(VIEWS.map((v) => v.group))]

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-2 border-b bg-background/75 px-3 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/60 sm:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-pressed={sidebarOpen} onClick={onToggleSidebar}>
          <PanelLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="ghost" size="icon" aria-label="Previous period" onClick={() => onStep(-1)} disabled={view === "upcoming"}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next period" onClick={() => onStep(1)} disabled={view === "upcoming"}>
          <ChevronRight />
        </Button>
        <JumpToDate date={date} onSelect={onDateChange} />
        <h2 className="ml-1 truncate text-base font-semibold tracking-tight sm:text-lg" aria-live="polite">
          {title}
        </h2>
        {refreshing && <LoaderCircle className="ml-1 size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Updating" />}
      </div>

      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        <div className="relative order-last w-full sm:order-none sm:w-52">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="cal-search" className="sr-only">
            Search events
          </label>
          <input
            ref={searchRef}
            id="cal-search"
            type="search"
            placeholder="Search events  /"
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className={cn(fieldClass, "h-8 pl-8")}
          />
        </div>

        <div className="hidden items-center rounded-lg border p-0.5 xl:flex" role="group" aria-label="Quick views">
          {QUICK_VIEWS.map((v) => (
            <Button key={v} variant={view === v ? "secondary" : "ghost"} size="xs" aria-pressed={view === v} onClick={() => onViewChange(v)} className="px-2.5">
              {VIEWS.find((x) => x.value === v).label}
            </Button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label={`View: ${currentView.label}. Change view`}>
              <LayoutGrid data-icon="inline-start" />
              {currentView.label}
              <ChevronDown className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup value={view} onValueChange={onViewChange}>
              {groups.map((group, i) => (
                <DropdownMenuGroup key={group}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{group}</DropdownMenuLabel>
                  {VIEWS.filter((v) => v.group === group).map((v) => (
                    <DropdownMenuRadioItem key={v.value} value={v.value}>
                      {v.label}
                      <DropdownMenuShortcut>{v.key.toUpperCase()}</DropdownMenuShortcut>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" className="lg:hidden" onClick={onOpenFilters}>
          <ListFilter data-icon="inline-start" />
          Filters
          {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground tabular-nums">{activeFilterCount}</span>}
        </Button>

        {permissions.canCreate && (
          <>
            <Button variant="ghost" size="icon" aria-label={undo.canUndo ? `Undo: ${undo.undoLabel}` : "Undo"} title="Undo (Ctrl+Z)" disabled={!undo.canUndo} onClick={undo.run}>
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" aria-label={undo.canRedo ? `Redo: ${undo.redoLabel}` : "Redo"} title="Redo (Ctrl+Shift+Z)" disabled={!undo.canRedo} onClick={undo.runRedo}>
              <Redo2 />
            </Button>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More calendar options">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => onOpenDialog("importExport")}>
              <FileDown />
              Import and export
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenDialog("share")}>
              <Share2 />
              Share and embed
            </DropdownMenuItem>
            {permissions.isAdmin && (
              <>
                <DropdownMenuItem onSelect={() => onOpenDialog("categories")}>
                  <Shapes />
                  Manage categories
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenDialog("resources")}>
                  <Warehouse />
                  Manage resources
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={() => onOpenDialog("settings")}>
              <Settings2 />
              Calendar settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenDialog("shortcuts")}>
              <Keyboard />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {permissions.canCreate && (
          <Button size="sm" onClick={() => openCreate()}>
            <Plus data-icon="inline-start" />
            <span className="hidden sm:inline">New event</span>
            <span className="sr-only sm:hidden">New event</span>
          </Button>
        )}
      </div>
    </div>
  )
}
