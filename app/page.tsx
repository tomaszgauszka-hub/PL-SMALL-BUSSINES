import { currentUser, serverSupabase } from "../lib/supabase/server";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  const choice = user?.user_metadata?.ewidora_business_type;
  const lab = user ? await (await serverSupabase()).from("mk_ksef_test_workspaces").select("id").eq("owner", user.id).maybeSingle() : null;
  return <Workspace ksefTestAvailable={!!lab?.data} user={user ? { name: user.email?.split("@")[0] || "Moja działalność", email: user.email || "" } : null} registrationType={choice === "dn" || choice === "jdg" ? choice : null} signIn="/login" signOut="/auth/logout" />;
}
