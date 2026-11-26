import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

const canonicalTopupmateNetworkName = (value: unknown, fallback = ""): string => {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("mtn") || normalized === "1" || normalized === "01") return "MTN";
  if (normalized.includes("airtel") || normalized === "2" || normalized === "02") return "Airtel";
  if (normalized === "glo" || normalized.includes("globacom") || normalized === "3" || normalized === "03") return "Glo";
  if (normalized.includes("9mobile") || normalized.includes("etisalat") || normalized === "4" || normalized === "04") return "9mobile";
  return raw || fallback;
};

const normaliseDataPlanLabel = (value:unknown):string => {
  let label=String(value??"").replace(/\s+/g," ").trim();
  if(!label)return "Data plan";
  const compact=label.replace(/\s+/g,"");
  const codeSize=compact.match(/^m?(\d+(?:\.\d+)?)(kb|kbs|mb|mbs|gb|gbs|tb|tbs)$/i);
  if(codeSize)return `${codeSize[1]} ${codeSize[2].replace(/s$/i,"").toUpperCase()}`;
  const embedded=label.match(/(\d+(?:\.\d+)?)\s*(KB|KBS|MB|MBS|GB|GBS|TB|TBS)\b/i);
  if(embedded)return `${embedded[1]} ${embedded[2].replace(/s$/i,"").toUpperCase()}`;
  label=label.replace(/\b(sme|awoof|direct|direct\s+data|gifting|gift|corporate|business|promo|promotion|bonus|hot\s*deal|hot)\b/gi,"").replace(/\s*[-|–—]\s*/g," ").replace(/\(\s*\)/g,"").replace(/\s{2,}/g," ").trim();
  return label||"Data plan";
};

const planGroupFromSupplier = (name: unknown, validity: unknown): "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER" => {
  const period=String(validity??"").replace(/\s+/g," ").trim().toLowerCase();
  const source=`${period} ${String(name??"")}`.toLowerCase();
  if(/hot|promo|promotion|bonus|awoof|sme|direct|gifting|gift/.test(period))return "OTHER";
  let days=0;
  const duration=period.match(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years)|^(daily|weekly|monthly|yearly|annual)$/i);
  if(duration){
    const count=Number(duration[1]??1);
    const unit=String(duration[2]??duration[3]).toLowerCase();
    if(unit.startsWith("year")||unit==="annual")days=count*365;
    else if(unit.startsWith("month"))days=count*30;
    else if(unit.startsWith("week"))days=count*7;
    else days=count;
  }else if(/^\d+$/.test(period))days=Number(period);
  else{
    const hour=period.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
    if(hour)days=Math.max(1,Math.ceil(Number(hour[1])/24));
  }
  if(days>=1&&days<=3)return "DAILY";
  if(days>=7&&days<=14)return "WEEKLY";
  if(days>=30&&days<=90)return "MONTHLY";
  if(days===365)return "YEARLY";
  if(/daily|1\s*day|24\s*hour/.test(source))return "DAILY";
  if(/weekly|7\s*day|1\s*week/.test(source))return "WEEKLY";
  if(/monthly|30\s*day|31\s*day|1\s*month/.test(source))return "MONTHLY";
  if(/yearly|annual|365\s*day|1\s*year/.test(source))return "YEARLY";
  return "OTHER";
};

const mapSupplierDataPlans = (catalogue: any[], catalogueOptions: any[]) =>
  catalogue.filter((item: any) => item.category_code === "data").map((item: any) => {
    const networkCode = String(item.network_or_operator ?? "");
    const networkOption = catalogueOptions.find((option: any) =>
      option.category_code === "data" && option.option_type === "network" && option.option_code === networkCode
    );
    return {
      id: item.id,
      network: canonicalTopupmateNetworkName(networkOption?.name, networkCode) || item.category_name,
      networkCode,
      planType: planGroupFromSupplier(item.name, item.description),
      data_amount: normaliseDataPlanLabel(item.name),
      validity: item.description ?? "",
      price: Number(item.selling_price),
      active: true,
    };
  });

