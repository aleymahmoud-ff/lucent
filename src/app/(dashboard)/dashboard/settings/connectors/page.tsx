"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import {
  tenantAdminApi,
  type ConnectorWithRLS,
  type GroupResponse,
} from "@/lib/api/endpoints";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Database,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  Check,
  X,
  AlertCircle,
  Shield,
  Eye,
  Settings,
  Loader2,
  RefreshCw,
} from "lucide-react";

// Connector type icons mapping
const connectorTypeLabels: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlserver: "SQL Server",
  s3: "Amazon S3",
  azure_blob: "Azure Blob",
  gcs: "Google Cloud Storage",
  bigquery: "BigQuery",
  snowflake: "Snowflake",
  api: "REST API",
};

export default function ConnectorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [connectors, setConnectors] = useState<ConnectorWithRLS[]>([]);
  const [groups, setGroups] = useState<GroupResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal states
  const [isRlsConfigOpen, setIsRlsConfigOpen] = useState(false);
  const [isDeleteRlsOpen, setIsDeleteRlsOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorWithRLS | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RLS Form state
  const [rlsColumn, setRlsColumn] = useState("");
  const [rlsEnabled, setRlsEnabled] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);

  // Check if user is admin
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    loadData();
  }, [search]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: any = { limit: 100 };
      if (search) params.search = search;

      const [connectorsData, groupsData] = await Promise.all([
        tenantAdminApi.listConnectors(params),
        tenantAdminApi.listGroups({ limit: 100 }),
      ]);

      setConnectors(connectorsData.connectors);
      setTotal(connectorsData.total);
      setGroups(groupsData.groups);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load connectors");
    } finally {
      setIsLoading(false);
    }
  };

  const loadColumns = async (connectorId: string) => {
    try {
      setIsLoadingColumns(true);
      // This endpoint will be created in backend
      const response = await tenantAdminApi.getConnectorColumns(connectorId);
      setColumns(response.columns);
    } catch (err: any) {
      // If columns can't be loaded, allow manual entry
      setColumns([]);
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const handleConfigureRls = async (connector: ConnectorWithRLS) => {
    setSelectedConnector(connector);
    if (connector.rls_config) {
      setRlsColumn(connector.rls_config.rls_column);
      setRlsEnabled(connector.rls_config.is_enabled);
    } else {
      setRlsColumn("");
      setRlsEnabled(true);
    }
    setIsRlsConfigOpen(true);
    // Load columns when opening modal
    loadColumns(connector.id);
  };

  const handleSaveRls = async () => {
    if (!selectedConnector || !rlsColumn) return;
    try {
      setIsSubmitting(true);
      if (selectedConnector.rls_config) {
        // Update existing RLS config
        await tenantAdminApi.updateConnectorRLS(selectedConnector.id, {
          rls_column: rlsColumn,
          is_enabled: rlsEnabled,
        });
      } else {
        // Create new RLS config
        await tenantAdminApi.createConnectorRLS(selectedConnector.id, {
          rls_column: rlsColumn,
          is_enabled: rlsEnabled,
        });
      }
      setIsRlsConfigOpen(false);
      setSelectedConnector(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save RLS configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRls = async (connector: ConnectorWithRLS) => {
    if (!connector.rls_config) return;
    try {
      await tenantAdminApi.toggleConnectorRLS(connector.id);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to toggle RLS");
    }
  };

  const handleDeleteRls = async () => {
    if (!selectedConnector) return;
    try {
      setIsSubmitting(true);
      await tenantAdminApi.deleteConnectorRLS(selectedConnector.id);
      setIsDeleteRlsOpen(false);
      setSelectedConnector(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete RLS configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDetail = (connector: ConnectorWithRLS) => {
    setSelectedConnector(connector);
    setIsDetailOpen(true);
  };

  // Get all unique RLS values from groups
  const allRlsValues = Array.from(
    new Set(groups.flatMap((g) => g.rls_values))
  );

  // Don't render if not admin
  if (user && user.role !== "admin" ) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connector RLS Configuration</h2>
          <p className="text-muted-foreground">
            Configure Row-Level Security for data connectors
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-blue-800 flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            How RLS Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-700 text-sm">
          <p>
            Row-Level Security (RLS) filters data based on user group memberships.
            When enabled, users only see rows where the RLS column value matches
            one of their group's RLS values.
          </p>
          <div className="mt-2">
            <strong>Current RLS Values in Groups:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {allRlsValues.length > 0 ? (
                allRlsValues.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {value}
                  </span>
                ))
              ) : (
                <span className="text-blue-600 italic">No RLS values defined in any group</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Connectors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by connector name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Connectors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Data Connectors ({total})</CardTitle>
          <CardDescription>
            Configure which column is used for RLS filtering on each connector
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : connectors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Database className="h-8 w-8 mb-2" />
              <p>No connectors found</p>
              <p className="text-sm">Create connectors in the Data section first</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>RLS Column</TableHead>
                  <TableHead>RLS Status</TableHead>
                  <TableHead>Connector Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map((connector) => (
                  <TableRow key={connector.id}>
                    <TableCell className="font-medium">{connector.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {connectorTypeLabels[connector.type] || connector.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {connector.rls_config ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          <Shield className="h-3 w-3" />
                          {connector.rls_config.rls_column}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not configured</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {connector.rls_config ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={connector.rls_config.is_enabled}
                            onCheckedChange={() => handleToggleRls(connector)}
                          />
                          <span className="text-sm">
                            {connector.rls_config.is_enabled ? (
                              <span className="text-green-600">Enabled</span>
                            ) : (
                              <span className="text-gray-500">Disabled</span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {connector.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(connector)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleConfigureRls(connector)}>
                            <Settings className="mr-2 h-4 w-4" />
                            {connector.rls_config ? "Edit RLS Config" : "Configure RLS"}
                          </DropdownMenuItem>
                          {connector.rls_config && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedConnector(connector);
                                  setIsDeleteRlsOpen(true);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove RLS Config
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* RLS Config Dialog */}
      <Dialog open={isRlsConfigOpen} onOpenChange={setIsRlsConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedConnector?.rls_config ? "Edit" : "Configure"} RLS for {selectedConnector?.name}
            </DialogTitle>
            <DialogDescription>
              Select the column that contains values matching your group RLS values
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rls-column">RLS Column</Label>
              <p className="text-xs text-muted-foreground mb-2">
                This column's values will be matched against user group RLS values to filter data
              </p>
              {isLoadingColumns ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading columns...
                </div>
              ) : columns.length > 0 ? (
                <Select value={rlsColumn} onValueChange={setRlsColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="rls-column"
                  placeholder="e.g., store_name, region, department"
                  value={rlsColumn}
                  onChange={(e) => setRlsColumn(e.target.value)}
                />
              )}
              {columns.length === 0 && !isLoadingColumns && (
                <p className="text-xs text-muted-foreground">
                  Could not load columns. Enter the column name manually.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>RLS Status</Label>
              <div className="flex items-center gap-3">
                <Switch
                  checked={rlsEnabled}
                  onCheckedChange={setRlsEnabled}
                />
                <span className="text-sm">
                  {rlsEnabled ? (
                    <span className="text-green-600">RLS will be enabled</span>
                  ) : (
                    <span className="text-gray-500">RLS will be disabled</span>
                  )}
                </span>
              </div>
            </div>

            {/* Show current RLS values in groups */}
            <div className="space-y-2">
              <Label>Available RLS Values</Label>
              <p className="text-xs text-muted-foreground">
                These values are configured in your user groups
              </p>
              <div className="flex flex-wrap gap-1 mt-1 p-3 border rounded-md bg-muted/50">
                {allRlsValues.length > 0 ? (
                  allRlsValues.map((value) => (
                    <span
                      key={value}
                      className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                    >
                      {value}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground italic text-sm">
                    No RLS values defined. Configure them in User Groups first.
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRlsConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRls}
              disabled={!rlsColumn || isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connector Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {selectedConnector?.name}
            </DialogTitle>
            <DialogDescription>
              Connector details and RLS configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <p className="font-medium">
                  {connectorTypeLabels[selectedConnector?.type || ""] || selectedConnector?.type}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <p>
                  {selectedConnector?.is_active ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <Check className="h-4 w-4" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <X className="h-4 w-4" /> Inactive
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium">RLS Configuration</Label>
              {selectedConnector?.rls_config ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Column</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedConnector.rls_config.rls_column}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        selectedConnector.rls_config.is_enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {selectedConnector.rls_config.is_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No RLS configuration set for this connector
                </p>
              )}
            </div>

            {/* Groups using RLS */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium">Groups with RLS Access</Label>
              <div className="mt-2 space-y-2">
                {groups.filter((g) => g.rls_values.length > 0).length > 0 ? (
                  groups
                    .filter((g) => g.rls_values.length > 0)
                    .map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div>
                          <p className="text-sm font-medium">{group.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {group.rls_values.map((value) => (
                              <span
                                key={value}
                                className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {group.member_count} members
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No groups have RLS values configured
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setIsDetailOpen(false);
              if (selectedConnector) handleConfigureRls(selectedConnector);
            }}>
              <Settings className="mr-2 h-4 w-4" />
              {selectedConnector?.rls_config ? "Edit RLS" : "Configure RLS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete RLS Config Dialog */}
      <Dialog open={isDeleteRlsOpen} onOpenChange={setIsDeleteRlsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove RLS Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the RLS configuration from &quot;{selectedConnector?.name}&quot;?
              All users will have unrestricted access to this connector's data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteRlsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteRls}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? "Removing..." : "Remove RLS Config"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
