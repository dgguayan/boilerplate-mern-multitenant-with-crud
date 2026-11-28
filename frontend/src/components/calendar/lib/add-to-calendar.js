import { DateTime } from "luxon"

const utc = (date) => DateTime.fromJSDate(new Date(date)).toUTC()

function details(event) {
  return [event.summary, event.description, event.virtualUrl && `Join: ${event.virtualUrl}`].filter(Boolean).join("\n\n").slice(0, 1500)
}

function where(event) {
  return [event.location?.name, event.location?.address].filter(Boolean).join(", ") || event.virtualUrl || ""
}

/** Google Calendar "add event" link for one occurrence. */
export function googleCalendarUrl(event, occurrence) {
  const start = occurrence?.start ?? event.start
  const end = occurrence?.end ?? event.end
  const dates = event.allDay
    ? `${utc(start).toFormat("yyyyMMdd")}/${utc(end).toFormat("yyyyMMdd")}`
    : `${utc(start).toFormat("yyyyMMdd'T'HHmmss'Z'")}/${utc(end).toFormat("yyyyMMdd'T'HHmmss'Z'")}`
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates, details: details(event), location: where(event) })
  if (!event.allDay && event.timeZone) params.set("ctz", event.timeZone)
  return `https://calendar.google.com/calendar/render?${params}`
}

/** Outlook.com / Microsoft 365 compose links. */
export function outlookUrl(event, occurrence, { office365 = false } = {}) {
  const start = occurrence?.start ?? event.start
  const end = occurrence?.end ?? event.end
  const format = (d) => (event.allDay ? utc(d).toFormat("yyyy-MM-dd") : utc(d).toISO({ suppressMilliseconds: true }))
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: format(start),
    enddt: format(end),
    body: details(event),
    location: where(event),
  })
  if (event.allDay) params.set("allday", "true")
  const host = office365 ? "https://outlook.office.com" : "https://outlook.live.com"
  return `${host}/calendar/0/deeplink/compose?${params}`
}
