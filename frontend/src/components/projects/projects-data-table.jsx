import { useMemo, useState } from 'react';
import { useTable } from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Download,
  GripVertical,
  Layers3,
  Maximize2,
  MoveLeft,
  MoveRight,
  Pin,
  PinOff,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { columnLabels, createColumns } from './columns.jsx';
import { features } from './data-table-features.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUSES = ['active', 'inactive', 'archived'];

const GROUP_OPTIONS = [
  { value: 'status', label: 'Group by status' },
  { value: 'category', label: 'Group by category' },
  { value: 'priority', label: 'Group by priority' },
  { value: 'client', label: 'Group by client' },
];

const densityClasses = {
  compact: 'h-9 py-1',
  comfortable: 'h-12 py-2',
  spacious: 'h-16 py-3',
};

const NON_DATA_COLUMNS = ['select', 'actions'];
const DEFAULT_MANAGED_COLUMN = 'code';

function getPinnedStyles(column) {
  const pinned = column.getIsPinned();

  return {
    left: pinned === 'start' ? `${column.getStart('start')}px` : undefined,
    maxWidth: column.getSize(),
    minWidth: column.getSize(),
    right: pinned === 'end' ? `${column.getAfter('end')}px` : undefined,
    position: pinned ? 'sticky' : 'relative',
    width: column.getSize(),
    zIndex: pinned ? 2 : 0,
  };
}

function stringifyCellValue(value) {
  if (value == null) return '';
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}

const escapeCsv = (value) => `"${stringifyCellValue(value).replaceAll('"', '""')}"`;

