'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Loader2,
  CheckCircle2,
  Users,
  ExternalLink,
  Database,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  WizardEntity,
  WizardSetupResponse,
  WizardTable,
} from '@/types/wizard';
import { toast } from 'sonner';

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface SetupCompleteStepProps {
  connectorId: string;
  table: WizardTable;
  columnMap: WizardColumnMap;
  tenantSlug: string;
  onBack: () => void;
  onComplete: (result: WizardSetupResponse) => void;
}

// -------------------------------------------------------
// Sub-components
// -------------------------------------------------------

function EntityList({ entities }: { entities: WizardEntity[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">
          Extracted Entities ({entities.length})
        </h4>
      </div>
      <div className="rounded-md border overflow-auto max-h-56">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs">Entity ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs text-right">Row Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.map((entity) => (
              <TableRow key={entity.id} className="text-xs">
                <TableCell className="font-mono">{entity.id}</TableCell>
                <TableCell>{entity.name ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                <TableCell className="text-right font-mono">
                  {entity.count.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function SetupCompleteStep({
  connectorId,
  table,
  columnMap,
  tenantSlug,
  onBack,
  onComplete,
}: SetupCompleteStepProps) {
  const [name, setName] = useState(
    `${table.schema_name}.${table.name}`.slice(0, 80)
  );
  const [result, setResult] = useState<WizardSetupResponse | null>(null);

  const columnMapRecord: Record<string, string> = {
    date: columnMap.date,
    entity_id: columnMap.entity_id,
    volume: columnMap.volume,
    ...(columnMap.entity_name ? { entity_name: columnMap.entity_name } : {}),
  };

  const { mutate: runSetup, isPending } = useMutation({
    mutationFn: () =>
      wizardApi.setup(connectorId, {
        table: table.name,
        column_map: columnMapRecord,
        name: name.trim(),
      }),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Data source configured successfully', {
        description: `${data.entity_count} entities extracted.`,
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Setup failed';
      toast.error('Setup failed', { description: message });
    },
  });

  const isNameValid = name.trim().length > 0;

  // Success state
  if (result) {
    return (
      <div className="space-y-5">
        {/* Success header */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Setup complete</p>
            <p className="text-xs text-muted-foreground">
              Data source{' '}
              <span className="font-mono text-foreground">{name}</span> is ready.
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Database className="h-3 w-3" />
            Source ID: <span className="font-mono">{result.data_source_id.slice(0, 8)}…</span>
          </Badge>
          <Badge variant="secondary" className="gap-1.5">
            <Users className="h-3 w-3" />
            {result.entity_count} entities
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-xs">
            RLS column: <span className="font-mono">{result.rls_column}</span>
          </Badge>
        </div>

        {/* Entity list */}
        <EntityList entities={result.entities} />

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            asChild
          >
            <a href={`/lucent/${tenantSlug}/settings`}>
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Configure RLS
            </a>
          </Button>
          <Button onClick={() => onComplete(result)}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Confirm Setup</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Give your data source a name and complete the setup. The system will
          extract all entities from the selected table.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border p-4 space-y-2 bg-muted/30 text-sm">
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Table:</span>
          <span className="font-mono">
            {table.schema_name}.{table.name}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Date:</span>
          <span className="font-mono">{columnMap.date}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Entity ID:</span>
          <span className="font-mono">{columnMap.entity_id}</span>
        </div>
        {columnMap.entity_name && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Entity Name:</span>
            <span className="font-mono">{columnMap.entity_name}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Volume:</span>
          <span className="font-mono">{columnMap.volume}</span>
        </div>
      </div>

      {/* Name input */}
      <div className="space-y-1.5">
        <Label htmlFor="ds-name" className="text-sm font-medium">
          Data Source Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ds-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Data — SQL Server"
          maxLength={120}
        />
        {!isNameValid && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Name is required.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={isPending}>
          Back
        </Button>
        <Button
          onClick={() => runSetup()}
          disabled={!isNameValid || isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            'Complete Setup'
          )}
        </Button>
      </div>
    </div>
  );
}
