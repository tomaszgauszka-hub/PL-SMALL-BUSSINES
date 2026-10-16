import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/supabase/server";
import { safeReturnPath } from "../../../lib/http";
export async function GET(request: Request) { const url = new URL(request.url); const hash = url.searchParams.get("token_hash"), type = url.searchParams.get("type"); if (hash && type && ["email", "signup", "recovery", "email_change"].includes(type)) { const db = await serverSupabase(); const { error } = await db.auth.verifyOtp({ token_hash: hash, type: type as EmailOtpType }); if (!error) { const response = NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/"), url.origin)); response.headers.set("Cache-Control", "private, no-store"); return response; } } return NextResponse.redirect(new URL("/login?error=link", url.origin)); }
