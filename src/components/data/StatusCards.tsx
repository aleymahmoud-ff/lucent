"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Database,
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api/client";

interface DatasetStats {
  totalDatasets: number;
  totalRows: number;
  totalEntities: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  hasData: boolean;
}

interface StatusCardsProps {
  refreshTrigger?: number;
}

export function StatusCards({ refreshTrigger }: StatusCardsProps) {
  const [stats, setStats] = useState<DatasetStats>({
    totalDatasets: 0,
    totalRows: 0,
    totalEntities: 0,
    dateRange: { earliest: null, latest: null },
    hasData: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [refreshTrigger]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ datasets: any[]; total: number }>("/datasets");
      const datasets = response.datasets || [];

      let totalRows = 0;
      let totalEntities = 0;
      let earliestDate: string | null = null;
      let latestDate: string | null = null;

      datasets.forEach((dataset) => {
        totalRows += dataset.row_count || 0;
        totalEntities += (dataset.entities?.length || 0);

        if (dataset.date_range?.start) {
          if (!earliestDate || dataset.date_range.start < earliestDate) {
            earliestDate = dataset.date_range.start;
          }
        }
        if (dataset.date_range?.end) {
          if (!latestDate || dataset.date_range.end > latestDate) {
            latestDate = dataset.date_range.end;
          }
        }
      });

      setStats({
        totalDatasets: datasets.length,
        totalRows,
        totalEntities,
        dateRange: { earliest: earliestDate, latest: latestDate },
        hasData: datasets.length > 0,
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-center h-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Data Status",
      value: stats.hasData ? "Loaded" : "No Data",
      description: `${stats.totalDatasets} dataset${stats.totalDatasets !== 1 ? "s" : ""} available`,
      icon: Database,
      color: stats.hasData ? "text-green-600" : "text-muted-foreground",
      bgColor: stats.hasData ? "bg-green-100" : "bg-muted",
    },
    {
      title: "Total Rows",
      value: formatNumber(stats.totalRows),
      description: "Across all datasets",
      icon: FileSpreadsheet,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Date Range",
      value: stats.dateRange.earliest ? formatDate(stats.dateRange.earliest) : "N/A",
      description: stats.dateRange.latest
        ? `to ${formatDate(stats.dateRange.latest)}`
        : "No date data",
      icon: Calendar,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Entities",
      value: formatNumber(stats.totalEntities),
      description: "Unique items to forecast",
      icon: TrendingUp,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.description}
                </p>
              </div>
              <div className={`p-3 rounded-full ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
