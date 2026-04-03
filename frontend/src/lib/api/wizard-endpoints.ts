// ============================================
// Connector Wizard & Data Source API Endpoints
// ============================================
// These extend the main endpoints.ts with Phase 6 wizard functionality.

import { api } from './client';
import type {
  WizardTable,
  WizardColumn,
  WizardPreviewResponse,
  WizardDateRange,
  WizardSetupResponse,
  WizardEntity,
  WizardImportResponse,
} from '@/types/wizard';

// ============================================
// Connector Wizard API (Admin only)
// prefix: /api/v1/connectors/{id}/wizard/
// ============================================

export const wizardApi = {
  listTables: (connectorId: string) =>
    api.post<WizardTable[]>(`/connectors/${connectorId}/wizard/tables`),

  listColumns: (connectorId: string, table: string) =>
    api.post<WizardColumn[]>(`/connectors/${connectorId}/wizard/columns`, { table }),

  preview: (
    connectorId: string,
    data: { table: string; column_map: Record<string, string>; limit?: number }
  ) => api.post<WizardPreviewResponse>(`/connectors/${connectorId}/wizard/preview`, data),

  dateRange: (
    connectorId: string,
    data: { table: string; date_column: string }
  ) => api.post<WizardDateRange>(`/connectors/${connectorId}/wizard/date-range`, data),

  setup: (
    connectorId: string,
    data: { table: string; column_map: Record<string, string>; name: string }
  ) => api.post<WizardSetupResponse>(`/connectors/${connectorId}/wizard/setup`, data),
};

// ============================================
// Data Source API (All authenticated users)
// prefix: /api/v1/data-sources/{id}/
// ============================================

export const dataSourceApi = {
  getEntities: (dataSourceId: string) =>
    api.get<WizardEntity[]>(`/data-sources/${dataSourceId}/entities`),

  importData: (
    dataSourceId: string,
    data: { date_range_start?: string; date_range_end?: string }
  ) => api.post<WizardImportResponse>(`/data-sources/${dataSourceId}/import`, data),
};
