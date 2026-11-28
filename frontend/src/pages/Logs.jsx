import { useEffect, useMemo, useState } from "react"
import { DateTime } from "luxon"
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Download,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ScrollText,
  SearchX,
  ShieldCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import * as adminApi from "@/api/admin.api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, Pagination, ROLE_META, RelativeTime, fieldClass, useDebounced } from "@/components/admin/shared"

const PAGE_SIZE = 25

export const CATEGORIES = {
  auth: { label: "Sign-in", icon: KeyRound },
  user: { label: "Users", icon: Users },
  project: { label: "Projects", icon: FolderKanban },
  calendar: { label: "Calendar", icon: CalendarDays },
  admin: { label: "Administration", icon: ShieldCheck },
}

const EMPTY_FILTERS = { search: "", category: "", status: "", actorId: "", from: "", to: "" }

function ResultBadge({ status }) {
  return status === "failure" ? (
    <span className="inline-flex items-center gap-1 text-sm text-red-700 dark:text-red-400">
      <CircleX className="size-3.5" aria-hidden="true" />
      Failed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Success
    </span>
  )
}

function CategoryLabel({ category }) {
  const meta = CATEGORIES[category] || CATEGORIES.admin
  return (
    <Badge variant="secondary" className="gap-1">
      <meta.icon className="size-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

function formatValue(value) {
  if (value == null || value === "") return "—"
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

function LogDetails({ log, onClose }) {
  const time = log && DateTime.fromISO(log.createdAt)
  const rows = log
    ? [
        ["When", `${time.toLocaleString(DateTime.DATETIME_FULL_WITH_SECONDS)} (${time.toUTC().toFormat("yyyy-MM-dd HH:mm:ss")} UTC)`],
        ["Person", [log.actor?.name, log.actor?.email].filter(Boolean).join(" · ") || "—"],
        ["Role at the time", ROLE_META[log.actor?.role]?.label || "—"],
        ["Action", log.action],
        ["Target", log.target?.label ? `${log.target.label}${log.target.type ? ` (${log.target.type})` : ""}` : "—"],
        ["IP address", log.ip || "—"],
        ["Device", log.userAgent || "—"],
      ]
    : []

  return (
    <Sheet open={Boolean(log)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        {log && (
          <>
            <SheetHeader className="gap-2 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryLabel category={log.category} />
                <ResultBadge status={log.status} />
              </div>
              <SheetTitle className="leading-snug">{log.summary || log.action}</SheetTitle>
              <SheetDescription>
                <RelativeTime value={log.createdAt} />
              </SheetDescription>
            </SheetHeader>
            <dl className="space-y-3 px-4 pb-4 text-sm">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Details</dt>
                  <dd>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
                      {Object.entries(log.metadata).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="font-medium">{key}</dt>
                          <dd className="font-mono break-all whitespace-pre-wrap">{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default function Logs() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [facets, setFacets] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState(null)
  const search = useDebounced(filters.search)

  // Dates are picked in local time and sent as instants covering whole days.
  const params = useMemo(() => {
    const p = { search: search || undefined, category: filters.category || undefined, status: filters.status || undefined, actorId: filters.actorId || undefined }
    if (filters.from) p.from = DateTime.fromISO(filters.from).startOf("day").toUTC().toISO()
    if (filters.to) p.to = DateTime.fromISO(filters.to).endOf("day").toUTC().toISO()
    return p
  }, [search, filters.category, filters.status, filters.actorId, filters.from, filters.to])

  useEffect(() => setPage(1), [params])

  useEffect(() => {
    adminApi.getLogFacets().then((res) => setFacets(res.data.data)).catch(() => {})
  }, [version])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    adminApi
      .getLogs({ ...params, page, limit: PAGE_SIZE }, controller.signal)
      .then((res) => {
        setData(res.data.data)
        setError(null)
      })
      .catch((err) => !controller.signal.aborted && setError(adminApi.errorMessage(err, "Couldn't load the log.")))
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
  }, [params, page, version])

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const hasFilters = Object.values(filters).some(Boolean)

  const doExport = async () => {
    setExporting(true)
    try {
      const response = await adminApi.exportLogs(params)
      const url = URL.createObjectURL(response.data)
      const link = document.createElement("a")
      link.href = url
      link.download = response.headers["content-disposition"]?.match(/filename="?([^"]+)"?/)?.[1] || "logs.csv"
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      toast.error(adminApi.errorMessage(err, "Export failed."))
    } finally {
      setExporting(false)
    }
  }

  const logs = data?.logs || []

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="Logs" description="View recorded user activities and system events.">
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)} disabled={loading}>
          <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
          Refresh
        </Button>
        <Button variant="outline" onClick={doExport} disabled={exporting || !data?.pagination.total}>
          {exporting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          Export CSV
        </Button>
      </PageHeader>

      <div className="rounded-xl border bg-card">
        <div className="grid gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,10rem))_auto_auto_auto]">
          <div>
            <label htmlFor="log-search" className="mb-0.5 block text-xs text-muted-foreground">
              Search
            </label>
            <input id="log-search" type="search" placeholder="Activity, person, target or IP" className={fieldClass} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
          </div>
          <div>
            <label htmlFor="log-category" className="mb-0.5 block text-xs text-muted-foreground">
              Category
            </label>
            <select id="log-category" className={fieldClass} value={filters.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>
              {Object.entries(CATEGORIES).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-status" className="mb-0.5 block text-xs text-muted-foreground">
              Result
            </label>
            <select id="log-status" className={fieldClass} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any result</option>
              <option value="success">Success</option>
              <option value="failure">Failed</option>
            </select>
          </div>
          <div>
            <label htmlFor="log-actor" className="mb-0.5 block text-xs text-muted-foreground">
              Person
            </label>
            <select id="log-actor" className={fieldClass} value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })}>
              <option value="">Everyone</option>
              {facets?.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-from" className="mb-0.5 block text-xs text-muted-foreground">
              From
            </label>
            <input id="log-from" type="date" className={fieldClass} value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div>
            <label htmlFor="log-to" className="mb-0.5 block text-xs text-muted-foreground">
              To
            </label>
            <input id="log-to" type="date" className={fieldClass} value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!hasFilters}>
              Clear
            </Button>
          </div>
        </div>

        {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto" aria-busy={loading}>
          <Table>
            <caption className="sr-only">Activity log, newest first. Select a row for details.</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Time</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="pr-4">IP address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cn(loading && data && "opacity-60 transition-opacity")}>
              {!data &&
                Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }, (_, j) => (
                      <TableCell key={j} className={j === 0 ? "pl-4" : undefined}>
                        <Skeleton className={cn("h-4", j === 2 ? "w-64" : "w-20")} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {logs.map((log) => {
                const time = DateTime.fromISO(log.createdAt)
                return (
                  <TableRow key={log._id} className="cursor-pointer" onClick={() => setSelected(log)}>
                    <TableCell className="pl-4 whitespace-nowrap">
                      <p>{time.toLocaleString(DateTime.DATETIME_MED)}</p>
                      <p className="text-xs text-muted-foreground">{time.toRelative()}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium">{log.actor?.name || log.actor?.email || "System"}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_META[log.actor?.role]?.label}</p>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {/* The summary is a button so keyboard users can open the details too. */}
                      <button
                        type="button"
                        className="text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(log)
                        }}
                      >
                        {log.summary || log.action}
                      </button>
                      <p className="font-mono text-[0.7rem] text-muted-foreground">{log.action}</p>
                    </TableCell>
                    <TableCell>
                      <CategoryLabel category={log.category} />
                    </TableCell>
                    <TableCell>
                      <ResultBadge status={log.status} />
                    </TableCell>
                    <TableCell className="pr-4 font-mono text-xs whitespace-nowrap text-muted-foreground">{log.ip || "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {data && logs.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            {hasFilters ? <SearchX className="size-6 text-muted-foreground" aria-hidden="true" /> : <ScrollText className="size-6 text-muted-foreground" aria-hidden="true" />}
            <p className="font-medium">{hasFilters ? "No entries match these filters" : "No activity recorded yet"}</p>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "Try a wider date range or fewer filters." : "Sign-ins and changes to users, projects and the calendar will appear here."}
            </p>
          </div>
        )}

        {data && data.pagination.total > 0 && (
          <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} label={data.pagination.total === 1 ? "entry" : "entries"} onPage={setPage} />
        )}
      </div>

      {facets?.retentionDays && (
        <p className="mt-2 text-xs text-muted-foreground">
          Entries are kept for {facets.retentionDays === 365 ? "one year" : `${facets.retentionDays} days`} and then removed automatically.
        </p>
      )}

      <LogDetails log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
