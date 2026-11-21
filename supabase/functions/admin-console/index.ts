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
  const permission = action === "customers" ? "customers.read" : action === "overview" ? "dashboard.read" : action === "transactions" ? "transactions.read" : action === "catalogue" ? "services.manage" : action === "publish_product" ? "services.manage" : action === "publish_option" ? "services.manage" : action === "provider_status" ? "providers.manage" : "";
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
        count("service_products", q => q.eq("active", true).eq("publication_status", "published")),
        count("service_orders", q => q.eq("status", "failed")),
      ]);
      return json({ metrics: { pendingKyc, unsettledFunding, unresolvedOrders, activeProviders, activeProducts, failedOrders }, generatedAt: new Date().toISOString() });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unable to load overview metrics" }, 500);
    }
  }

  if (action === "transactions") {
    const status = String(body.status ?? "").trim();
    const search = String(body.search ?? "").trim().slice(0, 80);
    const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(body.pageSize) || 25));
    let query = admin.from("service_orders")
      .select("id,user_id,category_id,product_id,request_id,provider_order_id,recipient,amount,currency,status,provider_status,created_at,updated_at,service_categories(code,name),service_providers(code,name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (status && ["pending","processing","successful","failed","refunded","reversal_pending","unknown"].includes(status)) query = query.eq("status", status);
    if (search) { const safe = search.replace(/[,%()]/g, " "); if (safe) query = query.or("request_id.ilike.%" + safe + "%,recipient.ilike.%" + safe + "%"); }
    const { data, count, error } = await query;
    if (error) return json({ error: "Unable to load service orders" }, 500);
    return json({ orders: data ?? [], total: count ?? 0, page, pageSize });
  }

  if (action === "catalogue") {
    const { data: canManagePricing } = await caller.rpc("has_admin_permission", { p_permission: "pricing.manage" });
    const { data: canManageProviders } = await caller.rpc("has_admin_permission", { p_permission: "providers.manage" });
    const productFields = canManagePricing === true
      ? "id,name,provider_product_code,network_or_operator,description,face_value,cost_price,selling_price,currency,active,publication_status,supplier_last_seen_at,updated_at,service_categories(code,name),service_providers(code,name)"
      : "id,name,provider_product_code,network_or_operator,description,face_value,selling_price,currency,active,publication_status,supplier_last_seen_at,updated_at,service_categories(code,name),service_providers(code,name)";
    const { data: products, error: productError } = await admin.from("service_products")
      .select(productFields).order("updated_at", { ascending: false }).limit(500);
    const { data: providers, error: providersError } = await admin.from("service_providers")
      .select("id,code,name,status,priority,supports_airtime,supports_data,supports_cable,supports_electricity,supports_epin")
      .order("priority");
    const { data: options, error: optionsError } = await admin.from("provider_service_options")
      .select("id,category_id,option_type,option_code,parent_option_code,name,active,publication_status,supplier_last_seen_at,service_categories(code,name)")
      .order("name").limit(500);
    const { data: runs, error: runError } = await admin.from("provider_catalogue_sync_runs")
      .select("id,status,discovered_products,discovered_options,failed_endpoints,summary,started_at,completed_at")
      .order("started_at", { ascending: false }).limit(10);
    if (productError || optionsError || runError || providersError) return json({ error: "Unable to load supplier catalogue workspace" }, 500);
    return json({ products: products ?? [], options: options ?? [], providers: providers ?? [], syncRuns: runs ?? [], canManagePricing: canManagePricing === true, canManageProviders: canManageProviders === true });
  }

  if (action === "provider_status") {
    const providerId = String(body.providerId ?? "");
    const status = String(body.status ?? "");
    const priority = Math.max(1, Math.min(10000, Number(body.priority) || 100));
    if (!providerId || !["active","degraded","disabled"].includes(status)) return json({ error: "Invalid provider control request" }, 400);
    const { data, error } = await caller.rpc("admin_set_service_provider_status", {
      p_provider_id: providerId, p_status: status, p_priority: priority,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ provider: data });
  }

  if (action === "publish_option") {
    const optionId = String(body.optionId ?? "");
    const status = String(body.publicationStatus ?? "");
    if (!optionId || !["published","paused","rejected"].includes(status)) return json({ error: "Invalid option publication request" }, 400);
    const { data, error } = await caller.rpc("admin_set_service_option_publication", {
      p_option_id: optionId, p_publication_status: status,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ option: data });
  }

  if (action === "publish_product") {
    const productId = String(body.productId ?? "");
    const status = String(body.publicationStatus ?? "");
    const personalPrice = Number(body.personalPrice);
    const agentPrice = Number(body.agentPrice);
    const businessPrice = Number(body.businessPrice);
    if (!productId || !["published","paused","rejected"].includes(status)) {
      return json({ error: "Invalid product publication request" }, 400);
    }
    const { data, error } = await caller.rpc("admin_set_service_product_publication", {
      p_product_id: productId,
      p_publication_status: status,
      p_personal_price: status === "published" ? personalPrice : null,
      p_agent_price: status === "published" ? agentPrice : null,
      p_business_price: status === "published" ? businessPrice : null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ product: data });
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
