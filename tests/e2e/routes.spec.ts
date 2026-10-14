import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USERNAME_BY_ROLE, asRole, certificateToken, type DevRole } from "./helpers";

/** Plain test passwords live only in docs/test-users.md (written by `npm run dev:accounts`). */
function passwordFor(username: string): string {
  const md = readFileSync("docs/test-users.md", "utf8");
  const section = md.slice(md.indexOf("<!-- dashboard-logins:start -->"));
  const row = section.split("\n").find((line) => line.includes(`| \`${username}\` |`));
  const cells = row?.split("|").map((c) => c.trim());
  const password = cells?.[3]?.replace(/`/g, "");
  if (!password) throw new Error(`No password for ${username} in docs/test-users.md`);
  return password;
}

async function expectRendered(page: Page, path: string, texts: string[]) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
  for (const text of texts) {
    await expect(
      page.getByText(text, { exact: false }).first(),
      `${path}: "${text}"`
    ).toBeVisible();
  }
  await expect(page.getByText("No session")).toHaveCount(0);
}

const AREA_HOME: Record<DevRole, string> = {
  super_admin: "/admin",
  hospital_admin: "/hospital",
  hospital_staff: "/hospital",
  driver: "/driver",
  disposal_operator: "/disposal",
  efda_officer: "/regulator",
};

const AREAS: { role: DevRole; routes: [string, string[]][] }[] = [
  {
    role: "super_admin",
    routes: [
      [
        "/admin",
        [
          "Admin & Operations Workstation",
          "Live Fleet GPS Radar",
          "Today's Active & Scheduled Trips",
        ],
      ],
      ["/admin/fleet", ["Full Screen Tactical Fleet Radar"]],
      ["/admin/finance", ["Healthcare Facility Invoices Ledger", "Settled Revenue (ETB)"]],
      ["/admin/contracts", ["Service Contracts & Imminent Expirations"]],
      ["/admin/categories", ["Total recorded in past 30 days"]],
      ["/admin/alerts", ["Fleet Units Lacking Active GPS Telemetry Device"]],
    ],
  },
  {
    role: "hospital_admin",
    routes: [
      ["/hospital", ["Station", "Recent Waste Manifests", "Outstanding Waste Invoices"]],
      ["/hospital/waste", ["All Facility Waste Records"]],
      ["/hospital/certificates", ["Destruction Certificates Registry"]],
      ["/hospital/invoices", ["Financial Invoices & Receipts"]],
    ],
  },
  {
    role: "hospital_staff",
    routes: [
      ["/hospital", ["Station", "Recent Waste Manifests"]],
      ["/hospital/waste", ["All Facility Waste Records"]],
      ["/hospital/certificates", ["Destruction Certificates Registry"]],
      ["/hospital/invoices", ["Invoices are for Hospital Administrators"]],
    ],
  },
  {
    role: "driver",
    routes: [
      ["/driver", ["Driver Mobile Console", "Ordered stop sequence"]],
      // drv-01 has no PLANNED trip in the mock data (the prototype also showed "Upcoming Routes (0)").
      ["/driver/upcoming", ["No upcoming trips"]],
    ],
  },
  {
    role: "disposal_operator",
    routes: [
      ["/disposal", ["Disposal Plant Operations", "Staged Containers Awaiting Incineration"]],
      ["/disposal/inbound", ["INBOUND FLEET UNIT"]],
      ["/disposal/exceptions", ["Container Exceptions Log"]],
    ],
  },
  {
    role: "efda_officer",
    routes: [
      ["/regulator", ["EFDA Regulatory & Compliance Oversight", "8-Week Hazardous Waste Trend"]],
      ["/regulator/audit", ["Tamper-Proof Audit Trail Ledger"]],
      ["/regulator/certificates", ["National Destruction Certificates Ledger"]],
      ["/regulator/map", ["Live Route & Chain-of-Custody Radar"]],
    ],
  },
];

for (const area of AREAS) {
  test.describe(`dev role ${area.role}`, () => {
    test.beforeEach(async ({ page }) => asRole(page, area.role));

    for (const [path, texts] of area.routes) {
      test(`renders ${path}`, async ({ page }) => {
        await expectRendered(page, path, texts);
      });
    }

    test("/ redirects to the role's area", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(`${AREA_HOME[area.role]}$`));
    });
  });
}

test.describe("area guards (server-side, from the users table)", () => {
  test("a role from another area is sent to its own area", async ({ page }) => {
    await asRole(page, "super_admin");
    await page.goto("/hospital");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("the EFDA officer cannot open the driver console", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/driver");
    await expect(page).toHaveURL(/\/regulator$/);
  });

  test("without a test login, areas send you to /dev-login; / shows the public home page", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dev-login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        name: "Medical waste, tracked from the ward to the certificate.",
      })
    ).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dev-login$/);
  });

  test("the home page certificate box opens the verification page", async ({ page }) => {
    const token = await certificateToken("ISSUED");
    await page.goto("/");
    await page
      .getByLabel("Certificate link or verification code")
      .fill(`https://example.test/verify/${token}`);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(new RegExp(`/verify/${token}$`));
    await page.goto("/");
    await page.getByLabel("Certificate link or verification code").fill("nonsense");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Paste the link from the certificate's QR code")).toBeVisible();
  });

  test("a forged or unsigned session cookie is ignored", async ({ page }) => {
    const forged = Buffer.from(
      JSON.stringify({ username: "sw_admin", role: "super_admin", exp: 4_000_000_000 })
    ).toString("base64url");
    await page
      .context()
      .addCookies([
        { name: "sw_dev_session", value: `${forged}.bad-signature`, url: "http://localhost:3100" },
      ]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dev-login$/);
  });
});

