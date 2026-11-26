import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { topupmateGet, topupmatePost, topupmateReference, topupmateMessage } from "../_shared/topupmate.ts";

type Obj=Record<string,any>;
const text=(v:unknown)=>String(v??"").trim();
const number=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
const ref=()=> "TOLISVC_"+crypto.randomUUID().replace(/-/g,"").toUpperCase();
const classify=(body:Obj):"success"|"fail"|"processing"|"unknown"=>{
 const s=text(body?.status??body?.response?.status??body?.data?.status).toLowerCase();
 if(["success","successful","completed","complete","succeeded"].includes(s))return "success";
 if(["fail","failed","error","rejected","declined"].includes(s))return "fail";
 if(["processing","pending","queued","order_received","initiated","in_progress","in-progress","submitted"].includes(s))return "processing";
 return "unknown";
};
const cleanPhone=(v:string)=>{let x=v.replace(/[\s()+-]/g,"");if(/^234\d{10}$/.test(x))x="0"+x.slice(3);if(/^\d{10}$/.test(x))x="0"+x;return /^0\d{10}$/.test(x)?x:"";};
const productCode=(p:Obj)=>text(p?.metadata?.supplier_plan_id)||text(p?.provider_product_code).split(":").slice(1).join(":")||text(p?.provider_product_code);
const resultPayload=(body:Obj)=>body?.response??body?.data??body;

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const authorization=request.headers.get("Authorization")??"";
 if(!authorization.startsWith("Bearer "))return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return json({error:"Service environment is incomplete"},500);
 const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await caller.auth.getUser();
 if(authError||!auth.user)return json({error:"Invalid session"},401);
 let body:Obj;try{body=await request.json();}catch{return json({error:"Invalid request body"},400);}
 const action=text(body.action).toLowerCase();
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const providerOption=async(category:string,type:string,code:string)=>{
  const {data,error}=await admin.from("provider_service_options").select("id,option_code,name,metadata,service_categories!inner(code),service_providers!inner(code)")
   .eq("option_code",code).eq("option_type",type).eq("active",true)
   .eq("service_categories.code",category).eq("service_providers.code","topupmate").maybeSingle();
  if(error||!data)throw new Error("The selected provider is not currently available.");
  return data as Obj;
 };
 try{
  if(action==="verify"){
   const serviceCode=text(body.service);
   if(serviceCode==="cable_tv"){
    const provider=text(body.providerCode),iuc=text(body.iuc).replace(/\s/g,"");
    if(!provider||!/^\d{8,20}$/.test(iuc))return json({error:"Enter a valid provider and SmartCard/IUC number."},400);
    await providerOption("cable_tv","cable_provider",provider);
    const q=await topupmatePost("/cabletv/verify/",{provider,iucnumber:iuc});
    if(!q.ok||classify(q.body)==="fail")return json({error:"We could not verify this SmartCard/IUC number. Check the number and provider."},400);
    const d=resultPayload(q.body),name=text(d?.Customer_Name??d?.customer_name??d?.customername??d?.name??d?.msg);
    if(!name)return json({error:"Topupmate did not return a verified customer name."},502);
    return json({success:true,customerName:name,message:"Cable customer verified."});
   }
   if(serviceCode==="electricity"){
    const provider=text(body.providerCode),meter=text(body.meterNumber).replace(/\s/g,""),meterType=text(body.meterType||"prepaid").toLowerCase();
    if(!provider||!meter||!["prepaid","postpaid"].includes(meterType))return json({error:"Select a disco and meter type, and enter the meter number."},400);
    await providerOption("electricity","operator",provider);
    const q=await topupmatePost("/electricity/verify/",{provider,meternumber:meter,metertype:meterType});
    if(!q.ok||classify(q.body)==="fail")return json({error:"We could not verify this meter. Check the number, disco and meter type."},400);
    const d=resultPayload(q.body),name=text(d?.Customer_Name??d?.customer_name??d?.customername??d?.name);
    return json({success:true,customerName:name||"Verified customer",message:"Meter verified."});
   }
   return json({error:"Verification is not available for this service."},400);
  }
  if(action==="purchase"){
   const category=text(body.categoryCode),productId=text(body.productId),optionType=text(body.optionType),optionCode=text(body.optionCode);
   const idempotency=text(body.idempotencyKey);
   if(!/^[A-Za-z0-9_-]{12,100}$/.test(idempotency))return json({error:"A valid request reference is required."},400);
   const supported=["cable_tv","electricity","recharge_pin","data_pin","education","internet","gift_card"];
   if(!supported.includes(category))return json({error:"This Topupmate service is not enabled yet."},400);
   const quantity=Math.max(1,Math.min(100,Math.floor(number(body.quantity)||1)));
   const recipient=text(body.recipient);
   const faceValue=number(body.amount);
   let product:Obj|null=null;
   if(productId){
    const {data,error}=await admin.from("service_products")
     .select("id,provider_product_code,name,network_or_operator,metadata,face_value,cost_price,service_categories!inner(code),service_providers!inner(code)")
     .eq("id",productId).eq("active",true)
     .eq("service_categories.code",category).eq("service_providers.code","topupmate").maybeSingle();
    if(error||!data)return json({error:"The selected supplier product is no longer available."},409);
    product=data as Obj;
   }
   if(category==="electricity"){
    if(!optionCode||faceValue<500||faceValue>1000000||!/^\d{6,20}$/.test(recipient))return json({error:"Enter a verified meter, provider and valid electricity amount."},400);
    await providerOption("electricity","operator",optionCode);
    const meterType=text(body.meterType||"prepaid").toLowerCase();
    if(!["prepaid","postpaid"].includes(meterType))return json({error:"Choose prepaid or postpaid."},400);
    const verify=await topupmatePost("/electricity/verify/",{provider:optionCode,meternumber:recipient,metertype:meterType});
    const meterData=resultPayload(verify.body);
    const meterOwner=text(meterData?.Customer_Name??meterData?.customer_name??meterData?.customername??meterData?.name);
    if(!verify.ok||classify(verify.body)==="fail"||!meterOwner)return json({error:"Meter verification must return a verified customer before payment."},409);
   } else if(category==="cable_tv"){
    if(!product||!optionCode||!/^\d{8,20}$/.test(recipient))return json({error:"Select a cable package and enter a valid SmartCard/IUC."},400);
    await providerOption("cable_tv","cable_provider",optionCode);
    const verify=await topupmatePost("/cabletv/verify/",{provider:optionCode,iucnumber:recipient});
    const cableData=resultPayload(verify.body);
    const cableOwner=text(cableData?.Customer_Name??cableData?.customer_name??cableData?.customername??cableData?.name);
    if(!verify.ok||classify(verify.body)==="fail"||!cableOwner)return json({error:"SmartCard/IUC verification must return a verified customer before payment."},409);
   } else if(!product && !(category==="internet" && ["alpha","kirani","ratel"].includes(optionCode))){
    return json({error:"Select an active supplier product."},400);
   }
   if(category==="recharge_pin"||category==="data_pin"){
    if(!optionCode||quantity<1||quantity>100)return json({error:"Select a network and a valid PIN quantity."},400);
    await providerOption(category,"network",optionCode);
   }
   if(category==="education"&&quantity>20)return json({error:"Exam PIN quantity cannot exceed 20."},400);
   if(category==="internet"){
    if(!recipient)return json({error:"Enter the ISP account number or phone number."},400);
    if(!optionCode)return json({error:"Select an internet provider."},400);
    await providerOption("internet","internet_provider",optionCode);
    if(optionCode!=="smile" && number(body.amount)<=0)return json({error:"Enter a valid internet top-up amount."},400);
    if(optionCode==="smile" && (!product || text(product.metadata?.source_service)!=="smile"))return json({error:"Select an available Smile bundle."},400);
   }
   if(category==="gift_card"&&(!product||!/^\S+@\S+\.\S+$/.test(recipient)||quantity>20))return json({error:"Select a gift card, enter a valid recipient email and choose a valid quantity."},400);
   const metadata:Obj={quantity};
   if(body.meterType)metadata.meter_type=text(body.meterType);
   if(body.subtype)metadata.subtype=text(body.subtype);
   if(body.accountType)metadata.account_type=text(body.accountType);
   if(body.contactPhone){const phone=cleanPhone(text(body.contactPhone));if(!phone)return json({error:"Enter a valid contact phone number."},400);metadata.contact_phone=phone;}
   if(category==="internet"){metadata.internet_provider=optionCode;metadata.amount_based=optionCode!=="smile";}
   if(category==="gift_card"){
    metadata.supplier_product_id=text(product?.metadata?.supplier_product_id);
    metadata.recipient_denomination=number(product?.face_value);
    metadata.recipient_currency=text(product?.metadata?.recipient_currency||"USD");
   }
   const {data:order,error:reserveError}=await admin.rpc("reserve_topupmate_service_order",{
    p_user_id:auth.user.id,p_category_code:category,p_product_id:product?.id??null,
    p_option_type:category==="cable_tv"?"cable_provider":category==="electricity"?"operator":category==="internet"?"internet_provider":"network",
    p_option_code:optionCode||null,p_recipient:recipient||productCode(product??{}),
    p_face_value:category==="electricity"||category==="internet"&&optionCode!=="smile"?faceValue:null,p_quantity:quantity,
    p_idempotency_key:idempotency,p_service_metadata:metadata,
    p_coupon_code:text(body.couponCode).toUpperCase()||null
   });
   if(reserveError||!order)return json({error:reserveError?.message??"Unable to reserve this purchase."},409);
   if(["successful","processing","unknown","refunded","failed","reversal_pending"].includes(order.status))
    return json({orderId:order.id,status:order.status,reference:order.request_id,reused:true},order.status==="processing"||order.status==="unknown"?202:200);
   const supplierPlan=product?productCode(product):"";
   let path="",payload:Obj={};
   const ref=order.request_id;
   if(category==="cable_tv"){
    path="/cabletv/";payload={provider:optionCode,iucnumber:recipient,plan:supplierPlan,ref,subtype:text(body.subtype||"renew"),phone:cleanPhone(text(body.contactPhone))||undefined};
   }else if(category==="electricity"){
    path="/electricity/";payload={provider:optionCode,meternumber:recipient,amount:faceValue,metertype:text(body.meterType||"prepaid"),phone:cleanPhone(text(body.contactPhone))||undefined,ref};
   }else if(category==="recharge_pin"){
    path="/rechargepin/";payload={network:optionCode,quantity,plan:supplierPlan,businessname:"TolirexData",ref};
   }else if(category==="data_pin"){
    path="/datapin/";payload={network:optionCode,quantity,data_plan:supplierPlan,businessname:"TolirexData",ref};
   }else if(category==="education"){
    path="/exam/";payload={provider:supplierPlan,quantity,ref};
   }else if(category==="gift_card"){
    const supplierProductId=text(product?.metadata?.supplier_product_id);
    const denomination=number(product?.face_value);
    if(!supplierProductId||denomination<=0)throw new Error("Gift card product mapping is incomplete.");
    path="/giftcard/";payload={product:supplierProductId,amount:denomination,email:recipient,sender:"TolirexData Customer",units:quantity,ref};
   }else if(category==="internet"){
    const isp=text(product?.metadata?.source_service||optionCode||"smile");
    if(isp==="smile"){
     const compact=recipient.replace(/[\s+()-]/g,"");
     const actype=/^234\d{10}$/.test(compact)||/^0\d{10}$/.test(compact)?"PhoneNumber":text(body.accountType);
     const phone=/^0\d{10}$/.test(compact)?"234"+compact.slice(1):compact;
     if(!["PhoneNumber","AccountNumber"].includes(actype))return json({error:"Select a valid Smile phone number or 10-digit account number type."},400);
     path="/smile-data/";payload={PhoneNumber:phone,BundleTypeCode:Number(supplierPlan),actype,ref};
    }else{
     const amount=number(body.amount),phone=cleanPhone(recipient);
     if(amount<=0)return json({error:"The selected ISP supplier price is unavailable."},409);
     if(!phone)return json({error:"Enter a valid 11-digit Nigerian ISP phone number."},400);
     path=isp==="alpha"?"/alphatopup/":isp==="kirani"?"/kirani/":"/ratel/";
     payload={phone,amount,ref};
    }
   }
   // Claim the reserved order atomically. Only one request may submit this
   // persistent supplier reference; retries must reconcile, never resubmit.
   const {data:claimed,error:claimError}=await admin.rpc("claim_topupmate_service_order",{p_order_id:order.id});
   if(claimError)return json({orderId:order.id,status:"unknown",reference:ref,message:"Your purchase is reserved and requires reconciliation."},202);
   if(claimed!==true){
    const {data:current}=await admin.from("service_orders").select("status,request_id").eq("id",order.id).maybeSingle();
    return json({orderId:order.id,status:current?.status??"unknown",reference:current?.request_id??ref,reused:true,message:"This purchase has already been submitted or is being processed. Do not submit it again."},202);
   }
   let response;
   try{response=await topupmatePost(path,payload);}catch(error){
    await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:"transport_error",p_message:"Topupmate response was not received"});
    return json({orderId:order.id,status:"unknown",reference:ref,message:"We are checking this purchase. Do not submit it again."},202);
   }
   const state=classify(response.body);
   if(response.ok&&state==="success"){
    const {error}=await admin.rpc("complete_catalogue_service_order",{p_order_id:order.id,p_provider_order_id:topupmateReference(response.body),p_provider_status:"success",p_message:"Topupmate confirmed success"});
    if(error)return json({orderId:order.id,status:"unknown",reference:ref,message:"Supplier success is being reconciled with your wallet."},202);
    let fulfilment=["recharge_pin","data_pin","education"].includes(category)?resultPayload(response.body):null;
    let fulfilmentPending=false;
    if(category==="gift_card"){
     try{
      const redeemed=await topupmateGet("/giftcard/redeem/",{ref});
      if(redeemed.ok&&classify(redeemed.body)!=="fail")fulfilment=resultPayload(redeemed.body);
      else fulfilmentPending=true;
     }catch{fulfilmentPending=true;}
    }
    const couponDiscount=number(order.service_metadata?.coupon_discount);
    return json({orderId:order.id,status:"successful",reference:ref,fulfilment,fulfilmentPending,
     couponCode:text(order.service_metadata?.coupon_code)||null,discountAmount:couponDiscount,chargedAmount:number(order.amount),originalAmount:number(order.service_metadata?.original_amount)||number(order.amount)});
   }
   if(response.ok&&state==="fail"){
    const {error}=await admin.rpc("fail_and_refund_catalogue_service_order",{p_order_id:order.id,p_provider_status:"fail",p_reason:topupmateMessage(response.body)});
    return json({orderId:order.id,status:error?"unknown":"refunded",reference:ref,message:error?"The supplier rejected the purchase; refund reconciliation is required.":"The supplier rejected the purchase and your wallet has been refunded."},error?202:400);
   }
   await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:response.ok?state:"http_"+response.httpStatus,p_message:"Topupmate outcome requires same-reference reconciliation"});
   return json({orderId:order.id,status:"unknown",reference:ref,message:"Your purchase is awaiting supplier confirmation. Do not submit it again."},202);
  }
  if(action==="giftcard_redeem"){
   const reference=text(body.reference);
   if(!reference)return json({error:"Gift-card transaction reference is required."},400);
   const {data:category}=await admin.from("service_categories").select("id").eq("code","gift_card").maybeSingle();
   if(!category)return json({error:"Gift-card service is unavailable."},503);
   const {data:order,error}=await admin.from("service_orders").select("id,status,request_id")
    .eq("user_id",auth.user.id).eq("category_id",category.id).eq("request_id",reference).maybeSingle();
   if(error||!order||order.status!=="successful")return json({error:"A successful gift-card purchase with this reference was not found."},404);
   const redeemed=await topupmateGet("/giftcard/redeem/",{ref:reference});
   if(!redeemed.ok||classify(redeemed.body)==="fail")return json({orderId:order.id,status:"fulfilment_pending",reference,message:"The gift-card code is not available yet. Try retrieving it again shortly."},202);
   return json({orderId:order.id,status:"successful",reference,fulfilment:resultPayload(redeemed.body)});
  }
  if(action==="status"){
   const reference=text(body.reference);
   if(!reference)return json({error:"Transaction reference is required."},400);
   const {data:order,error}=await admin.from("service_orders").select("id,status,request_id,service_metadata").eq("request_id",reference).eq("user_id",auth.user.id).maybeSingle();
   if(error||!order)return json({error:"Transaction not found."},404);
   // Topupmate status lookup uses the confirmed endpoint and original supplier reference.
   const q=await topupmateGet("/transaction/status/",{reference});
   if(!q.ok)return json({orderId:order.id,status:order.status,reference,message:"Supplier status is temporarily unavailable."},202);
   const state=classify(q.body);
   if(state==="success"){
    const {error:settleError}=await admin.rpc("complete_catalogue_service_order",{p_order_id:order.id,p_provider_order_id:topupmateReference(q.body),p_provider_status:"success",p_message:"Topupmate confirmed success"});
    if(settleError)return json({orderId:order.id,status:"unknown",reference},202);
    return json({orderId:order.id,status:"successful",reference});
   }
   if(state==="fail"){
    const {error:refundError}=await admin.rpc("fail_and_refund_catalogue_service_order",{p_order_id:order.id,p_provider_status:"fail",p_reason:topupmateMessage(q.body)});
    return json({orderId:order.id,status:refundError?"unknown":"refunded",reference},refundError?202:200);
   }
   await admin.rpc("mark_service_order_unknown",{p_order_id:order.id,p_provider_status:state,p_message:"Topupmate transaction remains unresolved"});
   return json({orderId:order.id,status:"unknown",reference},202);
  }
  return json({error:"Unsupported service operation."},400);
 }catch(error){
  console.error("Topupmate service operation failed",{userId:auth.user.id,action,error:String(error)});
  return json({error:error instanceof Error?error.message:"Unable to complete this request."},400);
 }
});
