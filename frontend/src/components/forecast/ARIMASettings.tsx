"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface ARIMASettingsType {
  auto?: boolean;
  p?: number;
  d?: number;
  q?: number;
  P?: number;
  D?: number;
  Q?: number;
  s?: number;
}

interface ARIMASettingsProps {
  settings: ARIMASettingsType;
  onChange: (settings: ARIMASettingsType) => void;
}

export function ARIMASettings({ settings, onChange }: ARIMASettingsProps) {
  const isAuto = settings.auto ?? true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ARIMA Settings</CardTitle>
        <CardDescription>Configure ARIMA model parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Auto-detect Parameters</Label>
            <p className="text-xs text-muted-foreground">
              Find optimal p, d, q values automatically
            </p>
          </div>
          <Switch
            checked={isAuto}
            onCheckedChange={(checked) => onChange({ ...settings, auto: checked })}
          />
        </div>

        {/* Manual Parameters */}
        {!isAuto && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p" className="text-xs">p (AR order)</Label>
                <Input
                  id="p"
                  type="number"
                  min={0}
                  max={5}
                  value={settings.p ?? 1}
                  onChange={(e) => onChange({ ...settings, p: parseInt(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d" className="text-xs">d (Differencing)</Label>
                <Input
                  id="d"
                  type="number"
                  min={0}
                  max={2}
                  value={settings.d ?? 1}
                  onChange={(e) => onChange({ ...settings, d: parseInt(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q" className="text-xs">q (MA order)</Label>
                <Input
                  id="q"
                  type="number"
                  min={0}
                  max={5}
                  value={settings.q ?? 1}
                  onChange={(e) => onChange({ ...settings, q: parseInt(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>
            </div>

            {/* Seasonal Parameters */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Seasonal (optional)</Label>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  placeholder="P"
                  type="number"
                  min={0}
                  max={3}
                  value={settings.P ?? ""}
                  onChange={(e) =>
                    onChange({ ...settings, P: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="h-8"
                />
                <Input
                  placeholder="D"
                  type="number"
                  min={0}
                  max={2}
                  value={settings.D ?? ""}
                  onChange={(e) =>
                    onChange({ ...settings, D: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="h-8"
                />
                <Input
                  placeholder="Q"
                  type="number"
                  min={0}
                  max={3}
                  value={settings.Q ?? ""}
                  onChange={(e) =>
                    onChange({ ...settings, Q: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="h-8"
                />
                <Input
                  placeholder="s"
                  type="number"
                  min={1}
                  value={settings.s ?? ""}
                  onChange={(e) =>
                    onChange({ ...settings, s: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="h-8"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                P, D, Q: Seasonal orders. s: Season period (e.g., 7 for weekly, 12 for yearly)
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
