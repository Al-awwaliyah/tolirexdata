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
      const [profiles, wallets, plans, orders, fundings, transactions] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallets").select("*").limit(500),
        supabaseAdmin.from("data_plans").select("*").order("network").order("price"),
        supabaseAdmin.from("data_orders").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("fundings").select("*").order("created_at", { ascending: false }).limit(500),
        supabaseAdmin.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      const results = [profiles, wallets, plans, orders, fundings, transactions];
      if (results.some((result) => result.error)) throw new Error("Unable to load the admin dashboard");

      return {
        profile: profiles.data?.find((profile) => profile.id === userId) ?? null,
        wallet: wallets.data?.find((wallet) => wallet.user_id === userId) ?? null,
        plans: plans.data ?? [],
        orders: orders.data ?? [],
        fundings: fundings.data ?? [],
        transactions: transactions.data ?? [],
        users: profiles.data ?? [],
        isAdmin: true,
      };
    }

    const [profile, wallet, plans, orders, fundings, transactions] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("data_plans").select("*").eq("active", true).order("network").order("price"),
      supabase.from("data_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("fundings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    ]);
    const results = [profile, wallet, plans, orders, fundings, transactions];
    if (results.some((result) => result.error)) throw new Error("Unable to load your DEX Sub account");

    return {
      profile: profile.data,
      wallet: wallet.data,
      plans: plans.data ?? [],
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

export const saveDataPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid().optional(),
    network: z.enum(["MTN", "Airtel", "Glo", "9mobile"]),
    dataAmount: z.string().trim().min(1).max(30),
    validity: z.string().trim().min(1).max(50),
    price: z.number().positive().max(10_000_000),
    active: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as AuthContext;
    await requireAdmin(authContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const values = {
      network: data.network,
      data_amount: data.dataAmount,
      validity: data.validity,
      price: data.price,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("data_plans").update(values).eq("id", data.id).select().single()
      : await supabaseAdmin.from("data_plans").insert(values).select().single();
    if (result.error || !result.data) throw new Error(result.error?.message ?? "Unable to save this plan");
    return result.data;
  });