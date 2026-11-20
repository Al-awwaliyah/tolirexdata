import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptIdentity } from "../_shared/identity-crypto.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Supabase function environment is incomplete" }, 500);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const firstName = String(body.first_name ?? "").trim();
  const lastName = String(body.last_name ?? "").trim();
  const phone = String(body.phone_number ?? "").trim();
  const bvn = String(body.bvn ?? "").replace(/\s/g, "");
  const nin = String(body.nin ?? "").replace(/\s/g, "");
  const consent = body.consent === true;

  if (firstName.length < 2 || firstName.length > 80 || lastName.length < 2 || lastName.length > 80) {
    return json({ error: "Enter your legal first and last names" }, 400);
  }
  if (!/^\+?[0-9]{10,15}$/.test(phone)) return json({ error: "Enter a valid phone number" }, 400);
  if (!consent) return json({ error: "Explicit consent is required to process your identity details" }, 400);
  if ((bvn && !/^\d{11}$/.test(bvn)) || (nin && !/^\d{11}$/.test(nin)) || (!!bvn === !!nin)) {
    return json({ error: "Provide either a valid 11-digit BVN or a valid 11-digit NIN" }, 400);
  }

  try {
    const identityKind = bvn ? "bvn" : "nin";
    const ciphertext = await encryptIdentity(bvn || nin);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing, error: existingError } = await admin.from("kyc_records")
      .select("id,status").eq("user_id", authData.user.id)
      .in("status", ["pending", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingError) return json({ error: "Unable to check existing KYC application" }, 500);
    if (existing?.status === "approved") return json({ error: "Your KYC is already approved" }, 409);
    if (existing?.status === "pending") return json({ error: "Your KYC application is already under review" }, 409);

    const { data, error } = await admin.from("kyc_records").insert({
      user_id: authData.user.id,
      level: 1,
      status: "pending",
      first_name: firstName,
      last_name: lastName,
      phone_number: phone,
      identity_kind: identityKind,
      identity_ciphertext: ciphertext,
      consent_at: new Date().toISOString(),
      verification_method: "manual_review",
    }).select("id,status,level,created_at").single();
    if (error || !data) return json({ error: "Unable to submit KYC application" }, 500);

    await admin.from("audit_logs").insert({
      actor_user_id: authData.user.id,
      action: "kyc.submitted",
      target_type: "kyc_record",
      target_id: data.id,
      after_data: { level: 1, identity_kind: identityKind, consent_recorded: true },
    });
    return json({ application: data }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to securely process KYC";
    return json({ error: message }, 500);
  }
});
