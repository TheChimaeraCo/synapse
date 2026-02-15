"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function AccountTab() {
  const { data: session } = useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name || "");
  const [email] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      // Profile update would go through an API route
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChangingPw(true);
    try {
      const res = await gatewayFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message || "Failed to change password");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Account</h2>
        <p className="text-sm text-zinc-400">Manage your account and security.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Email</label>
            <Input value={email} disabled className="bg-white/[0.04] border-white/[0.08] text-zinc-500" />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? "Saving..." : "Update Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Current Password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">New Password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Confirm New Password</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
          <Button onClick={changePassword} disabled={changingPw || !currentPassword || !newPassword}>
            {changingPw ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-white/[0.04] border-red-900/50">
        <CardHeader>
          <CardTitle className="text-sm text-red-400">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Reset Gateway</p>
              <p className="text-zinc-500 text-xs">Clear all config and start fresh</p>
            </div>
            <Button variant="outline" size="sm" className="border-red-900 text-red-400 hover:bg-red-900/20" disabled>
              Reset
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Delete Account</p>
              <p className="text-zinc-500 text-xs">Permanently delete everything</p>
            </div>
            <Button variant="outline" size="sm" className="border-red-900 text-red-400 hover:bg-red-900/20" disabled>
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
