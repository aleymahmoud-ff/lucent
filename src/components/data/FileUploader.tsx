"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onUploadComplete: (data: UploadResult) => void;
  onUploadError?: (error: string) => void;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

interface UploadResult {
  id: string;
  name: string;
  filename: string;
  file_size: number;
  file_type: string;
  row_count: number;
  column_count: number;
  columns: string[];
}

type UploadStatus = "idle" | "dragging" | "uploading" | "success" | "error";

export function FileUploader({
  onUploadComplete,
  onUploadError,
  maxSizeMB = 100,
  acceptedTypes = [".csv", ".xlsx", ".xls"],
}: FileUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file type
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!acceptedTypes.includes(fileExtension)) {
      return `Invalid file type. Supported formats: ${acceptedTypes.join(", ")}`;
    }

    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }

    return null;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setStatus("dragging");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setStatus("idle");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setStatus("idle");
      setError(null);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          setStatus("error");
          return;
        }
        setSelectedFile(file);
      }
    },
    [maxSizeMB, acceptedTypes]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setError(null);

    if (files && files.length > 0) {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setStatus("error");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setStatus("uploading");
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const token = localStorage.getItem("token");

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = JSON.parse(xhr.responseText);
          setStatus("success");
          onUploadComplete(result);
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            const errorMessage = errorData.detail || "Upload failed";
            setError(errorMessage);
            setStatus("error");
            onUploadError?.(errorMessage);
          } catch {
            setError("Upload failed");
            setStatus("error");
            onUploadError?.("Upload failed");
          }
        }
      };

      xhr.onerror = () => {
        setError("Network error occurred");
        setStatus("error");
        onUploadError?.("Network error occurred");
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      xhr.open("POST", `${apiUrl}/datasets/upload`);

      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setError(errorMessage);
      setStatus("error");
      onUploadError?.(errorMessage);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="p-6">
      {/* Drop zone */}
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          status === "dragging" && "border-primary bg-primary/5",
          status === "error" && "border-destructive bg-destructive/5",
          status === "success" && "border-green-500 bg-green-50",
          status === "idle" && "border-muted-foreground/25 hover:border-primary/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(",")}
          onChange={handleFileSelect}
          className="hidden"
        />

        {status === "success" ? (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-green-700">Upload successful!</p>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Upload Another File
            </Button>
          </div>
        ) : status === "uploading" ? (
          <div className="space-y-4">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-primary animate-pulse" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Uploading {selectedFile?.name}...</p>
              <div className="mx-auto w-64 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          </div>
        ) : selectedFile ? (
          <div className="space-y-4">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={handleUpload}>Upload File</Button>
              <Button variant="outline" onClick={handleReset}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Upload
              className={cn(
                "mx-auto h-12 w-12",
                status === "dragging" ? "text-primary" : "text-muted-foreground"
              )}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {status === "dragging" ? "Drop your file here" : "Drag and drop your file here"}
              </p>
              <p className="text-xs text-muted-foreground">
                or click to browse. Supports CSV and Excel files up to {maxSizeMB}MB
              </p>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Required columns: Date, Entity_ID, Entity_Name, Volume
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={status === "dragging"}
            >
              Select File
            </Button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* File type info */}
      <div className="mt-4 text-center text-xs text-muted-foreground space-y-1">
        <p>Accepted formats: CSV (.csv), Excel (.xlsx, .xls)</p>
        <p className="font-medium">Required columns: Date, Entity_ID, Entity_Name, Volume</p>
      </div>
    </Card>
  );
}
