import { Fragment, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Info, Minus, UserRound } from "lucide-react"

import * as adminApi from "@/api/admin.api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader, ROLE_META } from "@/components/admin/shared"

// Every access level has an icon and words, not just a colour.
const ACCESS = {
  all: { label: "Allowed", icon: Check, className: "text-emerald-700 dark:text-emerald-400" },
  own: { label: "Own only", icon: UserRound, className: "text-amber-700 dark:text-amber-400" },
  none: { label: "No access", icon: Minus, className: "text-muted-foreground" },
}

function AccessCell({ level }) {
  const meta = ACCESS[level] || ACCESS.none
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", meta.className)}>
      <meta.icon className="size-4" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export default function RolesPermissions() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    adminApi
      .getRoles()
      .then((res) => setData(res.data.data))
      .catch((err) => setError(adminApi.errorMessage(err, "Couldn't load roles.")))
  }, [])

  const roles = data?.roles || []

  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <PageHeader title="Roles and Permissions" description="Manage roles and define what each role can view, access, or modify." />

      <div className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">
          These are the rules the server enforces for every request. To give someone different access, change their role in{" "}
          <Link to="/members" className="font-medium text-foreground underline-offset-4 hover:underline">
            User Management
          </Link>
          .
        </p>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      <section aria-labelledby="roles-heading" className="mb-6">
        <h2 id="roles-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Roles
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {!data &&
            !error &&
            Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="shadow-none">
                <CardContent className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          {roles.map((role) => {
            const Icon = ROLE_META[role.key]?.icon
            return (
              <Card key={role.key} className="shadow-none">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
                      {Icon && <Icon className="size-4" aria-hidden="true" />}
                    </span>
                    <div>
                      <CardTitle>{role.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">Level {role.rank} of 4</p>
                    </div>
                  </div>
                  <CardDescription className="mt-2">{role.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/members?role=${role.key}`}>
                      {role.users} {role.users === 1 ? "user" : "users"}
                      {role.users !== role.activeUsers && <span className="text-muted-foreground">· {role.activeUsers} active</span>}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="matrix-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="matrix-heading" className="text-lg font-semibold tracking-tight">
            Permissions
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
            {Object.entries(ACCESS).map(([key, meta]) => (
              <li key={key} className={cn("inline-flex items-center gap-1", meta.className)}>
                <meta.icon className="size-3.5" aria-hidden="true" />
                {meta.label}
                <span className="text-muted-foreground">
                  {key === "all" ? "— any record" : key === "own" ? "— records they created" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">What each role can do, by module</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="min-w-56 pl-4">
                  Permission
                </TableHead>
                {roles.map((role) => (
                  <TableHead key={role.key} scope="col">
                    {role.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data &&
                !error &&
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4">
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    {Array.from({ length: 4 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {data?.permissions.map((group) => (
                <Fragment key={group.module}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead scope="colgroup" colSpan={roles.length + 1} className="pl-4 text-xs font-semibold tracking-wide uppercase">
                      {group.module}
                    </TableHead>
                  </TableRow>
                  {group.actions.map((action) => (
                    <TableRow key={action.key}>
                      <TableHead scope="row" className="h-auto py-2.5 pl-4 font-normal whitespace-normal text-foreground">
                        {action.label}
                        {action.note && <span className="mt-0.5 block text-xs text-muted-foreground">{action.note}</span>}
                      </TableHead>
                      {roles.map((role) => (
                        <TableCell key={role.key}>
                          <AccessCell level={action.access[role.key]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
