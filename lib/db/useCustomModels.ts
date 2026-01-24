/**
 * Custom Models Hook
 *
 * React hook for accessing custom models repository.
 * This is separated from the repository to keep tests simple.
 */

import { CustomModelsRepository } from "./customModels";
import { useDatabase } from "./DatabaseProvider";
import type {
  CreateCustomLocalModelInput,
  CreateRemoteModelInput,
  UpdateCustomModelInput,
  CustomModelType,
} from "../ai/customModels";

/**
 * Hook to access custom models repository.
 * Uses the database from DatabaseProvider context.
 */
export function useCustomModels() {
  const db = useDatabase();
  const repo = new CustomModelsRepository(db);

  return {
    // Create
    createCustomLocalModel: (input: CreateCustomLocalModelInput) =>
      repo.createCustomLocalModel(input),
    createRemoteModel: (input: CreateRemoteModelInput) =>
      repo.createRemoteModel(input),

    // Read
    getAll: () => repo.getAll(),
    getByModelId: (modelId: string) => repo.getByModelId(modelId),
    getByType: (modelType: CustomModelType) => repo.getByType(modelType),
    getEnabledModels: () => repo.getEnabledModels(),
    getCustomLocalModels: () => repo.getCustomLocalModels(),
    getRemoteModels: () => repo.getRemoteModels(),

    // Update
    update: (modelId: string, input: UpdateCustomModelInput) =>
      repo.update(modelId, input),
    acknowledgePrivacy: (modelId: string) => repo.acknowledgePrivacy(modelId),
    setEnabled: (modelId: string, enabled: boolean) =>
      repo.setEnabled(modelId, enabled),

    // Delete
    delete: (modelId: string) => repo.delete(modelId),
  };
}
