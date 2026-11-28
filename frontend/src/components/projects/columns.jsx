import { createColumnHelper } from '@tanstack/react-table';
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { SortableHeader, selectColumn } from '@/components/data-table/columns.jsx';

const columnHelper = createColumnHelper();

export const columnLabels = {
  code: 'Code',
  title: 'Project',
  client: 'Client',
  category: 'Category',
  priority: 'Priority',
  status: 'Status',
  budget: 'Budget',
  spent: 'Spent',
  remaining: 'Remaining',
  dueDate: 'Due Date',
  createdBy: 'Created By',
  updatedBy: 'Updated By',
  createdAt: 'Created',
  updatedAt: 'Updated',
};

export const STATUS_COLORS = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  inactive: 'bg-muted text-muted-foreground',
  archived: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const PRIORITY_COLORS = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatCurrency = (value) => (typeof value === 'number' ? currency.format(value) : '');
export const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '—');

const capitalize = (value) => (value ? value[0].toUpperCase() + value.slice(1) : '—');

function ToneBadge({ value, tones }) {
  return (
    <Badge variant="outline" className={cn('border-transparent capitalize', tones[value])}>
      {value || '—'}
    </Badge>
  );
}

function MoneyCell({ value, negativeTone = false }) {
  return (
    <span
      className={cn(
        'block text-right tabular-nums',
        negativeTone && value < 0 && 'text-red-600 dark:text-red-400',
      )}
    >
      {formatCurrency(value)}
    </span>
  );
}

/**
 * @param {{ onEdit: Function, onDelete: Function, canEdit: Function, canDelete: Function }} actions
 */
export function createColumns(actions) {
  const money = (key, label, extra = {}) => ({
    size: 150,
    sortFn: 'basic',
    aggregationFn: 'sum',
    header: ({ column }) => <SortableHeader column={column} label={label} align="right" />,
    cell: ({ getValue }) => <MoneyCell value={getValue()} negativeTone={key === 'remaining'} />,
    aggregatedCell: ({ getValue }) => (
      <span className="block text-right font-semibold">
        <MoneyCell value={getValue()} negativeTone={key === 'remaining'} />
      </span>
    ),
    ...extra,
  });

  return columnHelper.columns([
    selectColumn(columnHelper, {
      allLabel: 'Select all projects on this page',
      rowLabel: (project) => `Select ${project.title}`,
    }),
    columnHelper.accessor('code', {
      size: 150,
      filterFn: 'includesString',
      sortFn: 'alphanumeric',
      header: ({ column }) => <SortableHeader column={column} label="Code" />,
      cell: ({ getValue }) => <span className="font-mono text-xs font-medium">{getValue() || '—'}</span>,
    }),
    columnHelper.accessor('title', {
      size: 280,
      filterFn: 'includesString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Project" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.title}</p>
          {row.original.description && (
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          )}
        </div>
      ),
    }),
    columnHelper.accessor((row) => row.client ?? '', {
      id: 'client',
      size: 180,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Client" />,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.accessor((row) => row.category ?? '', {
      id: 'category',
      size: 150,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Category" />,
      cell: ({ getValue }) => capitalize(getValue()),
    }),
    columnHelper.accessor((row) => row.priority ?? '', {
      id: 'priority',
      size: 130,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Priority" />,
      cell: ({ getValue }) => <ToneBadge value={getValue()} tones={PRIORITY_COLORS} />,
    }),
    columnHelper.accessor('status', {
      size: 130,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Status" />,
      cell: ({ getValue }) => <ToneBadge value={getValue()} tones={STATUS_COLORS} />,
    }),
    columnHelper.accessor((row) => row.budget ?? 0, {
      id: 'budget',
      filterFn: 'inNumberRange',
      ...money('budget', 'Budget'),
    }),
    columnHelper.accessor((row) => row.spent ?? 0, {
      id: 'spent',
      ...money('spent', 'Spent'),
    }),
    columnHelper.accessor((row) => (row.budget ?? 0) - (row.spent ?? 0), {
      id: 'remaining',
      ...money('remaining', 'Remaining'),
    }),
    columnHelper.accessor((row) => row.dueDate ?? null, {
      id: 'dueDate',
      size: 140,
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Due Date" />,
      cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue())}</span>,
    }),
    columnHelper.accessor((row) => row.createdBy?.name ?? '', {
      id: 'createdBy',
      size: 160,
      filterFn: 'equalsString',
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Created By" />,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.accessor((row) => row.updatedBy?.name ?? '', {
      id: 'updatedBy',
      size: 160,
      sortFn: 'text',
      header: ({ column }) => <SortableHeader column={column} label="Updated By" />,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.accessor('createdAt', {
      size: 140,
      filterFn: 'inMonthYear',
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Created" />,
      cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue())}</span>,
    }),
    columnHelper.accessor('updatedAt', {
      size: 140,
      sortFn: 'datetime',
      header: ({ column }) => <SortableHeader column={column} label="Updated" />,
      cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue())}</span>,
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
        const project = row.original;
        const canEdit = actions.canEdit(project);
        const canDelete = actions.canDelete(project);

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <span className="sr-only">Open row actions</span>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{project.code || project.title}</DropdownMenuLabel>
              {project.code && (
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(project.code)}>
                  <Copy className="size-4" />
                  Copy code
                </DropdownMenuItem>
              )}
              {(canEdit || canDelete) && <DropdownMenuSeparator />}
              {canEdit && (
                <DropdownMenuItem onClick={() => actions.onEdit(project)}>
                  <Pencil />
                  Edit project
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(project)}>
                  <Trash2 />
                  Delete project
                </DropdownMenuItem>
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
