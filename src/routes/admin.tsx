import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity, ArrowDownToLine, ArrowLeftRight, BadgePercent, Bell, Building2,
  ChartNoAxesCombined, CheckCircle2, ChevronDown, CircleHelp, ClipboardList,
  CreditCard, Database, FileCheck2, Gift, Globe2, Headset, LayoutDashboard,
  LifeBuoy, LockKeyhole, LogOut, Menu, Network, Package, PanelLeftClose,
  RefreshCw, Search, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Users, Wallet, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDexAuth } from "@/lib/dex-auth";
import { ServiceOrdersWorkspace } from "@/components/admin/ServiceOrdersWorkspace";

type ModuleItem = { id: string; label: string; group: string; icon: typeof LayoutDashboard; description: string; capabilities: string[] };
const modules: ModuleItem[] = [
  { id: "overview", label: "Overview", group: "Workspace", icon: LayoutDashboard, description: "A live operational picture of the TolirexData platform.", capabilities: ["Platform health and activity", "Financial and transaction snapshots", "Pending operational tasks", "Service and provider status"] },
  { id: "customers", label: "Customers", group: "People & Accounts", icon: Users, description: "Manage personal customer accounts, access, profiles and customer lifecycle.", capabilities: ["Customer directory and profiles", "Account status, restrictions and access", "Customer activity and transaction history", "Account support context"] },
  { id: "kyc", label: "KYC & Compliance", group: "People & Accounts", icon: FileCheck2, description: "Review identity applications and manage compliance workflows.", capabilities: ["Pending KYC review queue", "Verification decisions and review notes", "KYC levels and account eligibility", "Compliance cases and audit trail"] },
  { id: "agents", label: "Agents & Resellers", group: "People & Accounts", icon: Network, description: "Onboard and operate agent and reseller accounts.", capabilities: ["Applications and approval", "Agent tiers and pricing", "Commissions and performance", "Suspension, limits and account controls"] },
  { id: "businesses", label: "Businesses", group: "People & Accounts", icon: Building2, description: "Manage verified business accounts and their teams.", capabilities: ["Business applications and verification", "Business members and roles", "Business pricing and transaction limits", "Statements and account reporting"] },
  { id: "wallets", label: "Wallets & Ledger", group: "Finance", icon: Wallet, description: "Monitor customer balances and the platform's accounting records.", capabilities: ["Wallet and ledger account monitoring", "Double-entry journal inspection", "Audited adjustments through controlled workflows", "Balance integrity and reconciliation"] },
  { id: "virtual-accounts", label: "Virtual Accounts", group: "Finance", icon: CreditCard, description: "Monitor permanent virtual accounts and their lifecycle.", capabilities: ["Account issuance status", "Provider references and masked account details", "Failed issuance investigations", "Account status and reconciliation"] },
  { id: "virtual-cards", label: "Virtual Cards", group: "Finance", icon: CreditCard, description: "Monitor customer virtual-card issuance, status, funding and lifecycle operations.", capabilities: ["Card issuance and provider references", "Masked card details and ownership", "Funding, withdrawal and FX reconciliation", "Freeze, unfreeze and termination investigations"] },
  { id: "fundings", label: "Deposits & Funding", group: "Finance", icon: ArrowDownToLine, description: "Track incoming transfers, payment events and deposit settlement.", capabilities: ["Funding event timeline", "Webhook and verification status", "Unmatched and pending deposits", "Idempotent settlement and reconciliation"] },
  { id: "transactions", label: "Transactions", group: "Operations", icon: ArrowLeftRight, description: "Investigate purchases, provider requests, refunds and transaction outcomes.", capabilities: ["All transaction and order records", "Provider request IDs and status checks", "Refund and reversal workflow", "Exception and stuck-order queue"] },
  { id: "catalogue", label: "Service Catalogue", group: "Services & Providers", icon: ShoppingBag, description: "Publish the live catalogue synchronized from Topupmate and future suppliers.", capabilities: ["Provider-sourced service categories and products", "Catalogue synchronization and freshness", "Customer-safe product publication", "Availability controls without hardcoded supplier plans"] },
  { id: "providers", label: "Providers", group: "Services & Providers", icon: Database, description: "Configure provider connections, priority and operational health.", capabilities: ["Topupmate connection and sync health", "Provider enablement and priority", "Future multi-provider routing and failover", "Credential configuration status (secrets remain server-side)"] },
  { id: "pricing", label: "Pricing & Fees", group: "Services & Providers", icon: SlidersHorizontal, description: "Control commercial pricing without editing supplier catalogue data.", capabilities: ["Global markups and service fees", "Personal, agent and business pricing", "Commission rules", "Margin and below-cost safeguards"] },
  { id: "referrals", label: "Referrals", group: "Growth", icon: Gift, description: "Manage referral acquisition and qualifying rewards.", capabilities: ["Referral codes and attribution", "Qualification and fraud checks", "Pending, settled and reversed rewards", "Ambassador programme controls"] },
  { id: "promotions", label: "Coupons & Campaigns", group: "Growth", icon: BadgePercent, description: "Run promotions within controlled budgets and margin rules.", capabilities: ["Coupon creation and redemption limits", "Campaign schedules and eligibility", "Cashback and promotional budgets", "Promotion performance reporting"] },
  { id: "loyalty", label: "Loyalty & Rewards", group: "Growth", icon: Gift, description: "Operate customer loyalty balances and reward activity.", capabilities: ["Loyalty accounts and transactions", "Reward rules and eligibility", "Cashback settlement monitoring", "Reversal and expiry controls"] },
  { id: "notifications", label: "Notifications", group: "Engagement", icon: Bell, description: "Manage platform announcements and delivery channels.", capabilities: ["In-app, push, email and SMS", "Templates and audience targeting", "Delivery status and retry monitoring", "Customer notification preferences"] },
  { id: "support", label: "Support & Disputes", group: "Engagement", icon: Headset, description: "Resolve customer issues and transaction disputes.", capabilities: ["Support ticket queue and assignment", "Dispute investigation and resolution", "Internal notes and response history", "Escalation and service-level tracking"] },
  { id: "reports", label: "Reports & Analytics", group: "Insights", icon: ChartNoAxesCombined, description: "Understand platform performance and financial operations.", capabilities: ["Transaction volume and success rates", "Revenue, margin and provider costs", "Customer, agent and business growth", "Exports and period comparisons"] },
  { id: "settings", label: "Platform Settings", group: "System", icon: Settings2, description: "Control platform-wide settings and launch behaviour.", capabilities: ["Feature flags and maintenance mode", "Registration and account policies", "Fees, limits and service availability", "Branding and platform configuration"] },
  { id: "admins", label: "Admin Team & Roles", group: "System", icon: ShieldCheck, description: "Manage staff access using least-privilege roles.", capabilities: ["Super Admin, Operations, Finance and Support", "Marketing and Compliance roles", "Permission assignment and access review", "Privileged action confirmations"] },
  { id: "audit", label: "Audit Logs", group: "System", icon: ClipboardList, description: "Review sensitive administrative and system activity.", capabilities: ["Actor, action and target history", "Before-and-after change records", "Financial and permission change review", "Security investigation trail"] },
];


