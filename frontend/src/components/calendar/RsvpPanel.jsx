import { useEffect, useState } from "react"
import { Check, CircleHelp, Download, Hourglass, LoaderCircle, Users, X } from "lucide-react"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export const RSVP_META = {
  going: { label: "Going", icon: Check },
  maybe: { label: "Maybe", icon: CircleHelp },
  declined: { label: "Can't go", icon: X },
  waitlist: { label: "Waitlist", icon: Hourglass },
}
const ANSWERS = ["going", "maybe", "declined"]

/** Where replies to this occurrence are addressed: the event document, plus the date for a series. */
export const rsvpTarget = (occ) => ({
  id: occ.eventId,
  occurrence: occ.isRecurring && !occ.isOverride ? occ.recurrenceKey : undefined,
})

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

function summaryLine(s) {
  const parts = [`${s.counts.going} going`]
  if (s.counts.maybe) parts.push(`${s.counts.maybe} maybe`)
  if (s.capacity != null) parts.push(s.spotsLeft ? `${plural(s.spotsLeft, "place")} left` : "Full")
  if (s.counts.waitlist) parts.push(`${s.counts.waitlist} on the waitlist`)
  return parts.join(" · ")
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`
  return [["Name", "Email", "Reply", "Note", "Replied at"], ...rows.map((r) => [r.name, r.email, RSVP_META[r.status]?.label, r.note, r.respondedAt])]
    .map((row) => row.map(esc).join(","))
    .join("\n")
}

function Attendees({ target, title }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    calendarApi
      .getAttendees(target.id, target.occurrence)
      .then((res) => !cancelled && setList(res.data.data.attendees))
      .catch((err) => !cancelled && setError(calendarApi.errorMessage(err, "Couldn't load who replied.")))
    return () => {
      cancelled = true
    }
  }, [target.id, target.occurrence])

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(list)], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "event"}-replies.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!list) return <Skeleton className="h-16 w-full" />
  if (!list.length) return <p className="text-sm text-muted-foreground">Nobody has replied yet.</p>
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border text-sm">
        {list.map((a) => {
          const meta = RSVP_META[a.status]
          return (
            <li key={a.userId} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                {a.note && <p className="mt-0.5 text-xs">“{a.note}”</p>}
              </div>
              <Badge variant={a.status === "going" ? "default" : "secondary"} className="shrink-0 gap-1">
                <meta.icon className="size-3" aria-hidden="true" />
                {meta.label}
              </Badge>
            </li>
          )
        })}
      </ul>
      <Button variant="outline" size="sm" onClick={exportCsv}>
        <Download data-icon="inline-start" />
        Export replies (CSV)
      </Button>
    </div>
  )
}

/**
 * "Are you going?" for one occurrence: the viewer's reply, places left, the waitlist, and —
 * for the event's organizers — who replied.
 */
export function RsvpPanel({ occ, onChanged }) {
  const target = rsvpTarget(occ)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(null)
  const [showAttendees, setShowAttendees] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setError(null)
    setShowAttendees(false)
    calendarApi
      .getRsvp(target.id, target.occurrence)
      .then((res) => !cancelled && setSummary(res.data.data))
      .catch((err) => !cancelled && setError(calendarApi.errorMessage(err, "Couldn't load replies.")))
    return () => {
      cancelled = true
    }
  }, [target.id, target.occurrence])

  const answer = async (status) => {
    setSaving(status)
    try {
      const res = await calendarApi.setRsvp(target.id, { status, occurrence: target.occurrence })
      const next = res.data.data
      setSummary(next)
      if (next.mine?.status === "waitlist") toast.info(`The event is full. You're number ${next.mine.waitlistPosition} on the waitlist.`)
      else toast.success(status === "declined" ? "Saved: you can't go" : `Saved: ${RSVP_META[status].label.toLowerCase()}`)
      onChanged?.()
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't save your reply."))
    } finally {
      setSaving(null)
    }
  }

  const mine = summary?.mine?.status
  // A waitlisted reply shows as "Going" pressed: that is what the person asked for.
  const pressed = mine === "waitlist" ? "going" : mine

  return (
    <section aria-labelledby="rsvp-heading" className="space-y-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="rsvp-heading" className="text-sm font-semibold">
          Are you going?
        </h3>
        {summary && <p className="text-xs text-muted-foreground" aria-live="polite">{summaryLine(summary)}</p>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!summary && !error && <Skeleton className="h-8 w-full" />}

      {summary && (
        <>
          <div role="group" aria-label="Your reply" className="grid grid-cols-3 gap-2">
            {ANSWERS.map((status) => {
              const meta = RSVP_META[status]
              const disabled = Boolean(saving) || (status !== "declined" && !summary.open) || (status === "declined" && summary.reason === "This event has ended.")
              return (
                <Button
                  key={status}
                  size="sm"
                  variant={pressed === status ? "default" : "outline"}
                  aria-pressed={pressed === status}
                  disabled={disabled}
                  onClick={() => pressed !== status && answer(status)}
                >
                  {saving === status ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <meta.icon data-icon="inline-start" />}
                  {meta.label}
                </Button>
              )
            })}
          </div>

          {mine === "waitlist" && (
            <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <Hourglass className="size-4 shrink-0" aria-hidden="true" />
              The event is full. You're number {summary.mine.waitlistPosition} on the waitlist and will get a place if one frees up.
            </p>
          )}
          {mine === "going" && summary.capacity != null && <p className="text-sm text-muted-foreground">Your place is saved.</p>}
          {!summary.open && summary.reason && <p className="text-sm text-muted-foreground">{summary.reason}</p>}

          {summary.canSeeAttendees && (
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn("-ml-2 text-muted-foreground", showAttendees && "text-foreground")}
                aria-expanded={showAttendees}
                onClick={() => setShowAttendees((v) => !v)}
              >
                <Users data-icon="inline-start" />
                {showAttendees ? "Hide replies" : `See who replied (${summary.counts.going + summary.counts.maybe + summary.counts.declined + summary.counts.waitlist})`}
              </Button>
              {showAttendees && (
                <div className="mt-2">
                  <Attendees target={target} title={occ.title} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
