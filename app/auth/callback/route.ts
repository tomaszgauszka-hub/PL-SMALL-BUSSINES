import { NextResponse } from "next/server";
import { serverSupabase } from "../../../lib/supabase/server";
import { safeReturnPath } from "../../../lib/http";
export async function GET(request: Request) { const url = new URL(request.url); const code = url.searchParams.get("code"); if (code) { const db = await serverSupabase(); const { error } = await db.auth.exchangeCodeForSession(code); if (!error) { const response = NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), url.origin)); response.headers.set("Cache-Control", "private, no-store"); return response; } } return NextResponse.redirect(new URL("/login?error=link", url.origin)); }
