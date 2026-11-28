import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table.jsx';
import { MonthYearFilter, RangeFilter, SelectFilter } from '@/components/data-table/filters.jsx';
import { columnLabels, createColumns } from './columns.jsx';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const GROUP_OPTIONS = [
  { value: 'status', label: 'Group by status' },
  { value: 'category', label: 'Group by category' },
  { value: 'priority', label: 'Group by priority' },
  { value: 'client', label: 'Group by client' },
];

const INITIAL_STATE = {
  columnPinning: { start: ['select', 'code'] },
  sorting: [{ id: 'createdAt', desc: true }],
};

export function ProjectsDataTable({ data, onEdit, onDelete, canEdit, canDelete }) {
  const columns = useMemo(
    () => createColumns({ onEdit, onDelete, canEdit, canDelete }),
    [onEdit, onDelete, canEdit, canDelete],
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      columnLabels={columnLabels}
      groupOptions={GROUP_OPTIONS}
      searchPlaceholder="Search projects..."
      emptyMessage="No projects match the current filters."
      exportFileName="projects.csv"
      defaultManagedColumn="code"
      initialState={INITIAL_STATE}
      filters={(table) => (
        <>
          <MonthYearFilter table={table} columnId="createdAt" />
          <RangeFilter table={table} columnId="budget" label="Budget" />
          <SelectFilter table={table} columnId="status" options={STATUS_OPTIONS} allLabel="All statuses" />
        </>
      )}
    />
  );
}
