import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, serverSupabase } from "../../lib/supabase/server";
import Brand from "../brand";
import KsefTestPanel from "./test-panel";
export const dynamic = "force-dynamic";
export default async function KsefTestPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await serverSupabase();
  const assigned = await db.from("mk_ksef_test_workspaces").select("id").eq("owner", user.id).maybeSingle();
  if (!assigned.data) notFound();
  return <div className="ksef-test-shell"><header className="ksef-test-header"><Link className="brand" href="/" aria-label="Ewidora — wróć do księgowości"><Brand /></Link><Link className="btn ghost" href="/">Wróć do księgowości</Link></header><main><KsefTestPanel /></main></div>;
}
