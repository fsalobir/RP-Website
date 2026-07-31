import { getCachedAuth } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await getCachedAuth();
  if (!auth.user || auth.isAdmin || !auth.playerCountryId) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rating = Number(body?.rating);
  const isReport = body?.isReport === true;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if ((rating !== -1 && rating !== 1)
      || (isReport && (question.length < 1 || question.length > 1000 || answer.length < 1 || answer.length > 12000))) {
    return Response.json({ error: "Retour invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ai_feedback").insert({
    user_id: auth.user.id,
    country_id: auth.playerCountryId,
    rating,
    is_report: isReport,
    question: isReport ? question : null,
    answer: isReport ? answer : null,
  });
  if (error) return Response.json({ error: "Le retour n’a pas pu être enregistré." }, { status: 500 });
  return Response.json({ ok: true });
}
