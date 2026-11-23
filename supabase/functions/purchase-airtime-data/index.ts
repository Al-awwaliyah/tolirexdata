import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type Body={service:"airtime"|"data";productId?:string;networkCode:string;recipient:string;amount?:number;idempotencyKey:string;couponCode?:string};
type Obj=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const stateOf=(body:Obj)=>clean(body?.status??body?.response?.status??body?.data?.status).toLowerCase();
const messageOf=(body:Obj)=>clean(body?.message??body?.detail??body?.response?.message??body?.data?.message??body?.status);
const referenceOf=(body:Obj)=>clean(body?.reference??body?.ref??body?.transaction_id??body?.response?.reference??body?.data?.reference);
async function topupmate(path:string,method:"GET"|"POST",token:string,payload?:Obj):Promise<Obj>{
  const root=(Deno.env.get("TOPUPMATE_BASE_URL")||"https://connect.topupmate.com/api").replace(/\/$/,"");
  const url=new URL(root+path);
  if(method==="GET"&&payload) for(const [k,v] of Object.entries(payload)) if(v!==undefined&&v!==null) url.searchParams.set(k,String(v));
  const response=await fetch(url,{method,headers:{"Authorization":"Token "+token,"Accept":"application/json","Content-Type":"application/json"},...(method==="POST"?{body:JSON.stringify(payload??{})}:{}),signal:AbortSignal.timeout(25000)});
  const body=await response.json().catch(()=>({}));
  if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid Topupmate response");
  if(!response.ok)throw new Error("Topupmate HTTP "+response.status);
  return body as Obj;
}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=request.headers.get("Authorization");
  if(!auth?.startsWith("Bearer "))return json({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("TOPUPMATE_API_KEY");
  if(!url||!anon||!serviceRole)return json({error:"Function environment is incomplete"},500);
  if(!token)return json({error:"Topupmate API key is not configured"},503);
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await caller.auth.getUser();
  if(authError||!authData.user)return json({error:"Invalid session"},401);
  let body:Body;try{body=await request.json() as Body}catch{return json({error:"Invalid JSON body"},400)}
  if(!body||!["airtime","data"].includes(body.service)||!/^[0-9]{10,14}$/.test(clean(body.recipient))||!/^[A-Za-z0-9_-]{12,100}$/.test(clean(body.idempotencyKey))||!/^[A-Za-z0-9_-]{1,30}$/.test(clean(body.networkCode))||(body.couponCode!==undefined&&!/^[A-Za-z0-9_-]{1,32}$/.test(clean(body.couponCode))))return json({error:"Invalid purchase details"},400);
  if(body.service==="data"&&!/^[0-9a-f-]{36}$/i.test(clean(body.productId)))return json({error:"Select a valid data plan"},400);
  if(body.service==="airtime"&&(!Number.isFinite(body.amount)||!Number.isInteger(body.amount)||(body.amount as number)<50||(body.amount as number)>200000))return json({error:"Airtime amount must be between ₦50 and ₦200,000"},400);
  const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:order,error:reserveError}=await admin.rpc("reserve_catalogue_service_order",{p_user_id:authData.user.id,p_service_code:body.service,p_product_id:body.productId??null,p_network_code:body.networkCode,p_recipient:body.recipient,p_airtime_face_value:body.service==="airtime"?body.amount:null,p_idempotency_key:body.idempotencyKey,p_coupon_code:clean(body.couponCode).toUpperCase()||null});
  if(reserveError||!order)return json({error:reserveError?.message??"Could not reserve purchase"},409);
  if(["successful","processing","unknown","refunded","failed","reversal_pending"].includes(order.status))return json({orderId:order.id,status:order.status,requestId:order.request_id,reused:true});
  const ref=order.request_id;
  const markProcessing=async(result:Obj)=>admin.rpc("mark_service_order_processing",{p_order_id:order.id,p_provider_order_id:referenceOf(result)||null,p_provider_status:stateOf(result)||"processing",p_message:messageOf(result)||"Topupmate is processing the order"});
  const settleSuccess=async(result:Obj)=>{
    const {error}=await admin.rpc("complete_catalogue_service_order",{p_order_id:order.id,p_provider_order_id:referenceOf(result)||null,p_provider_status:stateOf(result)||"success",p_message:messageOf(result)||"Topupmate confirmed success"});
    if(error)throw new Error("Provider succeeded but local settlement requires reconciliation");
  };
  const settleFailure=async(result:Obj)=>{
    const {error}=await admin.rpc("fail_and_refund_catalogue_service_order",{p_order_id:order.id,p_provider_status:stateOf(result)||"fail",p_reason:messageOf(result)||"Topupmate confirmed failure"});
    if(error)throw new Error("Provider failure confirmed but wallet refund requires reconciliation");
  };
  const reconcile=async()=>{
    const result=await topupmate("/transaction/status/","GET",token,{reference:ref});
    const state=stateOf(result);
    if(state==="success"){await settleSuccess(result);return "successful";}
    if(state==="fail"){await settleFailure(result);return "refunded";}
    await markProcessing(result);
    return "processing";
  };
  try{
    let payload:Obj;
    if(body.service==="airtime")payload={network:body.networkCode,phone:body.recipient,amount:body.amount,airtime_type:"VTU",ref};
    else{
      const {data:product,error}=await admin.from("service_products").select("provider_product_code,network_or_operator,provider_id,service_providers!inner(code)").eq("id",body.productId).single();
      if(error||!product||product.network_or_operator!==body.networkCode||(product as any).service_providers?.code!=="topupmate")return json({error:"Selected Topupmate data plan is no longer available"},409);
      const plan=clean(product.provider_product_code).split(":").pop();
      if(!plan)return json({error:"Selected data plan has no valid supplier plan ID"},409);
      payload={network:body.networkCode,phone:body.recipient,plan,ref};
    }
    const started=await admin.rpc("mark_service_order_processing",{p_order_id:order.id,p_provider_order_id:null,p_provider_status:"submission_started",p_message:"Submitting to Topupmate"});
    if(started.error)return json({orderId:order.id,status:"unknown",requestId:ref,message:"Your purchase is reserved and needs reconciliation."},202);
    const result=await topupmate(body.service==="airtime"?"/airtime/":"/data/","POST",token,payload);
    const state=stateOf(result);
    if(state==="success"){await settleSuccess(result);const discount=Number(order.service_metadata?.coupon_discount)||0;return json({orderId:order.id,status:"successful",requestId:ref,couponCode:order.service_metadata?.coupon_code||null,discountAmount:discount,chargedAmount:Number(order.amount),originalAmount:Number(order.service_metadata?.original_amount)||Number(order.amount)});}
    if(state==="fail"){await settleFailure(result);return json({orderId:order.id,status:"refunded",requestId:ref});}
    await markProcessing(result);
    return json({orderId:order.id,status:"processing",requestId:ref,message:"Topupmate is processing your purchase. Do not submit it again."},202);
  }catch(error){
    // A timeout may mean the supplier accepted the request. Query the exact original reference;
    // never submit a second purchase or create a replacement reference.
    try{
      const status=await reconcile();
      return json({orderId:order.id,status,requestId:ref,reconciled:true,message:status==="refunded"?"The supplier confirmed failure and your wallet refund was recorded.":"We are checking your purchase. Do not submit it again."},status==="processing"?202:200);
    }catch(queryError){
      await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:"QUERY_REQUIRED",p_message:"Topupmate request outcome is uncertain; status lookup required"});
      console.error("Topupmate purchase/reconciliation failure",{orderId:order.id,error:String(error),queryError:String(queryError)});
      return json({orderId:order.id,status:"unknown",requestId:ref,message:"We are checking this purchase. Do not submit it again."},202);
    }
  }
});
