import { adminClient, corsHeaders, jsonResponse, requireAdmin } from "../_shared/datagolf.ts";
import { finalizeTournament } from "../_shared/finalize.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);
    const admin = adminClient();

    let tournamentId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.tournament_id) tournamentId = String(body.tournament_id);
      } catch {
        // no body
      }
    }

    if (!tournamentId) {
      const { data, error } = await admin
        .from("tournaments")
        .select("id")
        .in("status", ["in_progress", "open"])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournamentId = data?.id ?? null;
    }

    if (!tournamentId) {
      return jsonResponse({ message: "No tournament to finalize.", awards: 0 });
    }

    const result = await finalizeTournament(admin, tournamentId);
    return jsonResponse({
      message: result.message,
      tournamentId: result.tournamentId,
      awards: result.awards,
      alreadyDone: result.alreadyDone,
      awardSummary: result.awardSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "finalize-event failed";
    const status = message === "Unauthorized" || message === "Admins only" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
