import { useDatabase } from "./DatabaseProvider";
import { SQLiteDatabase } from "expo-sqlite";

export interface OnboardingSettings {
  hasCompletedOnboarding: boolean;
  completedAt?: number;
}

const SETTINGS_KEY = "onboarding_settings";

export class OnboardingSettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<OnboardingSettings | null> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.value) as OnboardingSettings;
    } catch {
      return null;
    }
  }

  async set(settings: OnboardingSettings): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(settings), now]
    );
  }

  async hasCompletedOnboarding(): Promise<boolean> {
    const settings = await this.get();
    return settings?.hasCompletedOnboarding ?? false;
  }

  async markOnboardingComplete(): Promise<void> {
    const settings: OnboardingSettings = {
      hasCompletedOnboarding: true,
      completedAt: Date.now(),
    };
    await this.set(settings);
  }
}

export function useOnboardingSettings(): {
  getSettings: () => Promise<OnboardingSettings | null>;
  setSettings: (settings: OnboardingSettings) => Promise<void>;
  hasCompletedOnboarding: () => Promise<boolean>;
  markOnboardingComplete: () => Promise<void>;
} {
  const db = useDatabase();
  const repo = new OnboardingSettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings: OnboardingSettings) => repo.set(settings),
    hasCompletedOnboarding: () => repo.hasCompletedOnboarding(),
    markOnboardingComplete: () => repo.markOnboardingComplete(),
  };
}

