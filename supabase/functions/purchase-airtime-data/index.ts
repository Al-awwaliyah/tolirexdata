import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type Body = {
  service: "airtime" | "data";
  productId?: string;
  networkCode: string;
  recipient: string;
  amount?: number;
  idempotencyKey: string;
};
type SupplierPayload = {
  orderid?: string; requestid?: string; status?: string; statuscode?: string;
  orderstatus?: string; orderremark?: string; remark?: string;
};

const ROOT = "https://www.nellobytesystems.com";
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
function statusOf(p: SupplierPayload) {
  return clean(p.orderstatus || p.status).toUpperCase();
}
async function supplierRequest(path: string, params: Record<string,string>, timeout = 15000): Promise<SupplierPayload> {
  const url = new URL(path, ROOT);
  for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error("Supplier HTTP " + response.status);
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid supplier response");
  return payload as SupplierPayload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" },405);
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required" },401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId = Deno.env.get("CLUBKONNECT_USER_ID");
  const apiKey = Deno.env.get("CLUBKONNECT_API_KEY");
  if (!url || !anon || !serviceRole) return json({ error: "Function environment is incomplete" },500);
  if (!userId || !apiKey) return json({ error: "ClubKonnect credentials are not configured" },503);

  const caller = createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await caller.auth.getUser();
  if (authError || !authData.user) return json({error:"Invalid session"},401);

  let body: Body;
  try { body=await request.json() as Body; } catch { return json({error:"Invalid JSON body"},400); }
  if (!body || !["airtime","data"].includes(body.service) ||
      !/^\d{10,14}$/.test(clean(body.recipient)) ||
      !/^[A-Za-z0-9_-]{12,100}$/.test(clean(body.idempotencyKey)) ||
      !/^[A-Za-z0-9_-]{1,30}$/.test(clean(body.networkCode))) {
    return json({error:"Invalid purchase details"},400);
  }
  if (body.service==="data" && !/^[0-9a-f-]{36}$/i.test(clean(body.productId))) return json({error:"Select a valid data plan"},400);
  if (body.service==="airtime" && (!Number.isFinite(body.amount) || !Number.isInteger(body.amount) || (body.amount as number)<50 || (body.amount as number)>200000))
    return json({error:"Airtime amount must be between ₦50 and ₦200,000"},400);

  const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:order,error:reserveError}=await admin.rpc("reserve_catalogue_service_order",{
    p_user_id:authData.user.id,p_service_code:body.service,p_product_id:body.productId ?? null,
    p_network_code:body.networkCode,p_recipient:body.recipient,
    p_airtime_face_value:body.service==="airtime" ? body.amount : null,
    p_idempotency_key:body.idempotencyKey,
  });
  if (reserveError || !order) return json({error:reserveError?.message ?? "Could not reserve purchase"},409);
  if (order.status==="successful" || order.status==="processing" || order.status==="unknown" || order.status==="refunded")
    return json({orderId:order.id,status:order.status,requestId:order.request_id,reused:true});

  const common={UserID:userId,APIKey:apiKey,MobileNetwork:body.networkCode,MobileNumber:body.recipient,RequestID:order.request_id};
  let purchasePath: string;
  const params: Record<string,string>={...common};
  if (body.service==="airtime") {
    purchasePath="/APIAirtimeV1.asp"; params.Amount=String(body.amount);
  } else {
    purchasePath="/APIDatabundleV1.asp";
    const {data:product,error:productError}=await admin.from("service_products")
      .select("provider_product_code,network_or_operator,provider_id")
      .eq("id",body.productId).single();
    if (productError || !product || product.network_or_operator!==body.networkCode)
      return json({error:"Selected data plan is no longer available"},409);
    params.DataPlan=String(product.provider_product_code).split(":").pop()!;
  }

  try {
    const response=await supplierRequest(purchasePath,params);
    const state=statusOf(response);
    const orderId=clean(response.orderid);
    const message=clean(response.orderremark || response.remark || response.status);
    if (state==="ORDER_COMPLETED" || response.statuscode==="200") {
      const {error}=await admin.rpc("complete_catalogue_service_order",{
        p_order_id:order.id,p_provider_order_id:orderId || null,p_provider_status:state || "ORDER_COMPLETED",p_message:message,
      });
      if (error) throw new Error("Supplier completed but local settlement needs reconciliation");
      return json({orderId:order.id,status:"successful",requestId:order.request_id});
    }
    if (state==="ORDER_RECEIVED" || state==="ORDER_ONHOLD" || state==="ORDER_PROCESSING") {
      await admin.rpc("mark_service_order_processing",{p_order_id:order.id,p_provider_order_id:orderId || null,p_provider_status:state,p_message:message});
      return json({orderId:order.id,status:"processing",requestId:order.request_id});
    }
    if (state && state!=="ORDER_RECEIVED") {
      // A supplier-declared failure is only refundable when it is a known terminal rejection.
      const terminal = ["INVALID_RECIPIENT","INVALID_AMOUNT","MINIMUM_50","MINIMUM_200000","INVALID_DATAPLAN","MISSING_DATAPLAN","MISSING_MOBILENETWORK","MISSING_AMOUNT"];
      if (terminal.includes(state)) {
        const {error}=await admin.rpc("fail_and_refund_catalogue_service_order",{p_order_id:order.id,p_provider_status:state,p_reason:message || state});
        if (error) throw error;
        return json({orderId:order.id,status:"refunded",requestId:order.request_id});
      }
    }
    await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:state || "UNRECOGNIZED",p_message:message});
    return json({orderId:order.id,status:"unknown",requestId:order.request_id},202);
  } catch (error) {
    // A timeout or transport error may mean the supplier accepted the order.
    // Query the original RequestID; never submit a second purchase with a new ID.
    try {
      const query=await supplierRequest("/APIQueryV1.asp",{UserID:userId,APIKey:apiKey,RequestID:order.request_id});
      const state=statusOf(query);
      const message=clean(query.orderremark || query.remark || query.status);
      if (state==="ORDER_COMPLETED" || query.statuscode==="200") {
        const {error:settleError}=await admin.rpc("complete_catalogue_service_order",{
          p_order_id:order.id,p_provider_order_id:clean(query.orderid) || null,p_provider_status:state || "ORDER_COMPLETED",p_message:message,
        });
        if (!settleError) return json({orderId:order.id,status:"successful",requestId:order.request_id,reconciled:true});
      } else if (state==="ORDER_RECEIVED" || state==="ORDER_ONHOLD" || state==="ORDER_PROCESSING") {
        await admin.rpc("mark_service_order_processing",{p_order_id:order.id,p_provider_order_id:clean(query.orderid) || null,p_provider_status:state,p_message:message});
        return json({orderId:order.id,status:"processing",requestId:order.request_id,reconciled:true});
      }
    } catch { /* retain unknown state; operator reconciliation is required */ }
    await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:"QUERY_REQUIRED",p_message:error instanceof Error?error.message:"Supplier request outcome is unknown"});
    return json({orderId:order.id,status:"unknown",requestId:order.request_id,message:"We are checking this purchase. Do not submit it again."},202);
  }
});
