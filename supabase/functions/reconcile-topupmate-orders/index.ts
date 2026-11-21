import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const str=(v:unknown)=>String(v??"").trim();
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer "))return json({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("TOPUPMATE_API_KEY");
  if(!url||!anon||!service)return json({error:"Function environment is incomplete"},500);
  if(!token)return json({error:"Topupmate API key is not configured"},503);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error:userError}=await caller.auth.getUser();
  if(userError||!user.user)return json({error:"Invalid session"},401);
  const {data:allowed,error:permissionError}=await caller.rpc("has_admin_permission",{p_permission:"orders.manage"});
  if(permissionError||allowed!==true)return json({error:"Order-management permission required"},403);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:orders,error}=await admin.from("service_orders").select("id,request_id,status,created_at,service_providers!inner(code)").eq("service_providers.code","topupmate").in("status",["pending","processing","unknown"]).lt("created_at",new Date(Date.now()-30_000).toISOString()).order("created_at",{ascending:true}).limit(100);
  if(error)return json({error:"Could not load Topupmate orders for reconciliation"},500);
  const results=[];
  for(const order of orders??[]){
    try{
      const target=new URL("https://connect.topupmate.com/api/transaction/status/");
      target.searchParams.set("reference",order.request_id);
      const response=await fetch(target,{headers:{Authorization:"Token "+token,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error("Topupmate status lookup returned HTTP "+response.status);
      const state=str(body?.status??body?.response?.status??body?.data?.status).toLowerCase();
      const message=str(body?.message??body?.detail??body?.response?.message??body?.data?.message??state);
      const providerRef=str(body?.reference??body?.ref??body?.transaction_id??body?.response?.reference??body?.data?.reference)||null;
      if(state==="success"){
        const {error:e}=await admin.rpc("complete_catalogue_service_order",{p_order_id:order.id,p_provider_order_id:providerRef,p_provider_status:state,p_message:message});
        if(e)throw e;results.push({orderId:order.id,status:"successful"});
      }else if(state==="fail"){
        const {error:e}=await admin.rpc("fail_and_refund_catalogue_service_order",{p_order_id:order.id,p_provider_status:state,p_reason:message||"Topupmate confirmed failure"});
        if(e)throw e;results.push({orderId:order.id,status:"refunded"});
      }else{
        const {error:e}=await admin.rpc("mark_service_order_processing",{p_order_id:order.id,p_provider_order_id:providerRef,p_provider_status:state||"processing",p_message:message||"Topupmate has not returned a terminal result"});
        if(e)throw e;results.push({orderId:order.id,status:"processing"});
      }
    }catch(error){
      await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:"QUERY_FAILED",p_message:"Topupmate status lookup failed; manual review required"});
      results.push({orderId:order.id,status:"unknown"});
      console.error("Topupmate reconciliation failed",{orderId:order.id,error:String(error)});
    }
  }
  return json({checked:results.length,results});
});
