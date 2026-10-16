import AuthForm from "./auth-form";
import { supabaseConfigured } from "../../lib/supabase/config";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) { const params = await searchParams; return <AuthForm configured={supabaseConfigured()} linkError={params.error === "link"} />; }
