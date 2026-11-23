import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
function same(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const secretHash=Deno.env.get("FLW_SECRET_HASH");
  const signature=req.headers.get("verif-hash")??"";
  if(!secretHash||!signature||!same(secretHash,signature))return json({error:"Invalid webhook signature"},401);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),flwKey=Deno.env.get("FLW_SECRET_KEY");
  if(!url||!service||!flwKey)return json({error:"Webhook environment is incomplete"},500);
  let body:Record<string,any>;
  try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  const data=body.data??{};
  const transactionId=String(data.id??"");
  const txRef=String(data.tx_ref??"");
  if(!transactionId||!txRef)return json({received:true,ignored:true});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:account,error:accountError}=await admin.from("virtual_accounts")
    .select("id,user_id,business_id,currency,status,account_number")
    .eq("provider","flutterwave").eq("account_reference",txRef).eq("is_permanent",true).maybeSingle();
  if(accountError)return json({error:"Unable to resolve virtual account"},500);
  if(!account||account.status!=="active")return json({received:true,ignored:true});
  const verify=await fetch("https://api.flutterwave.com/v3/transactions/"+encodeURIComponent(transactionId)+"/verify",{
    headers:{Authorization:"Bearer "+flwKey,Accept:"application/json"}
  });
  const verified=await verify.json().catch(()=>null);
  const tx=verified?.data;
  if(!verify.ok||verified?.status!=="success"||tx?.status!=="successful"||String(tx?.tx_ref)!==txRef||
     String(tx?.currency)!=="NGN"||Number(tx?.amount)<=0){
    return json({error:"Flutterwave transaction verification failed"},422);
  }
  const amount=Number(tx.amount);
  const {data:event,error:eventError}=await admin.from("funding_events").upsert({
    user_id:account.user_id,business_id:account.business_id??null,virtual_account_id:account.id,
    provider:"flutterwave",provider_event_id:transactionId,
    provider_transaction_id:String(tx.flw_ref??transactionId),tx_reference:txRef,amount,currency:"NGN",
    sender_name:String(body.meta_data?.originatorname??"").slice(0,120)||null,
    sender_bank:String(body.meta_data?.bankname??"").slice(0,100)||null,
    sender_account_last4:String(body.meta_data?.originatoraccountnumber??"").replace(/\D/g,"").slice(-4)||null,
    status:"verified",processed_at:null
  },{onConflict:"provider,provider_event_id"}).select("id").single();
  if(eventError||!event)return json({error:"Unable to record verified funding event"},500);
  const {data:settlement,error:settlementError}=await admin.rpc("credit_flutterwave_funding",{p_funding_event_id:event.id});
  if(settlementError)return json({error:"Verified payment recorded but wallet settlement needs reconciliation"},500);
  await admin.from("audit_logs").insert({
    actor_user_id:null,action:"flutterwave.deposit.verified",target_type:"funding_event",target_id:event.id,
    after_data:{amount,currency:"NGN",transaction_id:transactionId,business_id:account.business_id??null}
  });
  return json({received:true,settlement});
});
