import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  InfiniteData,
} from "@tanstack/react-query";
import { usePostHog, sanitizeProperties } from "../analytics";
import { deleteAllAttachments } from "../attachments";
import { syncCountdownsToWidgets } from "../widgets/widgetDataBridge";
import {
  useEntryRepository,
  Entry,
  CreateEntryInput,
  UpdateEntryInput,
  EntryRepository,
} from "./entries";

// Type for paginated entry results from infinite queries
interface EntryPage {
  entries: Entry[];
  nextCursor?: number;
}

type InfiniteEntryData = InfiniteData<EntryPage, number | undefined>;

/**
 * Query keys for entries
 */
export const entryKeys = {
  all: ["entries"] as const,
  lists: () => [...entryKeys.all, "list"] as const,
  list: (filters?: {
    type?: string;
    isFavorite?: boolean;
    tag?: string;
    limit?: number;
  }) => [...entryKeys.lists(), filters] as const,
  infinite: (filters?: {
    type?: string;
    isFavorite?: boolean;
    tag?: string;
    limit?: number;
  }) => [...entryKeys.lists(), "infinite", filters] as const,
  searches: () => [...entryKeys.all, "search"] as const,
  search: (filters?: {
    query?: string;
    type?: string;
    isFavorite?: boolean;
    dateFrom?: number;
    dateTo?: number;
    limit?: number;
  }) => [...entryKeys.searches(), filters] as const,
  details: () => [...entryKeys.all, "detail"] as const,
  detail: (id: number) => [...entryKeys.details(), id] as const,
  children: (parentId: number) =>
    [...entryKeys.all, "children", parentId] as const,
};

/**
 * Helper to sync widget data after countdown changes
 * Only syncs if the entry is a countdown type
 */
async function syncWidgetsIfCountdown(
  entry: Entry,
  entryRepository: EntryRepository,
): Promise<void> {
  if (entry.type !== "countdown") return;

  try {
    const countdowns = await entryRepository.getAll({ type: "countdown" });
    await syncCountdownsToWidgets(countdowns);
  } catch (error) {
    console.warn("[useEntries] Failed to sync widgets:", error);
  }
}

/**
 * Helper to sync widget data after countdown deletion
 */
async function syncWidgetsAfterDelete(
  entryRepository: EntryRepository,
): Promise<void> {
  try {
    const countdowns = await entryRepository.getAll({ type: "countdown" });
    await syncCountdownsToWidgets(countdowns);
  } catch (error) {
    console.warn("[useEntries] Failed to sync widgets after delete:", error);
  }
}

/**
 * Hook to fetch a single entry by ID
 */
