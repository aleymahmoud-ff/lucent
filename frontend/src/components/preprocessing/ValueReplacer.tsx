"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Replace, Plus, X, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

type MatchType = "exact" | "contains" | "regex";

interface ReplacementRule {
  id: string;
  column: string;
  oldValue: string;
  newValue: string;
  matchType: MatchType;
}

interface ValueReplacerProps {
  datasetId: string;
  entityId: string | null;
  entityColumn: string | null;
  columns?: string[];
  onProcessingComplete?: () => void;
}

const matchTypeOptions: { value: MatchType; label: string; description: string }[] = [
  { value: "exact", label: "Exact Match", description: "Replace values that exactly match" },
  { value: "contains", label: "Contains", description: "Replace values containing the text" },
  { value: "regex", label: "Regex", description: "Use regular expression matching" },
];

export function ValueReplacer({
  datasetId,
  entityId,
  entityColumn,
  columns: availableColumns,
  onProcessingComplete,
}: ValueReplacerProps) {
  const [rules, setRules] = useState<ReplacementRule[]>([]);
  const [processing, setProcessing] = useState(false);
  const [completedRules, setCompletedRules] = useState<string[]>([]);

  // Current rule being edited
  const [currentColumn, setCurrentColumn] = useState<string>("");
  const [currentOldValue, setCurrentOldValue] = useState("");
  const [currentNewValue, setCurrentNewValue] = useState("");
  const [currentMatchType, setCurrentMatchType] = useState<MatchType>("exact");

  const addRule = () => {
    if (!currentColumn || !currentOldValue) {
      toast.error("Please select a column and enter a value to replace");
      return;
    }

    const newRule: ReplacementRule = {
      id: Date.now().toString(),
      column: currentColumn,
      oldValue: currentOldValue,
      newValue: currentNewValue,
      matchType: currentMatchType,
    };

    setRules([...rules, newRule]);

    // Reset form
    setCurrentOldValue("");
    setCurrentNewValue("");
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    setCompletedRules(completedRules.filter((c) => c !== id));
  };

  const handleApply = async () => {
    if (rules.length === 0) {
      toast.error("Please add at least one replacement rule");
      return;
    }

    setProcessing(true);
    setCompletedRules([]);

    try {
      const params = new URLSearchParams();
      if (entityId) params.append("entity_id", entityId);
      if (entityColumn) params.append("entity_column", entityColumn);

      let totalAffected = 0;

      // Apply each rule sequentially
      for (const rule of rules) {
        try {
          const response = await api.post<{
            success: boolean;
            message: string;
            rows_affected: number;
          }>(
            `/preprocessing/${datasetId}/replace${params.toString() ? `?${params}` : ""}`,
            {
              column: rule.column,
              old_value: rule.oldValue,
              new_value: rule.newValue,
              match_type: rule.matchType,
            }
          );

          totalAffected += response.rows_affected || 0;
          setCompletedRules((prev) => [...prev, rule.id]);
        } catch (err: any) {
          toast.error(`Failed to apply rule for "${rule.column}": ${err.response?.data?.detail || "Unknown error"}`);
        }
      }

      toast.success(`Value replacement complete. ${totalAffected} values affected.`);

      if (onProcessingComplete) {
        onProcessingComplete();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to replace values");
    } finally {
      setProcessing(false);
    }
  };

  const clearAllRules = () => {
    setRules([]);
    setCompletedRules([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Replace className="h-5 w-5" />
          Value Replacement
        </CardTitle>
        <CardDescription>Replace specific values with custom values</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Rule Form */}
        <div className="space-y-4 p-4 border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            {/* Column Selection */}
            <div className="space-y-2">
              <Label>Column</Label>
              <Select value={currentColumn} onValueChange={setCurrentColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns?.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Match Type */}
            <div className="space-y-2">
              <Label>Match Type</Label>
              <Select value={currentMatchType} onValueChange={(v) => setCurrentMatchType(v as MatchType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select match type" />
                </SelectTrigger>
                <SelectContent>
                  {matchTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Old Value */}
            <div className="space-y-2">
              <Label>Find Value</Label>
              <Input
                placeholder="Value to find"
                value={currentOldValue}
                onChange={(e) => setCurrentOldValue(e.target.value)}
              />
            </div>

            {/* New Value */}
            <div className="space-y-2">
              <Label>Replace With</Label>
              <Input
                placeholder="Replacement value"
                value={currentNewValue}
                onChange={(e) => setCurrentNewValue(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={addRule} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Replacement Rule
          </Button>
        </div>

        {/* Rules List */}
        {rules.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Replacement Rules ({rules.length})</Label>
              <Button variant="ghost" size="sm" onClick={clearAllRules}>
                Clear All
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-2 bg-muted rounded hover:bg-muted/80"
                >
                  <div className="flex items-center gap-2 flex-1">
                    {completedRules.includes(rule.id) && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    <Badge variant="outline">{rule.column}</Badge>
                    <span className="text-sm">
                      <span className="text-muted-foreground">"{rule.oldValue}"</span>
                      <span className="mx-2">→</span>
                      <span className="font-medium">"{rule.newValue}"</span>
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {rule.matchType}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(rule.id)}
                    disabled={processing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Rules Message */}
        {rules.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p>No replacement rules added yet.</p>
            <p className="text-sm">Add rules above to replace values in your data.</p>
          </div>
        )}

        {/* Apply Button */}
        <Button
          onClick={handleApply}
          disabled={processing || rules.length === 0}
          className="w-full"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Applying {completedRules.length}/{rules.length} Rules...
            </>
          ) : (
            `Apply ${rules.length} Replacement Rule${rules.length !== 1 ? "s" : ""}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
