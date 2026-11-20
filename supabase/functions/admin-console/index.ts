import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Admin console environment is incomplete" }, 500);

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Invalid or expired session" }, 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action = String(body.action ?? "");
  const permission = action === "customers" ? "customers.read" : action === "overview" ? "dashboard.read" : "";
  if (!permission) return json({ error: "Unsupported admin console action" }, 400);

  const { data: permitted, error: permissionError } = await caller.rpc("has_admin_permission", { p_permission: permission });
  if (permissionError || permitted !== true) return json({ error: "You do not have permission for this workspace" }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "overview") {
    const count = async (table: string, configure?: (query: any) => any) => {
      let query = admin.from(table).select("*", { count: "exact", head: true });
      if (configure) query = configure(query);
      const result = await query;
      if (result.error) throw new Error(`Unable to load ${table} count: ${result.error.message}`);
      return result.count ?? 0;
    };
    try {
      const [pendingKyc, unsettledFunding, unresolvedOrders, activeProviders, activeProducts, failedOrders] = await Promise.all([
        count("kyc_records", q => q.eq("status", "pending")),
        count("funding_events", q => q.in("status", ["received", "verified"])),
        count("service_orders", q => q.in("status", ["pending", "processing", "unknown", "reversal_pending"])),
        count("service_providers", q => q.eq("status", "active")),
        count("service_products", q => q.eq("active", true)),
        count("service_orders", q => q.eq("status", "failed")),
      ]);
      return json({ metrics: { pendingKyc, unsettledFunding, unresolvedOrders, activeProviders, activeProducts, failedOrders }, generatedAt: new Date().toISOString() });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unable to load overview metrics" }, 500);
    }
  }

  const search = String(body.search ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
  const pageSize = Math.max(10, Math.min(50, Number(body.pageSize) || 20));
  let query = admin.from("profiles")
    .select("id,email,full_name,phone,created_at,account_type,kyc_level,account_status", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (search) {
    const safe = search.replace(/[,%()]/g, " ").trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data, count, error } = await query;
  if (error) return json({ error: "Unable to load customer directory" }, 500);
  return json({ customers: data ?? [], total: count ?? 0, page, pageSize });
});
