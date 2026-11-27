import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type Obj = Record<string, unknown>;
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{...corsHeaders,"Content-Type":"application/json"} });
const text = (v: unknown) => String(v ?? "").trim();
const first = (o:Obj, keys:string[]) => { for (const k of keys) { const v=text(o[k]); if(v) return v; } return ""; };
const pick = (o:Obj, keys:string[]):unknown => {
  for(const key of keys){
    if(o[key]!==undefined&&o[key]!==null)return o[key];
    const match=Object.entries(o).find(([name])=>name.toLowerCase()===key.toLowerCase());
    if(match&&match[1]!==undefined&&match[1]!==null)return match[1];
  }
  return undefined;
};
const numberOrZero=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const num = (v:unknown) => { const n=Number(String(v??"").replace(/[₦,$,\s]/g,"")); return Number.isFinite(n) && n>0 ? n : null; };
const networkCode = (value:unknown) => text(value);
function rows(value:unknown, depth=0, seen=new Set<unknown>()): Obj[] {
  if(depth>9||value===null||value===undefined)return [];
  if(Array.isArray(value)){
    return value.filter(x=>x&&typeof x==="object"&&!Array.isArray(x)) as Obj[];
  }
  if(typeof value!=="object"||seen.has(value))return [];
  seen.add(value);
  const o=value as Obj;
  // Match IyanjuPay's Topupmate response envelopes, including provider lists
  // nested under billers and operator-specific catalogue keys.
  const keys=["response","data","results","services","billers","biller","providers","networks","operators",
    "plans","content","items","products","packages","catalogue","catalog","variations","records","list","available","msg","result"];
  for(const key of keys){
    if(o[key]===undefined)continue;
    const found=rows(o[key],depth+1,seen);
    if(found.length)return found;
  }
  return [];
}
const networkId=(value:unknown):string=>{
  const raw=text(value).toLowerCase().replace(/[^a-z0-9]/g,"");
  if(["1","01","mtn"].includes(raw)||raw.includes("mtn"))return "1";
  if(["2","02","airtel"].includes(raw)||raw.includes("airtel"))return "2";
  if(["3","03","glo"].includes(raw)||raw.includes("glo")||raw.includes("globacom"))return "3";
  if(["4","04","9mobile","etisalat"].includes(raw)||raw.includes("9mobile")||raw.includes("etisalat"))return "4";
  return "";
};
function dataPlanMatchesNetwork(item:Obj,wanted:string):boolean{
  const values=[
    item.networkid,item.network_id,item.networkId,item.network_code,item.networkCode,
    item.network,item.network_name,item.networkName,item.provider,item.provider_id,
    item.provider_name,item.providerName,item.operator,item.operator_name,item.telco,
    item.telco_name,item.plan_network,item.planNetwork,
    (item.plan as Obj|undefined)?.networkid,(item.plan as Obj|undefined)?.network_id,
    (item.plan as Obj|undefined)?.networkId,(item.plan as Obj|undefined)?.network,
    (item.data as Obj|undefined)?.networkid,(item.data as Obj|undefined)?.network_id,
    (item.data as Obj|undefined)?.networkId,(item.data as Obj|undefined)?.network
  ];
  return values.some(value=>networkId(value)===wanted);
}
// Use the exact catalogue keys and lookup sequence used by IyanjuPay.
// Internet provider cards are handled by the service flow; Topupmate does not
// expose smile/alpha/kirani/ratel as /services/?service= catalogue keys.
const services = [
  {key:"network", category:"airtime", kind:"options", optionType:"network"},
  {key:"data", category:"data", kind:"products"},
  {key:"cable-provider", category:"cable_tv", kind:"options", optionType:"cable_provider"},
  {key:"cabletv", category:"cable_tv", kind:"products"},
  {key:"electricity", category:"electricity", kind:"options", optionType:"operator"},
  {key:"exampin", category:"education", kind:"options", optionType:"exam_provider"},
  {key:"exampin", category:"education", kind:"products"},
  {key:"recharge-card", category:"recharge_pin", kind:"products"},
  {key:"datapin", category:"data_pin", kind:"products"},
] as const;

Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), token=Deno.env.get("TOPUPMATE_API_KEY");
  const missingConfig=[!url?"SUPABASE_URL":null,!anon?"SUPABASE_ANON_KEY":null,!serviceKey?"SUPABASE_SERVICE_ROLE_KEY":null,!token?"TOPUPMATE_API_KEY":null].filter((name): name is string => Boolean(name));
  if(!url||!anon||!serviceKey||!token) return json({error:"Required Edge Function configuration is missing",missing:missingConfig},503);
  const authHeader=req.headers.get("Authorization")||"";
  const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user}}=await caller.auth.getUser();
  if(!user) return json({error:"Authentication required"},401);
  const {data:allowed,error:permissionError}=await caller.rpc("has_admin_permission",{p_permission:"services.manage"});
  if(permissionError||allowed!==true) return json({error:"Service management permission is required"},403);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:provider,error:providerError}=await admin.from("service_providers").select("id,code").eq("code","topupmate").single();
  if(providerError||!provider) return json({error:"Topupmate provider is not registered. Apply the Topupmate services migration first."},409);
  const root="https://connect.topupmate.com/api";
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
    const syncErrors:string[]=[];
    try {
      // Topupmate's /services/ catalogue is the source for biller/operator IDs.
      // The same cable catalogue can contain both provider rows and priced plans.
      const serviceKey=spec.key;
      const endpointCandidates=spec.key==="recharge-card"
        ? ["rechargepin","recharge-pin","recharge-card","airtimepin","airtime-pin"]
        : spec.key==="datapin"
          ? ["datapin","data-pin","data-card"]
          : [serviceKey];
      let payload:unknown=null;
      let lastEndpointError:unknown=null;
      let list:Obj[]=[];
      if(spec.key==="data"){
        // IyanjuPay fetches Topupmate data plans per network, trying each
        // supported query parameter. Do not use one unscoped data catalogue.
        const combined=new Map<string,Obj>();
        for(const network of ["1","2","3","4"]){
          for(const parameter of ["network","networkid","network_id","provider","provider_id"]){
            try{
              const candidatePayload=await fetchEndpoint("/services/?service=data&"+encodeURIComponent(parameter)+"="+encodeURIComponent(network));
              const matching=rows(candidatePayload).filter(item=>dataPlanMatchesNetwork(item,network));
              for(const item of matching){
                const planCode=first(item,["planid","plan_id","planId","data_plan","dataplan","id","code"]);
                if(planCode)combined.set(network+":"+planCode,{...item,__tolirex_network_id:network});
              }
              if(matching.length)break;
            }catch(error){lastEndpointError=error;}
          }
        }
        list=[...combined.values()];
        if(list.length)payload={response:list,source:"network-scoped-data-catalogue"};
      }else{
        for(const candidate of endpointCandidates){
          try{
            const candidatePayload=await fetchEndpoint("/services/?service="+encodeURIComponent(candidate));
            if(payload===null)payload=candidatePayload;
            const candidateRows=rows(candidatePayload);
            if(candidateRows.length){payload=candidatePayload;list=candidateRows;break;}
          }catch(error){lastEndpointError=error;}
        }
      }
      if(payload===null){
        // IyanjuPay tries the same aliases and leaves the PIN service empty when
        // none of the live catalogue keys is accepted. Do not fail the entire
        // provider sync because an optional PIN catalogue is unavailable.
        if(spec.key==="recharge-card"||spec.key==="datapin"){
          results.push({service:spec.key,status:"skipped",reason:"No supported Topupmate catalogue key returned products"});
          continue;
        }
        throw lastEndpointError instanceof Error?lastEndpointError:new Error("Topupmate catalogue endpoint returned no response");
      }
      await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"services:"+spec.key,payload,fetch_status:"success",fetched_at:new Date().toISOString(),error_summary:null},{onConflict:"provider_code,catalogue_key"});
      if(!list.length)list=rows(payload);
      // IyanjuPay also checks /status/ for live Cable TV and electricity
      // provider lists; some Topupmate accounts expose the operators there.
      if(spec.key==="cable-provider"||spec.key==="electricity"){
        try{
          const statusPayload=await fetchEndpoint("/status/");
          const statusRoot=statusPayload as Obj;
          const statusRows=spec.key==="cable-provider"
            ? statusRoot.cable
            : statusRoot.electricity;
          // IyanjuPay always prefers the provider/operator list from /status/
          // when the live account returns it, even if /services/ had rows.
          if(Array.isArray(statusRows)&&statusRows.length){
            payload={response:statusRows};
            list=rows(payload);
            await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"services:"+spec.key,payload,fetch_status:"success",fetched_at:new Date().toISOString(),error_summary:null},{onConflict:"provider_code,catalogue_key"});
          }
        }catch{/* Keep the successful /services/ response when /status/ is unavailable. */}
      }
      for(const item of list) {
        const codeKeys=spec.key==="cable-provider"||spec.key==="electricity"
          ? ["provider_id","providerId","provider_code","providerCode","biller_code","billerCode","CableTVCode","cable_tv_code","cableTvCode","CableTVID","cable_tv_id","cableTvId","networkid","network_id","networkId","id","code"]
          : spec.key==="network"
            ? ["networkid","network_id","networkId","network","id","code","provider_id","providerId"]
            : spec.key==="cabletv"
              ? ["item_code","itemCode","plan_code","planCode","plan_id","planid","planId","id","code"]
              : spec.key==="data"
                ? ["planid","plan_id","planId","data_plan","dataplan","id","code"]
            : spec.key==="recharge-card"
              ? ["plan","airtime_pin_id_code","airtimePinIdCode","airtime_pin_id","item_code","itemCode","plan_id","planid","id","code"]
              : spec.key==="datapin"
                ? ["data_plan","dataplan","planid","plan_id","planId","item_code","id","code"]
              : spec.key==="exampin"
                ? ["id","provider_id","providerId","provider","code"]
                : ["plan_id","planid","planId","id","provider_id","providerId","code","product_id","productId"];
        const code=first(item,codeKeys);
        const label=spec.kind==="options"
          ? first(item,["provider_name","providerName","name","display_name","biller_name","billerName","CableTVName","cable_tv_name","cableTvName","CableTV","cable_tv","disco_name","discoName","disco","operator_name","operatorName","provider","description"])
          : first(item,["name","plan_name","planName","product_name","productName","package_name","packageName","provider","provider_name","description"]);
        if(!code||!label) continue;
        if(spec.kind==="options") {
          const {error}=await admin.rpc("sync_provider_service_option",{p_provider_code:"topupmate",p_category_code:spec.category,p_option_type:spec.optionType,p_option_code:code,p_name:label,p_parent_option_code:null,p_metadata:{source_service:spec.key,supplier_discount:item.discount??item.discount_percent??item.discountPercentage??null}});
          if(!error) options++; else syncErrors.push("option "+code+": "+error.message);
          if(spec.key==="network") {
            for(const category of ["data","recharge_pin","data_pin"]) {
              const mirrored=await admin.rpc("sync_provider_service_option",{p_provider_code:"topupmate",p_category_code:category,p_option_type:"network",p_option_code:code,p_name:label,p_parent_option_code:null,p_metadata:{source_service:"network"}});
              if(!mirrored.error) options++; else syncErrors.push("mirrored "+category+" network "+code+": "+mirrored.error.message);
            }
          }
        } else {
          const cost=num(item.price??item.amount??item.cost??item.provider_price??item.providerPrice??item.selling_price);
          if(!cost) continue;
          let network="";
          if(spec.key==="cabletv"){
            network=first(item,["provider_id","providerId","provider_code","providerCode","biller_code","billerCode","CableTVCode","cable_tv_code","cableTvCode","CableTVID","cable_tv_id","cableTvId","cable_code","cableCode","CableTV","cable_tv","provider","provider_name","providerName"]);
          }else if(spec.category==="education"){
            network=first(item,["provider_id","providerId","provider_code","providerCode","provider","provider_name","providerName","exam","exam_type","id"]);
          }else{
            network=networkCode(first(item,["__tolirex_network_id","networkid","network_id","networkId","network_code","networkCode","network","network_name","networkName","provider_id","provider","provider_name"]));
          }
          if(network&&!/^\d+$/.test(network)){
            const optionType=spec.key==="cabletv"?"cable_provider":spec.category==="education"?"exam_provider":"network";
            const {data:matchedNetwork}=await admin.from("provider_service_options")
              .select("option_code").eq("provider_id",provider.id).eq("option_type",optionType)
              .ilike("name",network).limit(1).maybeSingle();
            if(matchedNetwork?.option_code)network=matchedNetwork.option_code;
          }
          if(spec.key==="cabletv"&&!network)continue;
          const validity=first(item,["validity","validity_period","validityperiod","duration","period","plan_period","planperiod"]);
          const rawPlanType=first(item,["plantype","plan_type","planType","data_type","dataType","type","plan_category","planCategory","package_type","packageType"]);
          const normalizedPlanType=rawPlanType.toLowerCase().replace(/[^a-z]/g,"");
          const planType=normalizedPlanType.includes("sme")?"sme":normalizedPlanType.includes("gift")?"gifting":normalizedPlanType.includes("corporate")?"corporate":null;
          const {error}=await admin.rpc("sync_provider_catalogue_product",{p_provider_code:"topupmate",p_category_code:spec.category,p_product_code:spec.key+":"+code,p_name:label,p_network_or_operator:network||null,p_description:validity||null,p_face_value:num(item.face_value??item.denomination),p_cost_price:cost,p_metadata:{source_service:spec.key,supplier_plan_id:code,plan_type:planType,topupmate_plan_type:rawPlanType||null,topupmate_network_id:first(item,["networkid","network_id","networkId","network_code","networkCode"])||null,topupmate_raw_network:first(item,["network","network_name","networkName","provider","provider_name","providerName"])||null}});
          if(!error) products++; else syncErrors.push("product "+code+": "+error.message);
        }
      }
      results.push({service:spec.key,status:syncErrors.length?"failed":"success",records:list.length,...(syncErrors.length?{errors:syncErrors}: {})});
    } catch(error) {
      const message=error instanceof Error?error.message:"Catalogue endpoint failed";
      await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"services:"+spec.key,payload:{},fetch_status:"failed",error_summary:message},{onConflict:"provider_code,catalogue_key"});
      results.push({service:spec.key,status:"failed",error:message});
    }
  }
  // IyanjuPay's live service integration exposes these ISP choices directly.
  // Smile has a fixed bundle catalogue in that implementation; Alpha, Kirani
  // and Ratel are amount-based top-ups, so they are provider options, not plans.
  // The IyanjuPay PIN flow uses the four fixed Topupmate network IDs.
  // Register these selectors independently of PIN catalogue availability.
  const pinNetworks=[{code:"1",name:"MTN"},{code:"2",name:"Airtel"},{code:"3",name:"Glo"},{code:"4",name:"9mobile"}];
  for(const category of ["recharge_pin","data_pin"]){
    for(const network of pinNetworks){
      const {error}=await admin.rpc("sync_provider_service_option",{
        p_provider_code:"topupmate",p_category_code:category,p_option_type:"network",
        p_option_code:network.code,p_name:network.name,p_parent_option_code:null,
        p_metadata:{source_service:"iyanjupay-mobile-networks",network_id:network.code}
      });
      if(!error)options++;
      else results.push({service:category,status:"failed",error:"network "+network.code+": "+error.message});
    }
  }
  // Supplier-confirmed Recharge PIN IDs and provider costs copied from the
  // working IyanjuPay integration. The denomination is not the plan ID.
  const rechargePins=[
    {id:"1",network:"1",name:"MTN",value:100,cost:98},
    {id:"2",network:"1",name:"MTN",value:200,cost:196},
    {id:"3",network:"1",name:"MTN",value:500,cost:499.5},
    {id:"11",network:"1",name:"MTN",value:1000,cost:980},
    {id:"4",network:"2",name:"Airtel",value:100,cost:98},
    {id:"5",network:"2",name:"Airtel",value:200,cost:196},
    {id:"6",network:"2",name:"Airtel",value:500,cost:490},
    {id:"12",network:"2",name:"Airtel",value:1000,cost:980},
    {id:"7",network:"3",name:"Glo",value:100,cost:98},
    {id:"8",network:"3",name:"Glo",value:200,cost:198},
    {id:"9",network:"3",name:"Glo",value:500,cost:485},
    {id:"13",network:"3",name:"Glo",value:1000,cost:970},
    {id:"14",network:"4",name:"9mobile",value:100,cost:97.5},
    {id:"15",network:"4",name:"9mobile",value:200,cost:195.5}
  ];
  for(const plan of rechargePins){
    const {error}=await admin.rpc("sync_provider_catalogue_product",{
      p_provider_code:"topupmate",p_category_code:"recharge_pin",
      p_product_code:"rechargepin:"+plan.id,p_name:plan.name+" ₦"+plan.value,
      p_network_or_operator:plan.network,p_description:"Recharge PIN",
      p_face_value:plan.value,p_cost_price:plan.cost,
      p_metadata:{source_service:"rechargepin",supplier_plan_id:plan.id,network_id:plan.network,network_name:plan.name,denomination:plan.value}
    });
    if(!error)products++;
    else results.push({service:"recharge_pin",status:"failed",error:"plan "+plan.id+": "+error.message});
  }
  const internetProviders=[
    {key:"smile",name:"Smile"},
    {key:"alpha",name:"Alpha Caller"},
    {key:"kirani",name:"Kirani Caller"},
    {key:"ratel",name:"Ratel"}
  ];
  for(const item of internetProviders){
    const {error}=await admin.rpc("sync_provider_service_option",{
      p_provider_code:"topupmate",p_category_code:"internet",
      p_option_type:"internet_provider",p_option_code:item.key,
      p_name:item.name,p_parent_option_code:null,
      p_metadata:{source_service:item.key,amount_based:item.key!=="smile"}
    });
    if(!error)options++;
  }
  const smilePlans=[
    {id:"828",name:"Smile Midi 1.5GB + 3GB Stream",price:1250,days:30},
    {id:"848",name:"Smile Mini 3.5GB",price:1500,days:7},
    {id:"845",name:"Smile Mini 3GB",price:1500,days:2},
    {id:"829",name:"Smile Midi 2GB + 4GB Stream",price:1500,days:30},
    {id:"804",name:"SmileVoice ONLY 135",price:1850,days:30},
    {id:"830",name:"Smile Midi 3GB + 5GB Stream",price:2000,days:30},
    {id:"846",name:"Smile Mini 5GB",price:2200,days:2},
    {id:"849",name:"Smile Mini 6GB",price:2300,days:7},
    {id:"831",name:"Smile Midi 6GB + 5GB Stream",price:3000,days:30},
    {id:"832",name:"Smile Midi 8GB + 5GB Stream",price:3500,days:30},
    {id:"808",name:"SmileVoice ONLY 175",price:3600,days:90},
    {id:"833",name:"Smile Midi 10GB + 5GB Stream",price:4000,days:30},
    {id:"843",name:"Smile Mini 1GB",price:450,days:1},
    {id:"805",name:"SmileVoice ONLY 430",price:5700,days:30},
    {id:"807",name:"SmileVoice ONLY 450",price:7200,days:60},
    {id:"847",name:"Smile Mini 1GB",price:750,days:7},
    {id:"844",name:"Smile Mini 2.5GB",price:750,days:1},
    {id:"803",name:"SmileVoice ONLY 65",price:900,days:30},
    {id:"809",name:"SmileVoice ONLY 500",price:9000,days:90}
  ];
  for(const plan of smilePlans){
    const {error}=await admin.rpc("sync_provider_catalogue_product",{
      p_provider_code:"topupmate",p_category_code:"internet",
      p_product_code:"internet:smile:"+plan.id,p_name:plan.name,
      p_network_or_operator:"smile",p_description:plan.days+" days",
      p_face_value:null,p_cost_price:plan.price,
      p_metadata:{source_service:"smile",supplier_plan_id:plan.id,
        validity_days:plan.days,validity:plan.days+" days",internet_provider:"smile"}
    });
    if(!error)products++;
  }
  results.push({service:"internet",status:"success",records:internetProviders.length+smilePlans.length});
  try {
    const gift=await fetchEndpoint("/giftcard/available/");
    await admin.from("provider_catalogue_snapshots").upsert({provider_code:"topupmate",catalogue_key:"giftcard:available",payload:gift,fetch_status:"success",fetched_at:new Date().toISOString()},{onConflict:"provider_code,catalogue_key"});
    const unwrap=(value:unknown,depth=0):Obj[]=>{
      if(depth>7||!value)return [];
      if(Array.isArray(value))return value.filter(x=>x&&typeof x==="object"&&!Array.isArray(x)) as Obj[];
      if(typeof value!=="object")return [];
      const o=value as Obj;
      for(const key of ["response","data","results","content","products","items","plans","packages","result","msg"]){
        const found=unwrap(o[key],depth+1);if(found.length)return found;
      }
      return [];
    };
    const gifts=unwrap(gift);let giftProducts=0;
    for(const item of gifts){
      const id=first(item,["productid","product_id","productId","id"]);
      const name=first(item,["productname","product_name","productName","name"]);
      if(!id||!name)continue;
      const fixedRecipientRaw=pick(item,["fixedrecipientdenominations"]);
      const fixedSenderRaw=pick(item,["fixedsenderdenominations"]);
      const mappedRaw=pick(item,["fixedrecipienttosenderdenominationsmap"]);
      const fixedRecipient=Array.isArray(fixedRecipientRaw)?fixedRecipientRaw.map(Number).filter((x:number)=>x>0):[];
      const fixedSender=Array.isArray(fixedSenderRaw)?fixedSenderRaw.map(Number).filter((x:number)=>x>0):[];
      const mapped=Array.isArray(mappedRaw)?mappedRaw:[];
      const pairs:{recipient:number;sender:number}[]=[];
      for(const entry of mapped)if(entry&&typeof entry==="object")for(const [key,value] of Object.entries(entry)){
        const recipient=Number(key),sender=Number(value);if(recipient>0&&sender>0)pairs.push({recipient,sender});
      }
      const recipients=fixedRecipient.length?fixedRecipient:pairs.map(x=>x.recipient);
      const countryValue=pick(item,["country"]);
      const country=typeof countryValue==="object"&&countryValue?first(countryValue as Obj,["isoname","code"]):text(pick(item,["countrycode","country_code"])??countryValue);
      const currency=text(pick(item,["recipientcurrencycode","recipient_currency_code"]));
      const senderCurrency=text(pick(item,["sendercurrencycode","sender_currency_code"]));
      const categoryValue=pick(item,["category","productcategory","product_category"]);
      const productCategory=typeof categoryValue==="object"&&categoryValue
        ? first(categoryValue as Obj,["name","label","code"])
        : text(categoryValue);
      if(!currency||senderCurrency!=="NGN")continue;
      const logoValue=pick(item,["logourls","logo_urls","logourl","logo_url","logo","image"]);
      const logo=Array.isArray(logoValue)?text(logoValue[0]):text(logoValue);
      const redeem=pick(item,["redeeminstruction","redeem_instruction"])??null;
      const exchangeRate=numberOrZero(pick(item,["recipientcurrencytosendercurrencyexchangerate","recipient_currency_to_sender_currency_exchange_rate"]));
      for(let i=0;i<recipients.length;i++){
        const denomination=recipients[i];
        const sender=pairs.find(x=>x.recipient===denomination)?.sender??fixedSender[i]??(exchangeRate>0?denomination*exchangeRate:0);
        if(!(sender>0))continue;
        const productCode="giftcard:"+id+":"+String(denomination);
        const {error}=await admin.rpc("sync_provider_catalogue_product",{
          p_provider_code:"topupmate",p_category_code:"gift_card",p_product_code:productCode,
          p_name:name+" "+denomination+" "+currency,p_network_or_operator:country||null,
          p_description:"Gift card · "+currency,p_face_value:denomination,p_cost_price:sender,
          p_metadata:{source_service:"giftcard",supplier_product_id:id,recipient_denomination:denomination,
            recipient_currency:currency,sender_currency:senderCurrency,country_code:country,product_category:productCategory,logo_url:logo,
            redeem_instruction:redeem}
        });
        if(!error)giftProducts++;
      }
      if(!recipients.length){
        const minRecipient=Number(pick(item,["minrecipientdenomination","min_recipient_denomination"]));
        const maxRecipient=Number(pick(item,["maxrecipientdenomination","max_recipient_denomination"]));
        const minSender=Number(pick(item,["minsenderdenomination","min_sender_denomination"]));
        const maxSender=Number(pick(item,["maxsenderdenomination","max_sender_denomination"]));
        for(const [denomination,sender] of [[minRecipient,minSender],[maxRecipient,maxSender]]){
          if(!(denomination>0&&sender>0))continue;
          const productCode="giftcard:"+id+":"+String(denomination);
          const {error}=await admin.rpc("sync_provider_catalogue_product",{
            p_provider_code:"topupmate",p_category_code:"gift_card",p_product_code:productCode,
            p_name:name+" "+denomination+" "+currency,p_network_or_operator:country||null,
            p_description:"Gift card · "+currency,p_face_value:denomination,p_cost_price:sender,
            p_metadata:{source_service:"giftcard",supplier_product_id:id,recipient_denomination:denomination,
              recipient_currency:currency,sender_currency:senderCurrency,country_code:country,logo_url:logo,
              redeem_instruction:redeem}
          });
          if(!error)giftProducts++;
        }
      }
    }
    products+=giftProducts;
    results.push({service:"giftcard",status:"success",records:gifts.length,normalizedProducts:giftProducts});
  } catch(error) { results.push({service:"giftcard",status:"failed",error:error instanceof Error?error.message:"Gift card catalogue failed"}); }
  const failed=results.filter(x=>x.status==="failed");
  const skipped=results.filter(x=>x.status==="skipped");
  const status=failed.length===0?"success":failed.length===results.length?"failed":"partial";
  await admin.from("provider_catalogue_sync_runs").update({status,discovered_products:products,discovered_options:options,failed_endpoints:failed,summary:{provider:"topupmate",results,skipped},completed_at:new Date().toISOString()}).eq("id",run.id);
  return json({success:failed.length<results.length,status,provider:"topupmate",discoveredProducts:products,discoveredOptions:options,results,skipped:skipped.length},failed.length===results.length?502:200);
});
