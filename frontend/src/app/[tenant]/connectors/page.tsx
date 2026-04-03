"use client";

import { Suspense, useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, Database, ArrowRight, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  ConnectorList,
  ConnectorWizard,
  ResourceBrowser,
  DataPreview,
  type ConnectorCardData,
} from "@/components/connectors";

// -------------------------------------------------------
// QueryClient -- scoped to connectors page
// -------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 2,
    },
  },
});

// -------------------------------------------------------
// Empty state -- shown when no connector is selected
// -------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Plug className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Select a Connector</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        Choose a data connector from the list on the left to browse its resources and preview data.
        You can test connections, explore available tables and files, and view a sample of the data.
      </p>
      <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
        <Database className="h-4 w-4" />
        <span>Select connector</span>
        <ArrowRight className="h-3 w-3" />
        <span>Browse resources</span>
        <ArrowRight className="h-3 w-3" />
        <span>Preview data</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Detail panel -- resource browser + data preview
// -------------------------------------------------------

function ConnectorDetail({
  connector,
  selectedResource,
  onSelectResource,
}: {
  connector: ConnectorCardData;
  selectedResource: string | null;
  onSelectResource: (resource: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Connector info header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{connector.name}</CardTitle>
          <CardDescription className="text-xs">
            Browse resources and preview data from this connector
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Resource browser */}
      <ResourceBrowser
        connectorId={connector.id}
        connectorName={connector.name}
        selectedResource={selectedResource}
        onSelectResource={onSelectResource}
      />

      {/* Data preview */}
      <DataPreview
        connectorId={connector.id}
        connectorName={connector.name}
        resource={selectedResource}
      />
    </div>
  );
}

// -------------------------------------------------------
// Page content -- two-panel layout
// -------------------------------------------------------

function ConnectorsPageContent() {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorCardData | null>(null);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [wizardConnectorId, setWizardConnectorId] = useState<string | null>(null);

  const handleSelectConnector = useCallback((connector: ConnectorCardData) => {
    setSelectedConnector(connector);
    setSelectedResource(null); // reset resource when switching connectors
  }, []);

  const handleBrowseResources = useCallback((connector: ConnectorCardData) => {
    setSelectedConnector(connector);
    setSelectedResource(null);
  }, []);

  const handlePreviewData = useCallback((connector: ConnectorCardData) => {
    setSelectedConnector(connector);
    // keep resource selection — will show all data if no resource
  }, []);

  const handleSelectResource = useCallback((resource: string) => {
    setSelectedResource(resource);
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Connectors</h1>
          <p className="text-muted-foreground">
            Connect to external data sources and preview their data
          </p>
        </div>
        {selectedConnector && (
          <Button
            onClick={() => setWizardConnectorId(selectedConnector.id)}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Setup Data Source
          </Button>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel -- connector list */}
        <div className="lg:col-span-4 xl:col-span-3">
          <ConnectorList
            selectedConnectorId={selectedConnector?.id ?? null}
            onSelectConnector={handleSelectConnector}
            onBrowseResources={handleBrowseResources}
            onPreviewData={handlePreviewData}
          />
        </div>

        {/* Right panel -- detail / preview */}
        <div className="lg:col-span-8 xl:col-span-9">
          {selectedConnector ? (
            <ConnectorDetail
              connector={selectedConnector}
              selectedResource={selectedResource}
              onSelectResource={handleSelectResource}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      {/* Wizard dialog */}
      {wizardConnectorId && selectedConnector && (
        <ConnectorWizard
          connectorId={wizardConnectorId}
          connectorName={selectedConnector.name}
          tenantSlug=""
          open={true}
          onComplete={() => {
            setWizardConnectorId(null);
            toast.success("Data source configured successfully");
          }}
          onClose={() => setWizardConnectorId(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------
// Default export -- wraps with QueryClientProvider + Suspense
// -------------------------------------------------------

export default function ConnectorsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="flex flex-col h-64 items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        }
      >
        <ConnectorsPageContent />
      </Suspense>
    </QueryClientProvider>
  );
}
