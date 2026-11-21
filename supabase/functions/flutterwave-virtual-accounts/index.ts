import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptIdentity } from "../_shared/identity-crypto.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
const ref=(userId:string)=>"tolirex-va-"+userId.replace(/-/g,"");

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const authorization=req.headers.get("Authorization");
  if(!authorization?.startsWith("Bearer ")) return json({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const flwKey=Deno.env.get("FLW_SECRET_KEY");
  if(!url||!anon||!service||!flwKey) return json({error:"Supabase or Flutterwave server configuration is incomplete"},500);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await caller.auth.getUser();
  if(authError||!auth.user) return json({error:"Invalid or expired session"},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:profile,error:profileError},{data:kyc,error:kycError}]=await Promise.all([
    admin.from("profiles").select("id,email,full_name,phone,account_type,account_status").eq("id",auth.user.id).maybeSingle(),
    admin.from("kyc_records").select("id,status,first_name,last_name,phone_number,identity_kind,identity_ciphertext").eq("user_id",auth.user.id).eq("status","approved").order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(profileError||kycError) return json({error:"Unable to load verified account details"},500);
  if(!profile||profile.account_status!=="active") return json({error:"Your account is not eligible for virtual-account issuance"},403);
  if(!kyc?.identity_ciphertext) return json({error:"Complete and receive KYC approval before requesting a permanent virtual account"},403);
  const {data:existing,error:existingError}=await admin.from("virtual_accounts").select("id,account_number,bank_name,account_name,currency,status,is_permanent").eq("user_id",auth.user.id).eq("provider","flutterwave").eq("is_permanent",true).eq("status","active").maybeSingle();
  if(existingError) return json({error:"Unable to check existing virtual account"},500);
  if(existing) return json({account:existing,existing:true});
  const txRef=ref(auth.user.id);
  const {data:claim,error:claimError}=await admin.from("virtual_accounts").insert({
    user_id:auth.user.id,provider:"flutterwave",provider_reference:txRef,account_reference:txRef,
    account_number:"PENDING",bank_name:"Flutterwave",account_name:String(profile.full_name),
    currency:"NGN",is_permanent:true,status:"pending"
  }).select("id").single();
  if(claimError||!claim) {
    const {data:pending}=await admin.from("virtual_accounts").select("id,status").eq("provider","flutterwave").eq("account_reference",txRef).maybeSingle();
    if(pending?.status==="active") {
      const {data:ready}=await admin.from("virtual_accounts").select("id,account_number,bank_name,account_name,currency,status,is_permanent").eq("id",pending.id).single();
      return json({account:ready,existing:true});
    }
    return json({error:"Virtual-account issuance is already pending or needs reconciliation. Do not submit another request."},409);
  }
  let identity:string;
  try{identity=await decryptIdentity(kyc.identity_ciphertext);}catch{return json({error:"Unable to securely read approved identity. Contact support."},500);}
  const names=(kyc.first_name+" "+kyc.last_name).trim().split(/\s+/);
  const payload:Record<string,unknown>={email:auth.user.email??profile.email,currency:"NGN",firstname:names[0]??"",lastname:names.slice(1).join(" ")||names[0]||"",phonenumber:kyc.phone_number??profile.phone,tx_ref:txRef,is_permanent:true,narration:"TolirexData wallet",bank_code:"090567"};
  payload[kyc.identity_kind==="bvn"?"bvn":"nin"]=identity;
  let response:Response;
  try {
    response=await fetch("https://api.flutterwave.com/v3/virtual-account-numbers",{method:"POST",headers:{Authorization:"Bearer "+flwKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)});
  } catch {
    return json({error:"Flutterwave account creation response is uncertain. The request is locked for reconciliation; do not retry."},502);
  }
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=="success"||!result?.data?.account_number) return json({error:"Flutterwave could not confirm account creation. The request is held for reconciliation; do not retry."},502);
  const account=result.data;
  const {data:saved,error:saveError}=await admin.from("virtual_accounts").update({
    provider_reference:account.flw_ref??account.order_ref??txRef,provider_session_id:account.order_ref??null,
    account_number:String(account.account_number),bank_name:String(account.bank_name??"Flutterwave MFB"),
    account_name:String(profile.full_name),status:"active",issued_at:new Date().toISOString()
  }).eq("id",claim.id).eq("status","pending").select("id,account_number,bank_name,account_name,currency,status,is_permanent").single();
  if(saveError||!saved) return json({error:"Flutterwave issued the account but TolirexData could not safely save its details. The request is held for reconciliation; do not retry."},500);
  await admin.from("audit_logs").insert({actor_user_id:auth.user.id,action:"virtual_account.issued",target_type:"virtual_account",target_id:saved.id,after_data:{provider:"flutterwave",permanent:true}});
  return json({account:saved,existing:false},201);
});
