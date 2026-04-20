/**
 * Query keys for entries
 *
 * Extracted to its own file to avoid circular imports between
 * useEntries and SyncInitializer.
 */
export const entryKeys = {
  all: ["entries"] as const,
  lists: () => [...entryKeys.all, "list"] as const,
  list: (filters?: {
    type?: string;
    isFavorite?: boolean;
    includeArchived?: boolean;
    tag?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    order?: string;
  }) => [...entryKeys.lists(), filters] as const,
  infinite: (filters?: {
    type?: string;
    isFavorite?: boolean;
    includeArchived?: boolean;
    tag?: string;
    limit?: number;
    orderBy?: string;
    order?: string;
  }) => [...entryKeys.lists(), "infinite", filters] as const,
  searches: () => [...entryKeys.all, "search"] as const,
  search: (filters?: {
    query?: string;
    type?: string;
    isFavorite?: boolean;
    isPinned?: boolean;
    includeArchived?: boolean;
    archivedOnly?: boolean;
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
  }) => [...entryKeys.searches(), filters] as const,
  details: () => [...entryKeys.all, "detail"] as const,
  detail: (id: number) => [...entryKeys.details(), id] as const,
  children: (parentId: number) =>
    [...entryKeys.all, "children", parentId] as const,
};
