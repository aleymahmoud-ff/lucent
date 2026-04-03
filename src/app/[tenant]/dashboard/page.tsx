"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Database, TrendingUp, FileText, Activity, Users } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

export default function DashboardPage() {
  const { tenant } = useTenant();

  const stats = [
    {
      title: "Total Datasets",
      value: "12",
      change: "+2 this week",
      icon: Database,
      color: "text-blue-600",
    },
    {
      title: "Active Forecasts",
      value: "8",
      change: "3 running",
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      title: "Completed Forecasts",
      value: "45",
      change: "+12 this month",
      icon: BarChart3,
      color: "text-purple-600",
    },
    {
      title: "Team Members",
      value: "6",
      change: "4 active now",
      icon: Users,
      color: "text-orange-600",
    },
  ];

  const recentForecasts = [
    {
      id: 1,
      name: "Product A - Daily Sales",
      method: "ARIMA",
      status: "completed",
      accuracy: 94.2,
      date: "2 hours ago",
    },
    {
      id: 2,
      name: "Product B - Weekly Revenue",
      method: "Prophet",
      status: "running",
      progress: 65,
      date: "10 minutes ago",
    },
    {
      id: 3,
      name: "Product C - Monthly Demand",
      method: "ETS",
      status: "completed",
      accuracy: 91.8,
      date: "1 day ago",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {tenant?.name || "your organization"}! Here's an overview of your forecasting
          projects.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent forecasts */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Forecasts</CardTitle>
            <CardDescription>Your latest forecasting activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentForecasts.map((forecast) => (
              <div key={forecast.id} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">{forecast.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {forecast.method}
                    </span>
                    <span>{forecast.date}</span>
                  </div>
                </div>
                <div className="text-right">
                  {forecast.status === "completed" && (
                    <div className="flex items-center gap-1">
                      <Activity className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">{forecast.accuracy}%</span>
                    </div>
                  )}
                  {forecast.status === "running" && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${forecast.progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">{forecast.progress}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Start your next task</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <button className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent">
              <Database className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">Upload Dataset</p>
                <p className="text-sm text-muted-foreground">Import CSV or Excel files</p>
              </div>
            </button>
            <button className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium">New Forecast</p>
                <p className="text-sm text-muted-foreground">Create a new forecast model</p>
              </div>
            </button>
            <button className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent">
              <FileText className="h-8 w-8 text-purple-600" />
              <div>
                <p className="font-medium">View Reports</p>
                <p className="text-sm text-muted-foreground">Browse past forecast results</p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
