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
  { id: "fundings", label: "Deposits & Funding", group: "Finance", icon: ArrowDownToLine, description: "Track incoming transfers, payment events and deposit settlement.", capabilities: ["Funding event timeline", "Webhook and verification status", "Unmatched and pending deposits", "Idempotent settlement and reconciliation"] },
  { id: "transactions", label: "Transactions", group: "Operations", icon: ArrowLeftRight, description: "Investigate purchases, provider requests, refunds and transaction outcomes.", capabilities: ["All transaction and order records", "Provider request IDs and status checks", "Refund and reversal workflow", "Exception and stuck-order queue"] },
  { id: "catalogue", label: "Service Catalogue", group: "Services & Providers", icon: ShoppingBag, description: "Publish the live catalogue synchronized from ClubKonnect and future suppliers.", capabilities: ["Provider-sourced service categories and products", "Catalogue synchronization and freshness", "Customer-safe product publication", "Availability controls without hardcoded supplier plans"] },
  { id: "providers", label: "Providers", group: "Services & Providers", icon: Database, description: "Configure provider connections, priority and operational health.", capabilities: ["ClubKonnect connection and sync health", "Provider enablement and priority", "Future multi-provider routing and failover", "Credential configuration status (secrets remain server-side)"] },
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
  const [catalogueSaving, setCatalogueSaving] = useState<string | null>(null);
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
    const { data, error: invokeError } = await supabase.functions.invoke("clubkonnect-sync-catalogue", { body: {} });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Catalogue synchronization failed.");
    else {
      setError("");
      await loadCatalogue();
    }
    setCatalogueSyncing(false);
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

  const publishCatalogueOption = async (optionId: string, status: "published" | "paused") => {
    setCatalogueSaving(optionId);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: { action: "publish_option", optionId, publicationStatus: status },
    });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Unable to update supplier option.");
    else { setError(""); await loadCatalogue(); }
    setCatalogueSaving(null);
  };

  const publishCatalogueProduct = async (productId: string, status: "published" | "paused") => {
    const draft = catalogueDrafts[productId];
    setCatalogueSaving(productId);
    const { data, error: invokeError } = await supabase.functions.invoke("admin-console", {
      body: {
        action: "publish_product", productId, publicationStatus: status,
        personalPrice: Number(draft?.personal), agentPrice: Number(draft?.agent), businessPrice: Number(draft?.business),
      },
    });
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || "Unable to update catalogue publication.");
    else { setError(""); await loadCatalogue(); }
    setCatalogueSaving(null);
  };

  useEffect(() => { if (authorized) void loadOverview(); }, [authorized]);
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
           <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Platform control modules</h2><p className="mt-1 text-xs text-slate-400">Open an administration workspace</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{modules.length} modules</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{modules.filter(m=>m.id!=="overview").map((m)=>{const Icon=m.icon;return <button key={m.id} onClick={()=>setActive(m.id)} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50/40"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-600"><Icon size={16}/></span><span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{m.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{m.group}</span></span></button>})}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold">Platform readiness</h2><p className="mt-1 text-xs text-slate-400">Implementation and launch checkpoints</p><div className="mt-5 space-y-4">{[{name:"Admin access control",state:"Database authorization check is connected",done:true},{name:"ClubKonnect catalogue",state:"Supplier snapshots, normalization, admin review and account pricing are implemented; awaiting migrations, credentials and provider activation",done:false},{name:"KYC workflow",state:"Submission and staff review foundations exist",done:false},{name:"Permanent virtual accounts",state:"Automatic issuance after approved KYC remains",done:false},{name:"Wallet ledger",state:"Accounting and reconciliation validation required",done:false}].map((x)=> <div key={x.name} className="flex gap-3"><span className={x.done?"mt-0.5 text-emerald-600":"mt-0.5 text-amber-500"}><Activity size={15}/></span><div><p className="text-xs font-semibold text-slate-700">{x.name}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">{x.state}</p></div></div>)}</div></section></div>
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
            <div><h2 className="text-sm font-semibold">ClubKonnect supplier catalogue</h2><p className="mt-1 text-xs text-slate-500">Sync supplier records into private review. Products remain unavailable to customers until approved and published.</p></div>
            <button disabled={catalogueSyncing} onClick={()=>void syncCatalogue()} className="inline-flex items-center gap-2 rounded-xl bg-[#14366f] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw size={14} className={catalogueSyncing?"animate-spin":""}/>{catalogueSyncing?"Synchronizing…":"Sync ClubKonnect catalogue"}</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {catalogueProviders.map(provider=><div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><p className="text-xs font-semibold text-slate-800">{provider.name}</p><p className="mt-1 text-[10px] text-slate-500">Priority {provider.priority} · {provider.code}</p><p className={provider.status==="active"?"mt-1 text-[10px] font-semibold text-emerald-700":"mt-1 text-[10px] font-semibold text-amber-700"}>{provider.status}</p></div>{provider.code==="clubkonnect"&&catalogueCanManageProviders&&<div className="flex gap-2">{provider.status!=="active"?<button disabled={catalogueSaving===provider.id} onClick={()=>void setCatalogueProviderStatus(provider.id,"active")} className="rounded-lg bg-[#14366f] px-3 py-2 text-[10px] font-semibold text-white">Enable provider</button>:<button disabled={catalogueSaving===provider.id} onClick={()=>void setCatalogueProviderStatus(provider.id,"disabled")} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">Disable provider</button>}</div>}</div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Supplier products</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Published products</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.filter(p=>p.publication_status==="published"&&p.active).length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-bold">{catalogueProducts.filter(p=>p.publication_status==="pending").length}</p></div>
          </div>
          <div className="space-y-3">
            {catalogueLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Loading supplier catalogue…</div> : catalogueProducts.length===0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Package className="mx-auto text-slate-400" size={26}/><p className="mt-3 text-sm font-semibold text-slate-700">No supplier products imported yet</p><p className="mt-1 text-xs text-slate-500">Run a supplier sync when ClubKonnect credentials and catalogue endpoints are configured.</p></div> : catalogueProducts.map((product)=>{
              const draft=catalogueDrafts[product.id]??{personal:"",agent:"",business:""};
              const category=product.service_categories?.name??product.service_categories?.code??"Service";
              const provider=product.service_providers?.name??"Supplier";
              return <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{category}</span><span className={product.publication_status==="published"?"rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700":"rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"}>{product.publication_status}</span></div><h3 className="mt-2 text-sm font-semibold text-slate-900">{product.name}</h3><p className="mt-1 text-[11px] text-slate-500">{provider}{product.network_or_operator?" · "+product.network_or_operator:""} · Supplier code: {product.provider_product_code}</p></div>
                  <div className="text-right text-xs text-slate-500">{product.face_value?"Face value ₦"+Number(product.face_value).toLocaleString():""}{catalogueCanPrice&&product.cost_price!==undefined&&<p className="mt-1 font-semibold text-slate-700">Supplier cost ₦{Number(product.cost_price).toLocaleString()}</p>}</div>
                </div>
                {catalogueCanPrice ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {(["personal","agent","business"] as const).map((account)=> <label key={account} className="text-[11px] font-semibold capitalize text-slate-600">{account} selling price (₦)<input type="number" min={Number(product.cost_price??0)} step="0.01" value={draft[account]} onChange={(e)=>setCatalogueDrafts(prev=>({...prev,[product.id]:{...draft,[account]:e.target.value}}))} placeholder="Enter price" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-400"/></label>)}
                </div> : <p className="mt-4 text-xs text-slate-500">Pricing and publication require the pricing administrator permission.</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-[10px] text-slate-400">Last supplier update: {product.supplier_last_seen_at?new Date(product.supplier_last_seen_at).toLocaleString():"Not synchronized"}</p>
                  {catalogueCanPrice&&<div className="flex gap-2">
                    {product.publication_status==="published"&&<button disabled={catalogueSaving===product.id} onClick={()=>void publishCatalogueProduct(product.id,"paused")} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 disabled:opacity-50">Pause</button>}
                    <button disabled={catalogueSaving===product.id||![draft.personal,draft.agent,draft.business].every(v=>v.trim()!==""&&Number.isFinite(Number(v))&&Number(v)>=Number(product.cost_price??0))} onClick={()=>void publishCatalogueProduct(product.id,"published")} className="rounded-lg bg-[#14366f] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40">{catalogueSaving===product.id?"Saving…":product.publication_status==="published"?"Update prices":"Approve & publish"}</button>
                  </div>}
                </div>
              </article>;
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div><h3 className="text-sm font-semibold">Supplier networks and operators</h3><p className="mt-1 text-xs text-slate-500">Publish supplier-derived networks, cable providers and electricity operators for customer selection.</p></div>
            {catalogueOptions.length===0?<p className="mt-3 text-xs text-slate-500">No supplier options have been imported yet.</p>:<div className="mt-4 grid gap-2 md:grid-cols-2">{catalogueOptions.map(option=><div key={option.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{option.name}</p><p className="mt-1 text-[10px] text-slate-500">{option.service_categories?.name??option.service_categories?.code} · {option.option_type} · {option.option_code}</p><p className="mt-1 text-[10px] text-slate-400">{option.publication_status}</p></div><div className="flex shrink-0 gap-2">{option.publication_status==="published"?<button disabled={catalogueSaving===option.id} onClick={()=>void publishCatalogueOption(option.id,"paused")} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-600">Pause</button>:<button disabled={catalogueSaving===option.id} onClick={()=>void publishCatalogueOption(option.id,"published")} className="rounded-lg bg-[#14366f] px-2.5 py-2 text-[10px] font-semibold text-white">Publish</button>}</div></div>)}</div>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Recent catalogue synchronization</h3>{catalogueRuns.length===0?<p className="mt-2 text-xs text-slate-500">No synchronization history yet.</p>:<div className="mt-3 space-y-2">{catalogueRuns.map(run=><div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs"><span className="font-medium text-slate-700">{new Date(run.started_at).toLocaleString()}</span><span className="text-slate-500">{run.discovered_products} products · {run.discovered_options} options</span><span className={run.status==="success"?"font-semibold text-emerald-700":run.status==="partial"?"font-semibold text-amber-700":"font-semibold text-rose-700"}>{run.status}</span></div>)}</div>}</div>
        </section> : active==="transactions" ? <ServiceOrdersWorkspace/> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,.025)] sm:p-7"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#eff4fc] text-[#244d8e]"><current.icon size={20}/></span><div><h2 className="text-base font-semibold">{current.label} workspace</h2><p className="mt-1 text-xs text-slate-400">Dedicated administration module</p></div></div><div className="mt-7"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Included capabilities</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{current.capabilities.map((cap)=> <div key={cap} className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600"/><span className="text-sm text-slate-700">{cap}</span></div>)}</div></div><div className="mt-7 rounded-xl border border-amber-200 bg-amber-50/70 p-4"><p className="text-xs font-semibold text-amber-900">Module implementation status</p><p className="mt-1 text-xs leading-5 text-amber-800">This module is included in the dedicated admin navigation and architecture. Its live data tables, server functions and operational actions will be connected in the corresponding implementation phase. No placeholder action will alter customer balances or financial records.</p></div></section>}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5 text-[10px] text-slate-400"><span>TolirexData Administration · Restricted access</span><span>Developer/API product disabled for launch</span></footer>
      </main>
    </div>
  </div>;
}
