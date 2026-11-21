import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function isAdmin(context: AuthContext): Promise<boolean> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw new Error("Unable to verify account permissions");
  return data?.role === "admin";
}

async function requireAdmin(context: AuthContext): Promise<void> {
  if (!(await isAdmin(context))) throw new Error("Administrator access required");
}

export const getDexDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authContext = context as AuthContext;
    const adminAccess = await isAdmin(authContext);
    const { supabase, userId } = authContext;

    if (adminAccess) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [profiles, wallets, orders, fundings, transactions, catalogue, catalogueOptions] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallets").select("*").limit(500),
        supabaseAdmin.from("data_orders").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("fundings").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(500),
        (supabaseAdmin as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,description,face_value,selling_price,currency,sort_order").order("sort_order"),
        (supabaseAdmin as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
      ]);
      const results = [profiles, wallets, orders, fundings, transactions, catalogue, catalogueOptions];
      if (results.some((result) => result.error)) throw new Error("Unable to load the admin dashboard");

      return {
        profile: profiles.data?.find((profile) => profile.id === userId) ?? null,
        wallet: wallets.data?.find((wallet) => wallet.user_id === userId) ?? null,
        plans: (catalogue.data ?? []).filter((item: any) => item.category_code === "data").map((item: any) => ({ id: item.id, network: item.network_or_operator ?? item.category_name, data_amount: item.name, validity: item.description ?? "", price: Number(item.selling_price), active: true })),
        catalogue: catalogue.data ?? [],
        catalogueOptions: catalogueOptions.data ?? [],
        orders: orders.data ?? [],
        fundings: fundings.data ?? [],
        transactions: transactions.data ?? [],
        users: profiles.data ?? [],
        isAdmin: true,
      };
    }

    const [profile, wallet, orders, fundings, transactions, catalogue, catalogueOptions] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("data_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("fundings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,description,face_value,selling_price,currency,sort_order").order("sort_order"),
      (supabase as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
    ]);
    const results = [profile, wallet, orders, fundings, transactions, catalogue, catalogueOptions];
    if (results.some((result) => result.error)) throw new Error("Unable to load your TolirexData account");

    return {
      profile: profile.data,
      wallet: wallet.data,
      plans: (catalogue.data ?? []).filter((item: any) => item.category_code === "data").map((item: any) => ({ id: item.id, network: item.network_or_operator ?? item.category_name, data_amount: item.name, validity: item.description ?? "", price: Number(item.selling_price), active: true })),
      catalogue: catalogue.data ?? [],
      catalogueOptions: catalogueOptions.data ?? [],
      orders: orders.data ?? [],
      fundings: fundings.data ?? [],
      transactions: transactions.data ?? [],
      users: [],
      isAdmin: false,
    };
  });

export const createDataOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid(), phone: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.rpc("create_data_order", {
      p_user_id: authContext.userId,
      p_plan_id: data.planId,
      p_phone: data.phone,
    });
    if (error || !order) throw new Error(error?.message ?? "Unable to place this order");
    return order;
  });

export const completeDataOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.rpc("complete_data_order", {
      p_user_id: authContext.userId,
      p_order_id: data.orderId,
    });
    if (error || !order) throw new Error(error?.message ?? "Unable to complete this order");
    return order;
  });

export const createFundingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().positive().max(10_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: funding, error } = await supabaseAdmin.rpc("create_funding_request", {
      p_user_id: authContext.userId,
      p_amount: data.amount,
      p_method: "bank_transfer",
    });
    if (error || !funding) throw new Error(error?.message ?? "Unable to save this funding request");
    return funding;
  });

export const reviewFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fundingId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    await requireAdmin(authContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: funding, error } = await supabaseAdmin.rpc("review_funding", {
      p_admin_id: authContext.userId,
      p_funding_id: data.fundingId,
      p_decision: data.decision,
    });
    if (error || !funding) throw new Error(error?.message ?? "Unable to review this request");
    return funding;
  });

/**
 * Loads the live ClubKonnect product catalog from the server.
 * Credentials are read only in the server module and never reach the browser.
 */
export const getClubKonnectCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getClubKonnectCatalog: loadCatalog } = await import("@/lib/clubkonnect.server");
    return loadCatalog();
  });


/**
 * Creates a pending card-funding request and a Flutterwave hosted checkout link.
 * A verified webhook must settle the funding through an atomic database routine
 * before the wallet is credited; the browser redirect is never proof of payment.
 */
export const createFlutterwaveFundingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().int().min(100).max(10_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secretKey) throw new Error("Flutterwave is not configured yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: funding, error } = await supabaseAdmin.rpc("create_funding_request", {
      p_user_id: authContext.userId,
      p_amount: data.amount,
      p_method: "card",
    });
    if (error || !funding) throw new Error(error?.message ?? "Unable to start wallet funding.");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles").select("email, full_name, phone").eq("id", authContext.userId).single();
    if (profileError || !profile?.email) throw new Error("A valid account email is required for checkout.");

    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL is not configured.");
    const txRef = funding.id;
    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(data.amount),
        currency: "NGN",
        redirect_url: `${appUrl.replace(/\/$/, "")}/?funding=flutterwave`,
        customer: { email: profile.email, name: profile.full_name, phonenumber: profile.phone },
        customizations: { title: "ToliRex wallet funding", description: "Add money to your ToliRex wallet" },
        meta: { funding_id: funding.id, user_id: authContext.userId },
      }),
      cache: "no-store",
    });
    const payload = await response.json() as { status?: string; message?: string; data?: { link?: string } };
    if (!response.ok || payload.status !== "success" || !payload.data?.link) {
      throw new Error(payload.message ?? "Flutterwave could not create a checkout link.");
    }
    return { fundingId: funding.id, checkoutUrl: payload.data.link };
  });

/**
 * Loads administration metrics on the server. The browser role is checked
 * before the service-role client is ever used; admin tables remain private
 * behind RLS and are never queried directly from the browser.
 */
export const getTolirexAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authContext = context as AuthContext;
    const { data: allowed, error: permissionError } = await (authContext.supabase as any)
      .rpc("has_admin_permission", { p_permission: "dashboard.read" });

    if (permissionError || allowed !== true) {
      throw new Error("Administrator dashboard permission required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const count = async (table: string, configure?: (query: any) => any) => {
      let query = db.from(table).select("id", { count: "exact", head: true });
      if (configure) query = configure(query);
      const result = await query;
      if (result.error) throw new Error(`Unable to load ${table} metrics: ${result.error.message}`);
      return result.count ?? 0;
    };

    const [
      customers, agents, businesses, kycPending, unsettledFunding,
      unresolvedOrders, activeProviders, activeProducts, failedOrders,
    ] = await Promise.all([
      count("profiles"),
      count("agent_accounts"),
      count("businesses"),
      count("kyc_records", (q) => q.eq("status", "pending")),
      count("funding_events", (q) => q.in("status", ["received", "verified"])),
      count("service_orders", (q) => q.in("status", ["pending", "processing", "unknown", "reversal_pending"])),
      count("service_providers", (q) => q.eq("status", "active")),
      count("service_products", (q) => q.eq("active", true)),
      count("service_orders", (q) => q.eq("status", "failed")),
    ]);

    return {
      totals: { customers, agents, businesses },
      signals: {
        pendingKyc: kycPending,
        unsettledFunding,
        unresolvedOrders,
        activeProviders,
        activeProducts,
        failedOrders,
      },
      generatedAt: new Date().toISOString(),
    };
  });
