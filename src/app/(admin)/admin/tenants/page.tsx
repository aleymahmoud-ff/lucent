"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { superAdminApi, type AdminTenant } from "@/lib/api/endpoints";
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
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  UserPlus,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

export default function TenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<AdminTenant | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
  });
  const [adminFormData, setAdminFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "admin",
  });

  useEffect(() => {
    loadTenants();
  }, [search]);

  const loadTenants = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await superAdminApi.listTenants({
        search: search || undefined,
        limit: 100,
      });
      setTenants(data.tenants);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load tenants");
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleCreate = async () => {
    try {
      setIsSubmitting(true);
      await superAdminApi.createTenant({
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
      });
      setIsCreateOpen(false);
      setFormData({ name: "", slug: "" });
      loadTenants();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTenant) return;
    try {
      setIsSubmitting(true);
      await superAdminApi.updateTenant(selectedTenant.id, {
        name: formData.name,
        slug: formData.slug,
      });
      setIsEditOpen(false);
      setSelectedTenant(null);
      setFormData({ name: "", slug: "" });
      loadTenants();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTenant) return;
    try {
      setIsSubmitting(true);
      await superAdminApi.deleteTenant(selectedTenant.id);
      setIsDeleteOpen(false);
      setSelectedTenant(null);
      loadTenants();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (tenant: AdminTenant) => {
    try {
      await superAdminApi.updateTenant(tenant.id, {
        is_active: !tenant.is_active,
      });
      loadTenants();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update tenant status");
    }
  };

  const handleAddAdmin = async () => {
    if (!selectedTenant) return;
    try {
      setIsSubmitting(true);
      await superAdminApi.createTenantAdmin(selectedTenant.id, adminFormData);
      setIsAddAdminOpen(false);
      setSelectedTenant(null);
      setAdminFormData({ email: "", password: "", full_name: "", role: "admin" });
      loadTenants();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create admin user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (tenant: AdminTenant) => {
    setSelectedTenant(tenant);
    setFormData({ name: tenant.name, slug: tenant.slug });
    setIsEditOpen(true);
  };

  const openDelete = (tenant: AdminTenant) => {
    setSelectedTenant(tenant);
    setIsDeleteOpen(true);
  };

  const openAddAdmin = (tenant: AdminTenant) => {
    setSelectedTenant(tenant);
    setAdminFormData({ email: "", password: "", full_name: "", role: "admin" });
    setIsAddAdminOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenants</h2>
          <p className="text-muted-foreground">
            Manage organization tenants across the platform
          </p>
        </div>
        <Button
          onClick={() => {
            setFormData({ name: "", slug: "" });
            setIsCreateOpen(true);
          }}
          className="bg-red-600 hover:bg-red-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Tenant
        </Button>
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

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants ({total})</CardTitle>
          <CardDescription>
            A list of all tenants registered on the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Building2 className="h-8 w-8 mb-2" />
              <p>No tenants found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>{tenant.user_count}</TableCell>
                    <TableCell>
                      {tenant.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <Check className="mr-1 h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          <X className="mr-1 h-3 w-3" />
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/tenants/${tenant.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(tenant)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAddAdmin(tenant)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Admin
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(tenant)}
                          >
                            {tenant.is_active ? (
                              <>
                                <X className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Check className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDelete(tenant)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
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

      {/* Create Tenant Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>
              Add a new organization tenant to the platform
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                placeholder="Acme Corporation"
                value={formData.name}
                onChange={(e) => {
                  setFormData({
                    name: e.target.value,
                    slug: generateSlug(e.target.value),
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="acme-corporation"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and must be unique
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.name || isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update the tenant&apos;s information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Organization Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!formData.name || isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tenant</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedTenant?.name}&quot;? This
              action cannot be undone and will delete all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? "Deleting..." : "Delete Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Admin Dialog */}
      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
            <DialogDescription>
              Create an admin user for {selectedTenant?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">Full Name</Label>
              <Input
                id="admin-name"
                placeholder="John Doe"
                value={adminFormData.full_name}
                onChange={(e) =>
                  setAdminFormData({ ...adminFormData, full_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="john@example.com"
                value={adminFormData.email}
                onChange={(e) =>
                  setAdminFormData({ ...adminFormData, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={adminFormData.password}
                onChange={(e) =>
                  setAdminFormData({ ...adminFormData, password: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAdminOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddAdmin}
              disabled={
                !adminFormData.email ||
                !adminFormData.password ||
                !adminFormData.full_name ||
                isSubmitting
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Creating..." : "Create Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