test.describe("dashboard test logins (username + password)", () => {
  for (const role of Object.keys(USERNAME_BY_ROLE) as DevRole[]) {
    test(`${USERNAME_BY_ROLE[role]} opens the ${role} dashboard`, async ({ page }) => {
      await page.goto("/dev-login");
      await page.getByLabel("Username").fill(USERNAME_BY_ROLE[role]);
      await page.getByLabel("Password").fill(passwordFor(USERNAME_BY_ROLE[role]));
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(new RegExp(`${AREA_HOME[role]}$`));
      await expect(page.getByText(USERNAME_BY_ROLE[role]).first()).toBeVisible();
    });
  }

  test("a wrong password is refused with a clear message", async ({ page }) => {
    await page.goto("/dev-login");
    await page.getByLabel("Username").fill("sw_admin");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong username or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/dev-login$/);
  });

  test("sign out ends the session", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/regulator");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/dev-login$/);
    await page.goto("/regulator");
    await expect(page).toHaveURL(/\/dev-login$/);
  });
});

test.describe("permission matrix: every role × every area", () => {
  const AREA_PATHS = ["/admin", "/hospital", "/driver", "/disposal", "/regulator"];
  for (const role of Object.keys(AREA_HOME) as DevRole[]) {
    test(`${role} reaches only its own area`, async ({ page }) => {
      await asRole(page, role);
      for (const path of AREA_PATHS) {
        await page.goto(path);
        const expected = path === AREA_HOME[role] ? path : AREA_HOME[role];
        await expect(page, `${role} opening ${path}`).toHaveURL(new RegExp(`${expected}$`));
      }
    });
  }
});

test.describe("public and redirect routes", () => {
  test("/verify/[token] renders without the app sidebar", async ({ page }) => {
    await page.goto(`/verify/${await certificateToken("ISSUED")}`);
    await expect(page.getByText("Hazardous Waste Destruction Certificate")).toBeVisible();
    await expect(page.getByText("Admin Panel")).toHaveCount(0);
  });

  test("/sign-in placeholder renders", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("SafeWaste Portal")).toBeVisible();
  });

  test("/pending renders", async ({ page }) => {
    await page.goto("/pending");
    await expect(page.getByText("Account Pending Role Assignment")).toBeVisible();
  });

  test("/finance redirects to /admin/finance", async ({ page }) => {
    await asRole(page, "super_admin");
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/admin\/finance$/);
  });
});

test.describe("regulator filters live in the URL", () => {
  test("choosing a facility adds ?facility= and tabs keep it", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/regulator");
    await page.locator("select").first().selectOption("DD-REF-001");
    await expect(page).toHaveURL(/facility=DD-REF-001/);
    await page.getByRole("link", { name: /Audit Trail Ledger/ }).click();
    await expect(page).toHaveURL(/\/regulator\/audit\?facility=DD-REF-001/);
  });
});

