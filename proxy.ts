import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseConfig, supabaseConfigured } from "./lib/supabase/config";
export async function proxy(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next();
  let response = NextResponse.next({ request }); const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, { cookieOptions, cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values, extraHeaders) {
      values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(extraHeaders ?? {}).forEach(([key, value]) => response.headers.set(key, value));
    },
  } });
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
