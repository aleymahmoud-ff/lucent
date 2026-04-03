'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Bell, Search, LogOut, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export function Header() {
  const { user, logout } = useAuth();
  const { tenant, branding } = useTenant();
  const params = useParams();
  const tenantSlug = (params?.tenant as string) || user?.tenant_slug || '';

  const userInitial = user?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';
  const userName = user?.full_name || user?.email || 'User';
  const userRole = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User';

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      {/* Left side: Tenant Logo + Search */}
      <div className="flex flex-1 items-center gap-4">
        {/* Tenant Logo + Name - Clickable to dashboard */}
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={tenant?.name || 'Organization'}
              className="h-8 max-w-[40px] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
          <span className="font-semibold text-base">
            {tenant?.name || 'Organization'}
          </span>
        </Link>

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search datasets, forecasts..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
                3
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Forecast completed</p>
                <p className="text-xs text-muted-foreground">
                  ARIMA forecast for Product A is ready
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Data uploaded</p>
                <p className="text-xs text-muted-foreground">
                  sales_data.csv has been processed
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Team member added</p>
                <p className="text-xs text-muted-foreground">
                  John Doe joined your organization
                </p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {userInitial}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">{userRole}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
