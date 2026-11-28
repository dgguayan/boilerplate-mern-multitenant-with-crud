import { useEffect, useMemo, useRef, useState } from "react"
import { DateTime } from "luxon"
import { LoaderCircle, Plus, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCalendar } from "./CalendarContext"
import { RecurrenceEditor, fieldClass } from "./RecurrenceEditor"
import { CATEGORY_COLORS } from "./ui"
import { allDayDate, fromInputs, fromJS, timeZones, toDateInput, toTimeInput, zoneLabel } from "./lib/dates"
import { STATUSES } from "./lib/filters"

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
const httpUrl = /^https?:\/\/[^\s]+$/i
const linkUrl = /^(https?:\/\/[^\s]+|\/(?!\/)\S*)$/i
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "PHP", "SGD", "CHF"]

function initialValues({ mode, prefill = {}, event, occurrence, prefs }) {
  const zone = event?.timeZone || prefs.timeZone
  let allDay
  let start
  let end
  if (mode === "edit") {
    allDay = Boolean(event.allDay)
    const s = allDay ? fromJS(occurrence.start, "utc") : fromJS(occurrence.start, zone)
    const e = allDay ? fromJS(occurrence.end, "utc").minus({ days: 1 }) : fromJS(occurrence.end, zone)
    start = s
    end = e
  } else if (prefill.start) {
    allDay = prefill.allDay ?? isDateOnly(prefill.start)
    if (allDay) {
      start = DateTime.fromISO(prefill.start.slice(0, 10), { zone })
      end = prefill.end ? DateTime.fromISO(prefill.end.slice(0, 10), { zone }).minus({ days: 1 }) : start
      if (end < start) end = start
    } else {
      start = DateTime.fromISO(prefill.start, { setZone: true }).setZone(zone)
      end = prefill.end ? DateTime.fromISO(prefill.end, { setZone: true }).setZone(zone) : start.plus({ hours: 1 })
    }
  } else {
    allDay = false
    start = DateTime.now().setZone(zone).plus({ hours: 1 }).startOf("hour")
    end = start.plus({ hours: 1 })
  }
  const timedStart = allDay ? start.set({ hour: 9 }) : start
  const timedEnd = allDay ? start.set({ hour: 10 }) : end

  const e = event || {}
  return {
    title: e.title || "",
    summary: e.summary || "",
    description: e.description || "",
    imageUrl: e.imageUrl || "",
    allDay,
    startDate: toDateInput(start),
    startTime: toTimeInput(timedStart),
    endDate: toDateInput(end),
    endTime: toTimeInput(timedEnd),
    timeZone: zone,
    recurrence: occurrence?.isOverride ? null : e.recurrence || null,
    exdates: e.exdates || [],
    categoryId: e.categoryId ? String(e.categoryId) : prefill.categoryId || "",
    useCustomColor: Boolean(e.color),
    color: e.color || CATEGORY_COLORS[0],
    status: e.status || "published",
    visibility: e.visibility || "restricted",
    location: { name: e.location?.name || "", address: e.location?.address || "", mapUrl: e.location?.mapUrl || "" },
    virtualUrl: e.virtualUrl || "",
    organizer: { name: e.organizer?.name || "", email: e.organizer?.email || "", phone: e.organizer?.phone || "", website: e.organizer?.website || "" },
    contact: { email: e.contact?.email || "", phone: e.contact?.phone || "" },
    capacity: e.capacity ?? "",
    registrationDeadline: e.registrationDeadline ? fromJS(e.registrationDeadline, zone).toFormat("yyyy-MM-dd'T'HH:mm") : "",
    priceAmount: e.price?.amount ?? "",
    currency: e.price?.currency || "USD",
    externalUrl: e.externalUrl || "",
    tags: (e.tags || []).join(", "),
    resourceIds: (e.resourceIds || prefill.resourceIds || []).map(String),
    attachments: e.attachments?.length ? e.attachments.map((a) => ({ ...a })) : [],
    customFields: e.customFields?.length ? e.customFields.map((f) => ({ ...f })) : [],
  }
}

