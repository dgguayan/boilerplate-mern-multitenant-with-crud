import { useEffect, useState } from "react"
import { DateTime } from "luxon"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import {
  Ban,
  CalendarPlus,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Lock,
  Mail,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Repeat,
  Tag,
  Ticket,
  Trash2,
  User,
  Users,
  Video,
} from "lucide-react"
import { toast } from "sonner"

import * as calendarApi from "@/api/calendar.api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCalendar } from "./CalendarContext"
import { CategoryIcon, StatusBadge, eventColor } from "./ui"
import { formatEventTime, fromJS, timeState } from "./lib/dates"
import { describeRule } from "./lib/recurrence"
import { registrationOpen } from "./lib/filters"
import { googleCalendarUrl, outlookUrl } from "./lib/add-to-calendar"
import { RsvpPanel } from "./RsvpPanel"

const VISIBILITY = {
  public: { label: "Public", icon: Globe },
  restricted: { label: "Members only", icon: Users },
  private: { label: "Private", icon: Lock },
}

function Countdown({ start, end }) {
  const [now, setNow] = useState(() => DateTime.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const s = DateTime.fromJSDate(new Date(start))
  const e = DateTime.fromJSDate(new Date(end))
  if (now >= e) return <span>Ended {e.toRelative({ base: now })}</span>
  if (now >= s) return <span className="font-medium text-emerald-700 dark:text-emerald-400">Happening now · ends {e.toRelative({ base: now })}</span>
  const diff = s.diff(now, ["days", "hours", "minutes"]).toObject()
  const parts = [diff.days && `${diff.days}d`, (diff.days || diff.hours) && `${Math.floor(diff.hours)}h`, `${Math.floor(diff.minutes)}m`].filter(Boolean)
  return (
    <span>
      Starts in <span className="font-medium tabular-nums text-foreground">{parts.join(" ")}</span>
    </span>
  )
}

function Row({ icon: Icon, children, label }) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {label && <span className="sr-only">{label}: </span>}
        {children}
      </div>
    </li>
  )
}

const ext = { target: "_blank", rel: "noopener noreferrer" }

