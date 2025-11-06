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
      const entry = await entryRepository.getById(id);
      return entry;
    },
    enabled: !!id,
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
      // Remove from cache
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
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
