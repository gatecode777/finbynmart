import { NextResponse } from "next/server";
import { fail, readJson, str } from "@/lib/auth/http";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { createUser, toPublicUser } from "@/lib/auth/users";
import { validateSignUp, validateSupplierRegistration } from "@/lib/validations/account";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return fail("Invalid request.");

  const isSupplier = body.role === "supplier";
  const email = str(body.email);
  const password = str(body.password);

  let name: string;
  let supplier: { businessName: string; phone: string; city: string; offering: string } | undefined;

  if (isSupplier) {
    const values = {
      businessName: str(body.businessName),
      contactName: str(body.contactName),
      email,
      phone: str(body.phone),
      city: str(body.city),
      offering: str(body.offering),
      password,
    };
    const errors = validateSupplierRegistration(values);
    if (Object.keys(errors).length > 0) return fail("Check the highlighted fields.", 400, errors);
    name = values.contactName.trim();
    supplier = {
      businessName: values.businessName.trim(),
      phone: values.phone.trim(),
      city: values.city.trim(),
      offering: values.offering.trim(),
    };
  } else {
    const values = { name: str(body.name), email, password };
    const errors = validateSignUp(values);
    if (Object.keys(errors).length > 0) return fail("Check the highlighted fields.", 400, errors);
    name = values.name.trim();
  }

  try {
    const user = await createUser({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: isSupplier ? "supplier" : "buyer",
      supplier,
    });
    if (!user) return fail("An account with this email already exists.", 409, { email: "This email is already registered." });
    await startSession(user._id.toString());
    return NextResponse.json({ ok: true, user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    console.error("register failed", error);
    return fail("Registration is unavailable right now. Please try again.", 503);
  }
}
