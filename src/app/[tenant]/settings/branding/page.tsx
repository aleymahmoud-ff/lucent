"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { brandingApi, BrandingUpdate } from "@/lib/api/endpoints";
import { Palette, Image, MessageSquare, Save, RotateCcw } from "lucide-react";

export default function BrandingSettingsPage() {
  const params = useParams();
  const tenantSlug = params?.tenant as string;
  const { branding, refreshBranding, tenant } = useTenant();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    logo_url: "",
    favicon_url: "",
    login_bg_url: "",
    login_message: "",
    primary_color: "#2563eb",
    secondary_color: "#1e40af",
    accent_color: "#3b82f6",
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Check if user is admin
  const isAdmin = user?.role === "admin";

  // Load current branding into form
  useEffect(() => {
    if (branding) {
      setFormData({
        logo_url: branding.logo_url || "",
        favicon_url: branding.favicon_url || "",
        login_bg_url: branding.login_bg_url || "",
        login_message: branding.login_message || "",
        primary_color: branding.colors?.primary || "#2563eb",
        secondary_color: branding.colors?.secondary || "#1e40af",
        accent_color: branding.colors?.accent || "#3b82f6",
      });
    }
  }, [branding]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updateData: BrandingUpdate = {
        logo_url: formData.logo_url || null,
        favicon_url: formData.favicon_url || null,
        login_bg_url: formData.login_bg_url || null,
        login_message: formData.login_message || null,
        colors: {
          primary: formData.primary_color,
          secondary: formData.secondary_color,
          accent: formData.accent_color,
        },
      };

      await brandingApi.updateBranding(tenantSlug, updateData);
      await refreshBranding();
      setMessage({ type: "success", text: "Branding updated successfully!" });
    } catch (error: any) {
      console.error("Failed to update branding:", error);
      setMessage({
        type: "error",
        text: error.response?.data?.detail || "Failed to update branding",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      logo_url: "",
      favicon_url: "",
      login_bg_url: "",
      login_message: "",
      primary_color: "#2563eb",
      secondary_color: "#1e40af",
      accent_color: "#3b82f6",
    });
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Only administrators can access branding settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Branding Settings</h1>
        <p className="text-muted-foreground mt-1">
          Customize your organization's appearance
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Logo & Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Logo & Images
          </CardTitle>
          <CardDescription>
            Upload your organization's logo and customize login page appearance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                placeholder="https://example.com/logo.png"
                value={formData.logo_url}
                onChange={(e) => handleChange("logo_url", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recommended size: 200x50px (PNG or SVG)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="favicon_url">Favicon URL</Label>
              <Input
                id="favicon_url"
                placeholder="https://example.com/favicon.ico"
                value={formData.favicon_url}
                onChange={(e) => handleChange("favicon_url", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recommended size: 32x32px (ICO or PNG)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="login_bg_url">Login Background Image URL</Label>
            <Input
              id="login_bg_url"
              placeholder="https://example.com/background.jpg"
              value={formData.login_bg_url}
              onChange={(e) => handleChange("login_bg_url", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Recommended size: 1920x1080px (JPG or PNG)
            </p>
          </div>

          {/* Logo Preview */}
          {formData.logo_url && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Logo Preview:</p>
              <img
                src={formData.logo_url}
                alt="Logo preview"
                className="max-h-16 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Brand Colors
          </CardTitle>
          <CardDescription>
            Define your organization's color scheme
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="primary_color"
                  value={formData.primary_color}
                  onChange={(e) => handleChange("primary_color", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={formData.primary_color}
                  onChange={(e) => handleChange("primary_color", e.target.value)}
                  className="flex-1"
                  placeholder="#2563eb"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Main brand color (buttons, links)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="secondary_color"
                  value={formData.secondary_color}
                  onChange={(e) => handleChange("secondary_color", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={formData.secondary_color}
                  onChange={(e) => handleChange("secondary_color", e.target.value)}
                  className="flex-1"
                  placeholder="#1e40af"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Secondary accent color
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent_color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="accent_color"
                  value={formData.accent_color}
                  onChange={(e) => handleChange("accent_color", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={formData.accent_color}
                  onChange={(e) => handleChange("accent_color", e.target.value)}
                  className="flex-1"
                  placeholder="#3b82f6"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Highlight and hover states
              </p>
            </div>
          </div>

          {/* Color Preview */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-3">Color Preview:</p>
            <div className="flex gap-4">
              <div
                className="w-20 h-20 rounded-lg shadow-sm flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: formData.primary_color }}
              >
                Primary
              </div>
              <div
                className="w-20 h-20 rounded-lg shadow-sm flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: formData.secondary_color }}
              >
                Secondary
              </div>
              <div
                className="w-20 h-20 rounded-lg shadow-sm flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: formData.accent_color }}
              >
                Accent
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Login Message */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Login Page Message
          </CardTitle>
          <CardDescription>
            Custom welcome message displayed on the login page
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="login_message">Welcome Message</Label>
            <Textarea
              id="login_message"
              placeholder="Welcome to our platform! Please sign in to access your dashboard."
              value={formData.login_message}
              onChange={(e) => handleChange("login_message", e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {formData.login_message.length}/500 characters
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
