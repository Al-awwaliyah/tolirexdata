import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type Obj = Record<string, unknown>;
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{...corsHeaders,"Content-Type":"application/json"} });
const text = (v: unknown) => String(v ?? "").trim();
const first = (o:Obj, keys:string[]) => { for (const k of keys) { const v=text(o[k]); if(v) return v; } return ""; };
const num = (v:unknown) => { const n=Number(String(v??"").replace(/[₦,$,\s]/g,"")); return Number.isFinite(n) && n>0 ? n : null; };
const networkCode = (value:unknown) => {
  const raw=text(value), key=raw.toLowerCase().replace(/[^a-z0-9]/g,"");
  const aliases:Record<string,string>={mtn:"1","01":"1",airtel:"2","02":"2",glo:"3",globacom:"3","03":"3","9mobile":"4",ninemobile:"4",etisalat:"4","04":"4"};
  return aliases[key]??raw;
};
function rows(value:unknown): Obj[] {
  if (Array.isArray(value)) return value.filter(x=>x && typeof x==="object" && !Array.isArray(x)) as Obj[];
  if (!value || typeof value!=="object") return [];
  const o=value as Obj;
  for (const k of ["response","data","results","services","plans","content","items","products","msg"]) {
    const found=rows(o[k]); if(found.length) return found;
  }
  return [];
}
const services = [
  {key:"network", category:"airtime", kind:"options", optionType:"network"},
  {key:"airtime", category:"airtime", kind:"options", optionType:"network"},
  {key:"data", category:"data", kind:"products"},
  {key:"cable-provider", category:"cable_tv", kind:"options", optionType:"cable_provider"},
  {key:"cabletv", category:"cable_tv", kind:"products"},
  {key:"electricity", category:"electricity", kind:"options", optionType:"operator"},
  {key:"exampin", category:"education", kind:"products"},
  {key:"recharge-card", category:"recharge_pin", kind:"products"},
  {key:"datapin", category:"data_pin", kind:"products"},
  {key:"smile", category:"internet", kind:"products"},
  {key:"alpha", category:"internet", kind:"products"},
  {key:"kirani", category:"internet", kind:"products"},
  {key:"ratel", category:"internet", kind:"products"},
] as const;

Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), token=Deno.env.get("TOPUPMATE_API_KEY");
  if(!url||!anon||!serviceKey||!token) return json({error:"Topupmate or Supabase server configuration is incomplete"},503);
  const authHeader=req.headers.get("Authorization")||"";
  const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user}}=await caller.auth.getUser();
  if(!user) return json({error:"Authentication required"},401);
  const {data:allowed,error:permissionError}=await caller.rpc("has_admin_permission",{p_permission:"services.manage"});
  if(permissionError||allowed!==true) return json({error:"Service management permission is required"},403);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:provider,error:providerError}=await admin.from("service_providers").select("id,code").eq("code","topupmate").single();
  if(providerError||!provider) return json({error:"Topupmate provider is not registered. Apply the Topupmate services migration first."},409);
  const root=(Deno.env.get("TOPUPMATE_BASE_URL")||"https://connect.topupmate.com/api").replace(/\/$/,"");
  const fetchEndpoint=async(path:string) => {
    const response=await fetch(root+path,{headers:{Authorization:"Token "+token,Accept:"application/json"},signal:AbortSignal.timeout(25000)});
    const body=await response.json().catch(()=>null);
    if(!response.ok) throw new Error("Topupmate "+path+" returned HTTP "+response.status);
    if(text((body as Obj)?.status).toLowerCase()==="fail") throw new Error("Topupmate "+path+" reported failure");
    return body;
  };
  const {data:run,error:runError}=await admin.from("provider_catalogue_sync_runs").insert({provider_id:provider.id,triggered_by:user.id,trigger_source:"admin",status:"running"}).select("id").single();
  if(runError||!run) return json({error:"Unable to start catalogue sync"},500);
  const results:Obj[]=[]; let products=0,options=0;
  for(const spec of services) {
    try {
      const payload=await fetchEndpoint("/services/?service="+encodeURIComponent(spec.key));
      await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"services:"+spec.key,payload,fetch_status:"success",fetched_at:new Date().toISOString()},{onConflict:"provider_code,catalogue_key"});
      const list=rows(payload);
      for(const item of list) {
        const code=first(item,["id","plan_id","planid","planId","provider_id","code","product_id","productId"]);
        const label=first(item,["name","plan_name","planName","product_name","productName","provider","provider_name","description"]);
        if(!code||!label) continue;
        if(spec.kind==="options") {
          const {error}=await admin.rpc("sync_provider_service_option",{p_provider_code:"topupmate",p_category_code:spec.category,p_option_type:spec.optionType,p_option_code:code,p_name:label,p_parent_option_code:null,p_metadata:{source_service:spec.key,supplier_discount:item.discount??item.discount_percent??item.discountPercentage??null}});
          if(!error) options++;
        } else {
          const cost=num(item.price??item.amount??item.cost??item.provider_price??item.providerPrice??item.selling_price);
          if(!cost) continue;
          const network=networkCode(first(item,["networkid","network_id","networkId","network_code","networkCode","network","network_name","networkName","provider_id","provider","provider_name"]));
          const validity=first(item,["validity","duration","period","validity_period"]);
          const {error}=await admin.rpc("sync_provider_catalogue_product",{p_provider_code:"topupmate",p_category_code:spec.category,p_product_code:spec.key+":"+code,p_name:label,p_network_or_operator:network||null,p_description:validity||null,p_face_value:num(item.face_value??item.denomination),p_cost_price:cost,p_metadata:{source_service:spec.key,supplier_plan_id:code}});
          if(!error) products++;
        }
      }
      results.push({service:spec.key,status:"success",records:list.length});
    } catch(error) {
      const message=error instanceof Error?error.message:"Catalogue endpoint failed";
      await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"services:"+spec.key,payload:{},fetch_status:"failed",error_summary:message},{onConflict:"provider_code,catalogue_key"});
      results.push({service:spec.key,status:"failed",error:message});
    }
  }
  try {
    const gift=await fetchEndpoint("/giftcard/available/");
    await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"giftcard:available",payload:gift,fetch_status:"success",fetched_at:new Date().toISOString()},{onConflict:"provider_code,catalogue_key"});
    results.push({service:"giftcard",status:"success",records:rows(gift).length,publication:"private snapshot pending verified gift-card normalizer"});
  } catch(error) { results.push({service:"giftcard",status:"failed",error:error instanceof Error?error.message:"Gift card catalogue failed"}); }
  const failed=results.filter(x=>x.status==="failed");
  const status=failed.length===0?"success":failed.length===results.length?"failed":"partial";
  await admin.from("provider_catalogue_sync_runs").update({status,discovered_products:products,discovered_options:options,failed_endpoints:failed,summary:{provider:"topupmate",results},completed_at:new Date().toISOString()}).eq("id",run.id);
  return json({success:failed.length<results.length,status,provider:"topupmate",discoveredProducts:products,discoveredOptions:options,results},failed.length===results.length?502:200);
});
