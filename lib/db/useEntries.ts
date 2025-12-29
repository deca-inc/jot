import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { usePostHog, sanitizeProperties } from "../analytics";
import {
  useEntryRepository,
  Entry,
  CreateEntryInput,
  UpdateEntryInput,
} from "./entries";

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
};

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
  type?: "journal" | "ai_chat";
  isFavorite?: boolean;
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
  type?: "journal" | "ai_chat";
  isFavorite?: boolean;
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
  type?: "journal" | "ai_chat";
  isFavorite?: boolean;
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
    onSuccess: (entry) => {
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
          }),
        );
      }
      // Add to detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Update ALL infinite query caches directly
      queryClient.setQueriesData(
        { queryKey: entryKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any, index: number) => {
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
    onSuccess: (entry, variables) => {
      // Skip cache update if requested (e.g., during active editing to prevent HTML escaping)
      if (variables.skipCacheUpdate) {
        return;
      }

      // Update detail cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);

      // Update ALL infinite query caches directly
      queryClient.setQueriesData(
        { queryKey: entryKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
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
 */
export function useDeleteEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  return useMutation({
    mutationFn: async (id: number) => {
      await entryRepository.delete(id);
      return id;
    },
    onSuccess: (id) => {
      // Track entry deletion
      if (posthog) {
        posthog.capture("entry_deleted", { entryId: id });
      }
      // Remove from detail cache immediately
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });

      // Update ALL infinite query caches directly
      queryClient.setQueriesData(
        { queryKey: entryKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
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
      queryClient.setQueriesData(
        { queryKey: entryKeys.lists() },
        (oldData: any) => {
          if (!oldData) return oldData;

          // Check if this is an infinite query
          if (oldData.pages && Array.isArray(oldData.pages)) {
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
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
