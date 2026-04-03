'use client';

import { useState, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Search, Table2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { wizardApi } from '@/lib/api/wizard-endpoints';
import type { WizardTable } from '@/types/wizard';
import { toast } from 'sonner';

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatRowCount(count: number | null): string {
  if (count === null) return 'Unknown';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M rows`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K rows`;
  return `${count} rows`;
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface TableStepProps {
  connectorId: string;
  onSelect: (table: WizardTable) => void;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function TableStep({ connectorId, onSelect }: TableStepProps) {
  const [search, setSearch] = useState('');
  const [tables, setTables] = useState<WizardTable[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { mutate: loadTables, isPending } = useMutation({
    mutationFn: () => wizardApi.listTables(connectorId),
    onSuccess: (data) => {
      setTables(Array.isArray(data) ? data : []);
      setHasLoaded(true);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Failed to load tables';
      toast.error('Could not load tables', { description: message });
      setHasLoaded(true);
    },
  });

  // Trigger load on mount
  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tables;
    const q = search.toLowerCase();
    return tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.schema_name.toLowerCase().includes(q)
    );
  }, [tables, search]);

  if (isPending && !hasLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading tables...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Select a Table</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose the table that contains your time series data.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tables..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Retry / empty state */}
      {hasLoaded && tables.length === 0 && !isPending && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">No tables found or could not connect.</p>
          <Button variant="outline" size="sm" onClick={() => loadTables()}>
            Retry
          </Button>
        </div>
      )}

      {/* Table list */}
      {filtered.length > 0 && (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {filtered.map((table) => (
            <li key={`${table.schema_name}.${table.name}`}>
              <button
                type="button"
                onClick={() => onSelect(table)}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border',
                  'text-left text-sm transition-colors',
                  'hover:bg-accent hover:border-primary/40',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{table.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {table.schema_name}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {formatRowCount(table.row_count)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtered.length === 0 && tables.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No tables match your search.
        </p>
      )}
    </div>
  );
}
