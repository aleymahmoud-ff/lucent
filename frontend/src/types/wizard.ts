// ============================================
// Connector Wizard & Data Source Types
// ============================================

export interface WizardTable {
  name: string;
  schema_name: string;
  row_count: number | null;
}

export interface WizardColumn {
  name: string;
  type: string;
  nullable: boolean;
  sample: string | null;
}

export interface WizardDateRange {
  min_date: string | null;
  max_date: string | null;
  total_rows: number;
}

export interface WizardEntity {
  id: string;
  name: string | null;
  count: number;
}

export interface WizardSetupResponse {
  data_source_id: string;
  entities: WizardEntity[];
  rls_column: string;
  entity_count: number;
}

export interface WizardImportResponse {
  dataset_id: string;
  data_source_id: string;
  row_count: number;
  entity_count: number;
  status: string;
}

export interface WizardPreviewResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
}

export interface WizardColumnMap {
  date: string;
  entity_id: string;
  entity_name?: string;
  volume: string;
}

// Accumulated wizard state passed between steps
export interface WizardData {
  selectedTable?: WizardTable;
  columnMap?: WizardColumnMap;
  setupResult?: WizardSetupResponse;
}
