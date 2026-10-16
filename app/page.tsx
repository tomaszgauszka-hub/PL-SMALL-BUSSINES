import { currentUser } from "../lib/supabase/server";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  return <Workspace user={user ? { name: user.email?.split("@")[0] || "Moja działalność", email: user.email || "" } : null} signIn="/login" signOut="/auth/logout" />;
}
