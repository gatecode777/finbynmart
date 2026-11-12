import assert from "node:assert/strict";

const BASE = "http://localhost:3000";

async function run() {
  console.log("Starting Supplier Portal End-to-End Verification...");

  // 1. Register a test supplier
  const email = `supplier_${Date.now()}@example.com`;
  const password = "ValidPassword123!@#";
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "supplier",
      businessName: "Vertex Fabrications Pvt Ltd",
      contactName: "Test Supplier Owner",
      city: "Ahmedabad",
      phone: "+91 9876543210",
      offering: "Precision CNC machinery and industrial steel components",
      email,
      password,
    }),
  });

  const regData = await regRes.json();
  assert.equal(regRes.status, 201, `Supplier registration failed: ${JSON.stringify(regData)}`);
  console.log("✔ Supplier registered:", email);

  // Extract session cookies
  const rawCookies = regRes.headers.getSetCookie ? regRes.headers.getSetCookie() : [regRes.headers.get("set-cookie") || ""];
  const cookieHeader = rawCookies.map((c) => c.split(";")[0]).join("; ");

  const headers = {
    Cookie: cookieHeader,
    "Content-Type": "application/json",
  };

  // 2. Test GET /supplier/company
  const companyPageRes = await fetch(`${BASE}/supplier/company`, { headers: { Cookie: cookieHeader } });
  assert.equal(companyPageRes.status, 200, "GET /supplier/company page failed");
  const companyHtml = await companyPageRes.text();
  assert.ok(companyHtml.includes("Vertex Fabrications Pvt Ltd"), "Company name not found on company page");
  assert.ok(companyHtml.includes("Company Details"), "Company Details tab not found");
  console.log("✔ GET /supplier/company rendered successfully (HTTP 200)");

  // 3. Test PATCH /api/supplier/company
  const patchCompanyRes = await fetch(`${BASE}/api/supplier/company`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      businessName: "Vertex Global Fabrications Ltd",
      businessType: "Manufacturer",
      city: "Ahmedabad",
      country: "India",
      description: "ISO 9001 certified precision equipment manufacturer",
      version: 0,
    }),
  });
  const patchCompanyData = await patchCompanyRes.json();
  assert.equal(patchCompanyRes.status, 200, `PATCH /api/supplier/company failed: ${JSON.stringify(patchCompanyData)}`);
  assert.equal(patchCompanyData.data.businessName, "Vertex Global Fabrications Ltd");
  console.log("✔ PATCH /api/supplier/company updated business name");

  // 4. Test PATCH /api/supplier/profile
  const patchProfileRes = await fetch(`${BASE}/api/supplier/profile`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      name: "Rajesh Sharma",
      designation: "Managing Director",
      version: 0,
    }),
  });
  const patchProfileData = await patchProfileRes.json();
  assert.equal(patchProfileRes.status, 200, `PATCH /api/supplier/profile failed: ${JSON.stringify(patchProfileData)}`);
  assert.equal(patchProfileData.data.name, "Rajesh Sharma");
  console.log("✔ PATCH /api/supplier/profile updated contact person name");

  // 5. Test GET /supplier/settings and PATCH /api/supplier/settings
  const settingsPageRes = await fetch(`${BASE}/supplier/settings`, { headers: { Cookie: cookieHeader } });
  assert.equal(settingsPageRes.status, 200, "GET /supplier/settings page failed");
  console.log("✔ GET /supplier/settings rendered successfully (HTTP 200)");

  const patchSettingsRes = await fetch(`${BASE}/api/supplier/settings`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      inquiryAlerts: true,
      quotationAlerts: true,
      orderAlerts: true,
      marketingEmails: true,
    }),
  });
  const patchSettingsData = await patchSettingsRes.json();
  assert.equal(patchSettingsRes.status, 200, `PATCH /api/supplier/settings failed: ${JSON.stringify(patchSettingsData)}`);
  assert.equal(patchSettingsData.data.marketingEmails, true);
  console.log("✔ PATCH /api/supplier/settings updated notification preferences");

  // 6. Test GET /supplier/products and POST /api/supplier/products
  const productsPageRes = await fetch(`${BASE}/supplier/products`, { headers: { Cookie: cookieHeader } });
  assert.equal(productsPageRes.status, 200, "GET /supplier/products page failed");
  console.log("✔ GET /supplier/products rendered successfully (HTTP 200)");

  const addProductRes = await fetch(`${BASE}/api/supplier/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "High Performance Ball Bearing 6205",
      sku: "BRG-6205-Z",
      categoryName: "Industrial Supplies",
      price: 450,
      unit: "Piece",
      stock: 120,
      description: "Deep groove stainless steel ball bearing",
    }),
  });
  const addProductData = await addProductRes.json();
  assert.equal(addProductRes.status, 201, `POST /api/supplier/products failed: ${JSON.stringify(addProductData)}`);
  assert.equal(addProductData.data.name, "High Performance Ball Bearing 6205");
  console.log("✔ POST /api/supplier/products created product successfully");

  // 7. Test GET /supplier/inventory and PATCH /api/supplier/inventory
  const inventoryPageRes = await fetch(`${BASE}/supplier/inventory`, { headers: { Cookie: cookieHeader } });
  assert.equal(inventoryPageRes.status, 200, "GET /supplier/inventory page failed");
  console.log("✔ GET /supplier/inventory rendered successfully (HTTP 200)");

  const updateStockRes = await fetch(`${BASE}/api/supplier/inventory`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      sku: "BRG-6205-Z",
      quantity: 85,
      threshold: 15,
      location: "Sanand Plant Warehouse",
    }),
  });
  const updateStockData = await updateStockRes.json();
  assert.equal(updateStockRes.status, 200, `PATCH /api/supplier/inventory failed: ${JSON.stringify(updateStockData)}`);
  assert.equal(updateStockData.data.quantity, 85);
  console.log("✔ PATCH /api/supplier/inventory adjusted stock quantity to 85");

  // 8. Test GET /supplier/support and POST /api/supplier/support/tickets
  const supportPageRes = await fetch(`${BASE}/supplier/support`, { headers: { Cookie: cookieHeader } });
  assert.equal(supportPageRes.status, 200, "GET /supplier/support page failed");
  console.log("✔ GET /supplier/support rendered successfully (HTTP 200)");

  const createTicketRes = await fetch(`${BASE}/api/supplier/support/tickets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      category: "technical-issue",
      subject: "Test support ticket from supplier portal",
      description: "Testing support ticket creation and resolution pipeline for verified suppliers.",
      idempotencyKey: `idemp-${Date.now()}`,
    }),
  });
  const createTicketData = await createTicketRes.json();
  assert.equal(createTicketRes.status, 201, `POST /api/supplier/support/tickets failed: ${JSON.stringify(createTicketData)}`);
  assert.ok(createTicketData.ticket.reference, "No ticket reference returned");
  console.log("✔ POST /api/supplier/support/tickets created ticket:", createTicketData.ticket.reference);

  // 9. Test GET /supplier/company?tab=security and Supplier Security Actions
  const securityPageRes = await fetch(`${BASE}/supplier/company?tab=security`, { headers: { Cookie: cookieHeader } });
  assert.equal(securityPageRes.status, 200, "GET /supplier/company?tab=security failed");
  const securityHtml = await securityPageRes.text();
  assert.ok(securityHtml.includes("Account Security &amp; Credentials") || securityHtml.includes("Account Security & Credentials"), "Security panel heading not found");
  assert.ok(securityHtml.includes("Account Status"), "Account Status row not found");
  assert.ok(securityHtml.includes("Email Confirmation"), "Email Confirmation row not found");
  assert.ok(securityHtml.includes("Mobile Confirmation"), "Mobile Confirmation row not found");
  assert.ok(securityHtml.includes("Active Signed-In Devices"), "Active Signed-In Devices row not found");
  console.log("✔ GET /supplier/company?tab=security rendered with styled security rows");

  // 10. Test POST /api/supplier/security/verify-email
  const verifyEmailRes = await fetch(`${BASE}/api/supplier/security/verify-email`, {
    method: "POST",
    headers,
  });
  const verifyEmailData = await verifyEmailRes.json();
  assert.equal(verifyEmailRes.status, 200, `POST /api/supplier/security/verify-email failed: ${JSON.stringify(verifyEmailData)}`);
  assert.equal(verifyEmailData.ok, true, "Verify email response ok is false");
  console.log("✔ POST /api/supplier/security/verify-email succeeded:", verifyEmailData.message);

  // 11. Test POST /api/supplier/security/verify-phone
  const verifyPhoneRes = await fetch(`${BASE}/api/supplier/security/verify-phone`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      otp: "123456",
      phone: "+91 9876543210",
    }),
  });
  const verifyPhoneData = await verifyPhoneRes.json();
  assert.equal(verifyPhoneRes.status, 200, `POST /api/supplier/security/verify-phone failed: ${JSON.stringify(verifyPhoneData)}`);
  assert.equal(verifyPhoneData.ok, true, "Verify phone response ok is false");
  console.log("✔ POST /api/supplier/security/verify-phone succeeded:", verifyPhoneData.message);

  // 12. Test GET /api/supplier/security/sessions
  const getSessionsRes = await fetch(`${BASE}/api/supplier/security/sessions`, { headers: { Cookie: cookieHeader } });
  assert.equal(getSessionsRes.status, 200, "GET /api/supplier/security/sessions failed");
  const sessionsData = await getSessionsRes.json();
  assert.equal(sessionsData.ok, true);
  assert.ok(Array.isArray(sessionsData.data.sessions));
  console.log(`✔ GET /api/supplier/security/sessions returned ${sessionsData.data.sessions.length} active session(s)`);

  // 13. Test POST /api/supplier/security/sessions/revoke-others
  const revokeOthersRes = await fetch(`${BASE}/api/supplier/security/sessions/revoke-others`, {
    method: "POST",
    headers,
  });
  const revokeOthersData = await revokeOthersRes.json();
  assert.equal(revokeOthersRes.status, 200, `POST /api/supplier/security/sessions/revoke-others failed: ${JSON.stringify(revokeOthersData)}`);
  assert.equal(revokeOthersData.ok, true);
  console.log("✔ POST /api/supplier/security/sessions/revoke-others succeeded:", revokeOthersData.message);

  console.log("\n=======================================================");
  console.log("ALL SUPPLIER MODULE VERIFICATION CHECKS PASSED (13/13)!");
  console.log("=======================================================");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
