import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptIdentity } from "../_shared/identity-crypto.ts";
import { topupmateGet, topupmatePost, topupmateStatus, topupmateReference, topupmateMessage } from "../_shared/topupmate.ts";

type Obj=Record<string,any>;
const str=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const round2=(v:number)=>Math.round(v*100)/100;
const ceil10=(v:number)=>Math.ceil(v/10)*10;
const ref=()=> "TOLICARD_"+crypto.randomUUID().replace(/-/g,"").toUpperCase();
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
const generic="We could not complete this card request right now. Please check your card activity before trying again.";
class UserError extends Error {}
function safeCardPayload(data:Obj,profile:Obj){
 const rawPan=str(data.card_pan??data.pan??data.card_number);
 const expiry=str(data.expiry??data.expiration??"");
 return {
  provider_card_id:str(data.card_id??data.cardId??data.id),
  masked_pan:str(data.masked_pan??data.maskedPan)||(rawPan?rawPan.slice(0,4)+" **** **** "+rawPan.slice(-4):""),
  last4:rawPan?rawPan.slice(-4):str(data.last4),
  card_type:str(data.brand??"virtual").toLowerCase(),
  currency:str(data.currency??"USD"),
  name_on_card:str(data.name_on_card??profile.first_name+" "+profile.last_name),
  expiry_month:expiry.includes("-")?expiry.slice(5,7):str(data.expiry_month),
  expiry_year:expiry.includes("-")?expiry.slice(0,4):str(data.expiry_year),
 };
}
async function fxRate(usd:number){
 const q=await topupmatePost("/fx-conversions/rates/",{from:"USD",to:"NGN",amount:usd});
 if(!q.ok||topupmateStatus(q.body)==="fail")throw new UserError("Unable to obtain the current USD/NGN exchange rate.");
 const b=q.body?.response??q.body?.data??q.body;
 let rate=num(b?.rate??b?.exchange_rate??b?.exchangeRate??b?.conversion_rate);
 const converted=num(b?.converted_amount??b?.convertedAmount);
 if(!rate&&converted>0)rate=converted/usd;
 if(!rate)throw new UserError("Topupmate did not return a usable exchange rate.");
 return rate;
}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=request.headers.get("Authorization")??"";
 if(!auth.startsWith("Bearer "))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return json({error:"Card service environment is incomplete"},500);
 const caller=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await caller.auth.getUser();
 if(authError||!authData.user)return json({error:"Invalid session"},401);
 let body:Obj;try{body=await request.json()}catch{return json({error:"Invalid request"},400)}
 const action=str(body.action).toLowerCase();
 const allowed=["list","quote","save_profile","create","topup","withdraw","details","transactions","freeze","unfreeze","terminate"];
 if(!allowed.includes(action))return json({error:"Unsupported card action"},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const user=authData.user;
 try{
 if(action==="save_profile"){
  const p:Obj={first_name:str(body.firstName),last_name:str(body.lastName),phone:str(body.phone),email:str(body.email||user.email),date_of_birth:str(body.dateOfBirth),address:str(body.address),state:str(body.state),city:str(body.city)};
  if(p.first_name.length<2||p.last_name.length<2||!/^\+?[0-9]{10,15}$/.test(p.phone)||!/^\S+@\S+\.\S+$/.test(p.email)||!/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)||p.address.length<5||p.state.length<2||p.city.length<2)
   throw new UserError("Complete all required cardholder details with valid information.");
  const {error}=await admin.from("cardholder_profiles").upsert({user_id:user.id,...p,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(error)throw new UserError("Unable to save your cardholder details.");
  return json({success:true,message:"Cardholder details saved securely."});
 }
  if(action==="list"){
   const {data,error}=await admin.from("virtual_cards").select("id,masked_pan,last4,card_type,currency,name_on_card,expiry_month,expiry_year,status,amount_funded,total_funded_usd,last_balance_usd,last_provider_sync_at,created_at").eq("user_id",user.id).eq("provider","topupmate").neq("status","terminated").order("created_at",{ascending:false});
   if(error)throw new UserError("Unable to load your cards.");
   const {data:operations}=await admin.from("virtual_card_operations").select("id,virtual_card_id,action,reference,amount_usd,wallet_amount_ngn,status,provider_status,message,created_at,updated_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(15);
   return json({success:true,cards:data??[],operations:operations??[]});
  }
  if(action==="quote"){
   const amount=num(body.amountUsd);
   if(amount<=0||amount>10000)throw new UserError("Enter a valid USD amount.");
   const kind=str(body.kind)==="create"?"create":"topup";
   const {data:pricing,error:pricingError}=await admin.from("topupmate_card_pricing").select("*").eq("singleton",true).single();
   if(pricingError||!pricing)throw new UserError("Card pricing is not configured yet. Please contact support.");
   if(kind==="create"&&!pricing.card_creation_enabled)throw new UserError("Virtual card creation is temporarily unavailable.");
   if(kind==="create"&&amount<Number(pricing.minimum_initial_funding_usd))throw new UserError("The initial card funding is below the current minimum.");
   if(kind==="topup"&&amount<Number(pricing.topup_minimum_usd))throw new UserError("The card funding amount is below the current minimum.");
   const fee=kind==="create"?Number(pricing.creation_fee_usd):0;
   const markup=kind==="create"?Number(pricing.creation_markup_usd):0;
   const total=kind==="create"?round2(amount+fee+markup):amount;
   const rate=await fxRate(total);
   const walletAmount=ceil10(total*rate*(kind==="topup"?1+Number(pricing.topup_markup_percent)/100:1));
   return json({success:true,kind,amountUsd:amount,totalUsd:total,creationFeeUsd:fee,markupUsd:markup,topupMarkupPercent:Number(pricing.topup_markup_percent),exchangeRate:rate,walletAmountNgn:walletAmount});
  }
  const cardId=str(body.cardId);
  let card:Obj|null=null;
  if(["topup","withdraw","details","transactions","freeze","unfreeze","terminate"].includes(action)){
   if(!cardId)throw new UserError("Select a card first.");
   const {data,error}=await admin.from("virtual_cards").select("*").eq("id",cardId).eq("user_id",user.id).eq("provider","topupmate").maybeSingle();
   if(error||!data)throw new UserError("Card not found.");
   card=data;
  }
  if(action==="details"){
   const q=await topupmatePost("/cards/card-details/",{card_id:card!.provider_card_id});
   if(!q.ok||topupmateStatus(q.body)==="fail")throw new UserError(generic);
   const d=q.body?.response??q.body?.data??q.body;
   // Credentials are returned only to this authenticated owner on demand; never stored or logged.
   return json({success:true,details:d});
  }
  if(action==="transactions"){
   const start=str(body.startDate),end=str(body.endDate),page=Math.max(1,Math.min(100,Math.floor(num(body.page)||1)));
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))throw new UserError("Choose a valid transaction date range.");
   const q=await topupmatePost("/cards/transactions/",{card_id:card!.provider_card_id,start_date:start,end_date:end,page});
   if(!q.ok||topupmateStatus(q.body)==="fail")throw new UserError(generic);
   return json({success:true,transactions:q.body?.response??q.body?.data??q.body});
  }
  if(action==="create"){
   const amount=num(body.amountUsd),idempotency=str(body.idempotencyKey);
   if(amount<=0||!/^[-A-Za-z0-9_]{12,100}$/.test(idempotency))throw new UserError("Enter a valid funding amount and request reference.");
   const {data:kyc,error:kycError}=await admin.from("kyc_records").select("identity_kind,identity_ciphertext,first_name,last_name,phone_number,status").eq("user_id",user.id).eq("status","approved").not("identity_ciphertext","is",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(kycError||!kyc?.identity_ciphertext)throw new UserError("Complete and receive KYC approval before creating a virtual card.");
   const {data:profile}=await admin.from("cardholder_profiles").select("*").eq("user_id",user.id).maybeSingle();
   if(!profile)throw new UserError("Complete your cardholder address and date-of-birth details first.");
   const identity=await decryptIdentity(kyc.identity_ciphertext);
   const {data:pricing,error:pricingError}=await admin.from("topupmate_card_pricing").select("*").eq("singleton",true).single();
   if(pricingError||!pricing)throw new UserError("Card pricing is not configured yet. Please contact support.");
   const fee=Number(pricing.creation_fee_usd),minimum=Number(pricing.minimum_initial_funding_usd),markup=Number(pricing.creation_markup_usd);
   if(!pricing.card_creation_enabled)throw new UserError("Virtual card creation is temporarily unavailable.");
   if(!Number.isFinite(fee)||fee<0||!Number.isFinite(minimum)||minimum<=0||!Number.isFinite(markup)||markup<0||amount<minimum)throw new UserError("The initial card funding is below the current minimum or card pricing is invalid.");
   const totalUsd=round2(amount+fee+markup),rate=await fxRate(totalUsd),walletAmount=ceil10(totalUsd*rate);
   const reference=ref();
   const {data:op,error}=await admin.rpc("reserve_virtual_card_operation",{p_user_id:user.id,p_action:"create",p_virtual_card_id:null,p_reference:reference,p_idempotency_key:idempotency,p_amount_usd:amount,p_wallet_amount_ngn:walletAmount,p_fx_rate:rate,p_metadata:{fee_usd:fee,markup_usd:markup,total_usd:totalUsd}});
   if(error||!op)throw new UserError(error?.message??"Unable to reserve card creation.");
   const {data:claimed}=await admin.rpc("claim_virtual_card_operation",{p_operation_id:op.id});
   if(!claimed)return json({success:true,status:op.status,reference:op.reference,message:"This card request has already been submitted or is being checked. Do not retry it."},202);
   const parts=str(profile.first_name).split(/\s+/);
   const payload={first_name:profile.first_name,last_name:profile.last_name,phone:profile.phone,email:profile.email,dob:profile.date_of_birth,kycType:str(kyc.identity_kind).toUpperCase(),kycNo:identity,address:profile.address,state:profile.state,city:profile.city,amount,brand:str(body.brand||"VISA").toUpperCase(),ref:reference};
   let q;try{q=await topupmatePost("/cards/create/",payload);}catch(error){await admin.rpc("mark_virtual_card_operation",{p_operation_id:op.id,p_status:"unknown",p_provider_status:"transport_error",p_message:"Topupmate card creation response was not received"});return json({success:true,status:"unknown",reference,message:"We are checking your card creation request. Do not submit it again."},202);}
   const state=topupmateStatus(q.body);
   if(q.ok&&state==="fail"){
    const {error:refundError}=await admin.rpc("refund_virtual_card_operation",{p_operation_id:op.id,p_provider_status:"fail",p_reason:"Topupmate confirmed card creation failure"});
    return json({success:false,status:refundError?"unknown":"refunded",error:refundError?"The card provider rejected the request. Contact support to reconcile your wallet.":"The card provider rejected the request; your wallet has been refunded."},refundError?202:400);
   }
   if(!q.ok||state==="processing"){
    await admin.rpc("mark_virtual_card_operation",{p_operation_id:op.id,p_status:"unknown",p_provider_status:!q.ok?"http_"+q.httpStatus:"processing",p_provider_reference:topupmateReference(q.body),p_message:"Topupmate is processing or card creation requires reconciliation"});
    return json({success:true,status:"processing",reference,message:"Your card is being created. Do not submit another request."},202);
   }
   const d=q.body?.response??q.body?.data??q.body;
   const rawPan=str(d?.card_pan??d?.pan??d?.card_number);
   const safe=safeCardPayload(d,profile);
   if(!safe.provider_card_id)throw new UserError("Provider response did not contain a card ID.");
   const {error:completeError}=await admin.rpc("complete_virtual_card_operation",{p_operation_id:op.id,p_provider_status:"success",p_provider_reference:topupmateReference(q.body),p_message:"Card created",p_card:safe});
   if(completeError)throw new UserError("Your card was created, but local registration needs reconciliation.");
   return json({success:true,status:"successful",reference,card:{...safe,fullCardNumber:rawPan||undefined}},201);
  }
  const idempotency=str(body.idempotencyKey);
  if(!/^[-A-Za-z0-9_]{12,100}$/.test(idempotency))throw new UserError("A valid request reference is required.");
  let amount=0,rate=0,walletAmount=0;
  if(["topup","withdraw"].includes(action)){
   amount=num(body.amountUsd);if(amount<=0||amount>10000)throw new UserError("Enter a valid USD amount.");
   const {data:pricing,error:pricingError}=await admin.from("topupmate_card_pricing").select("*").eq("singleton",true).single();
   if(pricingError||!pricing)throw new UserError("Card pricing is not configured yet. Please contact support.");
   if(action==="topup"&&amount<Number(pricing.topup_minimum_usd))throw new UserError("The card funding amount is below the current minimum.");
   rate=await fxRate(amount);walletAmount=ceil10(amount*rate*(action==="topup"?1+Number(pricing.topup_markup_percent)/100:1));
  }
  const reference=ref();
  const {data:op,error:reserveError}=await admin.rpc("reserve_virtual_card_operation",{p_user_id:user.id,p_action:action,p_virtual_card_id:card!.id,p_reference:reference,p_idempotency_key:idempotency,p_amount_usd:amount||null,p_wallet_amount_ngn:walletAmount||null,p_fx_rate:rate||null,p_metadata:{card_id:card!.id}});
  if(reserveError||!op)throw new UserError(reserveError?.message??"Unable to reserve card operation.");
  const {data:claimed}=await admin.rpc("claim_virtual_card_operation",{p_operation_id:op.id});
  if(!claimed)return json({success:true,status:op.status,reference:op.reference,message:"This card request is already being processed or requires review. Do not retry it."},202);
  let q;try{if(action==="topup")q=await topupmatePost("/cards/topup/",{card_id:card!.provider_card_id,amount});
  else if(action==="withdraw")q=await topupmatePost("/cards/withdraw/",{card_id:card!.provider_card_id,amount});
  else q=await topupmatePost(action==="freeze"?"/cards/freeze/":action==="unfreeze"?"/cards/unfreeze/":"/cards/terminate/",{card_id:card!.provider_card_id});}
  catch(error){await admin.rpc("mark_virtual_card_operation",{p_operation_id:op.id,p_status:"unknown",p_provider_status:"transport_error",p_message:"Topupmate card operation response was not received"});return json({success:true,status:"unknown",reference,message:"We are checking this card operation. Do not submit it again."},202);}
  const state=topupmateStatus(q.body);
  if(q.ok&&state==="fail"){
   if(["topup"].includes(action)){
    const {error:refundError}=await admin.rpc("refund_virtual_card_operation",{p_operation_id:op.id,p_provider_status:"fail",p_reason:"Topupmate confirmed card funding failure"});
    return json({success:false,status:refundError?"unknown":"refunded",error:refundError?"Funding failed; contact support for reconciliation.":"Funding failed and your wallet has been refunded."},refundError?202:400);
   }
   await admin.rpc("mark_virtual_card_operation",{p_operation_id:op.id,p_status:"unknown",p_provider_status:"fail",p_message:"Provider rejected card operation; manual status review required"});
   return json({success:false,status:"unknown",error:generic},202);
  }
  if(!q.ok||state==="processing"){
   await admin.rpc("mark_virtual_card_operation",{p_operation_id:op.id,p_status:"unknown",p_provider_status:!q.ok?"http_"+q.httpStatus:"processing",p_provider_reference:topupmateReference(q.body),p_message:"Topupmate operation is processing or requires reconciliation"});
   return json({success:true,status:"processing",reference,message:"Your card operation is processing. Do not submit it again."},202);
  }
  const {error:completeError}=await admin.rpc("complete_virtual_card_operation",{p_operation_id:op.id,p_provider_status:"success",p_provider_reference:topupmateReference(q.body),p_message:"Topupmate confirmed "+action});
  if(completeError)throw new UserError("Topupmate confirmed the operation, but local settlement requires reconciliation.");
  return json({success:true,status:"successful",reference,message:"Card "+action+" completed successfully."});
 }catch(error){
  console.error("Virtual card action failed",{userId:user.id,action,error:String(error)});
  return json({success:false,error:error instanceof UserError?error.message:generic},error instanceof UserError?400:500);
 }
});
