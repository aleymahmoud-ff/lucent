"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ModelParametersPanelProps {
  method: string;
  parameters: Record<string, unknown>;
  coefficients?: Record<string, number> | null;
  standardErrors?: Record<string, number> | null;
  aic?: number | null;
  bic?: number | null;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function methodLabel(method: string): string {
  switch (method.toLowerCase()) {
    case "arima":
      return "ARIMA -- AutoRegressive Integrated Moving Average";
    case "ets":
      return "ETS -- Error, Trend, Seasonality (Exponential Smoothing)";
    case "prophet":
      return "Prophet -- Additive Regression Model by Meta";
    default:
      return method;
  }
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  return String(value);
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ModelParametersPanel({
  method,
  parameters,
  coefficients,
  standardErrors,
  aic,
  bic,
}: ModelParametersPanelProps) {
  const paramEntries = Object.entries(parameters ?? {});
  const coeffEntries = Object.entries(coefficients ?? {});
  const hasCoefficients = coeffEntries.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Parameters</CardTitle>
        <CardDescription>{methodLabel(method)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Method badge row + information criteria */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="uppercase">{method}</Badge>
          {aic != null && (
            <Badge variant="outline">AIC: {aic.toFixed(2)}</Badge>
          )}
          {bic != null && (
            <Badge variant="outline">BIC: {bic.toFixed(2)}</Badge>
          )}
        </div>

        {/* Parameters key-value grid */}
        {paramEntries.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Parameters</h4>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {paramEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground capitalize">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-foreground">
                    {formatParamValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coefficients table */}
        {hasCoefficients && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Coefficients</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coefficient</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  {standardErrors && Object.keys(standardErrors).length > 0 && (
                    <TableHead className="text-right">Std. Error</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {coeffEntries.map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium capitalize">
                      {name.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {typeof value === "number" ? value.toFixed(4) : String(value)}
                    </TableCell>
                    {standardErrors && Object.keys(standardErrors).length > 0 && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {standardErrors[name] != null
                          ? standardErrors[name].toFixed(4)
                          : "--"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Empty state */}
        {paramEntries.length === 0 && !hasCoefficients && (
          <p className="text-sm text-muted-foreground">
            No detailed model parameter information available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
