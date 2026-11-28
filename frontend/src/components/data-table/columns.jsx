import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/** Header button that toggles sorting; Shift-click adds a column to a multi-sort. */
export function SortableHeader({ column, label, align = 'left' }) {
  const direction = column.getIsSorted();
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      className={cn('h-8', align === 'right' ? '-mr-3 ml-auto flex' : '-ml-3')}
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      <SortIcon className="size-3.5" />
      {column.getSortIndex() > 0 && (
        <span className="text-[10px] text-muted-foreground">{column.getSortIndex() + 1}</span>
      )}
    </Button>
  );
}

/**
 * Row-selection checkbox column.
 * @param columnHelper  the table's column helper
 * @param {{ allLabel: string, rowLabel: (row) => string }} labels  accessible names
 */
export function selectColumn(columnHelper, { allLabel, rowLabel }) {
  return columnHelper.display({
    id: 'select',
    size: 44,
    enableCellSelection: false,
    enableHiding: false,
    enablePinning: false,
    enableResizing: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
        aria-label={allLabel}
      />
    ),
    cell: ({ row }) =>
      row.getIsGrouped() ? null : (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          aria-label={rowLabel(row.original)}
        />
      ),
  });
}
