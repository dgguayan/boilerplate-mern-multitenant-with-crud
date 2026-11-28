import {
  aggregationFn_count,
  aggregationFn_mean,
  aggregationFn_sum,
  constructFilterFn,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_inNumberRange,
  filterFn_includesString,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  stockFeatures,
  tableFeatures,
} from '@tanstack/react-table';
import { matchesMonthYear } from './match.js';

// Filter value: { month: 0-11 | undefined, year: number | undefined }
const filterFn_inMonthYear = constructFilterFn({
  filter: matchesMonthYear,
  autoRemove: (val) => !val || (val.month === undefined && val.year === undefined),
});

export const features = tableFeatures({
  ...stockFeatures,

  expandedRowModel: createExpandedRowModel(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  groupedRowModel: createGroupedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),

  aggregationFns: {
    count: aggregationFn_count,
    mean: aggregationFn_mean,
    sum: aggregationFn_sum,
  },

  filterFns: {
    equalsString: filterFn_equalsString,
    inMonthYear: filterFn_inMonthYear,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
  },

  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});
