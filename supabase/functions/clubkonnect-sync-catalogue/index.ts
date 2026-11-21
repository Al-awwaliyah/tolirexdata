import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

type JsonRecord = Record<string, unknown>;
type CatalogueEndpoint = { key: string; path: string };
type NormalizedProduct = {
  category: string; code: string; name: string; operator?: string; description?: string;
  faceValue?: number; costPrice: number; metadata: JsonRecord;
};
type NormalizedOption = {
  category: string; type: "network" | "operator" | "cable_provider" | "meter_type";
  code: string; name: string; parentCode?: string; metadata?: JsonRecord;
};

const API_ROOT = "https://www.nellobytesystems.com";
const ENDPOINTS: CatalogueEndpoint[] = [
  { key: "data_networks", path: "/APIDatabundleNetworkV1.asp" },
  { key: "data_plans", path: "/APIDatabundlePlansV2.asp" },
  { key: "airtime_networks", path: "/APIAirtimeNetworkV2.asp" },
  { key: "cable_types", path: "/APICableTVTypeV2.asp" },
  { key: "cable_packages", path: "/APICableTVPackagesV2.asp" },
  { key: "epin_catalogue", path: "/APIEPINDiscountV2.asp" },
];
const CATEGORIES = [
  ["airtime", "Airtime", 10],
  ["data", "Mobile data", 20],
  ["cable_tv", "Cable TV", 30],
  ["electricity", "Electricity", 40],
  ["recharge_pin", "Recharge PINs", 50],
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}
function first(obj: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = textValue(obj[key]);
    if (value) return value;
  }
  return "";
}
function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[₦,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
function walk(value: unknown, visit: (obj: JsonRecord, path: string[]) => void, path: string[] = [], depth = 0) {
  if (depth > 24 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, path, depth + 1));
    return;
  }
  const obj = record(value);
  visit(obj, path);
  for (const [key, child] of Object.entries(obj)) {
    if (child && typeof child === "object") walk(child, visit, [...path, key], depth + 1);
  }
}
function networkFrom(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    mtn: "MTN", airtel: "AIRTEL", glo: "GLO", globacom: "GLO",
    ninemobile: "9MOBILE", "9mobile": "9MOBILE", etisalat: "9MOBILE",
    "01": "01", "02": "02", "03": "03", "04": "04",
  };
  return aliases[normalized] ?? value.trim();
}
function getCode(obj: JsonRecord): string {
  return first(obj, ["ProductCode","product_code","productCode","PackageCode","package_code","packageCode","PRODUCT_ID","product_id","ID","id","code","Code","NetworkCode","network_code","NetworkID","network_id","Network","network","biller_code","billerCode","CableTV","cable_tv","ElectricCompany","electric_company"]);
}
function getName(obj: JsonRecord): string {
  return first(obj, ["ProductName","product_name","productName","PackageName","package_name","packageName","PRODUCT_NAME","Name","name","description","Description","NetworkName","network_name","CableTVName","cable_tv_name","BillerName","biller_name","CompanyName","company_name","ElectricCompanyName","electric_company_name","DiscoName","disco_name","BillerName","biller_name","label","Label"]);
}
function getCost(obj: JsonRecord): number | undefined {
  for (const key of ["PRODUCT_AMOUNT","product_amount","productAmount","PackageAmount","package_amount","packageAmount","provider_amount","providerAmount","Amount","amount","price","Price","cost","Cost"]) {
    const n = numberValue(obj[key]);
    if (n !== undefined && n > 0) return n;
  }
  return undefined;
}
function getNetwork(obj: JsonRecord, path: string[]): string {
  const explicit = first(obj, ["MOBILENETWORK","MobileNetwork","mobile_network","network_code","networkCode","NetworkCode","Network","network","biller_code","billerCode"]);
  if (explicit) return networkFrom(explicit);
  const candidates = [...path].reverse();
  for (const candidate of candidates) {
    const code = networkFrom(candidate);
    if (/^(MTN|AIRTEL|GLO|9MOBILE|01|02|03|04)$/i.test(code)) return code;
  }
  return "";
}
function normalizeData(payload: unknown): { products: NormalizedProduct[]; options: NormalizedOption[] } {
  const products: NormalizedProduct[] = [];
  const options: NormalizedOption[] = [];
  const seen = new Set<string>();
  walk(payload, (obj, path) => {
    const code = getCode(obj);
    const name = getName(obj);
    const network = getNetwork(obj, path);
    const cost = getCost(obj);
    if (code && name && network && cost !== undefined && !seen.has(network + ":" + code)) {
      seen.add(network + ":" + code);
      products.push({
        category: "data", code: network + ":" + code, name, operator: network,
        description: first(obj, ["Validity","validity","Duration","duration","description","Description"]) || undefined,
        costPrice: cost, metadata: { network_code: network, supplier_product_code: code },
      });
    }
    if (network && !options.some((item) => item.code === network)) {
      options.push({ category: "data", type: "network", code: network, name: network });
    }
  });
  return { products, options };
}
function normalizeNamedOptions(payload: unknown, category: string, type: NormalizedOption["type"]): NormalizedOption[] {
  const output = new Map<string, NormalizedOption>();
  walk(payload, (obj) => {
    const code = getCode(obj);
    const name = getName(obj);
    if (code && name && code !== name) output.set(code, { category, type, code, name });
  });
  return [...output.values()];
}
function normalizeCableProducts(payload: unknown): NormalizedProduct[] {
  const output = new Map<string, NormalizedProduct>();
  walk(payload, (obj) => {
    const code = getCode(obj);
    const name = getName(obj);
    const cost = getCost(obj);
    const operator = first(obj, ["CableTV","cable_tv","cableTv","biller_code","billerCode","provider_code","providerCode"]);
    if (!code || !name || cost === undefined) return;
    const key = (operator || "cable") + ":" + code;
    output.set(key, {
      category: "cable_tv", code: key, name, operator: operator || undefined,
      costPrice: cost, metadata: { supplier_package_code: code, cable_provider_code: operator || null },
    });
  });
  return [...output.values()];
}
function normalizeElectricityOptions(payload: unknown): NormalizedOption[] {
  const output = new Map<string, NormalizedOption>();
  walk(payload, (obj) => {
    const code = first(obj, ["ElectricCompany","electricCompany","electric_company","biller_code","billerCode","code","id","ID"]);
    const name = first(obj, ["ElectricCompanyName","electric_company_name","CompanyName","companyName","company_name","BillerName","biller_name","name","Name","label"]);
    if (code && name) output.set("operator:"+code,{category:"electricity",type:"operator",code,name});
    const meters = obj.meterTypes ?? obj.meter_types ?? obj.MeterTypes;
    if (code && Array.isArray(meters)) {
      for (const meterValue of meters) {
        const meter=record(meterValue);
        const meterCode=first(meter,["code","Code","id","ID","MeterType","meterType"]);
        const meterName=first(meter,["name","Name","label","Label","MeterTypeName","meterTypeName"]);
        if (meterCode && meterName) output.set("meter:"+code+":"+meterCode,{category:"electricity",type:"meter_type",code:meterCode,name:meterName,parentCode:code});
      }
    }
  });
  return [...output.values()];
}
function normalizeEpin(payload: unknown): NormalizedProduct[] {
  const output = new Map<string, NormalizedProduct>();
  const walkDiscounts = (value: unknown, inheritedNetwork = "", inheritedDenomination = 0, path: string[] = [], depth = 0) => {
    if (depth > 24 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((child) => walkDiscounts(child, inheritedNetwork, inheritedDenomination, path, depth + 1));
      return;
    }
    if (typeof value !== "object") {
      const discount = numberValue(value);
      if (inheritedNetwork && inheritedDenomination > 0 && discount !== undefined && discount >= 0 && discount < 100) {
        const cost = Math.round(inheritedDenomination * (1 - discount / 100) * 100) / 100;
        const code = inheritedNetwork + ":" + inheritedDenomination;
        output.set(code, {
          category: "recharge_pin", code, name: inheritedNetwork + " " + inheritedDenomination + " Airtime PIN",
          operator: inheritedNetwork, faceValue: inheritedDenomination, costPrice: cost,
          metadata: { network_code: inheritedNetwork, denomination: inheritedDenomination, supplier_discount_percent: discount },
        });
      }
      return;
    }
    const obj = record(value);
    const network = networkFrom(first(obj, ["MOBILENETWORK","MobileNetwork","network_code","networkCode","Network","network"]) || inheritedNetwork || path[path.length - 1] || "");
    const denomination = numberValue(obj.Value ?? obj.value ?? obj.Denomination ?? obj.denomination ?? obj.Amount ?? obj.amount) ?? inheritedDenomination;
    const discount = numberValue(obj.Discount ?? obj.discount ?? obj.discount_percent ?? obj.DiscountPercentage);
    if (network && denomination > 0 && discount !== undefined && discount >= 0 && discount < 100) {
      const code = network + ":" + denomination;
      output.set(code, {
        category: "recharge_pin", code, name: network + " " + denomination + " Airtime PIN",
        operator: network, faceValue: denomination,
        costPrice: Math.round(denomination * (1 - discount / 100) * 100) / 100,
        metadata: { network_code: network, denomination, supplier_discount_percent: discount },
      });
    }
    for (const [key, child] of Object.entries(obj)) {
      if (child && typeof child === "object") {
        const pathNetwork = network || inheritedNetwork || (["01","02","03","04"].includes(key) ? key : "");
        const pathDenomination = numberValue(key) ?? denomination;
        walkDiscounts(child, pathNetwork, pathDenomination, [...path,key], depth + 1);
      } else if (typeof child === "number" || (typeof child === "string" && child.trim())) {
        const leafDiscount = numberValue(child);
        const pathNetwork = network || inheritedNetwork || (["01","02","03","04"].includes(path[path.length-1] ?? "") ? path[path.length-1] : "");
        const pathDenomination = numberValue(key) ?? denomination;
        if (pathNetwork && pathDenomination > 0 && leafDiscount !== undefined && leafDiscount >= 0 && leafDiscount < 100) {
          const code = pathNetwork + ":" + pathDenomination;
          output.set(code, {
            category: "recharge_pin", code, name: pathNetwork + " " + pathDenomination + " Airtime PIN",
            operator: pathNetwork, faceValue: pathDenomination,
            costPrice: Math.round(pathDenomination * (1 - leafDiscount / 100) * 100) / 100,
            metadata: { network_code: pathNetwork, denomination: pathDenomination, supplier_discount_percent: leafDiscount },
          });
        }
      }
    }
  };
  walkDiscounts(payload);
  return [...output.values()];
}
async function fetchCatalogue(endpoint: CatalogueEndpoint, userId: string, apiKey: string) {
  const url = new URL(endpoint.path, API_ROOT);
  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);
  const response = await fetch(url, {
    method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Supplier returned HTTP " + response.status);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Supplier returned an invalid catalogue response");
  const status = String(record(payload).status ?? "").trim().toLowerCase();
  if (status && !["success","ok"].includes(status)) throw new Error("Supplier catalogue status: " + status);
  return payload;
}
async function rpcProduct(admin: ReturnType<typeof createClient>, product: NormalizedProduct) {
  const { data, error } = await admin.rpc("sync_provider_catalogue_product", {
    p_provider_code: "clubkonnect", p_category_code: product.category, p_product_code: product.code,
    p_name: product.name, p_network_or_operator: product.operator ?? null,
    p_description: product.description ?? null, p_face_value: product.faceValue ?? null,
    p_cost_price: product.costPrice, p_metadata: product.metadata,
  });
  if (error) throw error;
  return data as string;
}
async function rpcOption(admin: ReturnType<typeof createClient>, option: NormalizedOption) {
  const { data, error } = await admin.rpc("sync_provider_service_option", {
    p_provider_code: "clubkonnect", p_category_code: option.category,
    p_option_type: option.type, p_option_code: option.code, p_name: option.name,
    p_parent_option_code: option.parentCode ?? null, p_metadata: option.metadata ?? {},
  });
  if (error) throw error;
  return data as string;
}
function normalize(endpointKey: string, payload: unknown) {
  if (endpointKey === "data_plans") return normalizeData(payload);
  if (endpointKey === "data_networks") return { products: [], options: normalizeNamedOptions(payload,"data","network") };
  if (endpointKey === "airtime_networks") return { products: [], options: normalizeNamedOptions(payload,"airtime","network") };
  if (endpointKey === "cable_types") return { products: [], options: normalizeNamedOptions(payload,"cable_tv","cable_provider") };
  if (endpointKey === "cable_packages") return { products: normalizeCableProducts(payload), options: [] };
  if (endpointKey === "epin_catalogue") return { products: normalizeEpin(payload), options: [] };
  return { products: [], options: [] };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supplierUserId = Deno.env.get("CLUBKONNECT_USER_ID");
  const supplierApiKey = Deno.env.get("CLUBKONNECT_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase function environment is incomplete" }, 500);
  if (!supplierUserId || !supplierApiKey) return json({ error: "ClubKonnect credentials are not configured" }, 503);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);
  const { data: permitted, error: permissionError } = await caller.rpc("has_admin_permission", { p_permission: "services.manage" });
  if (permissionError || permitted !== true) return json({ error: "Service management permission required" }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: provider, error: providerError } = await admin.from("service_providers")
    .select("id,code").eq("code","clubkonnect").maybeSingle();
  if (providerError || !provider) return json({ error: "ClubKonnect provider is not registered" }, 409);

  for (const [code,name,sort_order] of CATEGORIES) {
    const { error } = await admin.from("service_categories").upsert({ code,name,sort_order }, { onConflict: "code", ignoreDuplicates: true });
    if (error) return json({ error: "Could not prepare service categories" }, 500);
  }

  const { data: run, error: runError } = await admin.from("provider_catalogue_sync_runs").insert({
    provider_id: provider.id, triggered_by: userData.user.id, trigger_source: "admin", status: "running",
  }).select("id").single();
  if (runError || !run) return json({ error: "Could not create catalogue sync record" }, 500);

  const results = await Promise.all(ENDPOINTS.map(async (endpoint) => {
    try {
      const payload = await fetchCatalogue(endpoint, supplierUserId, supplierApiKey);
      const { error: snapshotError } = await admin.from("provider_catalogue_snapshots").upsert({
        provider_code: "clubkonnect", catalogue_key: endpoint.key, payload,
        fetched_at: new Date().toISOString(), fetch_status: "success", error_summary: null,
      }, { onConflict: "provider_code,catalogue_key" });
      if (snapshotError) throw new Error("Could not persist supplier snapshot");

      const normalized = normalize(endpoint.key, payload);
      let insertedProducts = 0;
      let insertedOptions = 0;
      for (const product of normalized.products) {
        await rpcProduct(admin, product);
        insertedProducts++;
      }
      for (const option of normalized.options) {
        await rpcOption(admin, option);
        insertedOptions++;
      }
      return { key: endpoint.key, status: "success" as const, products: insertedProducts, options: insertedOptions };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown supplier error";
      const { data: previous } = await admin.from("provider_catalogue_snapshots")
        .select("id").eq("provider_code","clubkonnect").eq("catalogue_key",endpoint.key).maybeSingle();
      if (previous?.id) {
        await admin.from("provider_catalogue_snapshots").update({ fetch_status: "failed", error_summary: message })
          .eq("id",previous.id);
      } else {
        await admin.from("provider_catalogue_snapshots").insert({
          provider_code:"clubkonnect",catalogue_key:endpoint.key,payload:{},
          fetch_status:"failed",error_summary:message,
        });
      }
      return { key:endpoint.key,status:"failed" as const,error:message };
    }
  }));

  const electricityCatalogue = Deno.env.get("CLUBKONNECT_ELECTRICITY_BILLERS_JSON");
  if (electricityCatalogue) {
    try {
      const payload = JSON.parse(electricityCatalogue);
      const { error: snapshotError } = await admin.from("provider_catalogue_snapshots").upsert({
        provider_code:"clubkonnect",catalogue_key:"electricity_discos",payload,
        fetched_at:new Date().toISOString(),fetch_status:"success",error_summary:null,
      },{onConflict:"provider_code,catalogue_key"});
      if (snapshotError) throw new Error("Could not persist electricity supplier configuration snapshot");
      const options = normalizeElectricityOptions(payload);
      for (const option of options) await rpcOption(admin,option);
      results.push({key:"electricity_discos",status:"success",products:0,options:options.length});
    } catch (error) {
      results.push({key:"electricity_discos",status:"failed",error:error instanceof Error?error.message:"Invalid electricity supplier configuration"});
    }
  } else {
    results.push({key:"electricity_discos",status:"skipped",products:0,options:0,error:"Supplier-account electricity disco and meter catalogue is not configured."});
  }

  const succeeded = results.filter((item) => item.status === "success").length;
  const failed = results.filter((item) => item.status === "failed" || item.status === "skipped").length;
  const products = results.reduce((sum,item) => sum + (item.status === "success" ? item.products : 0),0);
  const options = results.reduce((sum,item) => sum + (item.status === "success" ? item.options : 0),0);
  const finalStatus = failed === 0 ? "success" : succeeded === 0 ? "failed" : "partial";
  await admin.from("provider_catalogue_sync_runs").update({
    status: finalStatus, discovered_products: products, discovered_options: options,
    inserted_products: products, failed_endpoints: results.filter((item) => item.status === "failed"),
    summary: { endpoints: results.length, succeeded, failed, products, options },
    completed_at: new Date().toISOString(),
  }).eq("id",run.id);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_user_id:userData.user.id,action:"provider.catalogue_sync",target_type:"service_provider",
    target_id:"clubkonnect",after_data:{run_id:run.id,succeeded,failed,products,options},
  });
  if (auditError) return json({ error:"Catalogue sync completed but audit logging failed",run_id:run.id },500);

  return json({
    provider:"clubkonnect",run_id:run.id,completed_at:new Date().toISOString(),
    succeeded,failed,products,options,results,
    note:"Imported products remain unpublished and inactive. Admin must configure account prices and explicitly publish each product. Airtime top-ups are amount-based; recharge PIN products are imported only when supplier discount data can be normalized.",
  },failed===ENDPOINTS.length?502:200);
});
