import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type CatalogueEndpoint = {
  key: string;
  path: string;
};

const API_ROOT = "https://www.nellobytesystems.com";
const ENDPOINTS: CatalogueEndpoint[] = [
  { key: "data_networks", path: "/APIDatabundleNetworkV1.asp" },
  { key: "data_plans", path: "/APIDatabundlePlansV3.asp" },
  { key: "airtime_networks", path: "/APIAirtimeNetworkV2.asp" },
  { key: "cable_types", path: "/APICableTVTypeV2.asp" },
  { key: "cable_packages", path: "/APICableTVPackagesV2.asp" },
  { key: "electricity_discos", path: "/APIElectricityDiscosV1.asp" },
  { key: "epin_catalogue", path: "/APIEPINDiscountV2.asp" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function fetchCatalogue(endpoint: CatalogueEndpoint, userId: string, apiKey: string) {
  const url = new URL(endpoint.path, API_ROOT);
  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Supplier returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("Supplier returned an invalid catalogue response");
  }

  const record = payload as Record<string, unknown>;
  const status = String(record.status ?? "").trim().toLowerCase();
  if (status && !["success", "ok"].includes(status)) {
    throw new Error(`Supplier catalogue status: ${String(record.status)}`);
  }

  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supplierUserId = Deno.env.get("CLUBKONNECT_USER_ID");
  const supplierApiKey = Deno.env.get("CLUBKONNECT_API_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Supabase function environment is incomplete" }, 500);
  }
  if (!supplierUserId || !supplierApiKey) {
    return json({ error: "ClubKonnect credentials are not configured in Supabase Edge Function secrets" }, 503);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const { data: permitted, error: permissionError } = await caller.rpc("has_admin_permission", {
    p_permission: "services.manage",
  });
  if (permissionError || permitted !== true) return json({ error: "Service management permission required" }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const providerCheck = await admin.from("service_providers")
    .select("code")
    .eq("code", "clubkonnect")
    .maybeSingle();
  if (providerCheck.error || !providerCheck.data) {
    return json({ error: "ClubKonnect provider is not registered in the platform database" }, 409);
  }

  const results = await Promise.all(ENDPOINTS.map(async (endpoint) => {
    try {
      const payload = await fetchCatalogue(endpoint, supplierUserId, supplierApiKey);
      const { error } = await admin.from("provider_catalogue_snapshots").upsert({
        provider_code: "clubkonnect",
        catalogue_key: endpoint.key,
        payload,
        fetched_at: new Date().toISOString(),
        fetch_status: "success",
        error_summary: null,
      }, { onConflict: "provider_code,catalogue_key" });

      if (error) throw new Error("Could not persist supplier catalogue snapshot");
      return { key: endpoint.key, status: "success" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown supplier error";
      // Preserve the last known good payload; report failure without replacing it.
      return { key: endpoint.key, status: "failed" as const, error: message };
    }
  }));

  const succeeded = results.filter((item) => item.status === "success").length;
  const failed = results.length - succeeded;

  await admin.from("audit_logs").insert({
    actor_user_id: userData.user.id,
    action: "provider.catalogue_sync",
    target_type: "service_provider",
    target_id: "clubkonnect",
    after_data: { succeeded, failed, catalogue_keys: results.map((item) => item.key) },
  });

  return json({
    provider: "clubkonnect",
    completed_at: new Date().toISOString(),
    succeeded,
    failed,
    results,
    note: "Raw snapshots are private. They are not yet customer-facing products; normalization and pricing publication are separate steps.",
  }, failed === results.length ? 502 : 200);
});
