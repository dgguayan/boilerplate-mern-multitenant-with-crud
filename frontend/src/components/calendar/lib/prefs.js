import { BROWSER_ZONE } from "./dates"

export const VIEWS = [
  { value: "day", label: "Day", group: "Calendar", key: "d" },
  { value: "week", label: "Week", group: "Calendar", key: "w" },
  { value: "workWeek", label: "Work week", group: "Calendar", key: "x" },
  { value: "month", label: "Month", group: "Calendar", key: "m" },
  { value: "multiMonth", label: "Multi-month", group: "Calendar", key: "3" },
  { value: "year", label: "Year", group: "Calendar", key: "y" },
  { value: "agenda", label: "Agenda", group: "Lists", key: "a" },
  { value: "list", label: "Event list", group: "Lists", key: "l" },
  { value: "upcoming", label: "Upcoming", group: "Lists", key: "u" },
  { value: "timeline", label: "Timeline", group: "Planning", key: "g" },
  { value: "resources", label: "Resources", group: "Planning", key: "r" },
]
export const VIEW_VALUES = new Set(VIEWS.map((v) => v.value))

export const DEFAULT_PREFS = {
  firstDay: 1, // ISO weekday the week starts on
  workingDays: [1, 2, 3, 4, 5],
  businessHours: { start: "09:00", end: "17:00" },
  weekNumbers: false,
  hour12: true,
  timeZone: BROWSER_ZONE,
  defaultView: "month",
  slotMinutes: 30,
}

const KEY = "calendar:prefs"

export function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null")
    if (stored && typeof stored === "object") return { ...DEFAULT_PREFS, ...stored }
  } catch {
    /* storage unavailable or corrupted — use defaults */
  }
  return DEFAULT_PREFS
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore — preferences just won't persist */
  }
}
