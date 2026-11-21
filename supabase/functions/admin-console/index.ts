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
  const workspacePermissions: Record<string, string> = {
    kyc: "kyc.review", agents: "customers.read", businesses: "customers.read",
    wallets: "wallets.read", "virtual-accounts": "finance.read", "virtual-cards": "finance.read",
    fundings: "finance.read", transactions: "orders.read", catalogue: "services.manage",
    providers: "providers.manage", pricing: "pricing.manage", referrals: "growth.manage",
    promotions: "growth.manage", loyalty: "growth.manage", notifications: "notifications.manage",
    support: "support.manage", reports: "finance.read", settings: "settings.manage",
    "admin-team": "staff.manage", audit: "audit.read",
  };
  const workspaceModule = String(body.module ?? "");
  const permission = action === "workspace" ? workspacePermissions[workspaceModule] ?? ""
    : action === "customers" ? "customers.read" : action === "overview" ? "dashboard.read"
    : action === "transactions" ? "orders.read" : action === "catalogue" ? "services.manage"
    : action === "publish_product" ? "services.manage" : action === "publish_option" ? "services.manage"
    : action === "provider_status" ? "providers.manage" : action === "airtime_pricing" ? "pricing.manage"
    : action === "card_pricing" ? "cards.pricing.manage" : action === "electricity_pricing" ? "pricing.manage" : "";
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
      .select("id,category_id,option_type,option_code,parent_option_code,name,metadata,active,publication_status,supplier_last_seen_at,service_categories(code,name)")
      .order("name").limit(500);
    const { data: runs, error: runError } = await admin.from("provider_catalogue_sync_runs")
      .select("id,status,discovered_products,discovered_options,failed_endpoints,summary,started_at,completed_at")
      .order("started_at", { ascending: false }).limit(10);
    if (productError || optionsError || runError || providersError) return json({ error: "Unable to load supplier catalogue workspace" }, 500);
    return json({ products: products ?? [], options: options ?? [], providers: providers ?? [], syncRuns: runs ?? [], canManagePricing: canManagePricing === true, canManageProviders: canManageProviders === true });
  }

  if (action === "electricity_pricing") {
    if (body.save === true) {
      const { data, error } = await caller.rpc("admin_set_service_category_markup", {
        p_category_code: "electricity",
        p_account_type: String(body.accountType),
        p_markup_type: String(body.markupType),
        p_markup_value: Number(body.markupValue),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ pricing: data });
    }
    const { data: category, error: categoryError } = await admin.from("service_categories")
      .select("id").eq("code", "electricity").maybeSingle();
    if (categoryError || !category) return json({ error: "Electricity category is not registered" }, 404);
    const { data, error } = await admin.from("pricing_rules")
      .select("account_type,markup_type,markup_value,active,updated_at")
      .eq("category_id", category.id).is("product_id", null);
    if (error) return json({ error: "Unable to load electricity pricing" }, 500);
    return json({ pricing: data ?? [] });
  }

  if (action === "card_pricing") {
    if (body.save === true) {
      const { data, error } = await caller.rpc("admin_set_topupmate_card_pricing", {
        p_creation_enabled: body.cardCreationEnabled === true,
        p_creation_fee_usd: Number(body.creationFeeUsd),
        p_minimum_initial_funding_usd: Number(body.minimumInitialFundingUsd),
        p_creation_markup_usd: Number(body.creationMarkupUsd),
        p_topup_minimum_usd: Number(body.topupMinimumUsd),
        p_topup_markup_percent: Number(body.topupMarkupPercent),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ pricing: data });
    }
    const { data, error } = await admin.from("topupmate_card_pricing")
      .select("card_creation_enabled,creation_fee_usd,minimum_initial_funding_usd,creation_markup_usd,topup_minimum_usd,topup_markup_percent,updated_at")
      .eq("singleton", true).single();
    if (error) return json({ error: "Unable to load virtual-card pricing settings" }, 500);
    return json({ pricing: data });
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

  if (action === "airtime_pricing") {
    const { data: canManageServices } = await caller.rpc("has_admin_permission", { p_permission: "services.manage" });
    if (canManageServices !== true) return json({ error: "Service management permission is required" }, 403);
    const optionId = String(body.optionId ?? "");
    const discountFactor = Number(body.discountFactor);
    const minimumAmount = Number(body.minimumAmount);
    const maximumAmount = Number(body.maximumAmount);
    if (!optionId || !Number.isFinite(discountFactor) || !Number.isFinite(minimumAmount) || !Number.isFinite(maximumAmount)) {
      return json({ error: "Enter valid Airtime supplier pricing values" }, 400);
    }
    const { data, error } = await caller.rpc("admin_configure_airtime_network_pricing", {
      p_option_id: optionId, p_discount_factor: discountFactor,
      p_minimum_amount: minimumAmount, p_maximum_amount: maximumAmount,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ option: data });
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

  if (action === "workspace") {
    const definitions: Record<string, { table: string; columns: string; order: string; search?: string }> = {
      kyc: { table: "kyc_records", columns: "id,user_id,level,status,reviewer_id,reviewed_at,review_note,created_at,updated_at", order: "created_at", search: "user_id" },
      agents: { table: "agent_accounts", columns: "id,user_id,business_name,status,commission_plan,approved_by,approved_at,created_at,updated_at", order: "created_at", search: "user_id" },
      businesses: { table: "businesses", columns: "id,legal_name,trading_name,registration_number,country_code,status,created_by,created_at,updated_at", order: "created_at", search: "legal_name" },
      wallets: { table: "wallets", columns: "id,user_id,balance,currency,wallet_status,created_at,updated_at", order: "updated_at", search: "user_id" },
      "virtual-accounts": { table: "virtual_accounts", columns: "id,user_id,provider,provider_reference,bank_name,currency,is_permanent,status,created_at,updated_at", order: "created_at", search: "user_id" },
      fundings: { table: "funding_events", columns: "id,user_id,virtual_account_id,provider,provider_event_id,provider_transaction_id,tx_reference,amount,currency,sender_name,sender_bank,sender_account_last4,status,processed_at,created_at", order: "created_at", search: "tx_reference" },
      transactions: { table: "service_orders", columns: "id,user_id,category_id,product_id,provider_id,request_id,provider_order_id,recipient,amount,currency,status,provider_status,created_at,updated_at", order: "created_at", search: "request_id" },
      catalogue: { table: "service_products", columns: "id,category_id,provider_id,provider_product_code,name,network_or_operator,description,face_value,cost_price,selling_price,currency,active,publication_status,supplier_last_seen_at,updated_at", order: "updated_at", search: "name" },
      providers: { table: "service_providers", columns: "id,code,name,status,priority,supports_airtime,supports_data,supports_cable,supports_electricity,supports_epin,created_at,updated_at", order: "priority", search: "name" },
      pricing: { table: "pricing_rules", columns: "id,category_id,product_id,account_type,markup_type,markup_value,fixed_selling_price,active,starts_at,ends_at,created_at,updated_at", order: "updated_at" },
      referrals: { table: "referrals", columns: "id,referrer_user_id,referred_user_id,referral_code_id,status,qualifying_order_id,qualified_at,created_at", order: "created_at" },
      promotions: { table: "coupons", columns: "id,code,description,discount_type,discount_value,max_discount,min_order_amount,total_redemption_limit,per_user_limit,starts_at,ends_at,budget_amount,budget_spent,active,created_at,updated_at", order: "created_at", search: "code" },
      loyalty: { table: "loyalty_transactions", columns: "id,user_id,points,reason,reference_type,reference_id,idempotency_key,created_at", order: "created_at" },
      notifications: { table: "notifications", columns: "id,user_id,title,body,channel,status,delivered_at,created_at", order: "created_at", search: "title" },
      support: { table: "support_tickets", columns: "id,user_id,subject,category,status,priority,assigned_to,created_at,updated_at", order: "created_at", search: "subject" },
      settings: { table: "platform_settings", columns: "setting_key,is_public,updated_by,updated_at", order: "setting_key", search: "setting_key" },
      "admin-team": { table: "platform_admin_memberships", columns: "user_id,admin_role,active,granted_by,created_at,updated_at", order: "created_at" },
      audit: { table: "audit_logs", columns: "id,actor_user_id,action,target_type,target_id,created_at", order: "created_at", search: "action" },
    };
    const definition = definitions[workspaceModule];
    if (!definition) return json({ error: "Unsupported workspace" }, 400);
    const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
    const pageSize = Math.max(10, Math.min(100, Number(body.pageSize) || 25));
    const search = String(body.search ?? "").trim().slice(0, 80);
    let query = admin.from(definition.table).select(definition.columns, { count: "exact" })
      .order(definition.order, { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    if (search && definition.search) {
      const safe = search.replace(/[,%()]/g, " ").trim();
      if (safe) query = query.ilike(definition.search, "%" + safe + "%");
    }
    const { data, count, error } = await query;
    if (error) return json({ error: "Unable to load " + workspaceModule + " workspace" }, 500);
    return json({ rows: data ?? [], total: count ?? 0, page, pageSize, module: workspaceModule });
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
