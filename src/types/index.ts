// ============================================
// LUCENT Platform - TypeScript Types
// ============================================

// User & Authentication Types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'analyst' | 'viewer';
  tenantId: string;
  createdAt: string;
  lastLogin?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
  limits: TenantLimits;
  isActive: boolean;
  createdAt: string;
}

export interface TenantLimits {
  maxUsers: number;
  maxFileSizeMb: number;
  maxEntitiesPerBatch: number;
  maxConcurrentForecasts: number;
  maxForecastHorizon: number;
  rateLimitForecastsPerHour: number;
}

// Dataset Types
export interface Dataset {
  id: string;
  name: string;
  filename: string;
  size: number;
  rowCount: number;
  columnCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  entities: string[];
  uploadedAt: string;
  uploadedBy: string;
}

export interface DataSummary {
  totalRows: number;
  totalColumns: number;
  missingValues: number;
  missingPercentage: number;
  dateRange: {
    start: string;
    end: string;
  };
  entityCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  missingCount: number;
  uniqueCount: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
}

// Preprocessing Types
export interface PreprocessConfig {
  missingValues: MissingValuesConfig;
  duplicates: DuplicatesConfig;
  outliers: OutliersConfig;
  valueReplacements: ValueReplacementConfig[];
  timeAggregation?: TimeAggregationConfig;
}

export interface MissingValuesConfig {
  method: 'linear' | 'polynomial' | 'spline' | 'forward_fill' | 'backward_fill' | 'mean';
  order?: number; // for polynomial
}

export interface DuplicatesConfig {
  method: 'keep_first' | 'keep_last' | 'remove_all' | 'average' | 'sum';
}

export interface OutliersConfig {
  method: 'iqr' | 'zscore';
  threshold: number;
  action: 'remove' | 'cap' | 'replace_mean' | 'replace_median';
}

export interface ValueReplacementConfig {
  condition: 'equals' | 'greater_than' | 'less_than' | 'between';
  value: number | string;
  replacement: number | string;
  secondValue?: number; // for 'between'
}

export interface TimeAggregationConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  method: 'sum' | 'mean' | 'median' | 'min' | 'max' | 'first' | 'last';
  customDays?: number;
}

export interface EntityStats {
  entityId: string;
  entityName: string;
  observationCount: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  missingCount: number;
  missingPercentage: number;
  outlierCount: number;
  duplicateCount: number;
}

// Forecasting Types
export interface ForecastConfig {
  method: 'arima' | 'ets' | 'prophet';
  horizon: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  confidenceLevel: number; // 0.80, 0.90, 0.95, 0.99
  methodSettings: ARIMASettings | ETSSettings | ProphetSettings;
  crossValidation?: CrossValidationConfig;
}

export interface ARIMASettings {
  auto: boolean;
  p?: number;
  d?: number;
  q?: number;
  P?: number;
  D?: number;
  Q?: number;
  s?: number; // seasonality period
}

export interface ETSSettings {
  auto: boolean;
  error?: 'add' | 'mul';
  trend?: 'add' | 'mul' | 'none';
  seasonal?: 'add' | 'mul' | 'none';
  seasonalPeriods?: number;
}

export interface ProphetSettings {
  changepoints?: string[];
  changepointPriorScale?: number;
  seasonalityPriorScale?: number;
  seasonalityMode?: 'additive' | 'multiplicative';
  yearlySeasonality?: boolean | number;
  weeklySeasonality?: boolean | number;
  dailySeasonality?: boolean | number;
  regressors?: string[];
}

export interface CrossValidationConfig {
  enabled: boolean;
  folds: number;
  method: 'rolling' | 'expanding';
  initialTrainSize?: number; // percentage
}

export interface ForecastResult {
  id: string;
  datasetId: string;
  entityId: string;
  method: 'arima' | 'ets' | 'prophet';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  predictions: Prediction[];
  metrics: ForecastMetrics;
  modelSummary: ModelSummary;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface Prediction {
  date: string;
  value: number;
  lowerBound: number;
  upperBound: number;
}

export interface ForecastMetrics {
  mae: number;
  rmse: number;
  mape: number;
  aic?: number;
  bic?: number;
  mse?: number;
  r2?: number;
}

export interface ModelSummary {
  method: string;
  parameters: Record<string, any>;
  coefficients?: Record<string, number>;
  standardErrors?: Record<string, number>;
  pValues?: Record<string, number>;
  diagnostics?: DiagnosticsData;
}

// Diagnostics Types
export interface DiagnosticsData {
  residuals: number[];
  acf: number[];
  pacf: number[];
  ljungBox: {
    statistic: number;
    pValue: number;
  };
  jarqueBera: {
    statistic: number;
    pValue: number;
  };
  seasonalStrength?: number;
  trendStrength?: number;
}

export interface QualityIndicators {
  accuracy: number; // 0-100
  stability: number; // 0-100
  reliability: number; // 0-100
  coverage: number; // 0-100
}

// Data Connector Types
export interface DataConnector {
  id: string;
  name: string;
  type: 'postgres' | 'mysql' | 'sqlserver' | 's3' | 'azure_blob' | 'gcs' | 'bigquery' | 'snowflake' | 'api';
  config: Record<string, any>;
  isActive: boolean;
  lastTested?: string;
  lastTestStatus?: 'success' | 'failed';
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

// Chart Types
export interface ChartData {
  x: (string | number)[];
  y: number[];
  name?: string;
  type?: 'scatter' | 'bar' | 'line';
  mode?: 'lines' | 'markers' | 'lines+markers';
  marker?: {
    color?: string;
    size?: number;
  };
  line?: {
    color?: string;
    width?: number;
  };
}

// WebSocket Types
export interface ProgressUpdate {
  forecastId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  currentEntity?: string;
  completedEntities?: number;
  totalEntities?: number;
}

// Export Types
export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf' | 'json';
  includeMetrics: boolean;
  includeCharts: boolean;
  includeDiagnostics: boolean;
}