function times(values) {
  if (values.allDay) {
    const endExclusive = DateTime.fromISO(values.endDate).plus({ days: 1 }).toISODate()
    return { start: allDayDate(values.startDate), end: allDayDate(endExclusive) }
  }
  return {
    start: fromInputs(values.startDate, values.startTime, values.timeZone),
    end: fromInputs(values.endDate, values.endTime, values.timeZone),
  }
}

function validate(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = "Enter a title."
  if (!values.startDate || !values.endDate) errors.time = "Choose a start and end date."
  else {
    const { start, end } = times(values)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.time = "Enter valid dates and times."
    else if (values.allDay ? values.endDate < values.startDate : end <= start) errors.time = "The event must end after it starts."
  }
  const urls = { virtualUrl: values.virtualUrl, externalUrl: values.externalUrl, mapUrl: values.location.mapUrl, website: values.organizer.website }
  for (const [key, value] of Object.entries(urls)) if (value && !httpUrl.test(value)) errors[key] = "Use a full web address starting with https://"
  if (values.imageUrl && !linkUrl.test(values.imageUrl)) errors.imageUrl = "Use a web address (https://…) or a site path (/images/…)."
  if (values.organizer.email && !emailRe.test(values.organizer.email)) errors.organizerEmail = "Enter a valid email address."
  if (values.contact.email && !emailRe.test(values.contact.email)) errors.contactEmail = "Enter a valid email address."
  if (values.capacity !== "" && !(Number.isInteger(Number(values.capacity)) && Number(values.capacity) >= 0)) errors.capacity = "Enter a whole number."
  if (values.priceAmount !== "" && !(Number(values.priceAmount) >= 0)) errors.price = "Enter a price of 0 or more."
  values.attachments.forEach((a, i) => {
    if ((a.name || a.url) && (!a.name.trim() || !linkUrl.test(a.url))) errors[`attachment${i}`] = "Each document needs a name and a link."
  })
  return errors
}

