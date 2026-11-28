import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import listPlugin from "@fullcalendar/list"
import multiMonthPlugin from "@fullcalendar/multimonth"
import interactionPlugin from "@fullcalendar/interaction"
import luxonPlugin from "@fullcalendar/luxon3"
import { Repeat } from "lucide-react"

import { useCalendar } from "../CalendarContext"
import { EventPreview } from "../EventPreview"
import { CategoryIcon, STATUS_META, eventColor } from "../ui"
import { timeState, toJsDay } from "../lib/dates"
import "../calendar.css"

const FC_VIEW = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  workWeek: "timeGridWorkWeek",
  day: "timeGridDay",
  agenda: "listMonth",
  multiMonth: "multiMonthThree",
}

const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin, luxonPlugin]
const coarsePointer = () => window.matchMedia?.("(pointer: coarse)").matches

/** FullCalendar for the grid and list views, wired to the shared calendar actions. */
export default function FullCalendarView({ view, date, occurrences, onNavigateDay, onSwipe }) {
  const { prefs, categoriesById, permissions, openDetails, openCreate, moveOccurrence } = useCalendar()
  const ref = useRef(null)
  const [preview, setPreview] = useState(null)
  const hideTimer = useRef(0)
  const isoDate = date.toISODate()

  // Drive FullCalendar from the page's view and date (its own header is turned off).
  useEffect(() => {
    const api = ref.current?.getApi()
    if (!api) return
    if (api.view.type !== FC_VIEW[view]) api.changeView(FC_VIEW[view], isoDate)
    else api.gotoDate(isoDate)
  }, [view, isoDate])

  const events = useMemo(
    () =>
      occurrences.map((o) => {
        const color = eventColor(o, categoriesById)
        return {
          id: o.id,
          title: o.title,
          // All-day dates are floating: pass plain dates so every zone shows the same days.
          start: o.allDay ? o.start.slice(0, 10) : o.start,
          end: o.allDay ? o.end.slice(0, 10) : o.end,
          allDay: o.allDay,
          editable: o.canEdit && o.status !== "archived",
          backgroundColor: `color-mix(in oklch, ${color} 16%, var(--background))`,
          borderColor: color,
          textColor: "var(--foreground)",
          classNames: [`cal-${timeState(o)}`, `cal-status-${o.status}`],
          extendedProps: { occurrence: o },
        }
      }),
    [occurrences, categoriesById]
  )

  const showPreview = (occurrence, el) => {
    clearTimeout(hideTimer.current)
    setPreview({ occurrence, rect: el.getBoundingClientRect() })
  }
  const hidePreview = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setPreview(null), 80)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const commitChange = async (info) => {
    setPreview(null)
    const occurrence = info.event.extendedProps.occurrence
    const allDay = info.event.allDay
    let start = info.event.startStr
    let end = info.event.endStr
    if (!end) {
      const zone = allDay ? "utc" : prefs.timeZone
      const s = DateTime.fromISO(start, { zone })
      end = (allDay ? s.plus({ days: 1 }).toISODate() : s.plus({ hours: 1 }).toISO())
    }
    const ok = await moveOccurrence(occurrence, { start, end, allDay }, info.type === "eventResize" ? "Event duration changed" : "Event rescheduled")
    if (!ok) info.revert()
  }

  const workingJsDays = prefs.workingDays.map(toJsDay)
  const hiddenDays = view === "workWeek" ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !workingJsDays.includes(d)) : []
  const timeFormat = { hour: "numeric", minute: "2-digit", meridiem: prefs.hour12 ? "short" : false, hour12: prefs.hour12 }
  const compactTime = { hour: "numeric", minute: "2-digit", omitZeroMinute: true, meridiem: prefs.hour12 ? "narrow" : false, hour12: prefs.hour12 }
  const scrollHour = Math.max(0, parseInt(prefs.businessHours.start, 10) - 1)

  // Horizontal swipes change the period on touch screens (FullCalendar drags need a long press).
  const touch = useRef(null)
  const onTouchStart = (e) => {
    if (e.touches.length === 1) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
  }
  const onTouchEnd = (e) => {
    const start = touch.current
    touch.current = null
    if (!start || !onSwipe || document.querySelector(".fc-event-mirror")) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - start.t < 600) onSwipe(dx < 0 ? 1 : -1)
  }

  return (
    <div className="cal-fc h-full min-h-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <FullCalendar
        ref={ref}
        plugins={PLUGINS}
        initialView={FC_VIEW[view]}
        initialDate={isoDate}
        headerToolbar={false}
        timeZone={prefs.timeZone}
        firstDay={toJsDay(prefs.firstDay)}
        weekNumbers={prefs.weekNumbers}
        weekNumberCalculation="ISO"
        weekText="W"
        hiddenDays={hiddenDays}
        businessHours={{ daysOfWeek: workingJsDays, startTime: prefs.businessHours.start, endTime: prefs.businessHours.end }}
        slotDuration={{ minutes: prefs.slotMinutes }}
        scrollTime={`${String(scrollHour).padStart(2, "0")}:00:00`}
        scrollTimeReset={false}
        slotLabelFormat={timeFormat}
        eventTimeFormat={timeFormat}
        nowIndicator
        height={view === "agenda" || view === "multiMonth" ? "auto" : "100%"}
        expandRows
        dayMaxEvents
        moreLinkContent={(arg) => `+${arg.num} more`}
        moreLinkHint={(num) => `Show ${num} more events`}
        eventDisplay="block"
        displayEventEnd
        eventInteractive
        navLinks
        navLinkHint="Go to $0"
        navLinkDayClick={(day) => onNavigateDay(DateTime.fromJSDate(day, { zone: prefs.timeZone }))}
        views={{
          // Month grids show a compact start time ("9:15a") so the title stays readable.
          dayGridMonth: { displayEventEnd: false, eventTimeFormat: compactTime },
          timeGridWorkWeek: { type: "timeGrid", duration: { weeks: 1 } },
          multiMonthThree: { type: "multiMonth", duration: { months: 3 }, multiMonthMaxColumns: 3, multiMonthMinWidth: 260, displayEventEnd: false, eventTimeFormat: compactTime },
          listMonth: { noEventsContent: "No events this month" },
        }}
        events={events}
        selectable={permissions.canCreate}
        selectMirror
        selectLongPressDelay={300}
        eventLongPressDelay={350}
        unselectAuto
        select={(info) => {
          openCreate({ start: info.startStr, end: info.endStr, allDay: info.allDay })
          info.view.calendar.unselect()
        }}
        dateClick={(info) => {
          // On touch screens a tap creates an event; with a mouse, click-and-drag (select) does.
          if (permissions.canCreate && coarsePointer()) openCreate({ start: info.dateStr, allDay: info.allDay })
        }}
        eventClick={(info) => {
          info.jsEvent.preventDefault()
          setPreview(null)
          openDetails(info.event.extendedProps.occurrence)
        }}
        eventDrop={commitChange}
        eventResize={commitChange}
        eventMouseEnter={(info) => !coarsePointer() && showPreview(info.event.extendedProps.occurrence, info.el)}
        eventMouseLeave={hidePreview}
        eventDragStart={() => setPreview(null)}
        eventResizeStart={() => setPreview(null)}
        eventDidMount={(info) => {
          const o = info.event.extendedProps.occurrence
          const category = categoriesById.get(o.categoryId)
          const label = [
            o.title,
            info.timeText || (o.allDay ? "All day" : ""),
            category?.name,
            o.status !== "published" ? STATUS_META[o.status]?.label : null,
            o.isRecurring ? "Recurring" : null,
            timeState(o) === "past" ? "Past event" : timeState(o) === "ongoing" ? "Happening now" : null,
          ]
            .filter(Boolean)
            .join(", ")
          info.el.setAttribute("aria-label", label)
          const onFocus = () => showPreview(o, info.el)
          info.el.addEventListener("focus", onFocus)
          info.el.addEventListener("blur", hidePreview)
          info.el._calCleanup = () => {
            info.el.removeEventListener("focus", onFocus)
            info.el.removeEventListener("blur", hidePreview)
          }
        }}
        eventWillUnmount={(info) => info.el._calCleanup?.()}
        eventContent={(arg) => <EventContent arg={arg} categoriesById={categoriesById} />}
      />
      {preview && <EventPreview occurrence={preview.occurrence} anchorRect={preview.rect} />}
    </div>
  )
}