export function useEntry(id: number | undefined) {
  const entryRepository = useEntryRepository();

  return useQuery({
    queryKey: entryKeys.detail(id!),
    queryFn: async () => {
      if (!id) return null;
      try {
        const entry = await entryRepository.getById(id);
        return entry;
      } catch (error) {
        // If entry doesn't exist (e.g., deleted), return null instead of throwing
        // This prevents crashes when entry is deleted while component is still mounted
        console.warn(`[useEntry] Entry ${id} not found:`, error);
        return null;
      }
    },
    enabled: !!id,
    // Retry disabled for deleted entries - if entry is gone, it's gone
    retry: false,
    // Always refetch on mount to get latest saved version when navigating back to entry
    // Use 'always' instead of true because we skip cache updates during editing
    refetchOnMount: "always",
    // Don't refetch on window focus if entry might be deleted
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch all entries with optional filters
 */
export function useEntries(options?: {
  type?: "journal" | "ai_chat" | "countdown";
  isFavorite?: boolean;
  includeArchived?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "updatedAt";
  order?: "ASC" | "DESC";
}) {
  const entryRepository = useEntryRepository();

  return useQuery({
    queryKey: entryKeys.list(options),
    queryFn: async () => {
      return entryRepository.getAll(options);
    },
    // Always refetch on mount to get latest entries when navigating back to list
    refetchOnMount: "always",
  });
}

/**
 * Hook to fetch entries with infinite scroll/pagination
 */
export function useInfiniteEntries(options?: {
  type?: "journal" | "ai_chat" | "countdown";
  isFavorite?: boolean;
  includeArchived?: boolean;
  tag?: string;
  limit?: number;
  orderBy?: "createdAt" | "updatedAt";
  order?: "ASC" | "DESC";
}) {
  const entryRepository = useEntryRepository();
  const pageSize = options?.limit || 20;

  return useInfiniteQuery({
    queryKey: entryKeys.infinite(options),
    queryFn: async ({ pageParam = 0 }) => {
      const entries = await entryRepository.getAll({
        ...options,
        limit: pageSize,
        offset: pageParam,
      });
      return {
        entries,
        nextOffset:
          entries.length === pageSize ? pageParam + pageSize : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    // Always refetch on mount to get latest entries when navigating back to list
    refetchOnMount: "always",
  });
}

/**
 * Hook to search entries with infinite scroll/pagination
 */
export function useSearchEntries(options: {
  query: string;
  type?: "journal" | "ai_chat" | "countdown";
  isFavorite?: boolean;
  includeArchived?: boolean;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
}) {
  const entryRepository = useEntryRepository();
  const pageSize = options?.limit || 20;

  return useInfiniteQuery({
    queryKey: entryKeys.search(options),
    queryFn: async ({ pageParam = 0 }) => {
      const entries = await entryRepository.search({
        ...options,
        limit: pageSize,
        offset: pageParam,
      });
      return {
        entries,
        nextOffset:
          entries.length === pageSize ? pageParam + pageSize : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: options.query.trim().length > 0,
    // Always refetch on mount when searching
    refetchOnMount: "always",
  });
}

/**
 * Hook to create a new entry
 */
export function useCreateEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      return entryRepository.create(input);
    },
    onSuccess: async (entry) => {
      // Sync widgets if this is a countdown
      syncWidgetsIfCountdown(entry, entryRepository);
      // Track entry creation
      if (posthog) {
        posthog.capture(
          "entry_created",
          sanitizeProperties({
            type: entry.type,
            hasBlocks: entry.blocks.length > 0,
            blockCount: entry.blocks.length,
            isFavorite: entry.isFavorite,
            hasAttachments: entry.attachments && entry.attachments.length > 0,
            hasParent: !!entry.parentId,
          }),
        );
      }
      // Add to detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // If this is a child entry (check-in), invalidate the parent's children cache
      if (entry.parentId) {
        queryClient.invalidateQueries({
          queryKey: entryKeys.children(entry.parentId),
        });
        return; // Don't add child entries to the main list
      }

      // Update ALL infinite query caches directly
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page, index: number) => {
                // Add to first page
                if (index === 0) {
                  return {
                    ...page,
                    entries: [entry, ...page.entries],
                  };
                }
                return page;
              }),
            };
          }

          return oldData;
        },
      );
    },
  });
}

/**
 * Hook to update an entry
 */
export function useUpdateEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: number;
      input: UpdateEntryInput;
      skipCacheUpdate?: boolean;
    }) => {
      return entryRepository.update(id, input);
    },
    onSuccess: async (entry, variables) => {
      // Sync widgets if this is a countdown (do this regardless of skipCacheUpdate)
      syncWidgetsIfCountdown(entry, entryRepository);

      // Skip cache update if requested (e.g., during active editing to prevent HTML escaping)
      if (variables.skipCacheUpdate) {
        return;
      }

      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Update ALL infinite query caches directly
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                entries: page.entries.map((e: Entry) =>
                  e.id === entry.id ? entry : e,
                ),
              })),
            };
          }

          return oldData;
        },
      );
    },
  });
}

/**
 * Hook to delete an entry
 * @param input - Either just the entry id (number) or an object with id and optional parentId
 */
export function useDeleteEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (
      input: number | { id: number; parentId?: number | null },
    ) => {
      const id = typeof input === "number" ? input : input.id;
      const parentId = typeof input === "number" ? null : input.parentId;

      // Delete attachment files before deleting the entry
      // (Database records will cascade delete via foreign key)
      try {
        await deleteAllAttachments(id);
      } catch (err) {
        console.warn(
          `[useDeleteEntry] Failed to delete attachments for entry ${id}:`,
          err,
        );
        // Continue with entry deletion even if attachment cleanup fails
      }

      await entryRepository.delete(id);
      return { id, parentId };
    },
    onSuccess: async ({ id, parentId }) => {
      // Always sync widgets after delete (lightweight if no countdowns changed)
      syncWidgetsAfterDelete(entryRepository);
      // Track entry deletion
      if (posthog) {
        posthog.capture("entry_deleted", { entryId: id });
      }
      // Remove from detail cache immediately
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });

      // If this was a child entry, invalidate the parent's children cache
      if (parentId) {
        queryClient.invalidateQueries({
          queryKey: entryKeys.children(parentId),
        });
      }

      // Update ALL infinite query caches directly
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                entries: page.entries.filter((entry: Entry) => entry.id !== id),
              })),
            };
          }

          return oldData;
        },
      );
    },
  });
}

