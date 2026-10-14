export type UserRole =
  | "super_admin"
  | "hospital_admin"
  | "hospital_staff"
  | "driver"
  | "disposal_operator"
  | "efda_officer";

export interface RoleConfig {
  role: UserRole;
  label: string;
  workspaceName: string;
  description: string;
  defaultPath: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  super_admin: {
    role: "super_admin",
    label: "Super Administrator",
    workspaceName: "Admin & Operations Workspace",
    description: "System oversight, fleet radar, billing & invoices (ETB), contracts & alerts",
    defaultPath: "/admin",
    accentColor: "emerald",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-400",
    badgeBorder: "border-emerald-500/20",
  },
  hospital_admin: {
    role: "hospital_admin",
    label: "Hospital Administrator",
    workspaceName: "Hospital Admin Portal",
    description: "Facility waste oversight, certificates & invoice totals (ETB)",
    defaultPath: "/hospital",
    accentColor: "blue",
    badgeBg: "bg-blue-500/10",
    badgeText: "text-blue-400",
    badgeBorder: "border-blue-500/20",
  },
  hospital_staff: {
    role: "hospital_staff",
    label: "Hospital Staff / EHO",
    workspaceName: "Hospital Station",
    description: "Waste registration, barcode containers & pickup scheduling",
    defaultPath: "/hospital",
    accentColor: "cyan",
    badgeBg: "bg-cyan-500/10",
    badgeText: "text-cyan-400",
    badgeBorder: "border-cyan-500/20",
  },
  driver: {
    role: "driver",
    label: "Fleet Driver",
    workspaceName: "Driver Mobile Console",
    description: "Mobile-first route navigation, stops sequence & container pickups",
    defaultPath: "/driver",
    accentColor: "amber",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-400",
    badgeBorder: "border-amber-500/20",
  },
  disposal_operator: {
    role: "disposal_operator",
    label: "Disposal Operator",
    workspaceName: "Disposal Facility Terminal",
    description: "Inbound truck reception, incinerator queue & destruction stats",
    defaultPath: "/disposal",
    accentColor: "rose",
    badgeBg: "bg-rose-500/10",
    badgeText: "text-rose-400",
    badgeBorder: "border-rose-500/20",
  },
  efda_officer: {
    role: "efda_officer",
    label: "EFDA Regulatory & Audit Officer",
    workspaceName: "EFDA Regulatory & Compliance Oversight",
    description:
      "Federal compliance inspection, volume analytics, route replay & immutable audit ledger",
    defaultPath: "/regulator",
    accentColor: "indigo",
    badgeBg: "bg-indigo-500/10",
    badgeText: "text-indigo-400",
    badgeBorder: "border-indigo-500/20",
  },
};
