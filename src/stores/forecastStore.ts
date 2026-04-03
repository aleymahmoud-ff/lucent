// ============================================
// Forecast Store - Global State Management
// ============================================

import { create } from 'zustand';
import type {
  Dataset,
  PreprocessConfig,
  ForecastConfig,
  ForecastResult,
  EntityStats,
} from '@/types';

interface ForecastStore {
  // Current dataset
  currentDataset: Dataset | null;
  setCurrentDataset: (dataset: Dataset | null) => void;

  // Current entity
  currentEntity: string | null;
  setCurrentEntity: (entity: string | null) => void;

  // Preprocessing state
  preprocessConfig: PreprocessConfig;
  updatePreprocessConfig: (config: Partial<PreprocessConfig>) => void;
  resetPreprocessConfig: () => void;

  // Entity statistics
  entityStats: EntityStats | null;
  setEntityStats: (stats: EntityStats | null) => void;

  // Forecast configuration
  forecastConfig: ForecastConfig;
  updateForecastConfig: (config: Partial<ForecastConfig>) => void;

  // Forecast results
  forecastResults: ForecastResult | null;
  setForecastResults: (results: ForecastResult | null) => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Reset all state
  reset: () => void;
}

const defaultPreprocessConfig: PreprocessConfig = {
  missingValues: {
    method: 'linear',
  },
  duplicates: {
    method: 'keep_first',
  },
  outliers: {
    method: 'iqr',
    threshold: 1.5,
    action: 'cap',
  },
  valueReplacements: [],
};

const defaultForecastConfig: ForecastConfig = {
  method: 'arima',
  horizon: 30,
  frequency: 'daily',
  confidenceLevel: 0.95,
  methodSettings: {
    auto: true,
  },
};

export const useForecastStore = create<ForecastStore>((set) => ({
  // Initial state
  currentDataset: null,
  currentEntity: null,
  preprocessConfig: defaultPreprocessConfig,
  entityStats: null,
  forecastConfig: defaultForecastConfig,
  forecastResults: null,
  isLoading: false,
  error: null,

  // Actions
  setCurrentDataset: (dataset) => set({ currentDataset: dataset }),

  setCurrentEntity: (entity) => set({ currentEntity: entity }),

  updatePreprocessConfig: (config) =>
    set((state) => ({
      preprocessConfig: { ...state.preprocessConfig, ...config },
    })),

  resetPreprocessConfig: () => set({ preprocessConfig: defaultPreprocessConfig }),

  setEntityStats: (stats) => set({ entityStats: stats }),

  updateForecastConfig: (config) =>
    set((state) => ({
      forecastConfig: { ...state.forecastConfig, ...config },
    })),

  setForecastResults: (results) => set({ forecastResults: results }),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      currentDataset: null,
      currentEntity: null,
      preprocessConfig: defaultPreprocessConfig,
      entityStats: null,
      forecastConfig: defaultForecastConfig,
      forecastResults: null,
      isLoading: false,
      error: null,
    }),
}));
