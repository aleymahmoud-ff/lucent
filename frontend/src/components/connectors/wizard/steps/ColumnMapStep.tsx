'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { wizardApi } from '@/lib/api/wizard-endpoints';
import type { WizardColumn, WizardColumnMap, WizardTable } from '@/types/wizard';
import { toast } from 'sonner';

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ColumnMapStepProps {
  connectorId: string;
  table: WizardTable;
  initialMap?: Partial<WizardColumnMap>;
  onNext: (columnMap: WizardColumnMap) => void;
  onBack: () => void;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function ColumnTypeTag({ type }: { type: string }) {
  return (
    <Badge
      variant="secondary"
      className="text-[10px] px-1.5 py-0 font-mono shrink-0"
    >
      {type}
    </Badge>
  );
}

function ColumnSelectField({
  label,
  value,
  required,
  columns,
  onChange,
}: {
  label: string;
  value: string;
  required: boolean;
  columns: WizardColumn[];
  onChange: (v: string) => void;
}) {
  const selectedCol = columns.find((c) => c.name === value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {required && (
          <span className="text-destructive text-xs font-medium">*</span>
        )}
        {!required && (
          <span className="text-muted-foreground text-xs">(optional)</span>
        )}
      </div>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(!value && required ? 'border-destructive/50' : '')}
        >
          <SelectValue placeholder={`Select ${label} column`} />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value="__none__">
              <span className="text-muted-foreground italic">None</span>
            </SelectItem>
          )}
          {columns.map((col) => (
            <SelectItem key={col.name} value={col.name}>
              <div className="flex items-center gap-2">
                <span>{col.name}</span>
                <ColumnTypeTag type={col.type} />
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sample value + nullability info */}
      {selectedCol && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          <span>
            Sample:{' '}
            <span className="font-mono">
              {selectedCol.sample ?? 'null'}
            </span>
            {selectedCol.nullable && (
              <span className="ml-2 text-amber-600">(nullable)</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ColumnMapStep({
  connectorId,
  table,
  initialMap,
  onNext,
  onBack,
}: ColumnMapStepProps) {
  const [columns, setColumns] = useState<WizardColumn[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dateCol, setDateCol] = useState(initialMap?.date ?? '');
  const [entityIdCol, setEntityIdCol] = useState(initialMap?.entity_id ?? '');
  const [entityNameCol, setEntityNameCol] = useState(
    initialMap?.entity_name ?? ''
  );
  const [volumeCol, setVolumeCol] = useState(initialMap?.volume ?? '');

  const { mutate: loadColumns, isPending } = useMutation({
    mutationFn: () => wizardApi.listColumns(connectorId, table.name),
    onSuccess: (data) => {
      setColumns(Array.isArray(data) ? data : []);
      setHasLoaded(true);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Failed to load columns';
      toast.error('Could not load columns', { description: message });
      setHasLoaded(true);
    },
  });

  useEffect(() => {
    loadColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.name]);

  const isValid = Boolean(dateCol && entityIdCol && volumeCol);

  function handleNext() {
    if (!isValid) return;
    onNext({
      date: dateCol,
      entity_id: entityIdCol,
      ...(entityNameCol && entityNameCol !== '__none__'
        ? { entity_name: entityNameCol }
        : {}),
      volume: volumeCol,
    });
  }

  if (isPending && !hasLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading columns...</p>
      </div>
    );
  }

  if (hasLoaded && columns.length === 0 && !isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Could not load columns for this table.</p>
        <Button variant="outline" size="sm" onClick={() => loadColumns()}>
          Retry
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Map Columns</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Map columns from{' '}
          <span className="font-mono text-foreground">{table.schema_name}.{table.name}</span>{' '}
          to their semantic roles.
        </p>
      </div>

      <div className="space-y-5">
        <ColumnSelectField
          label="Date Column"
          value={dateCol}
          required
          columns={columns}
          onChange={setDateCol}
        />
        <ColumnSelectField
          label="Entity ID Column"
          value={entityIdCol}
          required
          columns={columns}
          onChange={setEntityIdCol}
        />
        <ColumnSelectField
          label="Entity Name Column"
          value={entityNameCol}
          required={false}
          columns={columns}
          onChange={setEntityNameCol}
        />
        <ColumnSelectField
          label="Volume Column"
          value={volumeCol}
          required
          columns={columns}
          onChange={setVolumeCol}
        />
      </div>

      {!isValid && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          Date, Entity ID, and Volume columns are required.
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={!isValid}>
          Preview Data
        </Button>
      </div>
    </div>
  );
}
