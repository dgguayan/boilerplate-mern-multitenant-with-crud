import { timeState } from "./dates"

export const STATUSES = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "postponed", label: "Postponed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
]

export const SORTS = [
  { value: "date", label: "Date" },
  { value: "relevance", label: "Relevance" },
  { value: "popularity", label: "Popularity" },
  { value: "recent", label: "Recently added" },
  { value: "alpha", label: "A–Z" },
]

export const EMPTY_FILTERS = {
  q: "",
  hiddenCategories: [], // category ids toggled off in the legend ("none" = uncategorised)
  from: "", // yyyy-mm-dd, list views
  to: "",
  location: "",
  organizer: "",
  statuses: [],
  price: "any", // any | free | paid
  mode: "any", // any | online | in-person | hybrid
  availability: "any", // any | open | closed
  time: "any", // any | upcoming | ongoing | past
  tags: [],
  resourceIds: [],
}

export const attendanceMode = (o) => {
  const online = Boolean(o.virtualUrl)
  const inPerson = Boolean(o.location?.name || o.location?.address)
  if (online && inPerson) return "hybrid"
  if (online) return "online"
  if (inPerson) return "in-person"
  return null
}

/** Registration is "open" while the event is published, upcoming and before its deadline. */
export function registrationOpen(o, now = new Date()) {
  if (o.status !== "published") return false
  if (new Date(o.start) <= now) return false
  if (o.registrationDeadline && new Date(o.registrationDeadline) < now) return false
  return true
}

const normalise = (text) => (text || "").toLocaleLowerCase()

/** Relevance score of an occurrence for a query (0 = no match). */
export function relevance(o, terms, categoryName) {
  if (!terms.length) return 1
  let score = 0
  const fields = [
    [normalise(o.title), 5],
    [normalise(o.tags?.join(" ")), 3],
    [normalise(categoryName), 3],
    [normalise(o.summary), 2],
    [normalise(o.location?.name) + " " + normalise(o.location?.address), 2],
    [normalise(o.organizer), 2],
  ]
  for (const term of terms) {
    let matched = false
    for (const [text, weight] of fields) {
      if (text.includes(term)) {
        score += weight * (text.startsWith(term) ? 1.5 : 1)
        matched = true
      }
    }
    if (!matched) return 0 // every word must match somewhere
  }
  return score
}

/** Applies every filter; returns occurrences annotated with `_score`. */
export function applyFilters(occurrences, filters, categoriesById, now = new Date()) {
  const terms = normalise(filters.q).split(/\s+/).filter(Boolean)
  const hidden = new Set(filters.hiddenCategories)
  const statuses = new Set(filters.statuses)
  const tags = new Set(filters.tags)
  const resources = new Set(filters.resourceIds)
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null
  const location = normalise(filters.location)
  const result = []

  for (const o of occurrences) {
    if (hidden.has(o.categoryId || "none")) continue
    if (statuses.size && !statuses.has(o.status)) continue
    if (from && new Date(o.end) <= from) continue
    if (to && new Date(o.start) > to) continue
    if (location && !normalise(`${o.location?.name} ${o.location?.address}`).includes(location)) continue
    if (filters.organizer && o.organizer !== filters.organizer) continue
    if (filters.price === "free" && o.price?.amount > 0) continue
    if (filters.price === "paid" && !(o.price?.amount > 0)) continue
    if (filters.mode !== "any" && attendanceMode(o) !== filters.mode) continue
    if (filters.availability === "open" && !registrationOpen(o, now)) continue
    if (filters.availability === "closed" && registrationOpen(o, now)) continue
    if (filters.time !== "any" && timeState(o, now) !== filters.time) continue
    if (tags.size && !o.tags?.some((t) => tags.has(t))) continue
    if (resources.size && !o.resourceIds?.some((r) => resources.has(r))) continue
    const score = relevance(o, terms, categoriesById.get(o.categoryId)?.name)
    if (!score) continue
    result.push(terms.length ? { ...o, _score: score } : o)
  }
  return result
}

export function sortOccurrences(list, sort) {
  const sorted = [...list]
  const byDate = (a, b) => new Date(a.start) - new Date(b.start)
  switch (sort) {
    case "relevance":
      return sorted.sort((a, b) => (b._score || 0) - (a._score || 0) || byDate(a, b))
    case "popularity":
      return sorted.sort((a, b) => b.viewCount - a.viewCount || byDate(a, b))
    case "recent":
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || byDate(a, b))
    case "alpha":
      return sorted.sort((a, b) => a.title.localeCompare(b.title) || byDate(a, b))
    default:
      return sorted.sort(byDate)
  }
}

/** Values to offer in the organizer / tag filters, from the loaded events. */
export function facets(occurrences) {
  const organizers = new Set()
  const tags = new Set()
  for (const o of occurrences) {
    if (o.organizer) organizers.add(o.organizer)
    for (const t of o.tags || []) tags.add(t)
  }
  return { organizers: [...organizers].sort(), tags: [...tags].sort() }
}

/** Chips describing the active filters, each with a function that removes it. */
export function activeFilterChips(filters, { categoriesById, resourcesById }) {
  const chips = []
  const set = (patch) => (f) => ({ ...f, ...patch })
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, remove: set({ q: "" }) })
  for (const id of filters.hiddenCategories) {
    const name = id === "none" ? "Uncategorised" : categoriesById.get(id)?.name || "Category"
    chips.push({ key: `cat-${id}`, label: `Hiding ${name}`, remove: (f) => ({ ...f, hiddenCategories: f.hiddenCategories.filter((c) => c !== id) }) })
  }
  if (filters.from || filters.to) chips.push({ key: "dates", label: `${filters.from || "…"} → ${filters.to || "…"}`, remove: set({ from: "", to: "" }) })
  if (filters.location) chips.push({ key: "loc", label: `Location: ${filters.location}`, remove: set({ location: "" }) })
  if (filters.organizer) chips.push({ key: "org", label: `Organizer: ${filters.organizer}`, remove: set({ organizer: "" }) })
  for (const status of filters.statuses) {
    chips.push({ key: `st-${status}`, label: STATUSES.find((s) => s.value === status)?.label, remove: (f) => ({ ...f, statuses: f.statuses.filter((s) => s !== status) }) })
  }
  if (filters.price !== "any") chips.push({ key: "price", label: filters.price === "free" ? "Free" : "Paid", remove: set({ price: "any" }) })
  if (filters.mode !== "any") chips.push({ key: "mode", label: { online: "Online", "in-person": "In person", hybrid: "Hybrid" }[filters.mode], remove: set({ mode: "any" }) })
  if (filters.availability !== "any") chips.push({ key: "avail", label: filters.availability === "open" ? "Registration open" : "Registration closed", remove: set({ availability: "any" }) })
  if (filters.time !== "any") chips.push({ key: "time", label: { upcoming: "Upcoming", ongoing: "Happening now", past: "Past" }[filters.time], remove: set({ time: "any" }) })
  for (const tag of filters.tags) chips.push({ key: `tag-${tag}`, label: `#${tag}`, remove: (f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }) })
  for (const id of filters.resourceIds) {
    chips.push({ key: `res-${id}`, label: resourcesById.get(id)?.name || "Resource", remove: (f) => ({ ...f, resourceIds: f.resourceIds.filter((r) => r !== id) }) })
  }
  return chips
}
