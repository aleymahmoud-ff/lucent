"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  superAdminApi,
  type AdminTenant,
  type AdminUserResponse,
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
  ArrowLeft,
  Building2,
  Users,
  Calendar,
  Check,
  X,
  MoreHorizontal,
  UserPlus,
  UserCheck,
  UserX,
  Trash2,
  Pencil,
  AlertCircle,
  Settings,
} from "lucide-react";

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserResponse | null>(null);
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
    loadTenantData();
  }, [tenantId]);

  const loadTenantData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [tenantData, usersData] = await Promise.all([
        superAdminApi.getTenant(tenantId),
        superAdminApi.listUsers({ tenant_id: tenantId, limit: 100 }),
      ]);

      setTenant(tenantData);
      setUsers(usersData.users);
      setFormData({ name: tenantData.name, slug: tenantData.slug });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load tenant data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    try {
      setIsSubmitting(true);
      await superAdminApi.updateTenant(tenantId, {
        name: formData.name,
        slug: formData.slug,
      });
      setIsEditOpen(false);
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!tenant) return;
    try {
      await superAdminApi.updateTenant(tenantId, {
        is_active: !tenant.is_active,
      });
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update tenant status");
    }
  };

  const handleAddAdmin = async () => {
    try {
      setIsSubmitting(true);
      await superAdminApi.createTenantAdmin(tenantId, adminFormData);
      setIsAddAdminOpen(false);
      setAdminFormData({ email: "", password: "", full_name: "", role: "admin" });
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create admin user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await superAdminApi.approveUser(userId);
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to approve user");
    }
  };

  const handleToggleUserActive = async (userId: string) => {
    try {
      await superAdminApi.toggleUserActive(userId);
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update user status");
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      setIsSubmitting(true);
      await superAdminApi.deleteUser(selectedUser.id);
      setIsDeleteUserOpen(false);
      setSelectedUser(null);
      loadTenantData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete user");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-500">{error || "Tenant not found"}</p>
        <Link href="/admin/tenants">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tenants
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/tenants" className="hover:text-foreground">
          Tenants
        </Link>
        <span>/</span>
        <span className="text-foreground">{tenant.name}</span>
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

      {/* Tenant Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-red-100">
            <Building2 className="h-8 w-8 text-red-600" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{tenant.name}</h2>
              {tenant.is_active ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-muted-foreground">/{tenant.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant={tenant.is_active ? "outline" : "default"}
            onClick={handleToggleActive}
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
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant.user_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Date(tenant.created_at).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Users</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tenant.limits?.max_users || 10}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Users ({users.length})</CardTitle>
            <CardDescription>Users belonging to this tenant</CardDescription>
          </div>
          <Button
            onClick={() => {
              setAdminFormData({ email: "", password: "", full_name: "", role: "admin" });
              setIsAddAdminOpen(true);
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Users className="h-8 w-8 mb-2" />
              <p>No users in this tenant</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || "-"}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="capitalize">{user.role}</TableCell>
                    <TableCell>
                      {user.is_active ? (
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
                      {user.is_approved ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-gray-400" />
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
                          {!user.is_approved && (
                            <DropdownMenuItem
                              onClick={() => handleApproveUser(user.id)}
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              Approve
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleToggleUserActive(user.id)}
                          >
                            {user.is_active ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setIsDeleteUserOpen(true);
                            }}
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
              onClick={handleUpdateTenant}
              disabled={!formData.name || isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Admin Dialog */}
      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a new user for {tenant.name}
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
              {isSubmitting ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={isDeleteUserOpen} onOpenChange={setIsDeleteUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedUser?.email}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteUserOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
