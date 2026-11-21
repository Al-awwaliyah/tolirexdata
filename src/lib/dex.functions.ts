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
      const [profiles, wallets, orders, serviceOrders, fundings, transactions, catalogue, catalogueOptions] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallets").select("*").limit(500),
        supabaseAdmin.from("data_orders").select("*").order("created_at", { ascending: false }).limit(500),
        (supabaseAdmin as any).from("service_orders").select("id,user_id,category_id,product_id,request_id,recipient,amount,currency,status,provider_status,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("fundings").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(500),
        (supabaseAdmin as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,description,face_value,selling_price,currency,sort_order").order("sort_order"),
        (supabaseAdmin as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
      ]);
      const results = [profiles, wallets, orders, serviceOrders, fundings, transactions, catalogue, catalogueOptions];
      if (results.some((result) => result.error)) throw new Error("Unable to load the admin dashboard");

      return {
        profile: profiles.data?.find((profile) => profile.id === userId) ?? null,
        wallet: wallets.data?.find((wallet) => wallet.user_id === userId) ?? null,
        plans: (catalogue.data ?? []).filter((item: any) => item.category_code === "data").map((item: any) => ({ id: item.id, network: item.network_or_operator ?? item.category_name, data_amount: item.name, validity: item.description ?? "", price: Number(item.selling_price), active: true })),
        catalogue: catalogue.data ?? [],
        catalogueOptions: catalogueOptions.data ?? [],
        orders: orders.data ?? [],
        serviceOrders: serviceOrders.data ?? [],
        fundings: fundings.data ?? [],
        transactions: transactions.data ?? [],
        users: profiles.data ?? [],
        isAdmin: true,
      };
    }

    const [profile, wallet, orders, serviceOrders, fundings, transactions, catalogue, catalogueOptions] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("data_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("service_orders").select("id,user_id,category_id,product_id,request_id,recipient,amount,currency,status,provider_status,created_at,updated_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100),
      supabase.from("fundings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,description,face_value,selling_price,currency,sort_order").order("sort_order"),
      (supabase as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
    ]);
    const results = [profile, wallet, orders, serviceOrders, fundings, transactions, catalogue, catalogueOptions];
    if (results.some((result) => result.error)) throw new Error("Unable to load your TolirexData account");

    return {
      profile: profile.data,
      wallet: wallet.data,
      plans: (catalogue.data ?? []).filter((item: any) => item.category_code === "data").map((item: any) => ({ id: item.id, network: item.network_or_operator ?? item.category_name, data_amount: item.name, validity: item.description ?? "", price: Number(item.selling_price), active: true })),
      catalogue: catalogue.data ?? [],
      catalogueOptions: catalogueOptions.data ?? [],
      orders: orders.data ?? [],
      serviceOrders: serviceOrders.data ?? [],
      fundings: fundings.data ?? [],
      transactions: transactions.data ?? [],
      users: [],
      isAdmin: false,
    };
  });

export const purchaseAirtimeOrData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    service: z.enum(["airtime", "data"]),
    networkCode: z.string().min(1).max(30),
    recipient: z.string().regex(/^\d{10,14}$/),
    productId: z.string().uuid().optional(),
    amount: z.number().int().min(50).max(200000).optional(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{12,100}$/),
  }).superRefine((value, ctx) => {
    if (value.service === "data" && !value.productId) {
      ctx.addIssue({ code: "custom", path: ["productId"], message: "Choose a data plan." });
    }
    if (value.service === "airtime" && value.amount === undefined) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an airtime amount." });
    }
  }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { data: result, error } = await authContext.supabase.functions.invoke("purchase-airtime-data", {
      body: data,
    });
    if (error) throw new Error("Unable to submit purchase. Check your transaction history before trying again.");
    if (!result) throw new Error("The purchase service returned no result.");
    return result;
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

/** Authenticated Topupmate virtual-card actions. Provider credentials remain in Supabase Edge Functions. */
export const manageTopupmateVirtualCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    action: z.enum(["list","quote","save_profile","create","topup","withdraw","details","transactions","freeze","unfreeze","terminate"]),
    kind: z.string().optional(), amountUsd: z.number().positive().optional(),
    cardId: z.string().uuid().optional(), idempotencyKey: z.string().min(12).max(100).optional(),
    firstName: z.string().optional(), lastName: z.string().optional(), phone: z.string().optional(),
    email: z.string().optional(), dateOfBirth: z.string().optional(), address: z.string().optional(),
    state: z.string().optional(), city: z.string().optional(), brand: z.string().optional(),
    startDate: z.string().optional(), endDate: z.string().optional(), page: z.number().int().positive().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { data: result, error } = await authContext.supabase.functions.invoke("topupmate-virtual-cards", { body: data });
    if (error) throw new Error("Unable to contact the virtual-card service. Check your card activity before trying again.");
    if (!result) throw new Error("The virtual-card service returned no result.");
    if (result.error && !result.success) throw new Error(String(result.error));
    return result;
  });


/** Authenticated Topupmate operations for catalogue-driven bill and PIN services. */
export const manageTopupmateExpandedService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    action: z.enum(["verify","purchase","status","giftcard_redeem"]),
    service: z.string().optional(),
    categoryCode: z.string().optional(),
    productId: z.string().uuid().optional(),
    optionType: z.string().optional(),
    optionCode: z.string().optional(),
    recipient: z.string().optional(),
    iuc: z.string().optional(),
    meterNumber: z.string().optional(),
    meterType: z.enum(["prepaid","postpaid"]).optional(),
    amount: z.number().positive().optional(),
    quantity: z.number().int().positive().max(100).optional(),
    contactPhone: z.string().optional(),
    subtype: z.string().optional(),
    accountType: z.enum(["PhoneNumber","AccountNumber"]).optional(),
    idempotencyKey: z.string().min(12).max(100).optional(),
    reference: z.string().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { data: result, error } = await authContext.supabase.functions.invoke("topupmate-expanded-services", { body: data });
    if (error) throw new Error("Unable to contact Topupmate services. Check your transaction history before trying again.");
    if (!result) throw new Error("The Topupmate service returned no result.");
    if (result.error && !result.success) throw new Error(String(result.error));
    return result;
  });

