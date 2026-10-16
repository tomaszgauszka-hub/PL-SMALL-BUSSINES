import { ZodError } from "zod";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import { json, sameOrigin } from "../../../lib/http";
import { businessMutationInput, businessProfileInput, businessTypeInput, catalogItemInput } from "../../../lib/business-validation";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  const db = await serverSupabase();
  const { data, error } = await db.rpc("mk_business_state");
  if (error) return json({ error: "Nie udało się wczytać profilu działalności i katalogu." }, 503);
  return json(data);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Nieprawidłowe źródło żądania." }, 403);
  if (!await currentUser()) return json({ error: "Zaloguj się." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 30000) return json({ error: "Za dużo danych." }, 413);
    const { opId, action, data } = businessMutationInput.parse(JSON.parse(raw));
    const payload = action === "register" ? { businessType: businessTypeInput.parse((data as Record<string, unknown>)?.businessType) } : action === "profile" ? businessProfileInput.parse(data) : catalogItemInput.parse(data);
    const db = await serverSupabase();
    const { error } = await db.rpc("mk_business_mutate", { p_op_id: opId, p_action: action, p_data: payload });
    if (error) return json({ error: error.code === "P0001" || error.code === "40001" ? error.message : "Nie udało się zapisać danych. Sprawdź formularz i spróbuj ponownie." }, error.code === "40001" || error.code === "23505" ? 409 : 400);
    const { data: state, error: readError } = await db.rpc("mk_business_state");
    if (readError) return json({ error: "Zapisano dane, ale odświeżenie się nie powiodło. Ponów operację, aby wczytać stan." }, 503);
    return json(state);
  } catch (error) {
    return json({ error: error instanceof ZodError ? error.issues.map(issue => issue.message).join(" ") : "Nieprawidłowe dane." }, 400);
  }
}
