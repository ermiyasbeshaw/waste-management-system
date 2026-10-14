# SafeWaste Dashboards & Consolidated Role Architecture

This document describes the 6 core role dashboards, their widgets, and the underlying data query functions. All currency throughout the platform is strictly formatted in **ETB (Ethiopian Birr)**.

---

## 1. Consolidated Role Matrix (6 Active Personas)

| # | Role Persona | Route | Core Modules & Responsibilities | Query Function |
|---|---|---|---|---|
| **1** | **Super Administrator**<br>(Nebiyu Platform Admin) | `/admin` | • Live GPS fleet radar (30s auto-refresh)<br>• 6 System KPIs<br>• **Integrated Financial Operations**: Invoices ledger (ETB), accounts receivable, contract expirations & uncontracted facility warnings<br>• 30-Day MoH category analytics<br>• Security alerts (OTP overrides, missing contacts) | `getAdminDashboardData()` |
| **2** | **Hospital Administrator**<br>(Dr. Aster Tadesse) | `/hospital` | • Scoped to own hospital (*Dil Chora Referral Hospital*)<br>• Stage KPIs & categorized waste records<br>• Official destruction certificates feed<br>• Facility billing & open invoices summary in ETB | `getHospitalDashboardData(facilityId)` |
| **3** | **Hospital Staff / EHO**<br>(Sr. Genet Alemu) | `/hospital` | • Scoped to own hospital (*Sabian General Hospital*)<br>• Biohazard waste registration by MoH color code<br>• Barcoded container manifest preparation & pickup requests | `getHospitalDashboardData(facilityId)` |
| **4** | **Fleet Driver**<br>(Abebe Kebede) | `/driver` | • **Mobile-first console**<br>• Active trip progress banner & payload weight<br>• Ordered touch stop cards with contact info, ETA, and container counts<br>• Digital OTP handover confirmation & upcoming routes | `getDriverDashboardData(driverId)` |
| **5** | **Disposal Operator**<br>(Eng. Kassahun Worku) | `/disposal` | • Central treatment plant incinerator yard queue<br>• Inbound collection trucks live feed<br>• Neutralization metric counters (today/week)<br>• 30-Day missing and refused container discrepancy log | `getDisposalDashboardData()` |
| **6** | **EFDA Regulatory & Audit Officer**<br>(Tariku Haile) | `/regulator` | • Regional healthcare waste oversight across all 18 facilities<br>• 8-Week volume trends (Area Chart) & hospital generation league<br>• **Full Immutable Audit Trail Ledger** with cryptographic verify tokens<br>• National destruction certificates registry & chain-of-custody route replay | `getRegulatorDashboardData()` |

---

## 2. Public Certificate Verification
- Route: `/verify/[token]`
- Provides tamper-proof public verification for EFDA destruction certificates, displaying waste weight, disposal method, facility, and SHA256 cryptographic match.

---

## 3. Financial & Currency Standards
- All billing figures, contract rates, and invoice totals are strictly denominated and displayed in **ETB**.