function toPayload(values) {
  const { start, end } = times(values)
  const zone = values.timeZone
  return {
    title: values.title.trim(),
    summary: values.summary.trim(),
    description: values.description.trim(),
    imageUrl: values.imageUrl.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: values.allDay,
    timeZone: zone,
    recurrence: values.recurrence,
    exdates: values.recurrence ? values.exdates : [],
    categoryId: values.categoryId || null,
    color: values.useCustomColor ? values.color : null,
    status: values.status,
    visibility: values.visibility,
    location: { name: values.location.name.trim(), address: values.location.address.trim(), mapUrl: values.location.mapUrl.trim() },
    virtualUrl: values.virtualUrl.trim(),
    organizer: { ...values.organizer },
    contact: { ...values.contact },
    capacity: values.capacity === "" ? null : Number(values.capacity),
    registrationDeadline: values.registrationDeadline ? DateTime.fromISO(values.registrationDeadline, { zone }).toISO() : null,
    price: values.priceAmount === "" ? null : { amount: Number(values.priceAmount), currency: values.currency },
    externalUrl: values.externalUrl.trim(),
    tags: [...new Set(values.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    resourceIds: values.resourceIds,
    attachments: values.attachments.filter((a) => a.name.trim() && a.url.trim()),
    customFields: values.customFields.filter((f) => f.label.trim()),
  }
}

const sameRule = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null)

function Field({ id, label, error, hint, children, className }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <fieldset className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

export function EventFormSheet() {
  const { form, closeForm, prefs, categories, resources, resourcesById, askScope, afterChange } = useCalendar()
  const open = Boolean(form)
  const [values, setValues] = useState(null)
  const [source, setSource] = useState(null) // full event being edited
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const titleRef = useRef(null)

  useEffect(() => {
    if (!form) return
    setErrors({})
    setConflicts([])
    setLoadError(null)
    if (form.mode === "create") {
      setSource(null)
      setValues(initialValues({ mode: "create", prefill: form.prefill, prefs }))
      return
    }
    setValues(null)
    let cancelled = false
    const id = form.occurrence.isOverride ? form.occurrence.eventId : form.occurrence.seriesId || form.occurrence.eventId
    calendarApi
      .getEvent(id)
      .then((res) => {
        if (cancelled) return
        const event = res.data.data.event
        setSource(event)
        setValues(initialValues({ mode: "edit", event, occurrence: form.occurrence, prefs }))
      })
      .catch((err) => !cancelled && setLoadError(calendarApi.errorMessage(err, "Couldn't load the event.")))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const set = (patch) => setValues((v) => ({ ...v, ...patch }))
  const setNested = (key, patch) => setValues((v) => ({ ...v, [key]: { ...v[key], ...patch } }))

  const startDT = useMemo(
    () => (values ? DateTime.fromISO(`${values.startDate}T${values.allDay ? "00:00" : values.startTime || "00:00"}`, { zone: values.allDay ? "utc" : values.timeZone }) : null),
    [values?.startDate, values?.startTime, values?.allDay, values?.timeZone] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Live resource-conflict check (warns; never blocks saving).
  const conflictKey = values && values.resourceIds.length ? JSON.stringify([values.startDate, values.startTime, values.endDate, values.endTime, values.allDay, values.timeZone, values.resourceIds]) : ""
  useEffect(() => {
    if (!conflictKey || !values) {
      setConflicts([])
      return
    }
    const { start, end } = times(values)
    if (!(start < end)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const occ = form?.occurrence
      calendarApi
        .checkConflicts(
          { start: start.toISOString(), end: end.toISOString(), resourceIds: values.resourceIds, excludeIds: [occ?.eventId, occ?.seriesId, occ?.id].filter(Boolean) },
          controller.signal
        )
        .then((res) => setConflicts(res.data.data.conflicts))
        .catch(() => {})
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictKey])

  const submit = async (event) => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      const first = document.querySelector("[aria-invalid='true']")
      first?.focus()
      return
    }
    const payload = toPayload(values)
    setSaving(true)
    try {
      let response
      if (form.mode === "create") {
        response = await calendarApi.createEvent(payload)
        afterChange("Event created", response)
      } else {
        const occ = form.occurrence
        if (occ.isOverride) {
          const { recurrence, exdates, ...data } = payload // eslint-disable-line no-unused-vars
          response = await calendarApi.updateEvent(occ.eventId, { scope: "all", data })
        } else if (occ.isRecurring) {
          const ruleChanged = !sameRule(values.recurrence, source.recurrence)
          const scope = await askScope("edit", { allowThis: !ruleChanged })
          if (!scope) {
            setSaving(false)
            return
          }
          let data = payload
          if (scope === "this") {
            const { recurrence, exdates, ...rest } = payload // eslint-disable-line no-unused-vars
            data = rest
          } else if (scope === "all") {
            // The form shows this occurrence's times; shift the series start by the same amount.
            const delta = new Date(payload.start) - new Date(occ.start)
            const seriesStart = new Date(new Date(source.start).getTime() + delta)
            const duration = new Date(payload.end) - new Date(payload.start)
            data = { ...payload, start: seriesStart.toISOString(), end: new Date(seriesStart.getTime() + duration).toISOString() }
          } else {
            const { exdates, ...rest } = payload // eslint-disable-line no-unused-vars
            data = rest
          }
          response = await calendarApi.updateEvent(occ.seriesId, { scope, occurrenceKey: occ.recurrenceKey, data })
        } else {
          response = await calendarApi.updateEvent(occ.eventId, { scope: "all", data: payload })
        }
        afterChange("Event updated", response)
      }
      closeForm()
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't save the event."))
    } finally {
      setSaving(false)
    }
  }

  const isOverride = form?.occurrence?.isOverride
  const invalid = (key) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {})

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !saving && closeForm()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setTimeout(() => titleRef.current?.focus(), 50)
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{form?.mode === "edit" ? "Edit event" : "New event"}</SheetTitle>
          <SheetDescription>
            {isOverride ? "You're editing one occurrence that was changed separately from its series." : "Fields marked * are required."}
          </SheetDescription>
        </SheetHeader>

        {loadError && <p role="alert" className="p-4 text-sm text-destructive">{loadError}</p>}
        {!values && !loadError && (
          <div className="flex flex-1 items-center justify-center" role="status">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading event…</span>
          </div>
        )}

        {values && (
          <form id="event-form" onSubmit={submit} noValidate className="flex-1 space-y-5 overflow-y-auto p-4">
            <Section title="Basics">
              <Field id="title" label="Title *" error={errors.title}>
                <input ref={titleRef} id="title" className={fieldClass} value={values.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} required {...invalid("title")} />
              </Field>
              <Field id="summary" label="Short description" hint="Shown in lists and previews.">
                <input id="summary" className={fieldClass} value={values.summary} maxLength={300} onChange={(e) => set({ summary: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="category" label="Category">
                  <select id="category" className={fieldClass} value={values.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="status" label="Status">
                  <select id="status" className={fieldClass} value={values.status} onChange={(e) => set({ status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="visibility" label="Visibility" hint={{ public: "May appear on public pages.", restricted: "Everyone in your workspace.", private: "Only you and administrators." }[values.visibility]}>
                  <select id="visibility" className={fieldClass} value={values.visibility} onChange={(e) => set({ visibility: e.target.value })}>
                    <option value="public">Public</option>
                    <option value="restricted">Members only</option>
                    <option value="private">Private</option>
                  </select>
                </Field>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={values.useCustomColor} onChange={(e) => set({ useCustomColor: e.target.checked })} />
                    Custom color
                  </label>
                  {values.useCustomColor && (
                    <div role="radiogroup" aria-label="Event color" className="flex flex-wrap gap-1.5">
                      {CATEGORY_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={values.color === c}
                          aria-label={c}
                          onClick={() => set({ color: c })}
                          className={cn("size-6 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-3 focus-visible:ring-ring/60", values.color === c && "ring-2 ring-foreground")}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section title="When">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={values.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
                All-day event
              </label>
              <div className="grid grid-cols-2 gap-3" aria-describedby={errors.time ? "time-error" : undefined}>
                <Field id="startDate" label="Starts *">
                  <input
                    id="startDate"
                    type="date"
                    className={fieldClass}
                    value={values.startDate}
                    onChange={(e) => {
                      const next = e.target.value
                      // Keep the duration when the start date moves.
                      const shift = DateTime.fromISO(next).diff(DateTime.fromISO(values.startDate), "days").days
                      const endDate = Number.isFinite(shift) ? DateTime.fromISO(values.endDate).plus({ days: shift }).toISODate() : values.endDate
                      set({ startDate: next, endDate: endDate || next })
                    }}
                    {...invalid("time")}
                  />
                </Field>
                {!values.allDay ? (
                  <Field id="startTime" label="Start time">
                    <input id="startTime" type="time" step={300} className={fieldClass} value={values.startTime} onChange={(e) => set({ startTime: e.target.value })} {...invalid("time")} />
                  </Field>
                ) : (
                  <div />
                )}
                <Field id="endDate" label="Ends *">
                  <input id="endDate" type="date" className={fieldClass} value={values.endDate} min={values.startDate} onChange={(e) => set({ endDate: e.target.value })} {...invalid("time")} />
                </Field>
                {!values.allDay && (
                  <Field id="endTime" label="End time">
                    <input id="endTime" type="time" step={300} className={fieldClass} value={values.endTime} onChange={(e) => set({ endTime: e.target.value })} {...invalid("time")} />
                  </Field>
                )}
              </div>
              {errors.time && (
                <p id="time-error" className="text-xs text-destructive">
                  {errors.time}
                </p>
              )}
              {!values.allDay && (
                <Field id="timeZone" label="Time zone">
                  <select id="timeZone" className={fieldClass} value={values.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>
                    {timeZones().map((z) => (
                      <option key={z} value={z}>
                        {zoneLabel(z)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {!isOverride && startDT?.isValid && (
                <RecurrenceEditor
                  rule={values.recurrence}
                  onChange={(recurrence) => set({ recurrence })}
                  start={startDT}
                  exdates={values.exdates}
                  onExdatesChange={(exdates) => set({ exdates })}
                />
              )}
            </Section>

            <Section title="Where">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="locName" label="Venue">
                  <input id="locName" className={fieldClass} value={values.location.name} maxLength={200} onChange={(e) => setNested("location", { name: e.target.value })} />
                </Field>
                <Field id="locAddress" label="Address">
                  <input id="locAddress" className={fieldClass} value={values.location.address} maxLength={300} autoComplete="street-address" onChange={(e) => setNested("location", { address: e.target.value })} />
                </Field>
              </div>
              <Field id="mapUrl" label="Map or directions link" hint="Leave empty to link the address to a map search." error={errors.mapUrl}>
                <input id="mapUrl" type="url" className={fieldClass} placeholder="https://" value={values.location.mapUrl} onChange={(e) => setNested("location", { mapUrl: e.target.value })} {...invalid("mapUrl")} />
              </Field>
              <Field id="virtualUrl" label="Online meeting link" hint="Google Meet, Microsoft Teams, Zoom or any other meeting link." error={errors.virtualUrl}>
                <input id="virtualUrl" type="url" className={fieldClass} placeholder="https://" value={values.virtualUrl} onChange={(e) => set({ virtualUrl: e.target.value })} {...invalid("virtualUrl")} />
              </Field>
            </Section>

            <Section title="Resources">
              {resources.length ? (
                <div role="group" aria-label="Book resources" className="grid gap-1.5 sm:grid-cols-2">
                  {resources.map((r) => (
                    <label key={r._id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={values.resourceIds.includes(r._id)}
                        onChange={(e) =>
                          set({ resourceIds: e.target.checked ? [...values.resourceIds, r._id] : values.resourceIds.filter((id) => id !== r._id) })
                        }
                      />
                      <span className="truncate">{r.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground capitalize">{r.type}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No rooms or equipment have been set up yet.</p>
              )}
              {conflicts.length > 0 && (
                <div role="status" className="flex gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Scheduling conflict</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {conflicts.slice(0, 5).map((c) => (
                        <li key={c.id}>
                          {c.title} · {c.resourceIds.map((id) => resourcesById.get(id)?.name).filter(Boolean).join(", ")} ·{" "}
                          {fromJS(c.start, prefs.timeZone).toFormat(prefs.hour12 ? "LLL d, h:mm a" : "LLL d, HH:mm")}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground">You can still save; the overlap will be shown on the calendar.</p>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Details">
              <Field id="description" label="Full description">
                <textarea id="description" rows={5} className={cn(fieldClass, "h-auto py-2")} maxLength={8000} value={values.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <Field id="imageUrl" label="Banner image link" error={errors.imageUrl}>
                <input id="imageUrl" className={fieldClass} placeholder="https:// or /images/…" value={values.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} {...invalid("imageUrl")} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="capacity" label="Capacity" error={errors.capacity}>
                  <input id="capacity" type="number" min={0} inputMode="numeric" className={fieldClass} value={values.capacity} onChange={(e) => set({ capacity: e.target.value })} {...invalid("capacity")} />
                </Field>
                <Field id="price" label="Price" hint="0 for a free event." error={errors.price}>
                  <input id="price" type="number" min={0} step="0.01" inputMode="decimal" className={fieldClass} value={values.priceAmount} onChange={(e) => set({ priceAmount: e.target.value })} {...invalid("price")} />
                </Field>
                <Field id="currency" label="Currency">
                  <select id="currency" className={fieldClass} value={values.currency} onChange={(e) => set({ currency: e.target.value })}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field id="deadline" label="Registration deadline">
                <input id="deadline" type="datetime-local" className={fieldClass} value={values.registrationDeadline} onChange={(e) => set({ registrationDeadline: e.target.value })} />
              </Field>
              <Field id="externalUrl" label="Event website" error={errors.externalUrl}>
                <input id="externalUrl" type="url" className={fieldClass} placeholder="https://" value={values.externalUrl} onChange={(e) => set({ externalUrl: e.target.value })} {...invalid("externalUrl")} />
              </Field>
              <Field id="tags" label="Tags" hint="Separate tags with commas.">
                <input id="tags" className={fieldClass} value={values.tags} onChange={(e) => set({ tags: e.target.value })} />
              </Field>
            </Section>

            <Section title="Organizer and contact">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="orgName" label="Organizer">
                  <input id="orgName" className={fieldClass} value={values.organizer.name} onChange={(e) => setNested("organizer", { name: e.target.value })} />
                </Field>
                <Field id="orgEmail" label="Organizer email" error={errors.organizerEmail}>
                  <input id="orgEmail" type="email" className={fieldClass} value={values.organizer.email} onChange={(e) => setNested("organizer", { email: e.target.value })} {...invalid("organizerEmail")} />
                </Field>
                <Field id="orgPhone" label="Organizer phone">
                  <input id="orgPhone" type="tel" className={fieldClass} value={values.organizer.phone} onChange={(e) => setNested("organizer", { phone: e.target.value })} />
                </Field>
                <Field id="orgWebsite" label="Organizer website" error={errors.website}>
                  <input id="orgWebsite" type="url" className={fieldClass} placeholder="https://" value={values.organizer.website} onChange={(e) => setNested("organizer", { website: e.target.value })} {...invalid("website")} />
                </Field>
                <Field id="contactEmail" label="Contact email" error={errors.contactEmail}>
                  <input id="contactEmail" type="email" className={fieldClass} value={values.contact.email} onChange={(e) => setNested("contact", { email: e.target.value })} {...invalid("contactEmail")} />
                </Field>
                <Field id="contactPhone" label="Contact phone">
                  <input id="contactPhone" type="tel" className={fieldClass} value={values.contact.phone} onChange={(e) => setNested("contact", { phone: e.target.value })} />
                </Field>
              </div>
            </Section>

            <Section title="Documents">
              {values.attachments.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <input aria-label={`Document ${i + 1} name`} placeholder="Name" className={fieldClass} value={a.name} onChange={(e) => set({ attachments: values.attachments.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input aria-label={`Document ${i + 1} link`} placeholder="https:// or /docs/…" className={fieldClass} value={a.url} onChange={(e) => set({ attachments: values.attachments.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} {...(errors[`attachment${i}`] ? { "aria-invalid": true } : {})} />
                    {errors[`attachment${i}`] && <p className="text-xs text-destructive sm:col-span-2">{errors[`attachment${i}`]}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove document ${i + 1}`} onClick={() => set({ attachments: values.attachments.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              {values.attachments.length < 20 && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ attachments: [...values.attachments, { name: "", url: "" }] })}>
                  <Plus data-icon="inline-start" />
                  Add document link
                </Button>
              )}
            </Section>

            <Section title="Custom fields">
              {values.customFields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input aria-label={`Field ${i + 1} label`} placeholder="Label" className={cn(fieldClass, "w-2/5")} value={f.label} maxLength={60} onChange={(e) => set({ customFields: values.customFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input aria-label={`Field ${i + 1} value`} placeholder="Value" className={fieldClass} value={f.value} maxLength={500} onChange={(e) => set({ customFields: values.customFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove field ${i + 1}`} onClick={() => set({ customFields: values.customFields.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              {values.customFields.length < 20 && (
                <Button type="button" variant="outline" size="sm" onClick={() => set({ customFields: [...values.customFields, { label: "", value: "" }] })}>
                  <Plus data-icon="inline-start" />
                  Add field
                </Button>
              )}
            </Section>
          </form>
        )}

        <SheetFooter className="flex-row justify-end border-t bg-background/80 backdrop-blur-sm">
          <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" disabled={!values || saving}>
            {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
            {form?.mode === "edit" ? "Save changes" : "Create event"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