/**
 * Hook to toggle favorite status
 */
export function useToggleFavorite() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (id: number) => {
      return entryRepository.toggleFavorite(id);
    },
    onSuccess: (entry) => {
      // Track favorite toggle
      if (posthog) {
        posthog.capture("entry_favorited", {
          entryId: entry.id,
          isFavorite: entry.isFavorite,
        });
      }
      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Update ALL infinite query caches directly
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                entries: page.entries.map((e: Entry) =>
                  e.id === entry.id ? entry : e,
                ),
              })),
            };
          }

          return oldData;
        },
      );
    },
  });
}

/**
 * Hook to toggle pinned status
 */
export function useTogglePinned() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (id: number) => {
      return entryRepository.togglePinned(id);
    },
    onSuccess: async (entry) => {
      // Sync widgets if this is a countdown (pinned status affects widget sort order)
      syncWidgetsIfCountdown(entry, entryRepository);
      // Track pin toggle
      if (posthog) {
        posthog.capture("entry_pinned", {
          entryId: entry.id,
          isPinned: entry.isPinned,
        });
      }
      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Invalidate list queries since sort order changes with pinning
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    },
  });
}

/**
 * Hook to archive an entry
 */
export function useArchiveEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (id: number) => {
      return entryRepository.archive(id);
    },
    onSuccess: async (entry) => {
      // Sync widgets if this is a countdown (archived countdowns are excluded from widgets)
      syncWidgetsIfCountdown(entry, entryRepository);
      // Track archive
      if (posthog) {
        posthog.capture("entry_archived", {
          entryId: entry.id,
          entryType: entry.type,
        });
      }
      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Remove from list caches since archived entries are hidden by default
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                entries: page.entries.filter((e: Entry) => e.id !== entry.id),
              })),
            };
          }

          return oldData;
        },
      );

      // Also invalidate all entry queries to ensure UI updates
      await queryClient.invalidateQueries({ queryKey: entryKeys.all });
    },
  });
}

/**
 * Hook to unarchive an entry
 */
export function useUnarchiveEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (id: number) => {
      return entryRepository.unarchive(id);
    },
    onSuccess: async (entry) => {
      // Sync widgets if this is a countdown (unarchived countdowns should appear in widgets)
      syncWidgetsIfCountdown(entry, entryRepository);
      // Track unarchive
      if (posthog) {
        posthog.capture("entry_unarchived", {
          entryId: entry.id,
          entryType: entry.type,
        });
      }
      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Update the entry directly in all list caches so archivedAt is immediately null
      queryClient.setQueriesData<InfiniteEntryData | undefined>(
        { queryKey: entryKeys.lists() },
        (oldData) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            // Check if entry exists in any page
            const entryExists = oldData.pages.some((page) =>
              page.entries.some((e: Entry) => e.id === entry.id),
            );

            if (entryExists) {
              // Update the entry in place
              return {
                ...oldData,
                pages: oldData.pages.map((page) => ({
                  ...page,
                  entries: page.entries.map((e: Entry) =>
                    e.id === entry.id ? entry : e,
                  ),
                })),
              };
            } else {
              // Entry not in cache (was filtered out), add to first page
              return {
                ...oldData,
                pages: oldData.pages.map((page, index: number) => {
                  if (index === 0) {
                    return {
                      ...page,
                      entries: [entry, ...page.entries],
                    };
                  }
                  return page;
                }),
              };
            }
          }

          return oldData;
        },
      );
    },
  });
}

/**
 * Hook to fetch child entries (check-ins) for a parent entry
 */
export function useChildEntries(parentId: number | undefined) {
  const entryRepository = useEntryRepository();

  return useQuery({
    queryKey: entryKeys.children(parentId!),
    queryFn: async () => {
      if (!parentId) return [];
      return entryRepository.getChildEntries(parentId);
    },
    enabled: !!parentId,
    refetchOnMount: "always",
  });
}
