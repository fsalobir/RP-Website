import { getCachedAuth } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { getAiSettings, releaseAiCall, reserveAiCall, settleAiCall, stableSafetyIdentifier } from "@/lib/ai/budget";
import { streamOpenAIText } from "@/lib/ai/openai";
import { buildPlayerAssistantContext, PLAYER_ASSISTANT_INSTRUCTIONS } from "@/lib/ai/playerContext";
import type { PlayerStreamEvent } from "@/lib/ai/contracts";
import { parsePlayerAssistantRequest } from "@/lib/ai/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

function event(value: PlayerStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
}
function jsonError(message: string, status: number) {
  return Response.json({ error: message, wikiHref: "/wiki" }, { status });
}

export async function POST(request: Request) {
  const auth = await getCachedAuth();
  if (!auth.user) return jsonError("Connectez-vous pour utiliser le Secrétaire.", 401);
  if (auth.isAdmin) return jsonError("Utilisez l’assistant d’administration depuis le QG.", 403);
  if (!auth.playerCountryId) return jsonError("Aucun pays n’est lié à ce compte.", 403);

  let body;
  try {
    body = parsePlayerAssistantRequest(await request.json());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Requête invalide.", 400);
  }

  let settings;
  try {
    settings = await getAiSettings();
  } catch {
    return jsonError("Le Secrétaire est momentanément indisponible.", 503);
  }
  if (!settings.player_enabled) return jsonError("Le Secrétaire n’est pas encore activé.", 503);
  if (!process.env.OPENAI_API_KEY) return jsonError("Le Secrétaire n’est pas encore configuré.", 503);

  const supabase = await createClient();
  let authorizedContext;
  try {
    authorizedContext = await buildPlayerAssistantContext({
      supabase,
      playerCountryId: auth.playerCountryId,
      request: body,
    });
  } catch {
    return jsonError("Les données du jeu n’ont pas pu être chargées. Consultez le Wiki ou contactez un MJ.", 503);
  }

  const input = [
    { role: "user" as const, content: `CONTEXTE AUTORISÉ DU JEU\n${authorizedContext.context}` },
    ...body.history.slice(-20),
    { role: "user" as const, content: body.message },
  ];
  const maxOutputTokens = 1200;
  const reservationPrompt = `${PLAYER_ASSISTANT_INSTRUCTIONS}\n${JSON.stringify(input)}`;

  let reservation;
  try {
    reservation = await reserveAiCall({
      userId: auth.user.id,
      surface: "player",
      model: settings.player_model,
      effort: settings.player_effort,
      prompt: reservationPrompt,
      maxOutputTokens,
      prices: settings.prices,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_BUDGET_EXHAUSTED") {
      return jsonError("Le budget commun du Secrétaire est épuisé. Le Wiki reste disponible.", 429);
    }
    return jsonError("Le Secrétaire n’a pas pu démarrer. Réessayez plus tard.", 503);
  }

  const abortController = new AbortController();
  let settled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let completed = false;
        controller.enqueue(event({ type: "sources", sources: authorizedContext.sources }));
        for await (const chunk of streamOpenAIText({
          model: settings.player_model,
          effort: settings.player_effort,
          instructions: PLAYER_ASSISTANT_INSTRUCTIONS,
          input,
          safetyIdentifier: stableSafetyIdentifier(auth.user!.id),
          maxOutputTokens,
          signal: abortController.signal,
        })) {
          if (chunk.type === "text") {
            controller.enqueue(event({ type: "text", text: chunk.text }));
          } else {
            const costUsd = await settleAiCall(reservation.eventId, chunk.usage, reservation.prices);
            settled = true;
            completed = true;
            controller.enqueue(event({ type: "usage", ...chunk.usage, costUsd }));
          }
        }
        if (!completed) throw new Error("Flux OpenAI incomplet.");
        controller.enqueue(event({ type: "done" }));
      } catch (error) {
        if (!settled) await releaseAiCall(reservation.eventId, error instanceof Error ? error.message : "stream_error");
        controller.enqueue(event({
          type: "error",
          message: "Le Secrétaire n’a pas pu répondre. Le Wiki reste disponible.",
          wikiHref: "/wiki",
        }));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
      if (!settled) void releaseAiCall(reservation.eventId, "client_disconnected");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