function TopupmateBalancePanel({ onError }: { onError: (message: string) => void }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-console", { body: { action: "topupmate_balance" } });
    if (error || data?.error) {
      setBalance(null);
      onError(data?.error ?? error?.message ?? "Unable to retrieve Topupmate wallet balance.");
    } else {
      setBalance(Number(data.balance));
      setCurrency(String(data.currency ?? "NGN"));
      setCheckedAt(data.checkedAt ?? null);
      onError("");
    }
    setHasChecked(true);
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-medium text-slate-500">Topupmate supplier wallet</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{balance === null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(balance)}</h2><p className="mt-1 text-xs text-slate-500">{checkedAt ? "Live provider balance · checked " + new Date(checkedAt).toLocaleString() : hasChecked ? "Balance unavailable" : "Checking provider account…"}</p></div>
      <button onClick={() => void load()} disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={"mr-1 inline "+(busy?"animate-spin":"")}/>{busy?"Checking…":"Refresh balance"}</button>
    </div>
    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Read-only account balance retrieved directly from Topupmate. This is your supplier wallet balance, not the total of customer wallets. Provider credentials remain server-side.</div>
  </section>;
}

function AdminDataWorkspace({ moduleId, moduleLabel, onError }: { moduleId: string; moduleLabel: string; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const pageSize = 25;
  const [walletView,setWalletView] = useState<"wallets"|"ledger">("wallets");
  const [adjustment,setAdjustment] = useState({userId:"",amount:"",direction:"credit",reason:"",requestId:""});
  const [adjustmentSaving,setAdjustmentSaving] = useState(false);
  const reconcileFunding = async (id:string) => {
    setReviewing(id);
    const {data,error}=await supabase.functions.invoke("admin-console",{body:{action:"funding_reconcile",id}});
    if(error||data?.error) onError(data?.error??error?.message??"Deposit reconciliation failed.");
    else {onError("");await load();}
    setReviewing(null);
  };
  const setWalletStatus = async (userId:string,status:"active"|"frozen") => {
    setReviewing(userId);
    const {data,error}=await supabase.functions.invoke("admin-console",{body:{action:"wallet_status",userId,status,reason:status==="frozen"?"Admin wallet freeze":"Admin wallet reactivation"}});
    if(error||data?.error) onError(data?.error??error?.message??"Unable to update wallet status.");
    else {onError("");await load();}
    setReviewing(null);
  };
  const submitAdjustment = async () => {
    setAdjustmentSaving(true);
    const {data,error}=await supabase.functions.invoke("admin-console",{body:{action:"wallet_adjustment",userId:adjustment.userId,requestId:adjustment.requestId,amount:Number(adjustment.amount),direction:adjustment.direction,reason:adjustment.reason}});
    if(error||data?.error) onError(data?.error??error?.message??"Wallet adjustment failed.");
    else {onError("");setAdjustment({userId:"",amount:"",direction:"credit",reason:"",requestId:""});await load();}
    setAdjustmentSaving(false);
  };

  const [campaign,setCampaign] = useState({code:"",description:"",discountType:"fixed",discountValue:"",minOrderAmount:"0",perUserLimit:"1",active:true});
  const [campaignSaving,setCampaignSaving] = useState(false);
  const setCampaignStatus = async (id:string, active:boolean) => {
    setReviewing(id);
    const {data,error}=await supabase.functions.invoke("admin-console",{body:{action:"coupon_status",id,active}});
    if(error||data?.error) onError(data?.error??error?.message??"Unable to update campaign.");
    else {onError("");await load();}
    setReviewing(null);
  };
  const saveCampaign = async () => {
    setCampaignSaving(true);
    const {data,error} = await supabase.functions.invoke("admin-console",{body:{action:"coupon_save",...campaign,discountValue:Number(campaign.discountValue),minOrderAmount:Number(campaign.minOrderAmount),perUserLimit:Number(campaign.perUserLimit)}});
    if(error||data?.error) onError(data?.error??error?.message??"Unable to save campaign.");
    else {setCampaign({code:"",description:"",discountType:"fixed",discountValue:"",minOrderAmount:"0",perUserLimit:"1",active:true});onError("");await load();}
    setCampaignSaving(false);
  };

  const aliases: Record<string,string> = { admins: "admin-team" };
  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-console", {
      body: { action: "workspace", module: moduleId === "wallets" ? walletView : (aliases[moduleId] ?? moduleId), page, pageSize, search },
    });
    if (error || data?.error) { setRows([]); setTotal(0); onError(data?.error ?? error?.message ?? "Unable to load this workspace."); }
    else if (data?.metrics) { setRows(Object.entries(data.metrics).map(([metric, value]) => ({ metric, value }))); setTotal(Object.keys(data.metrics).length); onError(""); }
    else { setRows(data?.rows ?? []); setTotal(data?.total ?? 0); onError(""); }
    setBusy(false);
  };
  useEffect(() => { void load(); }, [moduleId, page, walletView]);
  const review = async (id: string, decision: "approved" | "rejected" | "needs_information") => {
    setReviewing(id);
    const { data, error } = await supabase.functions.invoke("review-kyc", { body: { kyc_record_id: id, decision, review_note: note } });
    if (error || data?.error) onError(data?.error ?? error?.message ?? "KYC review failed.");
    else { onError(""); setNote(""); await load(); }
    setReviewing(null);
  };
  const filteredRows = moduleId === "kyc" && statusFilter !== "all" ? rows.filter(r => r.status === statusFilter) : rows;
  const isAccountApplication = moduleId === "agents" || moduleId === "businesses";
  const decideAccount = async (id: string, status: "active" | "rejected") => {
    setReviewing(id);
    const { data, error } = await supabase.functions.invoke("admin-console", { body: { action: "account_application", module: moduleId, id, status } });
    if (error || data?.error) onError(data?.error ?? error?.message ?? "Unable to update account application.");
    else { onError(""); await load(); }
    setReviewing(null);
  };
  const columns = rows.length ? Object.keys(rows[0]).filter(k => !["identity_ciphertext","document_storage_path","raw_payload","metadata","safe_provider_metadata","before_data","after_data","ip_hash"].includes(k)) : [];
  const title = moduleId === "kyc" ? "Identity review queue" : moduleId === "fundings" ? "Incoming transfer and settlement records" : moduleId === "wallets" ? (walletView === "ledger" ? "Double-entry ledger entries" : "Wallet accounts") : moduleLabel + " records";
  return <section className="space-y-4">
    {moduleId==="providers"&&<TopupmateBalancePanel onError={onError}/>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} records · live database</p></div><button onClick={()=>void load()} disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-600"><RefreshCw size={13} className={"mr-1 inline "+(busy?"animate-spin":"")}/> Refresh</button></div>
      <div className="mt-4 flex flex-wrap gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setPage(1);void load();}}} placeholder="Search records" className="min-w-[220px] flex-1 rounded-xl border px-3 py-2 text-xs"/>{moduleId==="kyc"&&<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-xs"><option value="all">All statuses</option>{["pending","approved","rejected","needs_information"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select>}<button onClick={()=>{setPage(1);void load();}} className="rounded-xl bg-[#14366f] px-4 py-2 text-xs font-semibold text-white">Search</button></div>
      {moduleId==="wallets"&&<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">Finance view</span><button onClick={()=>{setWalletView("wallets");setPage(1);}} className={walletView==="wallets"?"rounded-lg bg-[#14366f] px-3 py-2 text-xs font-semibold text-white":"rounded-lg border px-3 py-2 text-xs"}>Wallet accounts</button><button onClick={()=>{setWalletView("ledger");setPage(1);}} className={walletView==="ledger"?"rounded-lg bg-[#14366f] px-3 py-2 text-xs font-semibold text-white":"rounded-lg border px-3 py-2 text-xs"}>Ledger entries</button></div>}
      {moduleId==="kyc"&&<div className="mt-4 rounded-xl bg-slate-50 p-3"><label className="block text-xs font-medium text-slate-600">Review note (optional)<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} className="mt-2 w-full rounded-lg border bg-white p-2 text-xs" rows={2}/></label><p className="mt-2 text-[10px] text-slate-500">Identity numbers and encrypted documents are never displayed in this table. Approval records the reviewer and decision.</p></div>}
    </div>
    {moduleId==="wallets"&&walletView==="wallets"&&adjustment.userId&&<div className="rounded-2xl border border-blue-100 bg-white p-5">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Wallet adjustment</h3><p className="mt-1 text-xs text-slate-500">Customer: {adjustment.userId}. Every adjustment posts a balanced journal and customer wallet activity record.</p></div><button onClick={()=>setAdjustment({userId:"",amount:"",direction:"credit",reason:""})} className="rounded-lg border px-3 py-2 text-xs">Close</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">Direction<select value={adjustment.direction} onChange={e=>setAdjustment(v=>({...v,direction:e.target.value}))} className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5"><option value="credit">Credit wallet</option><option value="debit">Debit wallet</option></select></label><label className="text-xs font-medium">Amount (NGN)<input type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={e=>setAdjustment(v=>({...v,amount:e.target.value}))} className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label><label className="text-xs font-medium">Reason<input value={adjustment.reason} maxLength={500} onChange={e=>setAdjustment(v=>({...v,reason:e.target.value}))} placeholder="Explain the adjustment" className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label></div>
      <div className="mt-4 flex justify-end"><button onClick={()=>void submitAdjustment()} disabled={adjustmentSaving||!adjustment.amount||Number(adjustment.amount)<=0||!adjustment.reason.trim()||adjustment.reason.trim().length<5} className="rounded-xl bg-[#14366f] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{adjustmentSaving?"Posting journal…":"Confirm audited adjustment"}</button></div>
    </div>}
    {moduleId==="promotions"&&<div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold">Create coupon campaign</h3>
      <p className="mt-1 text-xs text-slate-500">Saved campaigns are managed centrally and validated by the server at redemption.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium">Coupon code<input value={campaign.code} onChange={e=>setCampaign(v=>({...v,code:e.target.value.toUpperCase()}))} maxLength={32} placeholder="WELCOME10" className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label>
        <label className="text-xs font-medium">Discount type<select value={campaign.discountType} onChange={e=>setCampaign(v=>({...v,discountType:e.target.value}))} className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5"><option value="fixed">Fixed amount (₦)</option><option value="percentage">Percentage (%)</option></select></label>
        <label className="text-xs font-medium">Discount value<input type="number" min="0.01" value={campaign.discountValue} onChange={e=>setCampaign(v=>({...v,discountValue:e.target.value}))} className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label>
        <label className="text-xs font-medium">Minimum order (₦)<input type="number" min="0" value={campaign.minOrderAmount} onChange={e=>setCampaign(v=>({...v,minOrderAmount:e.target.value}))} className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label>
        <label className="text-xs font-medium">Per-user limit<input type="number" min="1" step="1" value={campaign.perUserLimit} onChange={e=>setCampaign(v=>({...v,perUserLimit:e.target.value}))} className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label>
      </div>
      <label className="mt-3 block text-xs font-medium">Description<textarea value={campaign.description} onChange={e=>setCampaign(v=>({...v,description:e.target.value}))} maxLength={500} rows={2} className="mt-1.5 w-full rounded-lg border px-3 py-2.5"/></label>
      <div className="mt-4 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={campaign.active} onChange={e=>setCampaign(v=>({...v,active:e.target.checked}))}/> Activate campaign</label><button onClick={()=>void saveCampaign()} disabled={campaignSaving||!campaign.code.trim()||!campaign.discountValue||!Number.isFinite(Number(campaign.discountValue))||Number(campaign.discountValue)<=0||Number(campaign.minOrderAmount)<0||Number(campaign.perUserLimit)<1} className="rounded-xl bg-[#14366f] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{campaignSaving?"Saving…":"Create campaign"}</button></div>
    </div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">{columns.map(k=><th key={k} className="p-3">{k.replace(/_/g," ")}</th>)}{(moduleId==="kyc"||isAccountApplication||moduleId==="promotions"||(moduleId==="wallets"&&walletView==="wallets")||moduleId==="fundings")&&<th className="p-3">Actions</th>}</tr></thead><tbody>
      {busy?<tr><td colSpan={columns.length+((moduleId==="kyc"||isAccountApplication||moduleId==="promotions"||(moduleId==="wallets"&&walletView==="wallets")||moduleId==="fundings")?1:0)} className="p-10 text-center text-slate-400">Loading records…</td></tr>:filteredRows.length===0?<tr><td colSpan={columns.length+1} className="p-10 text-center text-slate-400">No records found.</td></tr>:filteredRows.map((row,i)=><tr key={String(row.id??row.user_id??i)} className="border-b border-slate-50">{columns.map(k=><td key={k} className="max-w-[260px] truncate p-3 text-slate-600">{typeof row[k]==="object"&&row[k]!==null?"—":String(row[k]??"—")}</td>)}{moduleId==="kyc"&&<td className="p-3"><div className="flex flex-wrap gap-1">{row.status==="pending"?<><button disabled={reviewing===String(row.id)} onClick={()=>void review(String(row.id),"approved")} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-semibold text-white">Approve</button><button disabled={reviewing===String(row.id)} onClick={()=>void review(String(row.id),"rejected")} className="rounded-md bg-rose-600 px-2 py-1.5 text-[10px] font-semibold text-white">Reject</button><button disabled={reviewing===String(row.id)} onClick={()=>void review(String(row.id),"needs_information")} className="rounded-md border px-2 py-1.5 text-[10px] font-semibold">Request info</button></>:<span className="text-[10px] text-slate-400">Reviewed</span>}</div></td>}{isAccountApplication&&<td className="p-3"><div className="flex flex-wrap gap-1">{row.status==="pending"?<><button disabled={reviewing===String(row.id)} onClick={()=>void decideAccount(String(row.id),"active")} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-semibold text-white">Approve</button><button disabled={reviewing===String(row.id)} onClick={()=>void decideAccount(String(row.id),"rejected")} className="rounded-md bg-rose-600 px-2 py-1.5 text-[10px] font-semibold text-white">Reject</button></>:<span className="text-[10px] text-slate-400">Reviewed</span>}</div></td>}{moduleId==="promotions"&&<td className="p-3"><button disabled={reviewing===String(row.id)} onClick={()=>void setCampaignStatus(String(row.id),row.active!==true)} className={row.active===true?"rounded-md border border-amber-200 px-3 py-1.5 text-[10px] font-semibold text-amber-700":"rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white"}>{reviewing===String(row.id)?"Saving…":row.active===true?"Pause":"Activate"}</button></td>}{moduleId==="wallets"&&walletView==="wallets"&&<td className="p-3"><div className="flex flex-wrap gap-1"><button onClick={()=>setAdjustment({userId:String(row.user_id),amount:"",direction:"credit",reason:"",requestId:crypto.randomUUID()})} className="rounded-md bg-[#14366f] px-2 py-1.5 text-[10px] font-semibold text-white">Adjust</button><button disabled={reviewing===String(row.user_id)} onClick={()=>void setWalletStatus(String(row.user_id),row.wallet_status==="frozen"?"active":"frozen")} className="rounded-md border px-2 py-1.5 text-[10px] font-semibold">{row.wallet_status==="frozen"?"Unfreeze":"Freeze"}</button></div></td>}{moduleId==="fundings"&&<td className="p-3">{row.provider==="flutterwave"&&["received","verified"].includes(String(row.status))?<button disabled={reviewing===String(row.id)} onClick={()=>void reconcileFunding(String(row.id))} className="rounded-md bg-[#14366f] px-3 py-1.5 text-[10px] font-semibold text-white">{reviewing===String(row.id)?"Verifying…":"Verify & settle"}</button>:<span className="text-[10px] text-slate-400">{row.status==="credited"?"Settled":"No action"}</span>}</td>}</tr>)}
    </tbody></table></div>
    <div className="flex items-center justify-between text-xs text-slate-500"><span>{total.toLocaleString()} records · Page {page} / {Math.max(1,Math.ceil(total/pageSize))}</span><div className="flex gap-2"><button disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page>=Math.ceil(total/pageSize)||busy} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
    <p className="text-[11px] text-slate-500">Administrative access is permission-checked by the server. Sensitive payloads and identity documents are intentionally excluded.</p>
  </section>;
}

export const Route = createFileRoute("/admin")({ component: AdminDashboard });

function AdminDashboard() {
  const { user, loading } = useDexAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signals, setSignals] = useState<Record<string, number | null>>({});
  const [customers, setCustomers] = useState<Array<{id:string;email:string;full_name:string;phone:string;created_at:string;account_type:string;kyc_level:number;account_status:string}>>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [catalogueProducts, setCatalogueProducts] = useState<any[]>([]);
  const [catalogueOptions, setCatalogueOptions] = useState<any[]>([]);
  const [catalogueProviders, setCatalogueProviders] = useState<any[]>([]);
  const [catalogueRuns, setCatalogueRuns] = useState<any[]>([]);
  const [catalogueCanPrice, setCatalogueCanPrice] = useState(false);
  const [catalogueCanManageProviders, setCatalogueCanManageProviders] = useState(false);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueSyncing, setCatalogueSyncing] = useState(false);
  const [catalogueDrafts, setCatalogueDrafts] = useState<Record<string,{personal:string;agent:string;business:string}>>({});
  const [airtimePricingDrafts, setAirtimePricingDrafts] = useState<Record<string,{discountFactor:string;minimumAmount:string;maximumAmount:string}>>({});
  const [catalogueSaving, setCatalogueSaving] = useState<string | null>(null);
  const [cardPricing, setCardPricing] = useState({cardCreationEnabled:false,creationFeeUsd:"",minimumInitialFundingUsd:"",creationMarkupUsd:"",topupMinimumUsd:"",topupMarkupPercent:""});
  const [cardPricingLoading, setCardPricingLoading] = useState(false);
  const [cardPricingSaving, setCardPricingSaving] = useState(false);
  const [electricityPricing,setElectricityPricing]=useState<Record<"personal"|"agent"|"business",{markupType:"fixed"|"percentage";markupValue:string}>>({
    personal:{markupType:"fixed",markupValue:"0"},agent:{markupType:"fixed",markupValue:"0"},business:{markupType:"fixed",markupValue:"0"}
  });
  const [electricityPricingLoading,setElectricityPricingLoading]=useState(false);
  const [electricityPricingSaving,setElectricityPricingSaving]=useState<string|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const current = modules.find((item) => item.id === active) ?? modules[0];

  useEffect(() => {
    let alive = true;
    if (loading) return;
    if (!user) { setAuthorized(false); setChecking(false); return; }
    void supabase.rpc("is_platform_admin").then(({ data, error: rpcError }) => {
      if (!alive) return;
      setAuthorized(!rpcError && data === true);
      setChecking(false);
      if (rpcError) setError("Unable to verify administrator access. Please contact the platform owner.");
    });
    return () => { alive = false; };
  }, [user?.id, loading]);

  const loadElectricityPricing = async () => {
    setElectricityPricingLoading(true);
    const {data,error:invokeError}=await supabase.functions.invoke("admin-console",{body:{action:"electricity_pricing"}});
    if(invokeError||data?.error){setError(data?.error||invokeError?.message||"Unable to load electricity pricing.");}
    else{
      const next:any={personal:{markupType:"fixed",markupValue:"0"},agent:{markupType:"fixed",markupValue:"0"},business:{markupType:"fixed",markupValue:"0"}};
      for(const row of data?.pricing??[])if(["personal","agent","business"].includes(row.account_type))next[row.account_type]={markupType:row.markup_type,markupValue:String(row.markup_value??0)};
      setElectricityPricing(next);
    }
    setElectricityPricingLoading(false);
  };
  const saveElectricityPricing = async (accountType:"personal"|"agent"|"business") => {
    const draft=electricityPricing[accountType];setElectricityPricingSaving(accountType);setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("admin-console",{body:{action:"electricity_pricing",save:true,accountType,markupType:draft.markupType,markupValue:Number(draft.markupValue)}});
    if(invokeError||data?.error)setError(data?.error||invokeError?.message||"Unable to save electricity pricing.");
    else await loadElectricityPricing();
    setElectricityPricingSaving(null);
  };

  const loadCardPricing = async () => {
    setCardPricingLoading(true);
    const {data,error:invokeError}=await supabase.functions.invoke("admin-console",{body:{action:"card_pricing"}});
    if(invokeError||data?.error){setError(data?.error||invokeError?.message||"Unable to load card pricing.");}
    else if(data?.pricing){const p=data.pricing;setCardPricing({cardCreationEnabled:p.card_creation_enabled===true,creationFeeUsd:String(p.creation_fee_usd??0),minimumInitialFundingUsd:String(p.minimum_initial_funding_usd??0),creationMarkupUsd:String(p.creation_markup_usd??0),topupMinimumUsd:String(p.topup_minimum_usd??0),topupMarkupPercent:String(p.topup_markup_percent??0)});}
    setCardPricingLoading(false);
  };
  const saveCardPricing = async () => {
    setCardPricingSaving(true);setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("admin-console",{body:{action:"card_pricing",save:true,...cardPricing,creationFeeUsd:Number(cardPricing.creationFeeUsd),minimumInitialFundingUsd:Number(cardPricing.minimumInitialFundingUsd),creationMarkupUsd:Number(cardPricing.creationMarkupUsd),topupMinimumUsd:Number(cardPricing.topupMinimumUsd),topupMarkupPercent:Number(cardPricing.topupMarkupPercent)}});
    if(invokeError||data?.error)setError(data?.error||invokeError?.message||"Unable to save card pricing.");
    else {setError("");await loadCardPricing();}
    setCardPricingSaving(false);
  };

  const loadOverview = async () => {
    setRefreshing(true);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: { action: "overview" },
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Unable to load administrator metrics.");
      setSignals({});
    } else {
      setError("");
      setSignals(data?.metrics ?? {});
    }
    setRefreshing(false);
  };

  const loadCustomers = async (page = customerPage, search = customerSearch) => {
    setCustomersLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: { action: "customers", page, pageSize: 20, search },
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Unable to load customer directory.");
      setCustomers([]);
      setCustomerTotal(0);
    } else {
      setError("");
      setCustomers(data?.customers ?? []);
      setCustomerTotal(data?.total ?? 0);
    }
    setCustomersLoading(false);
  };

  const loadCatalogue = async () => {
    setCatalogueLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", { body: { action: "catalogue" } });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Unable to load supplier catalogue.");
    } else {
      setError("");
      setCatalogueProducts(data?.products ?? []);
      const priceRows = data?.productPricing ?? [];
      const priceDrafts: Record<string,{personal:string;agent:string;business:string}> = {};
      for (const product of data?.products ?? []) {
        const rows = priceRows.filter((row:any) => row.product_id === product.id);
        const getPrice = (account:string) => rows.find((row:any)=>row.account_type===account)?.fixed_selling_price;
        priceDrafts[product.id] = {
          personal: String(getPrice("personal") ?? product.selling_price ?? ""),
          agent: String(getPrice("agent") ?? product.selling_price ?? ""),
          business: String(getPrice("business") ?? product.selling_price ?? ""),
        };
      }
      setCatalogueDrafts(priceDrafts);
      setCatalogueOptions(data?.options ?? []);
      setCatalogueProviders(data?.providers ?? []);
      setCatalogueRuns(data?.syncRuns ?? []);
      setCatalogueCanPrice(data?.canManagePricing === true);
      setCatalogueCanManageProviders(data?.canManageProviders === true);
    }
    setCatalogueLoading(false);
  };

  const syncCatalogue = async () => {
    setCatalogueSyncing(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("topupmate-sync-catalogue", { body: {} });

    if (invokeError) {
      let detail = invokeError.message || "Catalogue synchronization failed.";
      const response = (invokeError as any).context;
      if (response && typeof response.clone === "function") {
        try {
          const payload = await response.clone().json();
          const reasons = Array.isArray(payload?.results)
            ? payload.results.filter((item: any) => item.status === "failed")
                .map((item: any) => (item.service || item.key || "endpoint") + ": " + item.error).join(" | ")
            : "";
          const missing = Array.isArray(payload?.missing) && payload.missing.length ? "Missing configuration: " + payload.missing.join(", ") : "";
          detail = [payload?.error || detail, missing, reasons].filter(Boolean).join(" — ");
        } catch {
          try {
            const bodyText = await response.clone().text();
            if (bodyText) detail = bodyText.slice(0, 1000);
          } catch { /* Keep the original Functions error. */ }
        }
      }
      setError(detail);
      await loadCatalogue();
    } else if (data?.error) {
      setError(data.error);
      await loadCatalogue();
    } else {
      const failed = Array.isArray(data?.results)
        ? data.results.filter((item: any) => item.status === "failed")
        : [];
      const summary = failed.map((item: any) => (item.service || item.key || "endpoint") + ": " + item.error).join(" | ");
      setError(summary || (data?.status === "partial" ? "Catalogue sync completed partially. Review the sync history." : ""));
      await loadCatalogue();
    }
    setCatalogueSyncing(false);
  };

  const saveAirtimePricing = async (optionId: string) => {
    const draft = airtimePricingDrafts[optionId];
    if (!draft) return;
    setCatalogueSaving(optionId);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: { action: "airtime_pricing", optionId, discountFactor: Number(draft.discountFactor), minimumAmount: Number(draft.minimumAmount), maximumAmount: Number(draft.maximumAmount) },
    });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Unable to save Airtime supplier pricing.");
    else { setError(""); await loadCatalogue(); }
    setCatalogueSaving(null);
  };

  const setCatalogueProviderStatus = async (providerId: string, status: "active" | "degraded" | "disabled") => {
    setCatalogueSaving(providerId);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: { action: "provider_status", providerId, status, priority: 100 },
    });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Unable to update provider status.");
    else { setError(""); await loadCatalogue(); }
    setCatalogueSaving(null);
  };

  const saveCatalogueProductPrices = async (productId: string) => {
    const draft = catalogueDrafts[productId];
    if (!draft) return;
    setCatalogueSaving(productId);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: {
        action: "price_product", productId,
        personalPrice: Number(draft.personal),
        agentPrice: Number(draft.agent),
        businessPrice: Number(draft.business),
      },
    });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Unable to save service selling prices.");
    else { setError(""); await loadCatalogue(); }
    setCatalogueSaving(null);
  };

  useEffect(() => { if (authorized) void loadOverview(); }, [authorized]);
  useEffect(() => { if (authorized && active === "virtual-cards") void loadCardPricing(); }, [authorized, active]);
  useEffect(() => { if (authorized && active === "pricing") void loadElectricityPricing(); }, [authorized, active]);
  useEffect(() => {
    if (authorized && active === "customers") void loadCustomers(customerPage, customerSearch);
  }, [authorized, active, customerPage]);


  const grouped = useMemo(() => [...new Set(modules.map((m) => m.group))].map((group) => ({ group, items: modules.filter((m) => m.group === group) })), []);
  const signOut = async () => { await supabase.auth.signOut(); await navigate({ to: "/" }); };

  if (loading || checking) return <div className="min-h-screen grid place-items-center bg-[#f5f7fb] text-slate-500"><div className="flex items-center gap-3"><RefreshCw className="animate-spin" size={18}/> Verifying secure admin access…</div></div>;
  if (!authorized) return <main className="min-h-screen grid place-items-center bg-[#f5f7fb] p-6"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><LockKeyhole/></div><h1 className="text-xl font-semibold text-slate-900">Admin access restricted</h1><p className="mt-2 text-sm leading-6 text-slate-500">This is a private TolirexData administration area. Your account does not currently have administrator access.</p>{error && <p className="mt-3 text-xs text-rose-600">{error}</p>}<div className="mt-6 flex justify-center gap-2"><Link to="/" className="rounded-xl border px-4 py-2 text-sm font-medium">Back to customer site</Link><button onClick={() => void signOut()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Sign out</button></div></section></main>;

  return <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
    {sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"/>}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6"><div className="grid size-10 place-items-center rounded-xl bg-[#102d63] text-lg font-bold text-white">T</div><div><div className="text-[15px] font-bold tracking-tight">TolirexData</div><div className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Administration</div></div><button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden"><X size={18}/></button></div>
      <div className="mx-4 mt-4 rounded-xl bg-[#f3f6fb] px-3 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#173b78]"><ShieldCheck size={15}/> Secure control centre</div><p className="mt-1 text-[11px] text-slate-500">Internal platform operations</p></div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5">{grouped.map(({group,items})=><section key={group}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">{group}</p><div className="space-y-1">{items.map((item)=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setActive(item.id);setSidebarOpen(false);}} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${active===item.id?"bg-[#edf3ff] text-[#17458f]":"text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon size={17} strokeWidth={1.8}/><span>{item.label}</span>{active===item.id&&<span className="ml-auto size-1.5 rounded-full bg-[#245bb4]"/>}</button>})}</div></section>)}</nav>
      <div className="border-t border-slate-100 p-4"><Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50"><Globe2 size={16}/> View customer website</Link><button onClick={()=>void signOut()} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut size={16}/> Sign out</button></div>
    </aside>
    <div className="min-h-screen lg:pl-[272px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><button onClick={()=>setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"><Menu size={20}/></button><div><div className="text-sm font-semibold text-slate-900">{current.label}</div><div className="hidden text-[11px] text-slate-400 sm:block">TolirexData / Administration / {current.label}</div></div></div><div className="flex items-center gap-2 sm:gap-4"><div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500"/> Admin session</div><button onClick={()=>void loadOverview()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Refresh overview"><RefreshCw size={16} className={refreshing?"animate-spin":""}/></button><div className="grid size-9 place-items-center rounded-full bg-[#e9effa] text-xs font-bold text-[#1b427f]">{user?.email?.slice(0,1).toUpperCase()||"A"}</div></div></header>
      <main className="mx-auto max-w-[1440px] p-4 sm:p-7">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#3764a6]">Platform management</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{current.label}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{current.description}</p></div>{active==="overview"&&<button onClick={()=>void loadOverview()} className="inline-flex items-center gap-2 rounded-xl bg-[#14366f] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1d4b91]"><RefreshCw size={14}/> Refresh data</button>}</div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>}
        {active==="overview" ? <>
           <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[{key:"pendingKyc",label:"KYC awaiting review",hint:"Compliance queue",icon:FileCheck2,action:"kyc"},{key:"unsettledFunding",label:"Funding awaiting settlement",hint:"Deposit exceptions",icon:ArrowDownToLine,action:"fundings"},{key:"unresolvedOrders",label:"Orders needing attention",hint:"Pending, processing or unknown",icon:Activity,action:"transactions"},{key:"activeProviders",label:"Active providers",hint:"Enabled supplier connections",icon:Database,action:"providers"},{key:"activeProducts",label:"Published supplier products",hint:"Live catalogue records",icon:ShoppingBag,action:"catalogue"},{key:"failedOrders",label:"Failed service orders",hint:"Requires investigation",icon:CircleHelp,action:"transactions"}].map((item)=>{const Icon=item.icon;const value=signals[item.key];return <button key={item.key} onClick={()=>setActive(item.action)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">{item.label}</span><Icon size={17} className="text-[#345b96]"/></div><div className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value===undefined?"—":value===null?"—":value.toLocaleString()}</div><p className="mt-1 text-[10px] text-slate-400">{item.hint}</p></button>})}</div>
           <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Platform control modules</h2><p className="mt-1 text-xs text-slate-400">Open an administration workspace</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{modules.length} modules</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{modules.filter(m=>m.id!=="overview").map((m)=>{const Icon=m.icon;return <button key={m.id} onClick={()=>setActive(m.id)} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50/40"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-600"><Icon size={16}/></span><span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{m.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{m.group}</span></span></button>})}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold">Platform readiness</h2><p className="mt-1 text-xs text-slate-400">Implementation and launch checkpoints</p><div className="mt-5 space-y-4">{[{name:"Admin access control",state:"Database authorization check is connected",done:true},{name:"Topupmate catalogue",state:"Supplier snapshots, normalization, admin review and account pricing are implemented; awaiting migrations, credentials and provider activation",done:false},{name:"KYC workflow",state:"Submission and staff review foundations exist",done:false},{name:"Permanent virtual accounts",state:"Automatic issuance after approved KYC remains",done:false},{name:"Wallet ledger",state:"Accounting and reconciliation validation required",done:false}].map((x)=> <div key={x.name} className="flex gap-3"><span className={x.done?"mt-0.5 text-emerald-600":"mt-0.5 text-amber-500"}><Activity size={15}/></span><div><p className="text-xs font-semibold text-slate-700">{x.name}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{x.state}</p></div></div>)}</div></section></div>
        </> : active==="customers" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Customer directory</h2><p className="mt-1 text-xs text-slate-500">{customerTotal.toLocaleString()} registered customer profiles</p></div>
            <div className="flex gap-2">
              <input value={customerSearch} onChange={(event)=>{setCustomerSearch(event.target.value);setCustomerPage(1);}} onKeyDown={(event)=>{if(event.key==="Enter")void loadCustomers(1,customerSearch);}} placeholder="Search name, email or phone" className="w-64 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"/>
              <button onClick={()=>void loadCustomers(1,customerSearch)} className="rounded-xl bg-[#14366f] px-4 py-2 text-xs font-semibold text-white">Search</button>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Account type</th><th className="px-3 py-3">KYC level</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Joined</th></tr></thead>
              <tbody>
                {customersLoading ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Loading customers…</td></tr> : customers.length===0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">No matching customers found.</td></tr> : customers.map((customer)=><tr key={customer.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-3"><p className="font-semibold text-slate-800">{customer.full_name || "Unnamed customer"}</p><p className="mt-1 text-[10px] text-slate-400">{customer.email}</p></td>
                  <td className="px-3 py-3 text-slate-600">{customer.phone || "—"}</td>
                  <td className="px-3 py-3 capitalize text-slate-600">{customer.account_type || "personal"}</td>
                  <td className="px-3 py-3 text-slate-600">Level {customer.kyc_level ?? 0}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${customer.account_status==="active"?"bg-emerald-50 text-emerald-700":customer.account_status==="suspended"?"bg-rose-50 text-rose-700":"bg-amber-50 text-amber-700"}`}>{customer.account_status || "unknown"}</span></td>
                  <td className="px-3 py-3 text-slate-500">{new Date(customer.created_at).toLocaleDateString()}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>Page {customerPage} of {Math.max(1,Math.ceil(customerTotal/20))}</span><div className="flex gap-2"><button disabled={customerPage<=1||customersLoading} onClick={()=>setCustomerPage(p=>Math.max(1,p-1))} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={customerPage>=Math.ceil(customerTotal/20)||customersLoading} onClick={()=>setCustomerPage(p=>p+1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button></div></div>

        </section> : active==="catalogue" ? <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div><h2 className="text-sm font-semibold">Topupmate supplier catalogue</h2><p className="mt-1 text-xs text-slate-500">Sync supplier records into private review. Products and provider options are imported directly from Topupmate. Admin controls selling prices only.</p></div>
            <button disabled={catalogueSyncing} onClick={()=>void syncCatalogue()} className="inline-flex items-center gap-2 rounded-xl bg-[#14366f] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw size={14} className={catalogueSyncing?"animate-spin":""}/>{catalogueSyncing?"Synchronizing…":"Sync Topupmate catalogue"}</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {catalogueProviders.map(provider=>{const providerPlans=catalogueProducts.filter(product=>product.service_providers?.code===provider.code);const publishedPlans=providerPlans.filter(product=>product.active);const categoryCounts=Object.entries(providerPlans.reduce((counts,product)=>{const category=product.service_categories?.name??product.service_categories?.code??"Other";counts[category]=(counts[category]??0)+1;return counts;},{} as Record<string,number>));return <div key={provider.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-800">{provider.name}</p><p className="mt-1 text-[10px] text-slate-500">Priority {provider.priority} · {provider.code}</p><p className={provider.status==="active"?"mt-1 text-[10px] font-semibold text-emerald-700":"mt-1 text-[10px] font-semibold text-amber-700"}>{provider.status}</p></div>{provider.code==="topupmate"&&catalogueCanManageProviders&&<div className="flex gap-2">{provider.status!=="active"?<button disabled={catalogueSaving===provider.id} onClick={()=>void setCatalogueProviderStatus(provider.id,"active")} className="rounded-lg bg-[#14366f] px-3 py-2 text-[10px] font-semibold text-white">Enable provider</button>:<button disabled={catalogueSaving===provider.id} onClick={()=>void setCatalogueProviderStatus(provider.id,"disabled")} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">Disable provider</button>}</div>}</div><div className="mt-3 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500"><span><strong className="text-slate-800">{providerPlans.length}</strong> supplier plans</span><span><strong className="text-emerald-700">{publishedPlans.length}</strong> active</span><span><strong className="text-amber-700">{providerPlans.length-publishedPlans.length}</strong> inactive</span></div><div className="mt-2 flex flex-wrap gap-1.5">{categoryCounts.length?categoryCounts.map(([category,count])=><span key={category} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{category}: {count}</span>):<span className="text-[10px] text-slate-400">No supplier plans synchronized yet</span>}</div><p className="mt-2 text-[10px] text-slate-400">Each synchronized plan remains linked to this provider. Customer availability follows the active supplier catalogue and configured selling price.</p></div></div>})}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Supplier products</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Published products</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.filter(p=>p.publication_status==="published"&&p.active).length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.filter(p=>p.publication_status==="pending").length}</p></div>
          </div>
          <div className="space-y-3">
            {catalogueLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Loading supplier catalogue…</div> : catalogueProducts.length===0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Package className="mx-auto text-slate-400" size={26}/><p className="mt-3 text-sm font-semibold text-slate-700">No Topupmate products imported yet</p><p className="mt-1 text-xs text-slate-500">Run a supplier sync when Topupmate API credentials and catalogue endpoints are configured.</p></div> : catalogueProducts.map((product)=>{
              const draft=catalogueDrafts[product.id]??{personal:"",agent:"",business:""};
              const category=product.service_categories?.name??product.service_categories?.code??"Service";
              const provider=product.service_providers?.name??"Supplier";
              return <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{category}</span><span className={product.active?"rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700":"rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"}>{product.active?"Supplier active":"Supplier unavailable"}</span></div><h3 className="mt-2 text-sm font-semibold text-slate-900">{product.name}</h3><p className="mt-1 text-[11px] text-slate-500">{provider}{product.network_or_operator?" · "+product.network_or_operator:""} · Supplier code: {product.provider_product_code}</p></div>
                  <div className="text-right text-xs text-slate-500">{product.face_value?(product.service_categories?.code==="gift_card"?"Denomination "+Number(product.face_value).toLocaleString()+" "+(product.name.split(" ").slice(-1)[0]||""):"Face value ₦"+Number(product.face_value).toLocaleString()):""}{catalogueCanPrice&&product.cost_price!==undefined&&<p className="mt-1 font-semibold text-slate-700">Supplier cost ₦{Number(product.cost_price).toLocaleString()}</p>}</div>
                </div>
                {catalogueCanPrice ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {(["personal","agent","business"] as const).map((account)=> <label key={account} className="text-[11px] font-semibold capitalize text-slate-600">{account} selling price (₦)<input type="number" min={Number(product.cost_price??0)} step="0.01" value={draft[account]} onChange={(e)=>setCatalogueDrafts(prev=>({...prev,[product.id]:{...draft,[account]:e.target.value}}))} placeholder="Enter price" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-400"/></label>)}
                </div> : <p className="mt-4 text-xs text-slate-500">Pricing and publication require the pricing administrator permission.</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-[10px] text-slate-400">Last supplier update: {product.supplier_last_seen_at?new Date(product.supplier_last_seen_at).toLocaleString():"Not synchronized"}</p>
                  {catalogueCanPrice&&<button disabled={catalogueSaving===product.id||![draft.personal,draft.agent,draft.business].every(v=>v.trim()!==""&&Number.isFinite(Number(v))&&Number(v)>=Number(product.cost_price??0))} onClick={()=>void saveCatalogueProductPrices(product.id)} className="rounded-lg bg-[#14366f] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40">{catalogueSaving===product.id?"Saving…":"Save selling prices"}</button>}
                </div>
              </article>;
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div><h3 className="text-sm font-semibold">Supplier networks and operators</h3><p className="mt-1 text-xs text-slate-500">Supplier-discovered networks, cable providers and electricity operators are automatically available when the provider is active.</p></div>
            {catalogueOptions.length===0?<p className="mt-3 text-xs text-slate-500">No supplier options have been imported yet.</p>:<div className="mt-4 grid gap-2 md:grid-cols-2">{catalogueOptions.map(option=>{
              const airtime = (option.service_categories?.code==="airtime" || option.service_categories?.name==="Airtime") && option.option_type==="network";
              const draft = airtimePricingDrafts[option.id] ?? {discountFactor:String(option.metadata?.discount_factor??""),minimumAmount:String(option.metadata?.minimum_amount??"50"),maximumAmount:String(option.metadata?.maximum_amount??"200000")};
              return <div key={option.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{option.name}</p><p className="mt-1 text-[10px] text-slate-500">{option.service_categories?.name??option.service_categories?.code} · {option.option_type} · {option.option_code}</p><p className="mt-1 text-[10px] text-slate-400">{option.active?"Active":"Inactive"}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Supplier catalogue</span></div>
                {airtime&&catalogueCanPrice&&<div className="mt-3 grid gap-2 sm:grid-cols-4"><label className="text-[10px] font-semibold text-slate-600">Supplier cost factor<input type="number" min="0.01" max="1" step="0.0001" value={draft.discountFactor} onChange={e=>setAirtimePricingDrafts(prev=>({...prev,[option.id]:{...draft,discountFactor:e.target.value}}))} placeholder="e.g. 0.98" className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"/></label><label className="text-[10px] font-semibold text-slate-600">Minimum ₦<input type="number" min="50" value={draft.minimumAmount} onChange={e=>setAirtimePricingDrafts(prev=>({...prev,[option.id]:{...draft,minimumAmount:e.target.value}}))} className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"/></label><label className="text-[10px] font-semibold text-slate-600">Maximum ₦<input type="number" min="50" value={draft.maximumAmount} onChange={e=>setAirtimePricingDrafts(prev=>({...prev,[option.id]:{...draft,maximumAmount:e.target.value}}))} className="mt-1 w-full rounded-lg border px-2 py-2 text-xs"/></label><button disabled={catalogueSaving===option.id||!draft.discountFactor||Number(draft.discountFactor)<=0||Number(draft.discountFactor)>1||Number(draft.minimumAmount)<50||Number(draft.maximumAmount)<Number(draft.minimumAmount)} onClick={()=>void saveAirtimePricing(option.id)} className="self-end rounded-lg bg-[#14366f] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">{catalogueSaving===option.id?"Saving…":"Save pricing"}</button></div>}
              </div>;
            })}</div>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Recent catalogue synchronization</h3>{catalogueRuns.length===0?<p className="mt-2 text-xs text-slate-500">No synchronization history yet.</p>:<div className="mt-3 space-y-2">{catalogueRuns.map(run=><div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs"><span className="font-medium text-slate-700">{new Date(run.started_at).toLocaleString()}</span><span className="text-slate-500">{run.discovered_products} products · {run.discovered_options} options</span><span className={run.status==="success"?"font-semibold text-emerald-700":run.status==="partial"?"font-semibold text-amber-700":"font-semibold text-rose-700"}>{run.status}</span></div>)}</div>}</div>
        </section> : active==="pricing" ? <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div><h2 className="text-base font-semibold">Electricity fees and markups</h2><p className="mt-1 text-xs leading-5 text-slate-500">Set a fixed convenience fee or percentage markup on the meter amount, separately for Personal, Agent and Business accounts. Supplier meter amounts remain dynamic and are verified before payment.</p></div>
            {electricityPricingLoading?<p className="mt-6 text-sm text-slate-500">Loading electricity pricing…</p>:<div className="mt-5 grid gap-4 lg:grid-cols-3">
              {(["personal","agent","business"] as const).map(account=><div key={account} className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold capitalize">{account} account</h3><label className="mt-4 block text-xs font-medium text-slate-600">Fee type<select value={electricityPricing[account].markupType} onChange={e=>setElectricityPricing(p=>({...p,[account]:{...p[account],markupType:e.target.value as "fixed"|"percentage"}}))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="fixed">Fixed fee (₦)</option><option value="percentage">Percentage (%)</option></select></label><label className="mt-3 block text-xs font-medium text-slate-600">{electricityPricing[account].markupType==="fixed"?"Convenience fee (₦)":"Markup (%)"}<input type="number" min="0" max={electricityPricing[account].markupType==="percentage"?100:undefined} step="0.01" value={electricityPricing[account].markupValue} onChange={e=>setElectricityPricing(p=>({...p,[account]:{...p[account],markupValue:e.target.value}}))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3"/></label><button onClick={()=>void saveElectricityPricing(account)} disabled={electricityPricingSaving===account||!electricityPricing[account].markupValue.trim()||!Number.isFinite(Number(electricityPricing[account].markupValue))||Number(electricityPricing[account].markupValue)<0||(electricityPricing[account].markupType==="percentage"&&Number(electricityPricing[account].markupValue)>100)} className="mt-4 w-full rounded-lg bg-[#14366f] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">{electricityPricingSaving===account?"Saving…":"Save "+account+" pricing"}</button></div>)}
            </div>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Catalogue product pricing</h3><p className="mt-1 text-xs leading-5 text-slate-500">Airtime discounts and published supplier-product selling prices are managed from Service Catalogue. Product prices are reviewed against supplier cost before publication. No fixed plans or retail prices are embedded in the customer application.</p></div>
        </section> : active==="virtual-cards" ? <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Topupmate card pricing controls</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Manage card creation fees, minimum funding and platform markups here. Changes are audited and apply to new card operations. API credentials remain protected as server secrets.</p></div><button onClick={()=>void loadCardPricing()} disabled={cardPricingLoading} className="rounded-xl border px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className="mr-1 inline"/> Refresh</button></div>
            {cardPricingLoading?<p className="mt-6 text-sm text-slate-500">Loading commercial settings…</p>:<>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 p-4"><div><p className="text-sm font-semibold text-slate-800">Allow new virtual card creation</p><p className="mt-1 text-xs text-slate-500">Turn off issuance without disabling existing cards.</p></div><button type="button" role="switch" aria-checked={cardPricing.cardCreationEnabled} onClick={()=>setCardPricing(p=>({...p,cardCreationEnabled:!p.cardCreationEnabled}))} className={`relative h-7 w-12 rounded-full transition-colors ${cardPricing.cardCreationEnabled?"bg-emerald-600":"bg-slate-300"}`}><span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${cardPricing.cardCreationEnabled?"translate-x-6":"translate-x-1"}`}/></button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ["creationFeeUsd","Card creation fee (USD)","Fee charged by Topupmate per new card"],
                  ["minimumInitialFundingUsd","Minimum initial funding (USD)","Minimum first card balance"],
                  ["creationMarkupUsd","Card creation markup (USD)","TolirexData creation service markup"],
                  ["topupMinimumUsd","Minimum card top-up (USD)","Minimum amount for a card funding request"],
                  ["topupMarkupPercent","Card top-up markup (%)","Percentage markup applied to card funding"],
                ] as const).map(([key,label,hint])=><label key={key} className="block text-xs font-semibold text-slate-700">{label}<input type="number" min="0" step="0.01" value={cardPricing[key]} onChange={e=>setCardPricing(p=>({...p,[key]:e.target.value}))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium outline-none focus:border-blue-500"/><span className="mt-1 block text-[10px] font-normal text-slate-400">{hint}</span></label>)}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-slate-500">Only Super Admin and Finance Admin can change these settings.</p><button onClick={()=>void saveCardPricing()} disabled={cardPricingSaving||!cardPricing.minimumInitialFundingUsd||![cardPricing.creationFeeUsd,cardPricing.minimumInitialFundingUsd,cardPricing.creationMarkupUsd,cardPricing.topupMinimumUsd,cardPricing.topupMarkupPercent].every(v=>v.trim()!==""&&Number.isFinite(Number(v))&&Number(v)>=0)} className="rounded-xl bg-[#14366f] px-5 py-3 text-xs font-semibold text-white disabled:opacity-40">{cardPricingSaving?"Saving settings…":"Save card pricing settings"}</button></div>
            </>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Pricing governance</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-slate-500"><li>Card fees and markups are stored in the database, not in Edge Function secrets.</li><li>Every settings update records the administrator and before/after values in the audit log.</li><li>Customer charges are recalculated server-side using the latest saved settings and current Topupmate FX quote.</li><li>Existing card operations retain the pricing snapshot used when they were created.</li></ul></div>
        </section> : active==="transactions" ? <ServiceOrdersWorkspace/> : <AdminDataWorkspace moduleId={active} moduleLabel={current.label} onError={setError}/>}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5 text-[10px] text-slate-400"><span>TolirexData Administration · Restricted access</span><span>Developer/API product disabled for launch</span></footer>
      </main>
    </div>
  </div>;
}
