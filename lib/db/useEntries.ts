import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  list: (filters?: { type?: string; isFavorite?: boolean; tag?: string }) =>
    [...entryKeys.lists(), filters] as const,
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
  });
}

/**
 * Hook to create a new entry
 */
export function useCreateEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      return entryRepository.create(input);
    },
    onSuccess: (entry) => {
      // Invalidate and refetch entries list
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      // Add the new entry to cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);
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
    }) => {
      return entryRepository.update(id, input);
    },
    onSuccess: (entry) => {
      // Update the entry in cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);
      // Invalidate lists to ensure they're up to date
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    },
  });
}

/**
 * Hook to delete an entry
 */
export function useDeleteEntry() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await entryRepository.delete(id);
    },
    onSuccess: (_, id) => {
      // Remove from cache first to prevent components from accessing deleted entry
      // CRITICAL: Remove queries to free memory - React Query cache can accumulate
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });

      // Invalidate lists after a small delay to ensure cache removal completes
      // This prevents race conditions where components try to access deleted entries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      }, 0);

      // Aggressively garbage collect unused queries to free memory
      // Don't clear all cache - just remove unused entries
      setTimeout(() => {
        const cache = queryClient.getQueryCache();
        cache.getAll().forEach((query) => {
          // Remove queries that are not being observed (no active components using them)
          if (!query.getObserversCount() && query.state.dataUpdateCount > 0) {
            cache.remove(query);
          }
        });
      }, 500);
    },
  });
}

/**
 * Hook to toggle favorite status
 */
export function useToggleFavorite() {
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return entryRepository.toggleFavorite(id);
    },
    onSuccess: (entry) => {
      // Update the entry in cache
      queryClient.setQueryData(entryKeys.detail(entry.id), entry);
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
    },
  });
}
