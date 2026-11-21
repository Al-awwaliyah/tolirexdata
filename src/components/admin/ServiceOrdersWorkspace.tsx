import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Order = { id:string; user_id:string; request_id:string; recipient:string; amount:number; currency:string; status:string; provider_status:string|null; created_at:string; service_categories?:{name:string}|null; service_providers?:{name:string}|null };

export function ServiceOrdersWorkspace() {
  const [orders,setOrders] = useState<Order[]>([]);
  const [total,setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const [status,setStatus] = useState("all");
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const load = async () => {
    setBusy(true);
    const {data,error:invokeError} = await supabase.functions.invoke("admin-console",{body:{action:"transactions",page,pageSize:25,status:status==="all"?"":status,search}});
    if(invokeError || data?.error) { setError(data?.error || invokeError?.message || "Unable to load orders"); setOrders([]); setTotal(0); }
    else { setError(""); setOrders(data?.orders ?? []); setTotal(data?.total ?? 0); }
    setBusy(false);
  };
  useEffect(()=>{void load();},[page,status]);
  return <section className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Service order investigation</h2><p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} Airtime and Data orders</p></div><button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"><RefreshCw size={13} className={busy?"animate-spin":""}/> Refresh</button></div>
      <div className="mt-4 flex flex-wrap gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);void load();}}} placeholder="Search RequestID or recipient" className="min-w-[220px] flex-1 rounded-xl border px-3 py-2 text-xs"/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="rounded-xl border px-3 py-2 text-xs"><option value="all">All statuses</option>{["pending","processing","unknown","successful","failed","refunded","reversal_pending"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select><button onClick={()=>{setPage(1);void load();}} className="rounded-xl bg-[#14366f] px-4 py-2 text-xs font-semibold text-white"><Search size={13}/></button></div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b text-[10px] uppercase text-slate-400"><th className="p-3">Request / Recipient</th><th className="p-3">Customer ID</th><th className="p-3">Service</th><th className="p-3">Amount</th><th className="p-3">Provider state</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead><tbody>
      {busy ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">Loading orders…</td></tr> : orders.length===0 ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">No matching orders.</td></tr> : orders.map(o=><tr key={o.id} className="border-b border-slate-50"><td className="p-3"><strong>{o.request_id}</strong><div className="mt-1 text-slate-400">{o.recipient}</div></td><td className="p-3 font-mono text-[10px]">{o.user_id}</td><td className="p-3">{o.service_categories?.name ?? "Service"}</td><td className="p-3 font-semibold">₦{Number(o.amount).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td className="p-3">{o.provider_status || "Awaiting supplier"}</td><td className="p-3 capitalize">{o.status.replace(/_/g," ")}</td><td className="p-3">{new Date(o.created_at).toLocaleString("en-NG")}</td></tr>)}
    </tbody></table></div>
    <div className="flex items-center justify-between text-xs text-slate-500"><span>{total.toLocaleString()} orders · Page {page} / {Math.max(1,Math.ceil(total/25))}</span><div className="flex gap-2"><button disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page>=Math.ceil(total/25)||busy} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
    <p className="text-[11px] text-slate-500">Read-only investigation. Supplier outcomes must be confirmed before an order is settled or refunded. No manual wallet adjustment is exposed.</p>
  </section>;
}