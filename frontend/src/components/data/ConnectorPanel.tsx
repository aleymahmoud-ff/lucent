"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Cloud,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Server,
} from "lucide-react";
import { toast } from "sonner";

// Connector type definitions
type ConnectorType = "postgres" | "mysql" | "sqlserver" | "s3" | "azure_blob" | "gcs" | "api";

interface ConnectorConfig {
  type: ConnectorType;
  name: string;
  icon: React.ElementType;
  category: "database" | "cloud" | "api";
  fields: ConnectorField[];
}

interface ConnectorField {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  options?: { value: string; label: string }[];
}

// Connector configurations
const connectorConfigs: ConnectorConfig[] = [
  {
    type: "postgres",
    name: "PostgreSQL",
    icon: Database,
    category: "database",
    fields: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost" },
      { name: "port", label: "Port", type: "number", required: true, defaultValue: 5432 },
      { name: "database", label: "Database", type: "text", required: true, placeholder: "mydb" },
      { name: "user", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
    ],
  },
  {
    type: "mysql",
    name: "MySQL",
    icon: Database,
    category: "database",
    fields: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost" },
      { name: "port", label: "Port", type: "number", required: true, defaultValue: 3306 },
      { name: "database", label: "Database", type: "text", required: true, placeholder: "mydb" },
      { name: "user", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
    ],
  },
  {
    type: "sqlserver",
    name: "SQL Server",
    icon: Server,
    category: "database",
    fields: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "localhost" },
      { name: "port", label: "Port", type: "number", required: true, defaultValue: 1433 },
      { name: "database", label: "Database", type: "text", required: true },
      { name: "user", label: "Username", type: "text", required: true },
      { name: "password", label: "Password", type: "password", required: true },
    ],
  },
  {
    type: "s3",
    name: "AWS S3",
    icon: Cloud,
    category: "cloud",
    fields: [
      { name: "access_key", label: "Access Key ID", type: "text", required: true },
      { name: "secret_key", label: "Secret Access Key", type: "password", required: true },
      { name: "bucket", label: "Bucket Name", type: "text", required: true },
      {
        name: "region",
        label: "Region",
        type: "select",
        required: true,
        options: [
          { value: "us-east-1", label: "US East (N. Virginia)" },
          { value: "us-west-2", label: "US West (Oregon)" },
          { value: "eu-west-1", label: "Europe (Ireland)" },
          { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
        ],
      },
      { name: "prefix", label: "Path Prefix", type: "text", required: false, placeholder: "data/" },
    ],
  },
  {
    type: "azure_blob",
    name: "Azure Blob Storage",
    icon: Cloud,
    category: "cloud",
    fields: [
      { name: "account_name", label: "Account Name", type: "text", required: true },
      { name: "account_key", label: "Account Key", type: "password", required: true },
      { name: "container", label: "Container Name", type: "text", required: true },
      { name: "prefix", label: "Path Prefix", type: "text", required: false },
    ],
  },
  {
    type: "gcs",
    name: "Google Cloud Storage",
    icon: Cloud,
    category: "cloud",
    fields: [
      { name: "project_id", label: "Project ID", type: "text", required: true },
      { name: "bucket", label: "Bucket Name", type: "text", required: true },
      { name: "credentials_json", label: "Service Account JSON", type: "password", required: true },
      { name: "prefix", label: "Path Prefix", type: "text", required: false },
    ],
  },
  {
    type: "api",
    name: "REST API",
    icon: Globe,
    category: "api",
    fields: [
      { name: "url", label: "API URL", type: "text", required: true, placeholder: "https://api.example.com/data" },
      { name: "method", label: "Method", type: "select", required: true, options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ]},
      { name: "auth_type", label: "Authentication", type: "select", required: true, options: [
        { value: "none", label: "None" },
        { value: "bearer", label: "Bearer Token" },
        { value: "basic", label: "Basic Auth" },
        { value: "api_key", label: "API Key" },
      ]},
      { name: "auth_value", label: "Auth Token/Key", type: "password", required: false },
    ],
  },
];

interface ConnectorPanelProps {
  onDataFetched?: (data: any) => void;
}