export function ProjectsDataTable({ data, onEdit, onDelete, canEdit, canDelete }) {
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(false);
  const [density, setDensity] = useState('compact');
  const [managedColumnId, setManagedColumnId] = useState(DEFAULT_MANAGED_COLUMN);

  const tableColumns = useMemo(
    () => createColumns({ onEdit, onDelete, canEdit, canDelete }),
    [onEdit, onDelete, canEdit, canDelete],
  );

  const years = useMemo(
    () =>
      Array.from(new Set(data.map((p) => new Date(p.createdAt).getFullYear()).filter(Boolean))).sort(
        (a, b) => b - a,
      ),
    [data],
  );

  const statusCounts = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, data.filter((p) => p.status === s).length])),
    [data],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data,
    columnResizeMode: 'onChange',
    enableCellSelection: true,
    enableMultiRowSelection: true,
    enableRowRangeSelection: true,
    getRowId: (row) => String(row._id),
    groupedColumnMode: false,
    initialState: {
      columnPinning: { start: ['select', 'code'], end: [] },
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [{ id: 'createdAt', desc: true }],
    },
  });

  const managedColumn = table.getColumn(managedColumnId);
  const orderedColumnIds = table.state.columnOrder.length
    ? table.state.columnOrder
    : table.getAllLeafColumns().map((column) => column.id);

  // ── Filter helpers ──────────────────────────────────────
  const createdAtColumn = table.getColumn('createdAt');
  const monthYear = createdAtColumn?.getFilterValue() ?? {};
  const setMonthYear = (patch) => {
    createdAtColumn?.setFilterValue({ ...monthYear, ...patch });
    table.setPageIndex(0);
  };

  const budgetColumn = table.getColumn('budget');
  const [minBudget = '', maxBudget = ''] = budgetColumn?.getFilterValue() ?? [];
  const setBudgetRange = (min, max) => {
    budgetColumn?.setFilterValue(min === '' && max === '' ? undefined : [min, max]);
    table.setPageIndex(0);
  };

  const statusColumn = table.getColumn('status');

  // ── Actions ─────────────────────────────────────────────
  function moveManagedColumn(offset) {
    const currentIndex = orderedColumnIds.indexOf(managedColumnId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedColumnIds.length) return;

    const nextOrder = [...orderedColumnIds];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    table.setColumnOrder(nextOrder);
  }

  function resetTable() {
    table.resetCellSelection(true);
    table.resetColumnFilters(true);
    table.resetColumnOrder(true);
    table.resetColumnPinning();
    table.resetColumnSizing(true);
    table.resetColumnVisibility();
    table.resetExpanded(true);
    table.resetGlobalFilter(true);
    table.resetGrouping(true);
    table.resetPagination();
    table.resetRowPinning(true);
    table.resetRowSelection(true);
    table.resetSorting();
    setDensity('compact');
    setManagedColumnId(DEFAULT_MANAGED_COLUMN);
  }

  function exportCsv() {
    const exportColumns = table
      .getVisibleLeafColumns()
      .filter((column) => !NON_DATA_COLUMNS.includes(column.id));
    const selectedRows = table.getSelectedRowModel().flatRows.filter((row) => !row.getIsGrouped());
    const rows = selectedRows.length
      ? selectedRows
      : table.getFilteredRowModel().flatRows.filter((row) => !row.getIsGrouped());
    const csv = [
      exportColumns.map((column) => escapeCsv(columnLabels[column.id] ?? column.id)).join(','),
      ...rows.map((row) => exportColumns.map((column) => escapeCsv(row.getValue(column.id))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'projects.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copySelectedCells() {
    const text = table
      .getSelectedCellRangesData()
      .map((range) => range.map((row) => row.map(stringifyCellValue).join('\t')).join('\n'))
      .join('\n\n');
    if (text) await navigator.clipboard.writeText(text);
  }

  function handleGridKeyDown(event) {
    const directions = { ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up' };
    const direction = directions[event.key];

    if (direction) {
      event.preventDefault();
      if (event.shiftKey) table.extendCellSelection(direction);
      else table.moveCellSelection(direction);
    }
    if (event.key === 'Escape') table.resetCellSelection(true);
  }

  // ── Rendering ───────────────────────────────────────────
  function renderCell(cell, row) {
    if (cell.getIsCovered()) return null;

    const pinned = cell.column.getIsPinned();
    const edges = cell.getSelectionEdges();

    return (
      <TableCell
        key={cell.id}
        colSpan={cell.getColSpan()}
        rowSpan={cell.getRowSpan()}
        tabIndex={cell.getTabIndex()}
        style={getPinnedStyles(cell.column)}
        onMouseDown={cell.getSelectionStartHandler()}
        onMouseEnter={cell.getSelectionExtendHandler()}
        className={cn(
          densityClasses[density],
          'relative truncate bg-background outline-none',
          NON_DATA_COLUMNS.includes(cell.column.id) ? 'px-2' : 'px-4',
          pinned && 'shadow-[1px_0_0_0_var(--border)]',
          cell.getCanSelect() && 'cursor-cell select-none',
          cell.getIsSelected() && 'bg-primary/10 dark:bg-primary/20',
          edges.top && 'border-t-2 border-t-primary',
          edges.bottom && 'border-b-2 border-b-primary',
          edges.left && 'border-l-2 border-l-primary',
          edges.right && 'border-r-2 border-r-primary',
        )}
      >
        {cell.getIsGrouped() ? (
          <button
            type="button"
            className="flex items-center gap-2 font-semibold capitalize"
            onClick={row.getToggleExpandedHandler()}
          >
            <ChevronRight className={cn('size-4 transition-transform', row.getIsExpanded() && 'rotate-90')} />
            {String(cell.getValue() || 'None')} ({row.subRows.length})
          </button>
        ) : cell.getIsPlaceholder() ? null : (
          <table.FlexRender cell={cell} />
        )}
      </TableCell>
    );
  }

  function renderRow(row, pinned = false) {
    return (
      <TableRow
        key={`${pinned ? 'pinned-' : ''}${row.id}`}
        data-state={row.getIsSelected() ? 'selected' : undefined}
        className={cn(pinned && 'bg-muted/50', row.getIsGrouped() && 'bg-muted/30 font-medium')}
      >
        {row.getVisibleCells().map((cell) => renderCell(cell, row))}
      </TableRow>
    );
  }

  const topRows = table.getTopRows();
  const centerRows = table.getCenterRows();
  const bottomRows = table.getBottomRows();
  const selectedCellCount = table.getSelectedCellCount();
  const managedColumns = table.getAllLeafColumns().filter((column) => !NON_DATA_COLUMNS.includes(column.id));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Collapsible
        open={advancedControlsOpen}
        onOpenChange={setAdvancedControlsOpen}
        className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm"
      >
        {/* ── Filter bar ── */}
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1 xl:max-w-md">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={String(table.state.globalFilter ?? '')}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              placeholder="Search projects..."
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select
              value={monthYear.month === undefined ? 'all' : String(monthYear.month)}
              onValueChange={(value) => setMonthYear({ month: value === 'all' ? undefined : Number(value) })}
            >
              <SelectTrigger size="sm" className="min-w-36">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={monthYear.year === undefined ? 'all' : String(monthYear.year)}
              onValueChange={(value) => setMonthYear({ year: value === 'all' ? undefined : Number(value) })}
            >
              <SelectTrigger size="sm" className="min-w-28">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={minBudget}
              onChange={(event) => setBudgetRange(event.target.value, maxBudget)}
              placeholder="Min budget"
              aria-label="Minimum budget"
              className="h-7 sm:w-36"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={maxBudget}
              onChange={(event) => setBudgetRange(minBudget, event.target.value)}
              placeholder="Max budget"
              aria-label="Maximum budget"
              className="h-7 sm:w-36"
            />

            <Select
              value={statusColumn?.getFilterValue() ?? 'all'}
              onValueChange={(value) => {
                statusColumn?.setFilterValue(value === 'all' ? undefined : value);
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger size="sm" className="min-w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses ({data.length})</SelectItem>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {`${status[0].toUpperCase()}${status.slice(1)} (${statusCounts[status]})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto w-fit shrink-0 self-end text-muted-foreground xl:self-auto"
            >
              <SlidersHorizontal className="size-4" />
              Advanced table controls
              <ChevronDown className={cn('size-4 transition-transform', advancedControlsOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* ── Advanced controls ── */}
        <CollapsibleContent>
          <div className="flex flex-col gap-2 border-t pt-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={table.state.grouping[0] ?? 'none'}
                onValueChange={(value) => {
                  table.setGrouping(value === 'none' ? [] : [value]);
                  table.setExpanded(true);
                }}
              >
                <SelectTrigger size="sm" className="min-w-40">
                  <Layers3 className="size-4" />
                  <SelectValue placeholder="Group rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  {GROUP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={density} onValueChange={setDensity}>
                <SelectTrigger size="sm" className="min-w-36">
                  <Rows3 className="size-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 className="size-4" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="px-2 py-1.5 text-sm text-foreground">Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllLeafColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(value === true)}
                        onSelect={(event) => event.preventDefault()}
                        className="gap-2 py-1.5 pr-2 pl-8 *:data-[slot=dropdown-menu-checkbox-item-indicator]:right-auto *:data-[slot=dropdown-menu-checkbox-item-indicator]:left-2"
                      >
                        {columnLabels[column.id] ?? column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Select value={managedColumnId} onValueChange={setManagedColumnId}>
                <SelectTrigger size="sm" className="min-w-36">
                  <GripVertical className="size-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {managedColumns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {columnLabels[column.id] ?? column.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => moveManagedColumn(-1)}
                aria-label="Move selected column left"
              >
                <MoveLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => moveManagedColumn(1)}
                aria-label="Move selected column right"
              >
                <MoveRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => managedColumn?.pin(managedColumn.getIsPinned() ? false : 'start')}
                aria-label="Toggle pin for selected column"
              >
                {managedColumn?.getIsPinned() ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={copySelectedCells} disabled={selectedCellCount === 0}>
                <Copy className="size-4" />
                Copy cells ({selectedCellCount})
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="size-4" />
                Export CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={resetTable}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Table ── */}
      <div
        role="grid"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        className="overflow-auto rounded-lg border bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Table
          className="table-fixed border-separate border-spacing-0"
          style={{ minWidth: table.getTotalSize(), width: '100%' }}
        >
          <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={getPinnedStyles(header.column)}
                    className={cn(
                      'relative bg-muted/95',
                      NON_DATA_COLUMNS.includes(header.column.id) ? 'px-2' : 'px-4',
                      header.column.getIsPinned() && 'shadow-[1px_0_0_0_var(--border)]',
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    {header.column.getCanResize() && (
                      <button
                        type="button"
                        aria-label={`Resize ${header.column.id} column`}
                        onDoubleClick={() => header.column.resetSize()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          'absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary',
                          header.column.getIsResizing() && 'bg-primary',
                        )}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {topRows.map((row) => renderRow(row, true))}
            {centerRows.length ? (
              centerRows.map((row) => renderRow(row))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Search className="size-6" />
                    No projects match the current filters.
                  </div>
                </TableCell>
              </TableRow>
            )}
            {bottomRows.map((row) => renderRow(row, true))}
          </TableBody>
        </Table>
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground">
          {table.getFilteredSelectedRowModel().flatRows.length} of {table.getFilteredRowModel().flatRows.length}{' '}
          row(s) selected
          <span className="mx-2">·</span>
          {selectedCellCount} cell(s) selected
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <Select
            value={String(table.state.pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="min-w-28 text-center font-medium">
            Page {table.state.pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Hints ── */}
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p className="flex items-center gap-1.5">
          <Maximize2 className="size-3.5" /> Drag cells to select; use Shift + arrow keys to extend.
        </p>
        <p>Shift-click sortable headers for multi-column sorting.</p>
        <p>Drag header edges to resize; double-click to reset width.</p>
      </div>
    </div>
  );
}
