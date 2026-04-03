"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  MoreVertical,
  Eye,
  Trash2,
  Loader2,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@/lib/api/client";

interface Dataset {
  id: string;
  name: string;
  filename: string;
  file_size: number;
  file_type: string;
  row_count: number | null;
  column_count: number | null;
  entities: string[];
  uploaded_at: string;
  is_processed: boolean;
}

interface DatasetListProps {
  onSelectDataset: (dataset: Dataset) => void;
  refreshTrigger?: number;
}

export function DatasetList({ onSelectDataset, refreshTrigger }: DatasetListProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchDatasets();
  }, [refreshTrigger]);

  const fetchDatasets = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get<{ datasets: Dataset[]; total: number }>("/datasets");
      setDatasets(response.datasets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!datasetToDelete) return;

    setDeleting(true);
    try {
      await api.delete(`/datasets/${datasetToDelete.id}`);
      setDatasets(datasets.filter((d) => d.id !== datasetToDelete.id));
      setDeleteDialogOpen(false);
      setDatasetToDelete(null);
    } catch (err) {
      console.error("Failed to delete dataset:", err);
    } finally {
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Loading datasets...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-destructive font-medium">Error loading datasets</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchDatasets}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (datasets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="mt-4 font-medium">No datasets yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a file or load sample data to get started
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your Datasets</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchDatasets}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Columns</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow
                  key={dataset.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectDataset(dataset)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{dataset.name}</p>
                        <p className="text-xs text-muted-foreground">{dataset.filename}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatFileSize(dataset.file_size)}</TableCell>
                  <TableCell className="text-right">
                    {dataset.row_count?.toLocaleString() || "-"}
                  </TableCell>
                  <TableCell className="text-right">{dataset.column_count || "-"}</TableCell>
                  <TableCell>{formatDate(dataset.uploaded_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelectDataset(dataset)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDatasetToDelete(dataset);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Dataset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{datasetToDelete?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
