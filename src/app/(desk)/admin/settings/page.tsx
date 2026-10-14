import { getAllSettings } from "@/server/services/settings-admin";
import { SettingsEditor } from "@/components/admin/settings-editor";

/** /admin/settings — business settings (CLAUDE.md §7), super_admin only; every change is audited. */
export default async function AdminSettingsPage() {
  return <SettingsEditor rows={await getAllSettings()} />;
}
