import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Eye, EyeOff, LoaderCircle, RefreshCw, UserPlus } from "lucide-react"
import { toast } from "sonner"

import * as adminApi from "@/api/admin.api"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, ROLE_META, ROLE_ORDER, fieldClass } from "@/components/admin/shared"
import { DataTable } from "@/components/data-table/data-table.jsx"
import { MonthYearFilter, SelectFilter } from "@/components/data-table/filters.jsx"
import { columnLabels, createColumns } from "@/components/users/columns.jsx"

const EMPTY_FORM = { name: "", email: "", role: "user", password: "", isActive: true }

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%"
  const values = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(values, (v) => chars[v % chars.length]).join("")
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

// The role and status columns hold display labels ("Super admin", "Active"), so search, grouping
// and CSV export read the same words the table shows.
const ROLE_OPTIONS = ROLE_ORDER.map((r) => ({ value: ROLE_META[r].label, label: ROLE_META[r].label }))
const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
]
const STATUS_LABELS = { active: "Active", inactive: "Inactive" }
const GROUP_OPTIONS = [
  { value: "role", label: "Group by role" },
  { value: "status", label: "Group by status" },
]

/** Filters named in the URL, e.g. /members?role=admin from Roles & permissions. Unknown values are ignored. */
function filtersFromUrl(searchParams) {
  const role = ROLE_META[searchParams.get("role")]?.label
  const status = STATUS_LABELS[searchParams.get("status")]
  return [role && { id: "role", value: role }, status && { id: "status", value: status }].filter(Boolean)
}

/** Client-side table: load every user in the workspace (the API pages at 100), then filter locally. */
async function fetchAllUsers(signal) {
  const users = []
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await adminApi.getUsers({ sort: "name", direction: "asc", page, limit: 100 }, signal)
    users.push(...res.data.data.users)
    pages = res.data.data.pagination.pages
  }
  return users
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState(null) // { mode, user }
  const [confirm, setConfirm] = useState(null)

  const myRank = ROLE_META[me?.role]?.rank || 0
  const assignableRoles = ROLE_ORDER.filter((r) => ROLE_META[r].rank <= myRank)

  // A link with ?role= / ?status= opens the table pre-filtered. The parameters are then removed so
  // the address never disagrees with filters changed in the table; a new link remounts the table.
  const [entry, setEntry] = useState(() => ({ id: 0, filters: filtersFromUrl(searchParams) }))
  useEffect(() => {
    if (!searchParams.has("role") && !searchParams.has("status")) return
    const filters = filtersFromUrl(searchParams)
    setEntry((current) => ({ id: current.id + 1, filters }))
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])
  const initialState = useMemo(
    () => ({
      columnPinning: { start: ["select", "name"] },
      sorting: [{ id: "name", desc: false }],
      columnFilters: entry.filters,
    }),
    [entry]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchAllUsers(controller.signal)
      .then((users) => {
        setData(users)
        setError(null)
      })
      .catch((err) => !controller.signal.aborted && setError(adminApi.errorMessage(err, "Couldn't load users.")))
    return () => controller.abort()
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  const users = useMemo(
    () => (data || []).map((u) => ({ ...u, isSelf: String(u._id) === String(me?.id), canManage: (ROLE_META[u.role]?.rank || 0) <= myRank })),
    [data, me, myRank]
  )

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

  const columns = useMemo(
    () => createColumns({ onEdit: (u) => setDialog({ mode: "edit", user: u }), onToggleActive: setConfirm }),
    []
  )

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="User Management" description="Manage user accounts and the roles assigned to them.">
        <Button onClick={() => setDialog({ mode: "create" })}>
          <UserPlus data-icon="inline-start" />
          Add user
        </Button>
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Skeleton only on first load so table state survives refreshes after edits */}
      {!data && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14 w-full rounded-lg" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        data && (
          <DataTable
            key={entry.id}
            data={users}
            columns={columns}
            columnLabels={columnLabels}
            groupOptions={GROUP_OPTIONS}
            searchPlaceholder="Search users..."
            emptyMessage="No users match the current filters."
            exportFileName="users.csv"
            defaultManagedColumn="name"
            initialState={initialState}
            rowClassName={(row) => !row.original.isActive && "text-muted-foreground"}
            filters={(table) => (
              <>
                <MonthYearFilter table={table} columnId="createdAt" />
                <SelectFilter table={table} columnId="role" options={ROLE_OPTIONS} allLabel="All roles" />
                <SelectFilter table={table} columnId="status" options={STATUS_OPTIONS} allLabel="All statuses" />
              </>
            )}
          />
        )
      )}

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
