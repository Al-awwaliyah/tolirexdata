import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Supabase function environment is incomplete" }, 500);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);
  const { data: permitted, error: permissionError } = await caller.rpc("has_admin_permission", { p_permission: "kyc.review" });
  if (permissionError || permitted !== true) return json({ error: "KYC review permission required" }, 403);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const recordId = String(body.kyc_record_id ?? "");
  const decision = body.decision;
  const note = String(body.review_note ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(recordId) || !["approved", "rejected", "needs_information"].includes(String(decision))) {
    return json({ error: "A valid KYC record and review decision are required" }, 400);
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: record, error } = await admin.from("kyc_records").update({
    status: decision,
    reviewer_id: authData.user.id,
    reviewed_at: new Date().toISOString(),
    review_note: note || null,
    verified_at: decision === "approved" ? new Date().toISOString() : null,
  }).eq("id", recordId).eq("status", "pending").select("id,user_id,status,level").maybeSingle();
  if (error) return json({ error: "Unable to update KYC review" }, 500);
  if (!record) return json({ error: "KYC record is not pending or does not exist" }, 409);

  await admin.from("audit_logs").insert({
    actor_user_id: authData.user.id,
    action: "kyc.reviewed",
    target_type: "kyc_record",
    target_id: record.id,
    after_data: { decision, review_note: note || null },
  });
  return json({ application: record });
});