async function isAdmin(context: AuthContext): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error) throw new Error("Unable to verify administrator membership");
  return data === true;
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
      const [profiles, wallets, orders, serviceOrders, transactions, catalogue, catalogueOptions, kycResult, accountResult] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallets").select("*").limit(500),
        supabaseAdmin.from("data_orders").select("*").order("created_at", { ascending: false }).limit(500),
        (supabaseAdmin as any).from("service_orders").select("id,user_id,category_id,product_id,request_id,recipient,amount,currency,status,provider_status,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(500),
        (supabaseAdmin as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,plan_type,description,face_value,selling_price,currency,sort_order").order("sort_order"),
        (supabaseAdmin as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
        // Admins may also use a Personal customer dashboard. Load their own KYC
        // and virtual account records exactly as for non-admin customers.
        (supabaseAdmin as any).from("kyc_records").select("id,status,level,review_note,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabaseAdmin as any).from("virtual_accounts").select("id,account_number,bank_name,account_name,currency,status,is_permanent").eq("user_id", userId).eq("provider", "flutterwave").eq("status", "active").eq("is_permanent", true).maybeSingle(),
      ]);
      const results = [profiles, wallets, orders, serviceOrders, transactions, catalogue, catalogueOptions, kycResult, accountResult];
      if (results.some((result) => result.error)) throw new Error("Unable to load the admin dashboard");

      return {
        profile: profiles.data?.find((profile) => profile.id === userId) ?? null,
        wallet: wallets.data?.find((wallet) => wallet.user_id === userId) ?? null,
        plans: mapSupplierDataPlans(catalogue.data ?? [], catalogueOptions.data ?? []),
        catalogue: catalogue.data ?? [],
        catalogueOptions: catalogueOptions.data ?? [],
        orders: orders.data ?? [],
        serviceOrders: serviceOrders.data ?? [],
        transactions: transactions.data ?? [],
        users: profiles.data ?? [],
        isAdmin: false,
        kyc: kycResult.data ?? null,
        virtualAccount: accountResult.data ?? null,
      };
    }

    // KYC and virtual-account records are read server-side with the service role,
    // but always constrained to the authenticated user ID from requireSupabaseAuth.
    // This avoids an RLS visibility gap incorrectly showing an approved KYC as missing.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, wallet, orders, serviceOrders, transactions, catalogue, catalogueOptions, kycResult, accountResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("data_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("service_orders").select("id,user_id,category_id,product_id,request_id,recipient,amount,currency,status,provider_status,created_at,updated_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100),
      supabase.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("public_service_catalog").select("id,category_id,category_code,category_name,name,network_or_operator,plan_type,description,face_value,selling_price,currency,sort_order").order("sort_order"),
      (supabase as any).from("public_service_options").select("id,category_code,option_type,option_code,parent_option_code,name").order("name"),
      (supabaseAdmin as any).from("kyc_records").select("id,status,level,review_note,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      (supabaseAdmin as any).from("virtual_accounts").select("id,account_number,bank_name,account_name,currency,status,is_permanent").eq("user_id",userId).eq("provider","flutterwave").eq("status","active").eq("is_permanent",true).maybeSingle(),
    ]);
    const results = [profile, wallet, orders, serviceOrders, transactions, catalogue, catalogueOptions, kycResult, accountResult];
    if (results.some((result) => result.error)) throw new Error("Unable to load your TolirexData account");

    return {
      profile: profile.data,
      wallet: wallet.data,
      plans: mapSupplierDataPlans(catalogue.data ?? [], catalogueOptions.data ?? []),
      catalogue: catalogue.data ?? [],
      catalogueOptions: catalogueOptions.data ?? [],
      orders: orders.data ?? [],
      serviceOrders: serviceOrders.data ?? [],
      transactions: transactions.data ?? [],
      users: [],
      isAdmin: false,
      kyc: kycResult.data ?? null,
      virtualAccount: accountResult.data ?? null,
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
    couponCode: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
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


/** Submit encrypted identity information through the private KYC Edge Function. */
export const submitCustomerKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    firstName: z.string().min(2).max(80), lastName: z.string().min(2).max(80),
    phone: z.string().min(10).max(16), identityType: z.enum(["bvn","nin"]),
    identityNumber: z.string().regex(/^\d{11}$/), consent: z.literal(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    const { data: result, error } = await authContext.supabase.functions.invoke("submit-kyc", {
      body: { first_name: data.firstName, last_name: data.lastName, phone_number: data.phone,
        bvn: data.identityType === "bvn" ? data.identityNumber : undefined,
        nin: data.identityType === "nin" ? data.identityNumber : undefined, consent: true },
    });
    if (error || result?.error) throw new Error(result?.error ?? "Unable to submit KYC application");
    return result.application;
  });

/** Issue or retrieve the customer's permanent Flutterwave account after KYC approval. */
export const ensureFlutterwaveVirtualAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authContext = context as AuthContext;
    const { data: result, error } = await authContext.supabase.functions.invoke("flutterwave-virtual-accounts", { body: {} });
    if (error || result?.error) throw new Error(result?.error ?? "Unable to retrieve your virtual account");
    return result.account;
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
    couponCode: z.string().max(32).optional(),
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

