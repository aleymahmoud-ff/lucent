"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Database } from "lucide-react";
import { api } from "@/lib/api/client";

interface EntityInfo {
  name: string;
  row_count: number;
  date_range?: {
    start?: string;
    end?: string;
  };
}

interface EntitySelectorProps {
  datasetId: string;
  selectedEntity: string | null;
  onEntityChange: (entityId: string | null, entityColumn: string | null) => void;
  entityColumn?: string | null;
}

export function EntitySelector({
  datasetId,
  selectedEntity,
  onEntityChange,
  entityColumn: initialEntityColumn,
}: EntitySelectorProps) {
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedColumn, setDetectedColumn] = useState<string | null>(initialEntityColumn || null);
  const [totalRows, setTotalRows] = useState<number>(0);

  useEffect(() => {
    const fetchEntities = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = initialEntityColumn ? `?entity_column=${initialEntityColumn}` : "";
        const response = await api.get<{ entities: EntityInfo[]; entity_column: string; total: number }>(`/preprocessing/${datasetId}/entities${params}`);

        setEntities(response.entities || []);
        setDetectedColumn(response.entity_column);
        setTotalRows(response.total || 0);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Failed to load entities");
        setEntities([]);
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchEntities();
    }
  }, [datasetId, initialEntityColumn]);

  const handleEntitySelect = (value: string) => {
    if (value === "all") {
      onEntityChange(null, detectedColumn);
    } else {
      onEntityChange(value, detectedColumn);
    }
  };

  const selectedEntityInfo = entities.find((e) => e.name === selectedEntity);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Entity Selection
        </CardTitle>
        <CardDescription>
          Select an entity to preprocess or work with all data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading entities...</span>
          </div>
        ) : error ? (
          <div className="text-center py-4 text-destructive">{error}</div>
        ) : (
          <>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Entity Column</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    {detectedColumn || "Auto-detected"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {entities.length} entities found
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entity-select">Select Entity</Label>
                <Select
                  value={selectedEntity || "all"}
                  onValueChange={handleEntitySelect}
                >
                  <SelectTrigger id="entity-select">
                    <SelectValue placeholder="Select an entity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        All Entities
                        <Badge variant="secondary" className="ml-2">
                          {totalRows.toLocaleString()} rows
                        </Badge>
                      </span>
                    </SelectItem>
                    {entities.map((entity) => (
                      <SelectItem key={entity.name} value={entity.name}>
                        <span className="flex items-center gap-2">
                          {entity.name}
                          <Badge variant="secondary" className="ml-2">
                            {entity.row_count.toLocaleString()} rows
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedEntityInfo && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">{selectedEntityInfo.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedEntityInfo.row_count.toLocaleString()} rows
                  {selectedEntityInfo.date_range?.start && selectedEntityInfo.date_range?.end && (
                    <span className="ml-2">
                      | {selectedEntityInfo.date_range.start} to {selectedEntityInfo.date_range.end}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
