import { WEEKDAYS } from "./dates"

const ORDINALS = ["first", "second", "third", "fourth", "last"]
const FREQ_UNIT = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday (Mon–Fri)" },
  { value: "weekends", label: "Every weekend (Sat–Sun)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom…" },
]

/** Builds a rule from a quick option, anchored on the event's start date (Luxon DateTime). */
export function ruleFromOption(option, start) {
  switch (option) {
    case "none":
      return null
    case "weekdays":
      return { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], preset: "weekdays", end: { type: "never" } }
    case "weekends":
      return { freq: "weekly", interval: 1, byWeekday: [6, 7], preset: "weekends", end: { type: "never" } }
    case "weekly":
      return { freq: "weekly", interval: 1, byWeekday: [start.weekday], end: { type: "never" } }
    case "custom":
      return { freq: "weekly", interval: 1, byWeekday: [start.weekday], end: { type: "never" } }
    default:
      return { freq: option, interval: 1, monthlyMode: "dayOfMonth", end: { type: "never" } }
  }
}

/** Which quick option a rule corresponds to, or "custom". */
export function optionFromRule(rule, start) {
  if (!rule?.freq) return "none"
  if (rule.preset === "weekdays" || rule.preset === "weekends") return rule.end?.type === "never" ? rule.preset : "custom"
  const plain = (rule.interval || 1) === 1 && (rule.end?.type || "never") === "never"
  if (!plain) return "custom"
  if (rule.freq === "weekly") {
    const days = rule.byWeekday || []
    return days.length === 1 && days[0] === start.weekday ? "weekly" : "custom"
  }
  if (rule.freq === "monthly" && rule.monthlyMode === "nthWeekday") return "custom"
  return rule.freq
}

export function nthWeekdayLabel(start) {
  const nth = Math.ceil(start.day / 7)
  const isLast = start.plus({ weeks: 1 }).month !== start.month && nth >= 4
  return `${ORDINALS[isLast ? 4 : nth - 1]} ${WEEKDAYS[start.weekday - 1].long}`
}

/** Plain-language summary: "Every 2 weeks on Mon, Wed, 10 times". */
export function describeRule(rule, start) {
  if (!rule?.freq) return "Does not repeat"
  const interval = rule.interval || 1
  let text
  if (rule.preset === "weekdays" && interval === 1) text = "Every weekday"
  else if (rule.preset === "weekends" && interval === 1) text = "Every weekend"
  else {
    const unit = FREQ_UNIT[rule.freq]
    text = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`
    if (rule.freq === "daily" && interval === 1) text = "Daily"
    if (rule.freq === "weekly") {
      const days = (rule.byWeekday?.length ? rule.byWeekday : [start.weekday])
        .slice()
        .sort()
        .map((d) => WEEKDAYS[d - 1].short)
      text += ` on ${days.join(", ")}`
    }
    if (rule.freq === "monthly") {
      text += rule.monthlyMode === "nthWeekday" ? ` on the ${nthWeekdayLabel(start)}` : ` on day ${start.day}`
    }
    if (rule.freq === "yearly") text += ` on ${start.toFormat("LLLL d")}`
  }
  if (rule.end?.type === "count") text += `, ${rule.end.count} time${rule.end.count === 1 ? "" : "s"}`
  if (rule.end?.type === "until" && rule.end.until) text += `, until ${rule.end.until}`
  return text
}
