const LIVE="https://connect.topupmate.com/api/";
export type TopupmateResult={ok:boolean;httpStatus:number;body:any};
export function topupmateBase(){const configured=(Deno.env.get("TOPUPMATE_BASE_URL")??"").trim();if(configured)return configured.replace(/\/+$/,"")+"/";return (Deno.env.get("TOPUPMATE_ENV")??"live").toLowerCase()==="sandbox"?SANDBOX:LIVE;}
export async function topupmateRequest(path:string,init:RequestInit={}):Promise<TopupmateResult>{
 const key=(Deno.env.get("TOPUPMATE_API_KEY")??"").trim();if(!key)throw new Error("Topupmate API key is not configured");
 const headers=new Headers(init.headers);headers.set("Authorization","Token "+key);headers.set("Accept","application/json");if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
 const response=await fetch(topupmateBase()+path.replace(/^\/+/, ""),{...init,headers,signal:init.signal??AbortSignal.timeout(25000)});
 const raw=await response.text();let body:any;try{body=raw?JSON.parse(raw):null}catch{body={status:response.ok?"success":"fail",msg:raw}};
 return {ok:response.ok,httpStatus:response.status,body};
}
export const topupmatePost=(path:string,body:Record<string,unknown>)=>topupmateRequest(path,{method:"POST",body:JSON.stringify(body)});
export const topupmateGet=(path:string,params:Record<string,unknown>={})=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&String(v)!=="")q.set(k,String(v));return topupmateRequest(path+(q.size?"?"+q.toString():""),{method:"GET"});};
export function topupmateStatus(body:any):"success"|"processing"|"fail"{const x=String(body?.status??body?.data?.status??body?.response?.status??"").toLowerCase();if(["success","successful","completed","complete","succeeded"].includes(x))return "success";if(["processing","pending","queued","initiated","in_progress","in-progress"].includes(x))return "processing";return "fail";}
export function topupmateReference(body:any){const x=body?.transref??body?.transaction_reference??body?.reference??body?.ref??body?.data?.transref??body?.data?.transaction_reference??body?.data?.reference??body?.data?.ref;return x?String(x):null;}
export function topupmateMessage(body:any){return String(body?.msg??body?.message??body?.error??body?.data?.msg??body?.data?.message??"Topupmate request failed").slice(0,500);}
