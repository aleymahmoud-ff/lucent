"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Users, UsersRound, Link2, Palette, Settings } from "lucide-react";

const settingsItems = [
  {
    name: "Users",
    description: "Manage users in your organization",
    href: "/settings/users",
    icon: Users,
    adminOnly: true,
  },
  {
    name: "Groups",
    description: "Manage user groups and permissions",
    href: "/settings/groups",
    icon: UsersRound,
    adminOnly: true,
  },
  {
    name: "Connectors",
    description: "Configure data connectors and RLS",
    href: "/settings/connectors",
    icon: Link2,
    adminOnly: true,
  },
  {
    name: "Branding",
    description: "Customize your organization's appearance",
    href: "/settings/branding",
    icon: Palette,
    adminOnly: true,
  },
];

export default function SettingsPage() {
  const params = useParams();
  const tenantSlug = params?.tenant as string;
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";

  // Filter items based on user role
  const visibleItems = settingsItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization's settings and preferences
        </p>
      </div>

      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No settings available for your role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.name} href={`/${tenantSlug}${item.href}`}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      {item.name}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