test.describe("regulator reads the database (Gate 2.11)", () => {
  test("certificates come from the seeded database (CD- numbers), audit shows real entries", async ({
    page,
  }) => {
    await asRole(page, "efda_officer");
    await page.goto("/regulator/certificates");
    await expect(page.getByText(/CD-\d{4}-\d{5}/).first()).toBeVisible();
    await expect(page.getByText("CERT-202610-0091")).toHaveCount(0); // old mock number
    await page.goto("/regulator/audit");
    await expect(page.getByText("Tamper-Proof Audit Trail Ledger")).toBeVisible();
    // Newest first: rows written by the integration tests may be on top, so any action name will do.
    await expect(page.getByText(/^[a-z_]+\.[a-z_.]+$/).first()).toBeVisible();
  });

  test("the map shows the trips in progress", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/regulator/map");
    // A real map with the count of vehicles on a trip (which ones depends on the test data: max 10 shown).
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await expect(page.getByText(/\d+ on trip/).first()).toBeVisible();
  });
});

test.describe("hospital reads the database, own facility only (Gate 2.12)", () => {
  test("the hospital admin sees its own waste (WR- codes) and issued invoices, never drafts", async ({
    page,
  }) => {
    await asRole(page, "hospital_admin");
    await page.goto("/hospital");
    await expect(page.getByText("Dil Chora Referral Hospital Station")).toBeVisible();
    await expect(page.getByText(/WR-\d{4}-\d{5}/).first()).toBeVisible();
    await page.goto("/hospital/invoices");
    await expect(page.getByText(/INV-\d{4}-\d{2}-\d{4}/).first()).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toHaveCount(0);
  });

  test("hospital staff sees its own facility (Sabian), not the admin's", async ({ page }) => {
    await asRole(page, "hospital_staff");
    await page.goto("/hospital");
    await expect(page.getByText("Sabian General Hospital Station")).toBeVisible();
    await expect(page.getByText("Dil Chora Referral Hospital")).toHaveCount(0);
  });
});

test.describe("admin reads the database (Gate 2.13)", () => {
  test("overview lists today's trip in progress; alerts show the seeded problems", async ({
    page,
  }) => {
    await asRole(page, "super_admin");
    await page.goto("/admin");
    await expect(page.getByText(/TR-\d{6}-\d{2}/).first()).toBeVisible();
    await expect(page.getByText("ET-3-A48291").first()).toBeVisible();
    await page.goto("/admin/alerts");
    await expect(page.getByText("Facilities Not Ready for Pickup")).toBeVisible();
    await expect(page.getByText("Dechatu Specialty Surgery Clinic").first()).toBeVisible();
    await expect(page.getByText("Silent Trackers During a Trip")).toBeVisible();
  });
});

test.describe("driver and disposal read the database (Gate 2.14)", () => {
  test("the driver sees today's trip and the stop where the truck has arrived", async ({
    page,
  }) => {
    await asRole(page, "driver");
    await page.goto("/driver");
    await expect(page.getByText(/TR-\d{6}-\d{2}/).first()).toBeVisible();
    await expect(page.getByText("Dil Chora Referral Hospital")).toBeVisible();
    await expect(page.getByText("Arrived", { exact: true }).first()).toBeVisible();
  });

  test("the disposal operator sees the queue (Waste IDs) and the inbound truck", async ({
    page,
  }) => {
    await asRole(page, "disposal_operator");
    await page.goto("/disposal");
    // Cards on a phone, a table from md up: only the visible copy counts.
    await expect(
      page
        .getByText(/WR-\d{4}-\d{5}-C\d{2}/)
        .locator("visible=true")
        .first()
    ).toBeVisible();
    await page.goto("/disposal/inbound");
    await expect(page.getByText("ET-3-A48291").first()).toBeVisible();
  });
});

