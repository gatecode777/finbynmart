import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ user: null });
  }
}
