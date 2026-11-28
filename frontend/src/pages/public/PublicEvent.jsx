import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Ban, CalendarPlus, ChevronDown, Clock, Download, ExternalLink, Mail, MapPin, Paperclip, Repeat, Share2, Tag, Ticket, User, Users, Video } from "lucide-react"
import { toast } from "sonner"

import * as publicApi from "@/api/public.api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { googleCalendarUrl, outlookUrl } from "@/components/calendar/lib/add-to-calendar"
import { eventIcsUrl, publicEventPath, publicEventUrl } from "@/lib/public-urls"
import { PublicHeader, PublicNotFound, StatusPill, formatPrice, formatWhen, toDT, useDocumentTitle, visitorZone } from "./public-shared"

const ext = { target: "_blank", rel: "noopener noreferrer" }

function Row({ icon: Icon, label, children }) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </li>
  )
}

/** /p/:tenant/events/:slug[?occurrence=yyyy-mm-dd] — one public event, readable without signing in. */
export default function PublicEvent() {
  const { tenant, slug } = useParams()
  const [searchParams] = useSearchParams()
  const occurrenceKey = searchParams.get("occurrence")
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    publicApi
      .getPublicEvent(tenant, slug)
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(err?.response?.status === 404 ? "notFound" : "Couldn't load this event. Please try again."))
    return () => {
      cancelled = true
    }
  }, [tenant, slug])

  const event = data?.event
  useDocumentTitle(event ? `${event.title} · ${data.tenant.name}` : null)

  // The date shown: the one in the link, else the next one of a series, else the event itself.
  const shown = useMemo(() => {
    if (!event) return null
    if (!event.recurrence?.freq) return { start: event.start, end: event.end, allDay: event.allDay, status: event.status, key: null }
    const match = data.upcoming.find((u) => u.key === occurrenceKey) || data.upcoming[0]
    return match ? { ...match, allDay: event.allDay } : { start: event.start, end: event.end, allDay: event.allDay, status: event.status, key: null }
  }, [event, data, occurrenceKey])

  if (error === "notFound") {
    return (
      <div className="min-h-svh bg-background">
        <PublicHeader tenant={tenant} />
        <PublicNotFound message="This event isn't public, or the link is wrong." />
      </div>
    )
  }

  const share = async () => {
    const url = publicEventUrl(tenant, slug, shown?.key)
    try {
      if (navigator.share) await navigator.share({ title: event.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copied")
      }
    } catch {
      /* the visitor closed the share sheet */
    }
  }

  const price = event && formatPrice(event.price)
  const directions =
    event?.location?.mapUrl ||
    ((event?.location?.address || event?.location?.name) &&
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.location.name, event.location.address].filter(Boolean).join(", "))}`)
  const zoneDiffers = event && !event.allDay && event.timeZone && event.timeZone !== visitorZone()
  const deadlinePassed = event?.registrationDeadline && new Date(event.registrationDeadline) < new Date()

  return (
    <div className="min-h-svh bg-background">
      <PublicHeader tenant={tenant} tenantName={data?.tenant.name} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link to={`/p/${tenant}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All events
        </Link>

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        {!event && !error && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="aspect-[2/1] w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {event && shown && (
          <article className="overflow-hidden rounded-xl border bg-card">
            {event.imageUrl ? (
              <img src={event.imageUrl} alt="" className="aspect-[2/1] w-full object-cover" />
            ) : (
              <div className="h-2 w-full" style={{ background: event.color || event.category?.color || "var(--primary)" }} aria-hidden="true" />
            )}
            <div className="space-y-5 p-5">
              <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {event.category && <Badge variant="secondary">{event.category.name}</Badge>}
                  <StatusPill status={shown.status} />
                </div>
                <h1 className={cn("text-2xl font-semibold tracking-tight", shown.status === "cancelled" && "line-through decoration-muted-foreground")}>{event.title}</h1>
                <p className="text-muted-foreground">{formatWhen(shown)}</p>
                {event.summary && <p className="font-medium">{event.summary}</p>}
              </header>

              {shown.status === "cancelled" && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-600/30 bg-red-600/10 p-3 text-sm">
                  <Ban className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
                  This event has been cancelled.
                </div>
              )}
              {shown.status === "postponed" && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  This event has been postponed. A new date will be announced.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarPlus data-icon="inline-start" />
                      Add to calendar
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem asChild>
                      <a href={googleCalendarUrl(event, shown)} {...ext}>
                        <ExternalLink />
                        Google Calendar
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={outlookUrl(event, shown)} {...ext}>
                        <ExternalLink />
                        Outlook.com
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={outlookUrl(event, shown, { office365: true })} {...ext}>
                        <ExternalLink />
                        Microsoft 365
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={eventIcsUrl(tenant, slug, shown.key)} download>
                        <Download />
                        Apple Calendar / other (.ics)
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 data-icon="inline-start" />
                  Share
                </Button>
                {event.externalUrl && (
                  <Button asChild size="sm">
                    <a href={event.externalUrl} {...ext}>
                      <ExternalLink data-icon="inline-start" />
                      Event website
                    </a>
                  </Button>
                )}
              </div>

              <ul className="space-y-3">
                {zoneDiffers && (
                  <Row icon={Clock} label="Time where it takes place">
                    {toDT(shown.start).setZone(event.timeZone).toFormat("ccc, LLL d · t")} in {event.timeZone.replace(/_/g, " ")}
                  </Row>
                )}
                {(event.location?.name || event.location?.address) && (
                  <Row icon={MapPin} label="Location">
                    <p>{event.location.name}</p>
                    {event.location.address && <p className="text-muted-foreground">{event.location.address}</p>}
                    {directions && (
                      <a href={directions} {...ext} className="font-medium underline-offset-4 hover:underline">
                        Get directions
                      </a>
                    )}
                  </Row>
                )}
                {event.virtualUrl && (
                  <Row icon={Video} label="Online">
                    <a href={event.virtualUrl} {...ext} className="font-medium underline-offset-4 hover:underline">
                      Join online
                    </a>
                  </Row>
                )}
                {price && (
                  <Row icon={Ticket} label="Price">
                    {price}
                  </Row>
                )}
                {(event.capacity != null || event.registrationDeadline) && (
                  <Row icon={Users} label="Registration">
                    {event.capacity != null && <p>Up to {event.capacity} {event.capacity === 1 ? "person" : "people"}</p>}
                    {event.registrationDeadline && (
                      <p className="text-muted-foreground">
                        {deadlinePassed ? "Registration closed " : "Register by "}
                        {toDT(event.registrationDeadline).toFormat("ccc, LLL d · t")}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      Members reply in the app:{" "}
                      <Link to={`/calendar?event=${event.id}${shown.key ? `&occurrence=${shown.key}&date=${shown.key}` : ""}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        sign in to reply
                      </Link>
                    </p>
                  </Row>
                )}
                {(event.organizer?.name || event.organizer?.email) && (
                  <Row icon={User} label="Organizer">
                    <p>{event.organizer.name || "Organizer"}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      {event.organizer.email && <a href={`mailto:${event.organizer.email}`} className="underline-offset-4 hover:underline">{event.organizer.email}</a>}
                      {event.organizer.website && <a href={event.organizer.website} {...ext} className="underline-offset-4 hover:underline">Website</a>}
                    </div>
                  </Row>
                )}
                {(event.contact?.email || event.contact?.phone) && (
                  <Row icon={Mail} label="Contact">
                    <div className="flex flex-wrap gap-x-3">
                      {event.contact.email && <a href={`mailto:${event.contact.email}`} className="underline-offset-4 hover:underline">{event.contact.email}</a>}
                      {event.contact.phone && <a href={`tel:${event.contact.phone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">{event.contact.phone}</a>}
                    </div>
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
                  <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">About</h2>
                  <p className="text-sm whitespace-pre-line">{event.description}</p>
                </section>
              )}

              {event.attachments?.length > 0 && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Documents</h2>
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
                  <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">More details</h2>
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

              {data.upcoming.length > 1 && (
                <section>
                  <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Repeat className="size-3.5" aria-hidden="true" />
                    Upcoming dates
                  </h2>
                  <ul className="divide-y rounded-lg border text-sm">
                    {data.upcoming.map((u) => (
                      <li key={u.key}>
                        <Link
                          to={publicEventPath(tenant, slug, u.key)}
                          replace
                          aria-current={u.key === shown.key ? "true" : undefined}
                          className={cn("flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent", u.key === shown.key && "bg-accent font-medium")}
                        >
                          <span>{formatWhen({ ...u, allDay: event.allDay })}</span>
                          <StatusPill status={u.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                Times are shown in your time zone ({visitorZone().replace(/_/g, " ")}).
              </p>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}