export function ConnectorPanel({ onDataFetched }: ConnectorPanelProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fetching, setFetching] = useState(false);

  const selectedConfig = connectorConfigs.find((c) => c.type === selectedType);

  const handleTypeSelect = (type: ConnectorType) => {
    setSelectedType(type);
    setFormData({});
    setTestResult(null);

    // Set default values
    const config = connectorConfigs.find((c) => c.type === type);
    if (config) {
      const defaults: Record<string, string | number> = {};
      config.fields.forEach((field) => {
        if (field.defaultValue !== undefined) {
          defaults[field.name] = field.defaultValue;
        }
      });
      setFormData(defaults);
    }
  };

  const handleFieldChange = (name: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!selectedConfig) return;

    setTesting(true);
    setTestResult(null);

    try {
      // Simulate connection test (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // For demo, always succeed
      setTestResult({ success: true, message: "Connection successful!" });
      toast.success("Connection test passed!");
    } catch (err) {
      setTestResult({ success: false, message: "Connection failed. Check your credentials." });
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleFetchData = async () => {
    if (!selectedConfig || !testResult?.success) return;

    setFetching(true);
    try {
      // Simulate data fetch (replace with actual API call)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast.success("Data fetched successfully!", {
        description: "Your data has been imported",
      });

      if (onDataFetched) {
        onDataFetched({ type: selectedType, config: formData });
      }

      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error("Failed to fetch data");
    } finally {
      setFetching(false);
    }
  };

  const resetForm = () => {
    setSelectedType(null);
    setFormData({});
    setTestResult(null);
  };

  const isFormValid = () => {
    if (!selectedConfig) return false;
    return selectedConfig.fields
      .filter((f) => f.required)
      .every((f) => formData[f.name] !== undefined && formData[f.name] !== "");
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "database":
        return Database;
      case "cloud":
        return Cloud;
      case "api":
        return Globe;
      default:
        return Database;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Connect Data Source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect to External Data Source</DialogTitle>
          <DialogDescription>
            Import data directly from databases, cloud storage, or APIs.
          </DialogDescription>
        </DialogHeader>

        {!selectedType ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Databases</Label>
              <div className="grid grid-cols-3 gap-2">
                {connectorConfigs
                  .filter((c) => c.category === "database")
                  .map((connector) => (
                    <Card
                      key={connector.type}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleTypeSelect(connector.type)}
                    >
                      <CardContent className="p-4 flex flex-col items-center gap-2">
                        <connector.icon className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{connector.name}</span>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cloud Storage</Label>
              <div className="grid grid-cols-3 gap-2">
                {connectorConfigs
                  .filter((c) => c.category === "cloud")
                  .map((connector) => (
                    <Card
                      key={connector.type}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleTypeSelect(connector.type)}
                    >
                      <CardContent className="p-4 flex flex-col items-center gap-2">
                        <connector.icon className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{connector.name}</span>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>APIs</Label>
              <div className="grid grid-cols-3 gap-2">
                {connectorConfigs
                  .filter((c) => c.category === "api")
                  .map((connector) => (
                    <Card
                      key={connector.type}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleTypeSelect(connector.type)}
                    >
                      <CardContent className="p-4 flex flex-col items-center gap-2">
                        <connector.icon className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">{connector.name}</span>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={resetForm}>
                &larr; Back
              </Button>
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedConfig && <selectedConfig.icon className="h-3 w-3" />}
                {selectedConfig?.name}
              </Badge>
            </div>

            <div className="grid gap-4">
              {selectedConfig?.fields.map((field) => (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === "select" ? (
                    <Select
                      value={String(formData[field.name] || "")}
                      onValueChange={(v) => handleFieldChange(field.name, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formData[field.name] || ""}
                      onChange={(e) =>
                        handleFieldChange(
                          field.name,
                          field.type === "number" ? Number(e.target.value) : e.target.value
                        )
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-2 p-3 rounded-md ${
                  testResult.success
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="text-sm">{testResult.message}</span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={!isFormValid() || testing || fetching}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
              <Button
                onClick={handleFetchData}
                disabled={!testResult?.success || fetching}
              >
                {fetching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  "Fetch Data"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
