"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Users } from "lucide-react";
import { api } from "@/lib/api/client";

export interface Entity {
  name: string;
  row_count: number;
  date_range?: { start: string; end: string };
  has_missing: boolean;
  missing_count: number;
}

export const ALL_ENTITIES_VALUE = "__ALL__";

interface EntitySelectorProps {
  datasetId: string;
  selectedEntity: string | null;
  onEntityChange: (entityId: string | null) => void;
  onEntitiesLoaded?: (entities: Entity[]) => void;
}

export function EntitySelector({
  datasetId,
  selectedEntity,
  onEntityChange,
  onEntitiesLoaded,
}: EntitySelectorProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datasetId) {
      fetchEntities();
    }
  }, [datasetId]);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ entities: Entity[]; total: number; entity_column: string | null }>(
        `/preprocessing/${datasetId}/entities`
      );
      setEntities(response.entities || []);
      setError(null);
      onEntitiesLoaded?.(response.entities || []);

      // Auto-select first entity if only one
      if (response.entities?.length === 1) {
        onEntityChange(response.entities[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities");
    } finally {
      setLoading(false);
    }
  };

  const selectedEntityData = selectedEntity !== ALL_ENTITIES_VALUE
    ? entities.find((e) => e.name === selectedEntity)
    : null;

  const totalObservations = entities.reduce((sum, e) => sum + e.row_count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Entity
        </CardTitle>
        <CardDescription>Select an entity or forecast all</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading entities...</span>
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-2">{error}</div>
        ) : entities.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No entities found in dataset.
          </div>
        ) : (
          <Select
            value={selectedEntity || ""}
            onValueChange={(value) => onEntityChange(value || null)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select an entity" />
            </SelectTrigger>
            <SelectContent>
              {entities.length > 1 && (
                <SelectItem value={ALL_ENTITIES_VALUE}>
                  <div className="flex flex-col">
                    <span className="font-medium">All Entities</span>
                    <span className="text-xs text-muted-foreground">
                      {entities.length} entities &bull; {totalObservations.toLocaleString()} total observations
                    </span>
                  </div>
                </SelectItem>
              )}
              {entities.map((entity) => (
                <SelectItem key={entity.name} value={entity.name}>
                  <div className="flex flex-col">
                    <span>{entity.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {entity.row_count.toLocaleString()} observations
                      {entity.has_missing && ` \u2022 ${entity.missing_count} missing`}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedEntity === ALL_ENTITIES_VALUE && (
          <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entities:</span>
              <span className="font-medium">{entities.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Observations:</span>
              <span className="font-medium">{totalObservations.toLocaleString()}</span>
            </div>
          </div>
        )}

        {selectedEntityData && (
          <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Observations:</span>
              <span className="font-medium">{selectedEntityData.row_count.toLocaleString()}</span>
            </div>
            {selectedEntityData.date_range && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date Range:</span>
                <span className="font-medium">
                  {selectedEntityData.date_range.start} to {selectedEntityData.date_range.end}
                </span>
              </div>
            )}
            {selectedEntityData.has_missing && (
              <div className="flex justify-between text-amber-600">
                <span>Missing Values:</span>
                <span className="font-medium">{selectedEntityData.missing_count}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
