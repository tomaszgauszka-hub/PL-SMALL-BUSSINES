import AuthForm from "../login/auth-form";
import { supabaseConfigured } from "../../lib/supabase/config";
export const dynamic = "force-dynamic";
export default function Reset() { return <AuthForm configured={supabaseConfigured()} recovery />; }