export function EventDetailsSheet() {
  const ctx = useCalendar()
  const { details: occ, closeDetails, categoriesById, resourcesById, prefs, permissions, openEdit, deleteOccurrence, duplicateOccurrence, reload } = ctx
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const occId = occ?.id

  useEffect(() => {
    if (!occ) return
    let cancelled = false
    setData(null)
    setError(null)
    calendarApi
      .getEvent(occ.eventId, { countView: true })
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(calendarApi.errorMessage(err, "Couldn't load this event.")))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occId])

  const event = data?.event
  const category = occ && categoriesById.get(occ.categoryId)
  const color = occ ? eventColor(occ, categoriesById) : undefined
  const rule = data?.series?.recurrence || event?.recurrence
  const ruleStart = data?.series || event
  const visibility = VISIBILITY[occ?.visibility] || VISIBILITY.restricted
  const directions =
    event?.location?.mapUrl ||
    ((event?.location?.address || event?.location?.name) &&
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.location.name, event.location.address].filter(Boolean).join(", "))}`)
  const price = event?.price?.amount > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency: event.price.currency || "USD" }).format(event.price.amount) : event?.price ? "Free" : null

  const downloadIcs = async () => {
    try {
      const response = await calendarApi.downloadEventIcs(occ.isOverride ? occ.eventId : occ.eventId, occ.isRecurring && !occ.isOverride ? occ.recurrenceKey : undefined)
      calendarApi.saveBlob(response, "event.ics")
    } catch (err) {
      toast.error(calendarApi.errorMessage(err, "Couldn't create the calendar file."))
    }
  }

  return (
    <Sheet open={Boolean(occ)} onOpenChange={(open) => !open && closeDetails()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-md">
        {occ && (
          <>
            {event?.imageUrl ? (
              <img src={event.imageUrl} alt="" className="aspect-[2/1] w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="h-2 w-full" style={{ background: color }} aria-hidden="true" />
            )}
            <SheetHeader className="gap-2 pr-12">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {category && (
                  <Badge variant="secondary" className="gap-1">
                    <CategoryIcon category={category} className="size-3" />
                    {category.name}
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1">
                  <visibility.icon className="size-3.5" aria-hidden="true" />
                  {visibility.label}
                </span>
                <StatusBadge status={occ.status} />
              </div>
              <SheetTitle className={cn("text-lg leading-snug", occ.status === "cancelled" && "line-through decoration-muted-foreground")}>
                {occ.title}
              </SheetTitle>
              <SheetDescription>{formatEventTime(occ, prefs.timeZone, { hour12: prefs.hour12, withDate: true })}</SheetDescription>
              {occ.status !== "cancelled" && <p className="text-xs text-muted-foreground"><Countdown start={occ.start} end={occ.end} /></p>}
            </SheetHeader>

            {occ.status === "cancelled" && (
              <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-red-600/30 bg-red-600/10 p-3 text-sm">
                <Ban className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
                This event has been cancelled.
              </div>
            )}
            {occ.status === "postponed" && (
              <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                This event has been postponed. A new date will be announced.
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-y px-4 py-3">
              <DropdownMenuPrimitive.Root>
                <DropdownMenuPrimitive.Trigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarPlus data-icon="inline-start" />
                    Add to calendar
                  </Button>
                </DropdownMenuPrimitive.Trigger>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.Content
                    align="start"
                    sideOffset={4}
                    className="z-50 min-w-48 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0"
                  >
                    {[
                      { label: "Google Calendar", href: event && googleCalendarUrl(event, occ) },
                      { label: "Outlook.com", href: event && outlookUrl(event, occ) },
                      { label: "Microsoft 365", href: event && outlookUrl(event, occ, { office365: true }) },
                    ].map((item) => (
                      <DropdownMenuPrimitive.Item key={item.label} asChild disabled={!item.href}>
                        <a href={item.href} {...ext} className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none focus:bg-accent data-disabled:opacity-50">
                          <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
                          {item.label}
                        </a>
                      </DropdownMenuPrimitive.Item>
                    ))}
                    <DropdownMenuPrimitive.Item onSelect={downloadIcs} className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none focus:bg-accent">
                      <Download className="size-4 text-muted-foreground" aria-hidden="true" />
                      Apple Calendar / other (.ics)
                    </DropdownMenuPrimitive.Item>
                  </DropdownMenuPrimitive.Content>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Root>
              {occ.canEdit && (
                <Button variant="outline" size="sm" onClick={() => { closeDetails(); openEdit(occ) }}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
              )}
              {permissions.canCreate && (
                <Button variant="outline" size="sm" onClick={() => duplicateOccurrence(occ)}>
                  <Copy data-icon="inline-start" />
                  Duplicate
                </Button>
              )}
              {occ.canEdit && (
                <Button variant="destructive" size="sm" onClick={() => deleteOccurrence(occ)}>
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              )}
            </div>

            {/* Replies; the calendar reloads so the "Going" marker and the My replies filter follow. */}
            <RsvpPanel key={occ.id} occ={occ} onChanged={reload} />

            {error && <p role="alert" className="px-4 py-3 text-sm text-destructive">{error}</p>}
            {!event && !error && (
              <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading event details">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {event && (
              <div className="space-y-5 p-4">
                {event.summary && <p className="text-sm font-medium">{event.summary}</p>}
                <ul className="space-y-3">
                  {!event.allDay && event.timeZone !== prefs.timeZone && (
                    <Row icon={Clock} label="Event time zone">
                      {formatEventTime(occ, event.timeZone, { hour12: prefs.hour12 })} in {event.timeZone.replace(/_/g, " ")}
                    </Row>
                  )}
                  {rule?.freq && ruleStart && (
                    <Row icon={Repeat} label="Repeats">
                      {describeRule(rule, fromJS(ruleStart.start, ruleStart.allDay ? "utc" : ruleStart.timeZone))}
                      {occ.isOverride && <span className="block text-xs text-muted-foreground">This occurrence was edited separately.</span>}
                    </Row>
                  )}
                  {(event.location?.name || event.location?.address) && (
                    <Row icon={MapPin} label="Location">
                      <p>{event.location.name}</p>
                      {event.location.address && <p className="text-muted-foreground">{event.location.address}</p>}
                      {directions && (
                        <a href={directions} {...ext} className="text-sm font-medium underline-offset-4 hover:underline">
                          Get directions
                        </a>
                      )}
                    </Row>
                  )}
                  {event.virtualUrl && (
                    <Row icon={Video} label="Online meeting">
                      <a href={event.virtualUrl} {...ext} className="font-medium underline-offset-4 hover:underline">
                        Join online meeting
                      </a>
                      <p className="truncate text-xs text-muted-foreground">{new URL(event.virtualUrl).host}</p>
                    </Row>
                  )}
                  {(event.capacity != null || event.registrationDeadline) && (
                    <Row icon={Users} label="Registration">
                      {event.capacity != null && <p>Capacity: {event.capacity} {event.capacity === 1 ? "person" : "people"}</p>}
                      {event.registrationDeadline && (
                        <p className="text-muted-foreground">
                          {registrationOpen({ ...occ, registrationDeadline: event.registrationDeadline }) ? "Registration open until " : "Registration closed · deadline was "}
                          {fromJS(event.registrationDeadline, prefs.timeZone).toFormat("ccc, LLL d, " + (prefs.hour12 ? "h:mm a" : "HH:mm"))}
                        </p>
                      )}
                    </Row>
                  )}
                  {price && (
                    <Row icon={Ticket} label="Price">
                      {price}
                    </Row>
                  )}
                  {event.externalUrl && (
                    <Row icon={Link2} label="Website">
                      <a href={event.externalUrl} {...ext} className="break-all underline-offset-4 hover:underline">
                        {event.externalUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </Row>
                  )}
                  {(event.organizer?.name || event.organizer?.email) && (
                    <Row icon={User} label="Organizer">
                      <p>{event.organizer.name || "Organizer"}</p>
                      <div className="flex flex-wrap gap-x-3 text-xs">
                        {event.organizer.email && <a href={`mailto:${event.organizer.email}`} className="underline-offset-4 hover:underline">{event.organizer.email}</a>}
                        {event.organizer.phone && <a href={`tel:${event.organizer.phone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">{event.organizer.phone}</a>}
                        {event.organizer.website && <a href={event.organizer.website} {...ext} className="underline-offset-4 hover:underline">Website</a>}
                      </div>
                    </Row>
                  )}
                  {(event.contact?.email || event.contact?.phone) && (
                    <Row icon={Mail} label="Contact">
                      <div className="flex flex-wrap gap-x-3">
                        {event.contact.email && <a href={`mailto:${event.contact.email}`} className="underline-offset-4 hover:underline">{event.contact.email}</a>}
                        {event.contact.phone && (
                          <a href={`tel:${event.contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                            <Phone className="size-3.5" aria-hidden="true" />
                            {event.contact.phone}
                          </a>
                        )}
                      </div>
                    </Row>
                  )}
                  {event.resourceIds?.length > 0 && (
                    <Row icon={Users} label="Resources">
                      {event.resourceIds.map((id) => resourcesById.get(String(id))?.name).filter(Boolean).join(", ")}
                    </Row>
                  )}
                  {event.tags?.length > 0 && (
                    <Row icon={Tag} label="Tags">
                      <div className="flex flex-wrap gap-1">
                        {event.tags.map((t) => (
                          <Badge key={t} variant="outline">
                            #{t}
                          </Badge>
                        ))}
                      </div>
                    </Row>
                  )}
                </ul>

                {event.description && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">About</h3>
                    <p className="text-sm whitespace-pre-line">{event.description}</p>
                  </section>
                )}

                {event.attachments?.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Documents</h3>
                    <ul className="space-y-1">
                      {event.attachments.map((a) => (
                        <li key={a.url}>
                          <a href={a.url} {...ext} className="inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline">
                            <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
                            {a.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {event.customFields?.length > 0 && (
                  <section>
                    <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">More details</h3>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {event.customFields.map((f) => (
                        <div key={f.label} className="contents">
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                  <Eye className="size-3.5" aria-hidden="true" />
                  {event.viewCount} view{event.viewCount === 1 ? "" : "s"}
                  {event.createdBy?.name && <> · Added by {event.createdBy.name}</>}
                  {timeState(occ) === "past" && <> · Past event</>}
                </p>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
