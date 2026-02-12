"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
}

const templates: Template[] = [
  {
    id: "basic",
    name: "Standard Template",
    description: "Date, Entity_ID, Entity_Name, Volume",
    type: "basic",
  },
  {
    id: "multi_entity",
    name: "Multi-Entity Template",
    description: "Multiple products/SKUs format",
    type: "multi_entity",
  },
  {
    id: "sales",
    name: "Sales Template",
    description: "Sales forecasting format",
    type: "sales",
  },
];

export function TemplateDownload() {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (template: Template) => {
    setDownloading(template.id);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${apiUrl}/datasets/templates/download?template_type=${template.type}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lucent_${template.type}_template.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Template downloaded!", {
        description: template.name,
      });
    } catch (err) {
      toast.error("Failed to download template", {
        description: "Please try again later",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download Template
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Choose a template format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onClick={() => handleDownload(template)}
            disabled={downloading !== null}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-3 w-full">
              {downloading === template.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.description}
                </p>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
