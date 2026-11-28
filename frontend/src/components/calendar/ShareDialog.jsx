import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { embedCode, embedUrl, feedUrl, googleSubscribeUrl, publicCalendarUrl } from "@/lib/public-urls"
import { useCalendar } from "./CalendarContext"
import { fieldClass } from "./RecurrenceEditor"

function CopyField({ id, label, value, hint, multiline = false }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.")
    }
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        {multiline ? (
          <textarea id={id} readOnly rows={3} value={value} className={`${fieldClass} h-auto flex-1 resize-none py-1.5 font-mono text-xs`} onFocus={(e) => e.target.select()} />
        ) : (
          <input id={id} readOnly value={value} className={`${fieldClass} flex-1 font-mono text-xs`} onFocus={(e) => e.target.select()} />
        )}
        <Button variant="outline" size="sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Public calendar: the on/off switch (admins), the public page, the subscribe feed and the embed code. */
export function ShareDialog({ open, onOpenChange }) {
  const { permissions, categories } = useCalendar()
  const [sharing, setSharing] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [limit, setLimit] = useState(5)
  const [category, setCategory] = useState("")
  const [theme, setTheme] = useState("auto")

  useEffect(() => {
    if (!open) return
    setError(null)
    calendarApi
      .getSharing()
      .then((res) => setSharing(res.data.data))
      .catch((err) => setError(calendarApi.errorMessage(err, "Couldn't load sharing settings.")))
  }, [open])

  const toggle = async () => {
    setSaving(true)
    try {
      const res = await calendarApi.setSharing(!sharing.publicEnabled)
      setSharing(res.data.data)
      toast.success(res.data.message)
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't change the setting."))
    } finally {
      setSaving(false)
    }
  }

  const publicCategories = categories.filter((c) => c.visibility === "public")
  const slug = sharing?.slug

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share and embed</DialogTitle>
          <DialogDescription>
            A public page, a subscribe link and a website widget, showing only events marked <strong>Public</strong> (in a public category, or none).
          </DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!sharing && !error && <Skeleton className="h-24 w-full" />}

        {sharing && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Public calendar is {sharing.publicEnabled ? "on" : "off"}</p>
                <p className="text-xs text-muted-foreground">
                  {sharing.publicEnabled
                    ? `${sharing.publicEvents} public event${sharing.publicEvents === 1 ? "" : "s"} can be seen by anyone with the link.`
                    : "Nothing is visible outside the workspace."}
                  {!permissions.isAdmin && " Only administrators can change this."}
                </p>
              </div>
              {permissions.isAdmin && (
                <Button variant={sharing.publicEnabled ? "outline" : "default"} size="sm" onClick={toggle} disabled={saving}>
                  {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                  {sharing.publicEnabled ? "Turn off" : "Turn on"}
                </Button>
              )}
            </div>

            {sharing.publicEnabled && (
              <>
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Links</h3>
                  <CopyField id="share-page" label="Public page" value={publicCalendarUrl(slug)} />
                  <a href={publicCalendarUrl(slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Open the public page
                  </a>
                  <CopyField
                    id="share-feed"
                    label="Subscribe link (.ics)"
                    value={feedUrl(slug)}
                    hint="Paste into Google Calendar, Outlook or Apple Calendar as a calendar from URL. They refresh it every few hours."
                  />
                  <a href={googleSubscribeUrl(slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Subscribe in Google Calendar
                  </a>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Website widget</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label htmlFor="embed-limit" className="mb-1 block text-xs text-muted-foreground">
                        Events shown
                      </label>
                      <select id="embed-limit" className={fieldClass} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                        {[3, 5, 8, 10].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="embed-category" className="mb-1 block text-xs text-muted-foreground">
                        Category
                      </label>
                      <select id="embed-category" className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="">All public</option>
                        {publicCategories.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="embed-theme" className="mb-1 block text-xs text-muted-foreground">
                        Colours
                      </label>
                      <select id="embed-theme" className={fieldClass} value={theme} onChange={(e) => setTheme(e.target.value)}>
                        <option value="auto">Match visitor</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>
                  </div>
                  <CopyField id="share-embed" label="Embed code" multiline value={embedCode(slug, { limit, category: category || undefined, theme })} hint="Paste this HTML into your website where the list should appear." />
                  <a href={embedUrl(slug, { limit, category: category || undefined, theme })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Preview the widget
                  </a>
                </section>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