test.describe("waste registration (Gate 2.15)", () => {
  // NOTE: the successful registration is committed on the database the dev server uses (one record per run).
  test("empty form shows field errors; a valid registration shows the Waste ID and container codes", async ({
    page,
  }) => {
    await asRole(page, "hospital_staff");
    await page.goto("/hospital/waste");
    await page.getByRole("link", { name: "Register waste" }).click();
    await expect(page).toHaveURL(/\/hospital\/waste\/new$/);

    await page.getByLabel("Number of containers").fill("0");
    await page.getByRole("button", { name: "Register waste" }).click();
    await expect(page.getByText("Choose a waste category")).toBeVisible();
    await expect(page.getByText("At least 1 container")).toBeVisible();
    await expect(
      page.getByText("Enter the weight in kg").or(page.getByText("Weight must be more than 0 kg"))
    ).toBeVisible();

    await page.getByLabel("Waste category").selectOption("SHARPS");
    await page.getByLabel("Number of containers").fill("2");
    await page.getByLabel("Total weight (kg)").fill("3.5");
    await page.getByRole("button", { name: "Register waste" }).click();

    await expect(page.getByText("Waste registered")).toBeVisible();
    const code = await page.locator("ul[aria-label='Container codes'] li").first().textContent();
    expect(code).toMatch(/^WR-\d{4}-\d{5}-C01/);
    await expect(page.locator("ul[aria-label='Container codes'] li")).toHaveCount(2);

    // Gate 2.16: the label sheet is a PDF from the real route (same session cookie).
    const href = await page.getByRole("link", { name: "Print labels (PDF)" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/waste\/[0-9a-f-]{36}\/labels$/);
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Another facility's hospital admin cannot fetch these labels (not even learn they exist).
    await asRole(page, "hospital_admin");
    expect((await page.request.get(href!)).status()).toBe(404);
  });

  test("the EFDA officer cannot open the registration page", async ({ page }) => {
    await asRole(page, "efda_officer");
    await page.goto("/hospital/waste/new");
    await expect(page).toHaveURL(/\/regulator$/);
  });
});

test.describe("public certificate verification reads the database (Gate 2.17)", () => {
  test("an issued certificate shows exactly the public fields; a revoked one says so", async ({
    page,
  }) => {
    await page.goto(`/verify/${await certificateToken("ISSUED")}`);
    await expect(page.getByText(/CD-\d{4}-\d{5}/).first()).toBeVisible();
    await expect(page.getByText(/WR-\d{4}-\d{5}/).first()).toBeVisible();
    await expect(page.getByText("Destruction Method:")).toBeVisible();
    await expect(page.getByText("Disposal Facility:")).toHaveCount(0); // not a DECISION field
    await page.goto(`/verify/${await certificateToken("REVOKED")}`);
    await expect(page.getByText("THIS CERTIFICATE HAS BEEN REVOKED")).toBeVisible();
    await expect(page.getByText(/seed example/)).toHaveCount(0); // the free-text revoke reason is never public
  });

  test("pending, failed and unknown certificates are not found", async ({ page }) => {
    for (const token of [
      await certificateToken("PENDING"),
      await certificateToken("FAILED"),
      "unknown-token-0000000000000",
    ]) {
      const res = await page.goto(`/verify/${token}`);
      expect(res?.status(), token).toBe(404);
    }
  });
});

test.describe("mobile areas at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  const MOBILE: [DevRole, string][] = [
    ["driver", "/driver"],
    ["driver", "/driver/upcoming"],
    ["disposal_operator", "/disposal"],
    ["disposal_operator", "/disposal/inbound"],
    ["disposal_operator", "/disposal/exceptions"],
  ];

  for (const [role, path] of MOBILE) {
    test(`${path} has no horizontal scroll and ≥ 48 px nav targets`, async ({ page }) => {
      await asRole(page, role);
      await page.goto(path);
      await expect(page.getByRole("navigation").last()).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, "page width").toBeLessThanOrEqual(360);

      const navLinks = page.getByRole("navigation").last().getByRole("link");
      const count = await navLinks.count();
      expect(count).toBeGreaterThan(1);
      for (let i = 0; i < count; i++) {
        const box = await navLinks.nth(i).boundingBox();
        expect(box?.height ?? 0, `nav link ${i} height`).toBeGreaterThanOrEqual(48);
      }
    });
  }
});

test.describe("sign-in is required (no bypass header)", () => {
  test.use({ extraHTTPHeaders: {} });

  test("a signed-out visitor opening /admin is sent to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
    await expect(page.getByText("SafeWaste Portal")).toBeVisible();
  });

  test("an API route outside the public list is protected", async ({ request }) => {
    const res = await request.get("/api/does-not-exist-yet", { maxRedirects: 0 });
    expect([401, 404, 307]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("public pages stay public", async ({ page }) => {
    await page.goto(`/verify/${await certificateToken("ISSUED")}`);
    await expect(page.getByText("Hazardous Waste Destruction Certificate")).toBeVisible();
  });
});
