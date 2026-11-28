import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, LoaderCircle, MoreHorizontal, Pencil, Power, RefreshCw, SearchX, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"

import * as adminApi from "@/api/admin.api"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ActiveBadge, PageHeader, Pagination, ROLE_META, ROLE_ORDER, RelativeTime, RoleBadge, fieldClass, initials, useDebounced } from "@/components/admin/shared"

const PAGE_SIZE = 20
const EMPTY_FORM = { name: "", email: "", role: "user", password: "", isActive: true }

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%"
  const values = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(values, (v) => chars[v % chars.length]).join("")
}

function SortHeader({ label, field, sort, onSort, className }) {
  const active = sort.field === field
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className={className} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" onClick={() => onSort(field)}>
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  )
}

function UserDialog({ open, mode, user, assignableRoles, onClose, onSaved }) {
  const [values, setValues] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setShowPassword(false)
    setValues(mode === "edit" ? { name: user.name, email: user.email, role: user.role, isActive: user.isActive, password: "" } : { ...EMPTY_FORM, password: generatePassword() })
  }, [open, mode, user])

  const set = (patch) => setValues((v) => ({ ...v, ...patch }))

  const submit = async (event) => {
    event.preventDefault()
    const found = {}
    if (values.name.trim().length < 2) found.name = "Enter a name of at least 2 characters."
    if (mode === "create" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "Enter a valid email address."
    if (mode === "create" && values.password.length < 8) found.password = "Use at least 8 characters."
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      if (mode === "create") {
        await adminApi.createUser({ name: values.name.trim(), email: values.email.trim(), role: values.role, password: values.password, isActive: values.isActive })
        toast.success(`${values.name.trim()} was added`)
      } else {
        const patch = {}
        if (values.name.trim() !== user.name) patch.name = values.name.trim()
        if (values.role !== user.role) patch.role = values.role
        if (values.isActive !== user.isActive) patch.isActive = values.isActive
        if (Object.keys(patch).length) {
          await adminApi.updateUser(user._id, patch)
          toast.success(`${values.name.trim()} was updated`)
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setErrors({ form: adminApi.errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const invalid = (key) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `user-${key}-error` } : {})

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${user?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Create an account in this workspace and choose its role." : "Role and status changes apply when the person's session next refreshes (within 15 minutes)."}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={submit} noValidate className="space-y-3">
          <div>
            <label htmlFor="user-name" className="mb-1 block text-sm font-medium">
              Full name
            </label>
            <input id="user-name" className={fieldClass} value={values.name} maxLength={60} autoFocus onChange={(e) => set({ name: e.target.value })} {...invalid("name")} />
            {errors.name && <p id="user-name-error" className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="user-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="user-email"
              type="email"
              autoComplete="off"
              className={fieldClass}
              value={values.email}
              disabled={mode === "edit"}
              onChange={(e) => set({ email: e.target.value })}
              {...invalid("email")}
            />
            {errors.email && <p id="user-email-error" className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="user-role" className="mb-1 block text-sm font-medium">
              Role
            </label>
            <select id="user-role" className={fieldClass} value={values.role} onChange={(e) => set({ role: e.target.value })} disabled={user?.isSelf}>
              {ROLE_ORDER.filter((r) => assignableRoles.includes(r) || r === values.role).map((r) => (
                <option key={r} value={r} disabled={!assignableRoles.includes(r)}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>
            {user?.isSelf && <p className="mt-1 text-xs text-muted-foreground">You can't change your own role.</p>}
          </div>
          {mode === "create" && (
            <div>
              <label htmlFor="user-password" className="mb-1 block text-sm font-medium">
                Temporary password
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="user-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={cn(fieldClass, "pr-9 font-mono")}
                    value={values.password}
                    onChange={(e) => set({ password: e.target.value })}
                    {...invalid("password")}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={() => set({ password: generatePassword() })}>
                  <RefreshCw data-icon="inline-start" />
                  Generate
                </Button>
              </div>
              {errors.password ? (
                <p id="user-password-error" className="mt-1 text-xs text-destructive">{errors.password}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Share it with the person through a secure channel.</p>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.isActive} disabled={user?.isSelf} onChange={(e) => set({ isActive: e.target.checked })} />
            Account is active (can sign in)
          </label>
          {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
            {mode === "create" ? "Add user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState("")
  const role = searchParams.get("role") || ""
  const status = searchParams.get("status") || ""
  const [sort, setSort] = useState({ field: "name", direction: "asc" })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState(null) // { mode, user }
  const [confirm, setConfirm] = useState(null)
  const debouncedSearch = useDebounced(search)

  const myRank = ROLE_META[me?.role]?.rank || 0
  const assignableRoles = ROLE_ORDER.filter((r) => ROLE_META[r].rank <= myRank)

  const setFilter = (key, value) => {
    setPage(1)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  useEffect(() => setPage(1), [debouncedSearch])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    adminApi
      .getUsers({ search: debouncedSearch || undefined, role: role || undefined, status: status || undefined, sort: sort.field, direction: sort.direction, page, limit: PAGE_SIZE }, controller.signal)
      .then((res) => {
        setData(res.data.data)
        setError(null)
      })
      .catch((err) => !controller.signal.aborted && setError(adminApi.errorMessage(err, "Couldn't load users.")))
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
  }, [debouncedSearch, role, status, sort, page, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const onSort = (field) => setSort((s) => ({ field, direction: s.field === field && s.direction === "asc" ? "desc" : "asc" }))

  const users = useMemo(
    () => (data?.users || []).map((u) => ({ ...u, isSelf: String(u._id) === String(me?.id), canManage: (ROLE_META[u.role]?.rank || 0) <= myRank })),
    [data, me, myRank]
  )
  const counts = data?.counts
  const hasFilters = Boolean(search || role || status)

  const toggleActive = async (u) => {
    try {
      await adminApi.updateUser(u._id, { isActive: !u.isActive })
      toast.success(`${u.name} was ${u.isActive ? "deactivated" : "reactivated"}`)
      reload()
    } catch (err) {
      toast.error(adminApi.errorMessage(err))
    } finally {
      setConfirm(null)
    }
  }

  const stats = [
    { label: "Total users", value: counts?.total },
    { label: "Active", value: counts?.active },
    { label: "Inactive", value: counts?.inactive },
    { label: "Administrators", value: counts && (counts.byRole.admin || 0) + (counts.byRole.superadmin || 0) },
  ]

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="User Management" description="Manage user accounts and the roles assigned to them.">
        <Button onClick={() => setDialog({ mode: "create" })}>
          <UserPlus data-icon="inline-start" />
          Add user
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm" className="shadow-none">
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value ?? <Skeleton className="h-7 w-10" />}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="user-search" className="sr-only">
              Search users
            </label>
            <input id="user-search" type="search" placeholder="Search by name or email" className={fieldClass} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor="user-role-filter" className="sr-only">
              Role
            </label>
            <select id="user-role-filter" className={cn(fieldClass, "w-40")} value={role} onChange={(e) => setFilter("role", e.target.value)}>
              <option value="">All roles</option>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label} {counts ? `(${counts.byRole[r] || 0})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="user-status-filter" className="sr-only">
              Status
            </label>
            <select id="user-status-filter" className={cn(fieldClass, "w-36")} value={status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("")
                setSearchParams({}, { replace: true })
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto" aria-busy={loading}>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="User" field="name" sort={sort} onSort={onSort} className="pl-4" />
                <SortHeader label="Role" field="role" sort={sort} onSort={onSort} />
                <TableHead>Status</TableHead>
                <SortHeader label="Last sign-in" field="lastLogin" sort={sort} onSort={onSort} />
                <SortHeader label="Added" field="createdAt" sort={sort} onSort={onSort} />
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cn(loading && data && "opacity-60 transition-opacity")}>
              {!data &&
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-44" />
                        </div>
                      </div>
                    </TableCell>
                    {Array.from({ length: 5 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {users.map((u) => (
                <TableRow key={u._id} className={cn(!u.isActive && "text-muted-foreground")}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-foreground">
                          {u.name}
                          {u.isSelf && <Badge variant="outline">You</Badge>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={u.isActive} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <RelativeTime value={u.lastLogin} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <RelativeTime value={u.createdAt} fallback="—" />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`} disabled={!u.canManage}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", user: u })}>
                          <Pencil />
                          Edit user
                        </DropdownMenuItem>
                        {!u.isSelf && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant={u.isActive ? "destructive" : "default"} onSelect={() => setConfirm(u)}>
                              <Power />
                              {u.isActive ? "Deactivate" : "Reactivate"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {data && users.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            {hasFilters ? <SearchX className="size-6 text-muted-foreground" aria-hidden="true" /> : <Users className="size-6 text-muted-foreground" aria-hidden="true" />}
            <p className="font-medium">{hasFilters ? "No users match these filters" : "No users yet"}</p>
            <p className="text-sm text-muted-foreground">{hasFilters ? "Try another name, role or status." : "Add the first person to this workspace."}</p>
          </div>
        )}

        {data && data.pagination.total > 0 && (
          <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} label={data.pagination.total === 1 ? "user" : "users"} onPage={setPage} />
        )}
      </div>

      <UserDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        user={dialog?.user}
        assignableRoles={assignableRoles}
        onClose={() => setDialog(null)}
        onSaved={reload}
      />

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.isActive ? `Deactivate ${confirm?.name}?` : `Reactivate ${confirm?.name}?`}</DialogTitle>
            <DialogDescription>
              {confirm?.isActive
                ? "They won't be able to sign in. Their current session ends within 15 minutes. Their projects, events and history are kept."
                : "They will be able to sign in again with their existing password."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm?.isActive ? "destructive" : "default"} onClick={() => toggleActive(confirm)} autoFocus>
              {confirm?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
