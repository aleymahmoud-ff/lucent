'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertCircle, BarChart2, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { wizardApi } from '@/lib/api/wizard-endpoints';
import type {
  WizardColumnMap,
  WizardPreviewResponse,
  WizardTable,
} from '@/types/wizard';
import { toast } from 'sonner';

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface PreviewStepProps {
  connectorId: string;
  table: WizardTable;
  columnMap: WizardColumnMap;
  onNext: () => void;
  onBack: () => void;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function SummaryBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getCellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '—';
  return String(v);
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function PreviewStep({
  connectorId,
  table,
  columnMap,
  onNext,
  onBack,
}: PreviewStepProps) {
  const [preview, setPreview] = useState<WizardPreviewResponse | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const columnMapRecord: Record<string, string> = {
    date: columnMap.date,
    entity_id: columnMap.entity_id,
    volume: columnMap.volume,
    ...(columnMap.entity_name ? { entity_name: columnMap.entity_name } : {}),
  };

  const { mutate: loadPreview, isPending } = useMutation({
    mutationFn: () =>
      wizardApi.preview(connectorId, {
        table: table.name,
        column_map: columnMapRecord,
        limit: 100,
      }),
    onSuccess: (data) => {
      setPreview(data);
      setHasLoaded(true);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Failed to load preview';
      toast.error('Preview failed', { description: message });
      setHasLoaded(true);
    },
  });

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isPending && !hasLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Fetching preview data...
        </p>
      </div>
    );
  }

  if (hasLoaded && !preview && !isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Could not load preview.</p>
        <Button variant="outline" size="sm" onClick={() => loadPreview()}>
          Retry
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Go Back
        </Button>
      </div>
    );
  }

  const displayColumns = preview?.columns ?? [];
  const rows = preview?.rows ?? [];

  // Derive summary stats from the preview rows
  const dateValues = rows
    .map((r) => getCellValue(r, columnMap.date))
    .filter((v) => v !== '—')
    .sort();
  const minDate = dateValues[0] ?? null;
  const maxDate = dateValues[dateValues.length - 1] ?? null;
  const entityIds = new Set(
    rows.map((r) => getCellValue(r, columnMap.entity_id)).filter((v) => v !== '—')
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Preview Data</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Showing up to 100 rows from{' '}
          <span className="font-mono text-foreground">
            {table.schema_name}.{table.name}
          </span>
        </p>
      </div>

      {/* Summary stats bar */}
      {preview && (
        <div className="flex flex-wrap gap-2">
          <SummaryBadge
            icon={BarChart2}
            label="Total rows"
            value={formatRowCount(preview.row_count)}
          />
          {minDate && maxDate && (
            <SummaryBadge
              icon={Calendar}
              label="Date range"
              value={`${minDate} — ${maxDate}`}
            />
          )}
          <SummaryBadge
            icon={Users}
            label="Entities (sample)"
            value={String(entityIds.size)}
          />
          <Badge variant="outline" className="self-center text-xs">
            Preview: {rows.length} rows
          </Badge>
        </div>
      )}

      {/* Table */}
      {displayColumns.length > 0 && (
        <div className="rounded-md border overflow-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {displayColumns.map((col) => (
                  <TableHead
                    key={col}
                    className="text-xs font-semibold whitespace-nowrap"
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className="text-xs">
                  {displayColumns.map((col) => (
                    <TableCell
                      key={col}
                      className="py-1.5 whitespace-nowrap font-mono"
                    >
                      {getCellValue(row, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue to Setup</Button>
      </div>
    </div>
  );
}
