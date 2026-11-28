import { createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Pin, PinOff, Power } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ActiveBadge, ROLE_META, RelativeTime, RoleBadge, initials } from '@/components/admin/shared';
import { SortableHeader, selectColumn } from '@/components/data-table/columns.jsx';

const columnHelper = createColumnHelper();

export const columnLabels = {
  name: 'User',
  email: 'Email',
  role: 'Role',
  status: 'Status',
  lastLogin: 'Last sign-in',
  createdAt: 'Added',
  updatedAt: 'Updated',
};

/** Role values sort by rank (Super admin first when descending), not alphabetically. */
const roleRank = (role) => ROLE_META[role]?.rank || 0;

/**
 * @param {{ onEdit: Function, onToggleActive: Function }} actions
 */
export function createColumns(actions) {
  return columnHelper.columns([
    selectColumn(columnHelper, {
      allLabel: 'Select all users on this page',
      rowLabel: (user) => `Select ${user.name}`,
    }),
    columnHelper.accessor('name', {
      size: 260,
      filterFn: 'includesString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="User" />,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(row.original.name)}</AvatarFallback>
          </Avatar>
          <p className="flex min-w-0 items-center gap-1.5 font-medium">
            <span className="truncate">{row.original.name}</span>
            {row.original.isSelf && <Badge variant="outline">You</Badge>}
          </p>
        </div>
      ),
    }),
    columnHelper.accessor('email', {
      size: 240,
      filterFn: 'includesString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Email" />,
      cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
    }),
    columnHelper.accessor((row) => ROLE_META[row.role]?.label ?? row.role, {
      id: 'role',
      size: 150,
      filterFn: 'equalsString',
      sortFn: (rowA, rowB) => roleRank(rowA.original.role) - roleRank(rowB.original.role),
      header: ({ column }) => <SortableHeader column={column} label="Role" />,
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    }),
    columnHelper.accessor((row) => (row.isActive ? 'Active' : 'Inactive'), {
      id: 'status',
      size: 130,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
    }),
    columnHelper.accessor((row) => row.lastLogin ?? null, {
      id: 'lastLogin',
      size: 150,
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Last sign-in" />,
      cell: ({ getValue }) => <RelativeTime value={getValue()} />,
    }),
    columnHelper.accessor('createdAt', {
      size: 140,
      filterFn: 'inMonthYear',
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Added" />,
      cell: ({ getValue }) => <RelativeTime value={getValue()} fallback="—" />,
    }),
    columnHelper.accessor((row) => row.updatedAt ?? null, {
      id: 'updatedAt',
      size: 140,
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Updated" />,
      cell: ({ getValue }) => <RelativeTime value={getValue()} fallback="—" />,
    }),
    columnHelper.display({
      id: 'actions',
      size: 52,
      enableCellSelection: false,
      enableHiding: false,
      enablePinning: false,
      enableResizing: false,
      cell: ({ row }) => {
        if (row.getIsGrouped()) return null;
        const user = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${user.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              {user.canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => actions.onEdit(user)}>
                    <Pencil />
                    Edit user
                  </DropdownMenuItem>
                  {!user.isSelf && (
                    <DropdownMenuItem
                      variant={user.isActive ? 'destructive' : 'default'}
                      onClick={() => actions.onToggleActive(user)}
                    >
                      <Power />
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => row.pin('top')}>
                <Pin className="size-4" />
                Pin to top
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => row.pin('bottom')}>
                <Pin className="size-4 rotate-180" />
                Pin to bottom
              </DropdownMenuItem>
              {row.getIsPinned() && (
                <DropdownMenuItem onClick={() => row.pin(false)}>
                  <PinOff className="size-4" />
                  Unpin row
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);
}