function EventContent({ arg, categoriesById }) {
  const o = arg.event.extendedProps.occurrence
  const category = categoriesById.get(o.categoryId)
  const status = o.status !== "published" ? STATUS_META[o.status] : null
  const isList = arg.view.type.startsWith("list")
  const isTimeGrid = arg.view.type.startsWith("timeGrid") && !arg.event.allDay
  const icon = (
    <span className="shrink-0" style={{ color: arg.borderColor }}>
      <CategoryIcon category={category} className="size-3" />
    </span>
  )

  // Tall blocks in the time grid: title first, then time and status.
  if (isTimeGrid) {
    return (
      <div className="cal-ev flex h-full flex-col overflow-hidden px-1 py-0.5">
        <div className="flex min-w-0 items-center gap-1">
          {icon}
          <span className="cal-title min-w-0 flex-1 truncate font-medium">{arg.event.title}</span>
          {o.isRecurring && <Repeat className="size-3 shrink-0 opacity-60" aria-hidden="true" />}
        </div>
        {arg.timeText && <span className="truncate text-[0.7rem] tabular-nums opacity-80">{arg.timeText}</span>}
        {status && (
          <span className="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold tracking-wide uppercase opacity-80">
            <status.icon className="size-2.5" aria-hidden="true" />
            {status.label}
          </span>
        )}
      </div>
    )
  }

  // One-line chips (month, multi-month, all-day row, agenda): the title gets the space.
  return (
    <div className="cal-ev flex w-full min-w-0 items-center gap-1 overflow-hidden px-1">
      {icon}
      {!isList && arg.timeText && !arg.event.allDay && (
        <span className="hidden shrink-0 text-[0.7rem] tabular-nums opacity-75 sm:inline">{arg.timeText}</span>
      )}
      <span className="cal-title min-w-0 flex-1 truncate font-medium">{arg.event.title}</span>
      {status &&
        (isList ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.65rem] font-semibold tracking-wide uppercase opacity-80">
            <status.icon className="size-2.5" aria-hidden="true" />
            {status.label}
          </span>
        ) : (
          <status.icon className="size-3 shrink-0 opacity-80" aria-hidden="true" />
        ))}
      {o.isRecurring && !isList && <Repeat className="hidden size-3 shrink-0 opacity-50 sm:block" aria-hidden="true" />}
    </div>
  )
}
