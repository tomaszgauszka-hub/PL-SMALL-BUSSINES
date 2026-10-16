import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cookieOptions, supabaseConfig, supabaseConfigured } from "./config";
export async function serverSupabase() {
  const { url, key } = supabaseConfig(); const jar = await cookies();
  return createServerClient(url, key, { cookieOptions, cookies: { getAll: () => jar.getAll(), setAll(values) { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components: refreshed cookies are written by proxy.ts. */ } } } });
}
export async function currentUser() {
  if (!supabaseConfigured()) return null;
  const db = await serverSupabase(); const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous || !user.email_confirmed_at) return null;
  return user;
}
