'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  Download,
  CheckCircle2,
  Calendar,
  Users,
  BarChart2,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dataSourceApi } from '@/lib/api/wizard-endpoints';
import { tenantAdminApi } from '@/lib/api/endpoints';
import type { WizardEntity, WizardImportResponse } from '@/types/wizard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

const today = new Date();

const QUICK_RANGES: { label: string; start: Date; end: Date }[] = [
  {
    label: '3 months',
    start: addMonths(today, -3),
    end: today,
  },
  {
    label: '6 months',
    start: addMonths(today, -6),
    end: today,
  },
  {
    label: '1 year',
    start: addMonths(today, -12),
    end: today,
  },
];

// -------------------------------------------------------
// Sub-components
// -------------------------------------------------------

function EntityTable({ entities }: { entities: WizardEntity[] }) {
  if (entities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No entities available for this data source.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-auto max-h-52">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-xs">Entity ID</TableHead>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs text-right">Rows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entities.map((entity) => (
            <TableRow key={entity.id} className="text-xs">
              <TableCell className="font-mono">{entity.id}</TableCell>
              <TableCell>
                {entity.name ?? (
                  <span className="text-muted-foreground italic">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {entity.count.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ImportSuccess({
  result,
  onReset,
}: {
  result: WizardImportResponse;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Import successful</p>
          <p className="text-xs text-muted-foreground">
            Your dataset is ready to use.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <Database className="h-3 w-3" />
          Dataset:{' '}
          <span className="font-mono">{result.dataset_id.slice(0, 8)}…</span>
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <BarChart2 className="h-3 w-3" />
          {result.row_count.toLocaleString()} rows
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Users className="h-3 w-3" />
          {result.entity_count} entities
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            result.status === 'ready'
              ? 'border-green-500/40 text-green-600'
              : 'border-amber-500/40 text-amber-600'
          )}
        >
          {result.status}
        </Badge>
      </div>

      <Button variant="outline" size="sm" onClick={onReset} className="w-full">
        Import Another Dataset
      </Button>
    </div>
  );
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface DataSourceImportProps {
  /** Pre-selected data source ID (optional) */
  initialDataSourceId?: string;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function DataSourceImport({ initialDataSourceId }: DataSourceImportProps) {
  const [dataSourceId, setDataSourceId] = useState(
    initialDataSourceId ?? ''
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [importResult, setImportResult] =
    useState<WizardImportResponse | null>(null);

  // Load available connectors (data sources are linked to connectors)
  const {
    data: connectorsData,
    isLoading: loadingConnectors,
  } = useQuery({
    queryKey: ['connectors', 'list'],
    queryFn: () => tenantAdminApi.listConnectors({ limit: 100 }),
  });

  const connectors = connectorsData?.connectors ?? [];

  // Load entities for selected data source
  const {
    data: entities,
    isLoading: loadingEntities,
    isError: entitiesError,
  } = useQuery<WizardEntity[]>({
    queryKey: ['data-source-entities', dataSourceId],
    queryFn: () => dataSourceApi.getEntities(dataSourceId),
    enabled: Boolean(dataSourceId),
  });

  const { mutate: runImport, isPending: importing } = useMutation({
    mutationFn: () =>
      dataSourceApi.importData(dataSourceId, {
        ...(startDate ? { date_range_start: startDate } : {}),
        ...(endDate ? { date_range_end: endDate } : {}),
      }),
    onSuccess: (data) => {
      setImportResult(data);
      toast.success('Data imported successfully', {
        description: `${data.row_count.toLocaleString()} rows across ${data.entity_count} entities.`,
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Import failed';
      toast.error('Import failed', { description: message });
    },
  });

  function applyQuickRange(start: Date, end: Date) {
    setStartDate(toDateString(start));
    setEndDate(toDateString(end));
  }

  function applyAllRange() {
    setStartDate('');
    setEndDate('');
  }

  function handleReset() {
    setImportResult(null);
    setStartDate('');
    setEndDate('');
  }

  const canImport = Boolean(dataSourceId) && !importing;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Import from Data Source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {importResult ? (
          <ImportSuccess result={importResult} onReset={handleReset} />
        ) : (
          <>
            {/* Data source selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Data Source <span className="text-destructive">*</span>
              </Label>
              {loadingConnectors ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading data sources...
                </div>
              ) : (
                <Select value={dataSourceId} onValueChange={setDataSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a configured data source" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectors.length === 0 && (
                      <SelectItem value="__empty__" disabled>
                        No connectors available
                      </SelectItem>
                    )}
                    {connectors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            {c.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Entity list (read-only, filtered by RLS server-side) */}
            {dataSourceId && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">
                    Available Entities
                  </Label>
                  {loadingEntities && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                {entitiesError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Could not load entities. You may not have access.
                  </p>
                )}
                {!loadingEntities && !entitiesError && entities && (
                  <EntityTable entities={entities} />
                )}
              </div>
            )}

            {/* Date range */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Date Range</Label>
                <span className="text-xs text-muted-foreground">
                  (optional — leave empty for all data)
                </span>
              </div>

              {/* Quick select buttons */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_RANGES.map((range) => (
                  <Button
                    key={range.label}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2.5"
                    onClick={() => applyQuickRange(range.start, range.end)}
                  >
                    {range.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2.5"
                  onClick={applyAllRange}
                >
                  All data
                </Button>
              </div>

              {/* Manual date inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor="start-date"
                    className="text-xs text-muted-foreground"
                  >
                    Start date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="end-date"
                    className="text-xs text-muted-foreground"
                  >
                    End date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Import button */}
            <Button
              className="w-full"
              disabled={!canImport}
              onClick={() => runImport()}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Import Data
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
