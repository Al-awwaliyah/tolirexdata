import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const ROOT="https://www.nellobytesystems.com";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer ")) return json({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId=Deno.env.get("CLUBKONNECT_USER_ID"),apiKey=Deno.env.get("CLUBKONNECT_API_KEY");
  if(!url||!anon||!service) return json({error:"Function environment is incomplete"},500);
  if(!userId||!apiKey) return json({error:"ClubKonnect credentials are not configured"},503);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error:userError}=await caller.auth.getUser();
  if(userError||!user.user) return json({error:"Invalid session"},401);
  const {data:allowed,error:permissionError}=await caller.rpc("has_admin_permission",{p_permission:"orders.manage"});
  if(permissionError||allowed!==true) return json({error:"Order-management permission required"},403);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:orders,error}=await admin.from("service_orders")
    .select("id,request_id,status,created_at")
    .in("status",["pending","processing","unknown"])
    .lt("created_at",new Date(Date.now()-30_000).toISOString())
    .order("created_at",{ascending:true}).limit(100);
  if(error) return json({error:"Could not load orders for reconciliation"},500);
  const results=[];
  for(const order of orders??[]){
    try{
      const queryUrl=new URL("/APIQueryV1.asp",ROOT);
      queryUrl.searchParams.set("UserID",userId);
      queryUrl.searchParams.set("APIKey",apiKey);
      queryUrl.searchParams.set("RequestID",order.request_id);
      const response=await fetch(queryUrl,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12_000)});
      if(!response.ok) throw new Error("Supplier HTTP "+response.status);
      const payload=await response.json();
      if(!payload||typeof payload!=="object"||Array.isArray(payload)) throw new Error("Invalid supplier query response");
      const p=payload as Record<string,unknown>;
      const status=str(p.orderstatus||p.status).toUpperCase();
      const message=str(p.orderremark||p.remark||p.status);
      if(status==="ORDER_COMPLETED"){
        const {error:settleError}=await admin.rpc("complete_catalogue_service_order",{
          p_order_id:order.id,p_provider_order_id:str(p.orderid)||null,p_provider_status:status,p_message:message,
        });
        if(settleError) throw settleError;
        results.push({orderId:order.id,status:"successful"});
      }else if(["ORDER_RECEIVED","ORDER_ONHOLD","ORDER_PROCESSING"].includes(status)){
        const {error:updateError}=await admin.rpc("mark_service_order_processing",{
          p_order_id:order.id,p_provider_order_id:str(p.orderid)||null,p_provider_status:status,p_message:message,
        });
        if(updateError) throw updateError;
        results.push({orderId:order.id,status:"processing"});
      }else{
        await admin.rpc("mark_service_order_unknown",{
          p_order_id:order.id,p_provider_status:status||"QUERY_UNRECOGNIZED",
          p_message:message||"Supplier outcome is not a confirmed terminal result",
        });
        results.push({orderId:order.id,status:"unknown"});
      }
    }catch(e){
      await admin.rpc("mark_service_order_unknown",{
        p_order_id:order.id,p_provider_status:"QUERY_FAILED",
        p_message:e instanceof Error?e.message:"Supplier query failed",
      });
      results.push({orderId:order.id,status:"unknown"});
    }
  }
  return json({checked:results.length,results});
});
