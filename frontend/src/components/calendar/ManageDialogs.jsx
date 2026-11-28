import { useEffect, useRef, useState } from "react"
import { DateTime } from "luxon"
import { Download, FileUp, LoaderCircle, Pencil, Plus, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCalendar } from "./CalendarContext"
import { fieldClass } from "./RecurrenceEditor"
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from "./ui"
import { WEEKDAYS, timeZones, zoneLabel } from "./lib/dates"
import { VIEWS } from "./lib/prefs"

/* -------------------------------------------------------------------------- */
/*                                 Categories                                 */
/* -------------------------------------------------------------------------- */

const EMPTY_CATEGORY = { name: "", color: CATEGORY_COLORS[0], icon: "calendar", description: "", visibility: "restricted" }

export function CategoryManager({ open, onOpenChange }) {
  const { categories, reload, confirm } = useCalendar()
  const [editing, setEditing] = useState(null) // null | 'new' | category
  const [values, setValues] = useState(EMPTY_CATEGORY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  const startEdit = (category) => {
    setEditing(category || "new")
    setError(null)
    setValues(category ? { name: category.name, color: category.color, icon: category.icon, description: category.description || "", visibility: category.visibility } : EMPTY_CATEGORY)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!values.name.trim()) return setError("Enter a name.")
    setSaving(true)
    try {
      await calendarApi.saveCategory(editing === "new" ? null : editing._id, { ...values, name: values.name.trim() })
      await reload({ taxonomy: true })
      toast.success(editing === "new" ? "Category added" : "Category updated")
      setEditing(null)
    } catch (err) {
      setError(calendarApi.errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (category) => {
    const ok = await confirm({
      title: `Delete the “${category.name}” category?`,
      description: "Its events stay on the calendar without a category.",
      confirmLabel: "Delete category",
      destructive: true,
    })
    if (!ok) return
    try {
      await calendarApi.deleteCategory(category._id)
      await reload({ taxonomy: true })
      toast.success("Category deleted")
    } catch (err) {
      toast.error(calendarApi.errorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Event categories</DialogTitle>
          <DialogDescription>Categories color-code events and power the legend and filters.</DialogDescription>
        </DialogHeader>
        {editing ? (
          <form onSubmit={save} className="space-y-3" noValidate>
            <div>
              <label htmlFor="cat-name" className="mb-1 block text-sm font-medium">
                Name *
              </label>
              <input id="cat-name" className={fieldClass} value={values.name} maxLength={60} autoFocus onChange={(e) => setValues({ ...values, name: e.target.value })} aria-invalid={Boolean(error) || undefined} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium" id="cat-color-label">
                Color
              </p>
              <div role="radiogroup" aria-labelledby="cat-color-label" className="flex flex-wrap items-center gap-1.5">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={values.color === c}
                    aria-label={c}
                    onClick={() => setValues({ ...values, color: c })}
                    className={cn("size-7 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-3 focus-visible:ring-ring/60", values.color === c && "ring-2 ring-foreground")}
                    style={{ background: c }}
                  />
                ))}
                <label className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Custom
                  <input type="color" value={values.color} onChange={(e) => setValues({ ...values, color: e.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                </label>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium" id="cat-icon-label">
                Icon
              </p>
              <div role="radiogroup" aria-labelledby="cat-icon-label" className="grid grid-cols-8 gap-1">
                {Object.keys(CATEGORY_ICONS).map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    role="radio"
                    aria-checked={values.icon === icon}
                    aria-label={icon.replace(/-/g, " ")}
                    onClick={() => setValues({ ...values, icon })}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      values.icon === icon && "border-foreground bg-muted"
                    )}
                  >
                    <CategoryIcon category={{ icon }} className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="cat-desc" className="mb-1 block text-sm font-medium">
                Description
              </label>
              <input id="cat-desc" className={fieldClass} value={values.description} maxLength={300} onChange={(e) => setValues({ ...values, description: e.target.value })} />
            </div>
            <div>
              <label htmlFor="cat-vis" className="mb-1 block text-sm font-medium">
                Visibility
              </label>
              <select id="cat-vis" className={fieldClass} value={values.visibility} onChange={(e) => setValues({ ...values, visibility: e.target.value })}>
                <option value="public">Public — may appear on public pages</option>
                <option value="restricted">Members — everyone in the workspace</option>
                <option value="private">Private — administrators only</option>
              </select>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Back
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                Save category
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {categories.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No categories yet.</li>}
              {categories.map((c) => (
                <li key={c._id} className="flex items-center gap-3 p-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklch, ${c.color} 18%, transparent)`, color: c.color }}>
                    <CategoryIcon category={c} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{{ public: "Public", restricted: "Members", private: "Private" }[c.visibility]}{c.description ? ` · ${c.description}` : ""}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => startEdit(c)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => startEdit(null)}>
                <Plus data-icon="inline-start" />
                Add category
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Resources                                 */
/* -------------------------------------------------------------------------- */

const RESOURCE_TYPES = ["room", "equipment", "person", "vehicle", "other"]
const EMPTY_RESOURCE = { name: "", type: "room", capacity: "", color: CATEGORY_COLORS[7], description: "", exclusive: false }

export function ResourceManager({ open, onOpenChange }) {
  const { resources, reload, confirm } = useCalendar()
  const [editing, setEditing] = useState(null)
  const [values, setValues] = useState(EMPTY_RESOURCE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  const startEdit = (resource) => {
    setEditing(resource || "new")
    setError(null)
    setValues(resource ? { name: resource.name, type: resource.type, capacity: resource.capacity ?? "", color: resource.color || CATEGORY_COLORS[7], description: resource.description || "", exclusive: Boolean(resource.exclusive) } : EMPTY_RESOURCE)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!values.name.trim()) return setError("Enter a name.")
    setSaving(true)
    try {
      await calendarApi.saveResource(editing === "new" ? null : editing._id, {
        ...values,
        name: values.name.trim(),
        capacity: values.capacity === "" ? null : Number(values.capacity),
      })
      await reload({ taxonomy: true })
      toast.success(editing === "new" ? "Resource added" : "Resource updated")
      setEditing(null)
    } catch (err) {
      setError(calendarApi.errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (resource) => {
    const ok = await confirm({
      title: `Delete “${resource.name}”?`,
      description: "Events booked on it keep their other details.",
      confirmLabel: "Delete resource",
      destructive: true,
    })
    if (!ok) return
    try {
      await calendarApi.deleteResource(resource._id)
      await reload({ taxonomy: true })
      toast.success("Resource deleted")
    } catch (err) {
      toast.error(calendarApi.errorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rooms and resources</DialogTitle>
          <DialogDescription>Resources can be booked on events and appear in the Resources view. Double-bookings are flagged, or refused for resources that can't be shared.</DialogDescription>
        </DialogHeader>
        {editing ? (
          <form onSubmit={save} className="space-y-3" noValidate>
            <div>
              <label htmlFor="res-name" className="mb-1 block text-sm font-medium">
                Name *
              </label>
              <input id="res-name" className={fieldClass} value={values.name} maxLength={80} autoFocus onChange={(e) => setValues({ ...values, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="res-type" className="mb-1 block text-sm font-medium">
                  Type
                </label>
                <select id="res-type" className={cn(fieldClass, "capitalize")} value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}>
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="res-cap" className="mb-1 block text-sm font-medium">
                  Capacity
                </label>
                <input id="res-cap" type="number" min={0} className={fieldClass} value={values.capacity} onChange={(e) => setValues({ ...values, capacity: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="res-desc" className="mb-1 block text-sm font-medium">
                Description
              </label>
              <input id="res-desc" className={fieldClass} value={values.description} maxLength={300} onChange={(e) => setValues({ ...values, description: e.target.value })} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={values.exclusive} onChange={(e) => setValues({ ...values, exclusive: e.target.checked })} aria-describedby="res-exclusive-hint" />
              <span>
                <span className="font-medium">Prevent double booking</span>
                <span id="res-exclusive-hint" className="block text-xs text-muted-foreground">
                  An event that overlaps another booking of this resource can't be saved. Off: overlaps are allowed and flagged.
                </span>
              </span>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Back
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                Save resource
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {resources.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No resources yet.</li>}
              {resources.map((r) => (
                <li key={r._id} className="flex items-center gap-3 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground capitalize">
                      {r.type}
                      {r.capacity != null ? ` · capacity ${r.capacity}` : ""}
                      {r.exclusive ? " · no double booking" : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => startEdit(r)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} onClick={() => remove(r)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => startEdit(null)}>
                <Plus data-icon="inline-start" />
                Add resource
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                               Import / export                              */
/* -------------------------------------------------------------------------- */

export function ImportExportDialog({ open, onOpenChange, defaultRange }) {
  const { prefs, permissions, undo, reload } = useCalendar()
  const [format, setFormat] = useState("ics")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [importZone, setImportZone] = useState(prefs.timeZone)
  const fileRef = useRef(null)

  useEffect(() => {
    if (open) {
      setFrom(defaultRange.start.toISODate())
      setTo(defaultRange.end.minus({ days: 1 }).toISODate())
      setResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const doExport = async () => {
    setBusy("export")
    try {
      const start = DateTime.fromISO(from, { zone: prefs.timeZone }).startOf("day")
      const end = DateTime.fromISO(to, { zone: prefs.timeZone }).plus({ days: 1 }).startOf("day")
      const response = await calendarApi.exportCalendar({ format, start: start.toUTC().toISO(), end: end.toUTC().toISO() })
      calendarApi.saveBlob(response, `calendar.${format}`)
    } catch (err) {
      let message = calendarApi.errorMessage(err, "Export failed.")
      if (err?.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await err.response.data.text()).message || message
        } catch {
          /* keep the generic message */
        }
      }
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const doImport = async (file) => {
    if (!file) return
    const ext = file.name.split(".").pop().toLowerCase()
    if (!["ics", "csv"].includes(ext)) {
      toast.error("Choose an .ics or .csv file.")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("The file is larger than 2 MB.")
      return
    }
    setBusy("import")
    setResult(null)
    try {
      const response = await calendarApi.importCalendar({ format: ext, timeZone: importZone, text: await file.text() })
      const data = response.data.data
      setResult(data)
      undo.push(`Imported ${data.created} event${data.created === 1 ? "" : "s"}`, data.changes)
      reload()
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Import failed."))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import and export</DialogTitle>
          <DialogDescription>Exchange events with Google Calendar, Outlook, Apple Calendar or spreadsheets.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="export-title" className="space-y-3">
          <h3 id="export-title" className="text-sm font-medium">
            Export
          </h3>
          <div role="radiogroup" aria-label="Format" className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="fmt" checked={format === "ics"} onChange={() => setFormat("ics")} />
              iCalendar (.ics)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="fmt" checked={format === "csv"} onChange={() => setFormat("csv")} />
              Spreadsheet (.csv)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp-from" className="mb-1 block text-xs text-muted-foreground">
                From
              </label>
              <input id="exp-from" type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label htmlFor="exp-to" className="mb-1 block text-xs text-muted-foreground">
                To
              </label>
              <input id="exp-to" type="date" className={fieldClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <Button onClick={doExport} disabled={!from || !to || to < from || busy === "export"}>
            {busy === "export" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            Download {format.toUpperCase()}
          </Button>
        </section>

        {permissions.canCreate && (
          <section aria-labelledby="import-title" className="space-y-3 border-t pt-4">
            <h3 id="import-title" className="text-sm font-medium">
              Import
            </h3>
            <p className="text-xs text-muted-foreground">
              .ics files from any calendar app, or .csv with at least Title and Start columns (the export format). Events already imported are skipped.
            </p>
            <div>
              <label htmlFor="imp-zone" className="mb-1 block text-xs text-muted-foreground">
                Time zone for times without one
              </label>
              <select id="imp-zone" className={fieldClass} value={importZone} onChange={(e) => setImportZone(e.target.value)}>
                {timeZones().map((z) => (
                  <option key={z} value={z}>
                    {zoneLabel(z)}
                  </option>
                ))}
              </select>
            </div>
            <input ref={fileRef} id="imp-file" type="file" accept=".ics,.csv,text/calendar,text/csv" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "import"}>
              {busy === "import" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <FileUp data-icon="inline-start" />}
              Choose file…
            </Button>
            {result && (
              <div role="status" className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  {result.created} imported · {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped · {result.skipped} not imported
                </p>
                {result.warnings.length > 0 && (
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-muted-foreground">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                {result.created > 0 && (
                  <Button size="sm" variant="ghost" className="-ml-2" onClick={() => undo.run().then(() => setResult(null))} disabled={!undo.canUndo}>
                    <Undo2 data-icon="inline-start" />
                    Undo import
                  </Button>
                )}
              </div>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

export function SettingsDialog({ open, onOpenChange }) {
  const { prefs, setPrefs } = useCalendar()
  const set = (patch) => setPrefs({ ...prefs, ...patch })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Calendar settings</DialogTitle>
          <DialogDescription>Saved in this browser for your account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-first" className="mb-1 block text-sm font-medium">
                Week starts on
              </label>
              <select id="set-first" className={fieldClass} value={prefs.firstDay} onChange={(e) => set({ firstDay: Number(e.target.value) })}>
                {WEEKDAYS.map((d) => (
                  <option key={d.iso} value={d.iso}>
                    {d.long}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="set-view" className="mb-1 block text-sm font-medium">
                Default view
              </label>
              <select id="set-view" className={fieldClass} value={prefs.defaultView} onChange={(e) => set({ defaultView: e.target.value })}>
                {VIEWS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Working days</legend>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = prefs.workingDays.includes(d.iso)
                return (
                  <Button
                    key={d.iso}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    aria-label={d.long}
                    className="w-11"
                    onClick={() => {
                      const days = on ? prefs.workingDays.filter((x) => x !== d.iso) : [...prefs.workingDays, d.iso]
                      if (days.length) set({ workingDays: days.sort() })
                    }}
                  >
                    {d.short.slice(0, 2)}
                  </Button>
                )
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-bh-start" className="mb-1 block text-sm font-medium">
                Business hours from
              </label>
              <input id="set-bh-start" type="time" className={fieldClass} value={prefs.businessHours.start} onChange={(e) => e.target.value < prefs.businessHours.end && set({ businessHours: { ...prefs.businessHours, start: e.target.value } })} />
            </div>
            <div>
              <label htmlFor="set-bh-end" className="mb-1 block text-sm font-medium">
                to
              </label>
              <input id="set-bh-end" type="time" className={fieldClass} value={prefs.businessHours.end} onChange={(e) => e.target.value > prefs.businessHours.start && set({ businessHours: { ...prefs.businessHours, end: e.target.value } })} />
            </div>
          </div>
          <div>
            <label htmlFor="set-zone" className="mb-1 block text-sm font-medium">
              Display time zone
            </label>
            <select id="set-zone" className={fieldClass} value={prefs.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>
              {timeZones().map((z) => (
                <option key={z} value={z}>
                  {zoneLabel(z)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Events keep their own time zone; times are converted for display, including daylight saving changes.</p>
          </div>
          <div>
            <label htmlFor="set-slot" className="mb-1 block text-sm font-medium">
              Time slots
            </label>
            <select id="set-slot" className={fieldClass} value={prefs.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) })}>
              {[15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={prefs.weekNumbers} onChange={(e) => set({ weekNumbers: e.target.checked })} />
              Show week numbers
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!prefs.hour12} onChange={(e) => set({ hour12: !e.target.checked })} />
              Use 24-hour time
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
