import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Database,
  FileClock,
  House,
  LogOut,
  Menu,
  MoreHorizontal,
  Grid2X2,
  PackageCheck,
  Tv,
  Lightbulb,
  TicketPercent,
  Megaphone,
  Coins,
  Award,
  Gift,
  Globe2,
  Users,
  Pin,
  Plus,
  RadioTower,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database as SupabaseDatabase } from "@/integrations/supabase/types";
import { useDexAuth } from "@/lib/dex-auth";
import {
  getDexDashboard,
  manageTopupmateVirtualCard,
  manageTopupmateExpandedService,
  purchaseAirtimeOrData,
  submitCustomerKyc,
  ensureFlutterwaveVirtualAccount,
} from "@/lib/dex.functions";
import { formatNaira, isValidNigerianPhone } from "@/lib/dex-rules";
import tolirexMobile from "@/assets/tolirex-mobile.jpg";

type TableRows<K extends keyof SupabaseDatabase["public"]["Tables"]> = SupabaseDatabase["public"]["Tables"][K]["Row"];
type DataPlan = { id: string; network: string; networkCode: string; planType: "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"; data_amount: string; validity: string; price: number; active: boolean };
type CatalogueProduct = { id: string; category_id: string; category_code: string; category_name: string; name: string; network_or_operator: string | null; plan_type?: "sme"|"gifting"|"corporate"|null; description: string | null; face_value: number | null; selling_price: number; currency: string; sort_order: number; country_code?:string|null; product_category?:string|null; recipient_currency?:string|null; logo_url?:string|null; redeem_instruction?:any };
type CatalogueOption = { id: string; category_code: string; option_type: string; option_code: string; parent_option_code: string | null; name: string };
type DataOrder = TableRows<"data_orders">;
type WalletTransaction = TableRows<"wallet_transactions">;
type ServiceOrder = { id:string; user_id:string; category_id:string; product_id:string|null; request_id:string; recipient:string; amount:number; currency:string; status:string; provider_status:string|null; created_at:string; updated_at:string };
type Profile = TableRows<"profiles">;
type DashboardData = {
  profile: Profile | null;
  wallet: TableRows<"wallets"> | null;
  plans: DataPlan[];
  catalogue: CatalogueProduct[];
  catalogueOptions: CatalogueOption[];
  orders: DataOrder[];
  serviceOrders: ServiceOrder[];
  transactions: WalletTransaction[];
  users: Profile[];
  isAdmin: boolean;
  kyc?: { id: string; status: string; level: number; review_note?: string | null; created_at: string } | null;
  virtualAccount?: { id: string; account_number: string; bank_name: string; account_name: string; currency: string; status: string; is_permanent: boolean } | null;
};
type ViewKey = "overview" | "buy" | "fund" | "activity" | "airtime" | "cable" | "electricity" | "epin" | "data-pin" | "education" | "internet" | "gift-cards" | "cards" | "fx" | "referrals" | "coupons" | "promotions" | "cashback" | "loyalty";
type Network = string;
type AuthMode = "signin" | "signup";




function KycAndFundingOnboarding({dashboard,onRefresh}:{dashboard:DashboardData;onRefresh:()=>void}) {
 const [firstName,setFirstName]=useState(""); const [lastName,setLastName]=useState("");
 const [phone,setPhone]=useState(String((dashboard.profile as any)?.phone??""));
 const [kind,setKind]=useState<"bvn"|"nin">("nin"); const [identity,setIdentity]=useState("");
 const [consent,setConsent]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 const issuanceStarted=useRef(false);
 const kyc=dashboard.kyc; const account=dashboard.virtualAccount;
 const submit=async()=>{if(!consent||!/^[0-9]{11}$/.test(identity)||firstName.trim().length<2||lastName.trim().length<2){setMessage("Enter your legal name, valid 11-digit identity number and consent.");return;}
 setBusy(true);setMessage("");try{await submitCustomerKyc({data:{firstName:firstName.trim(),lastName:lastName.trim(),phone,identityType:kind,identityNumber:identity,consent:true}});setIdentity("");setMessage("KYC submitted for compliance review.");onRefresh();}catch(e){setMessage(messageOf(e,"Unable to submit KYC."));}finally{setBusy(false);}};
 useEffect(()=>{if(kyc?.status!=="approved"||account||issuanceStarted.current)return;issuanceStarted.current=true;setBusy(true);setMessage("KYC approved. Setting up your permanent bank account…");void ensureFlutterwaveVirtualAccount().then(()=>{setMessage("Your permanent Flutterwave virtual account is ready.");onRefresh();}).catch(e=>{setMessage(messageOf(e,"KYC is approved, but account setup needs attention. Please refresh or contact support; do not submit another KYC application."));}).finally(()=>setBusy(false));},[kyc?.status,account?.id,onRefresh]);
 return <section className="mb-6 grid gap-4 lg:grid-cols-2">
 <div className="rounded-2xl border bg-background p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Identity verification</p><h2 className="mt-1 font-semibold">{kyc?.status==="approved"?"KYC approved":kyc?.status==="pending"?"KYC under review":"Complete your KYC"}</h2></div><StatusBadge status={kyc?.status??"not_submitted"}/></div>
 {kyc?.status==="approved"?<p className="mt-3 text-sm text-muted-foreground">Your identity is verified. TolirexData automatically requests your permanent wallet account after approval.</p>:kyc?.status==="pending"?<p className="mt-3 text-sm text-muted-foreground">Your KYC submission is awaiting compliance review.</p>:<div className="mt-4 grid gap-3 sm:grid-cols-2">
 <Field label="Legal first name"><Input value={firstName} onChange={e=>setFirstName(e.target.value)}/></Field><Field label="Legal last name"><Input value={lastName} onChange={e=>setLastName(e.target.value)}/></Field>
 <Field label="Phone number"><Input value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
 <Field label="Identity type"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={kind} onChange={e=>setKind(e.target.value as "bvn"|"nin")}><option value="nin">NIN</option><option value="bvn">BVN</option></select></Field>
 <div className="sm:col-span-2"><Field label={kind.toUpperCase()}><Input type="password" maxLength={11} inputMode="numeric" value={identity} onChange={e=>setIdentity(e.target.value.replace(/\D/g,"").slice(0,11))}/></Field></div>
 <label className="sm:col-span-2 flex gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to secure processing of my identity details for KYC and account eligibility.</label>
 <Button className="sm:col-span-2" disabled={busy} onClick={()=>void submit()}>{busy?"Submitting…":"Submit KYC"}</Button></div>}
 {message&&<p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>}<p className="mt-3 text-[10px] text-muted-foreground">BVN/NIN is encrypted server-side and is not displayed in your profile.</p></div>
 <div className="rounded-2xl border bg-background p-5"><p className="text-xs font-semibold uppercase text-muted-foreground">Permanent wallet account</p><h2 className="mt-1 font-semibold">Flutterwave bank transfer</h2>
 {account?<div className="mt-4 rounded-xl bg-primary/5 p-4"><p className="text-xs text-muted-foreground">{account.bank_name}</p><p className="mt-1 text-2xl font-bold tracking-wider">{account.account_number}</p><p className="mt-2 text-sm font-medium">{account.account_name}</p><p className="mt-1 text-xs text-muted-foreground">Permanent {account.currency} account</p></div>:<p className="mt-3 text-sm text-muted-foreground">{kyc?.status==="approved"?"Your permanent account is being provisioned automatically.":"Your permanent account is generated automatically after KYC approval."}</p>}
 </div></section>;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ToliRex Data | Data, airtime and bills made simple" },
      { name: "description", content: "Manage Nigerian data, airtime, TV subscriptions and electricity payments in one simple ToliRex Data account." },
      { property: "og:title", content: "ToliRex Data | Everyday services in one place" },
      { property: "og:description", content: "Explore data, airtime, TV subscriptions and electricity services from one Nigerian wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading: authLoading } = useDexAuth();
  const queryClient = useQueryClient();
  const dashboardRequest = getDexDashboard;
  const getDashboard = useCallback(() => dashboardRequest(), [dashboardRequest]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [view, setView] = useState<ViewKey>("overview");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState<Network>("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlanType,setSelectedPlanType]=useState<"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"|"">("DAILY");
  const [phone, setPhone] = useState("");
  const [dataCouponCode,setDataCouponCode] = useState("");
  const virtualAccountIssuanceStarted = useRef(false);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const result = await getDashboard();
      setDashboard(result as DashboardData);
    } catch (error) {
      setNotice(messageOf(error, "We couldn't load your ToliRex Data account."));
    } finally {
      setDashboardLoading(false);
    }
  }, [getDashboard]);

  // Provisioning must continue even when the approved-KYC onboarding card is hidden.
  useEffect(() => {
    if (dashboard?.kyc?.status !== "approved" || dashboard.virtualAccount || virtualAccountIssuanceStarted.current) return;
    virtualAccountIssuanceStarted.current = true;
    void ensureFlutterwaveVirtualAccount().then(() => refreshDashboard()).catch((error) => {
      setNotice(messageOf(error, "Your KYC is approved, but permanent account setup needs attention. Open Wallet funding or contact support."));
    });
  }, [dashboard?.kyc?.status, dashboard?.virtualAccount?.id, refreshDashboard]);

  useEffect(() => {
    if (!user) {
      setDashboard(null);
      setView("overview");
      return;
    }
    void refreshDashboard();
  }, [user?.id, refreshDashboard]);

  const availablePlans = useMemo(() => {
    const allPlans = (dashboard?.plans ?? []).filter((plan) => plan.active || dashboard?.isAdmin);
    // A remembered network selection can become stale after a supplier catalogue
    // refresh (renamed/removed network). Never let that hide supplier plans after a catalogue refresh.
    const selectedNetworkStillExists = !network || allPlans.some((plan) => plan.network === network);
    return allPlans.filter((plan) => !selectedNetworkStillExists || !network || plan.network === network);
  }, [dashboard?.isAdmin, dashboard?.plans, network]);
  const typedPlans=availablePlans.filter(plan=>plan.network===network&&plan.planType===selectedPlanType);
  const selectedPlan = typedPlans.find((plan) => plan.id === selectedPlanId) ?? typedPlans[0];
  useEffect(() => {
    if(!network)return;
    const groups=["DAILY","WEEKLY","MONTHLY","YEARLY","OTHER"] as const;
    if(availablePlans.some(plan=>plan.network===network&&plan.planType===selectedPlanType))return;
    const first=groups.find(group=>availablePlans.some(plan=>plan.network===network&&plan.planType===group));
    if(first)setSelectedPlanType(first);
  },[network,availablePlans,selectedPlanType]);

  const availableNetworks = useMemo(() => Array.from(new Set((dashboard?.catalogueOptions ?? []).filter(option=>option.category_code==="data"&&option.option_type==="network").map(option=>canonicalNetworkLabel(option.name,option.option_code)).filter(Boolean))), [dashboard?.catalogueOptions]);

  const clearNotice = () => setNotice("");
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    clearNotice();
    try {
      await work();
    } catch (error) {
      setNotice(messageOf(error, "That didn't go through. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleBuy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan || !selectedPlan.networkCode || !isValidNigerianPhone(phone)) { setNotice("Choose an available data plan with a valid supplier network and enter a valid Nigerian phone number."); return; }
    await action(async () => {
      const result = await purchaseAirtimeOrData({ data: { service:"data", productId:selectedPlan.id, networkCode:selectedPlan.networkCode, recipient:phone, couponCode:dataCouponCode.trim().toUpperCase()||undefined, idempotencyKey:crypto.randomUUID().replace(/-/g,"") } });
      const saved=result.discountAmount>0?` ${result.couponCode} saved ${formatNaira(Number(result.discountAmount))}; you paid ${formatNaira(Number(result.chargedAmount))}.`:"";
      setNotice(result.status==="successful" ? "Data purchase completed successfully."+saved : result.status==="refunded" ? "Supplier rejected the order; your wallet refund has been processed." : "Your order is processing or being checked. Check Transactions before submitting again.");
      await refreshDashboard();
    });
  };
  const handleAirtimePurchase = async (payload:{networkCode:string;recipient:string;amount:number;couponCode?:string}) => {
    await action(async () => {
      const result = await purchaseAirtimeOrData({ data:{ service:"airtime", ...payload, idempotencyKey:crypto.randomUUID().replace(/-/g,"") } });
      const saved=result.discountAmount>0?` ${result.couponCode} saved ${formatNaira(Number(result.discountAmount))}; you paid ${formatNaira(Number(result.chargedAmount))}.`:"";
      setNotice(result.status==="successful" ? "Airtime purchase completed successfully."+saved : result.status==="refunded" ? "Supplier rejected the order; your wallet refund has been processed." : "Your order is processing or being checked. Check Transactions before submitting again.");
      await refreshDashboard();
    });
  };

  const signOut = async () => {
    setBusy(true);
    clearNotice();
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) setNotice("We couldn't sign you out. Please try again.");
    setBusy(false);
  };

  if (authLoading) return <LoadingScreen />;

  return (
    <>
      {user ? (
        <DashboardShell
          userName={dashboard?.profile?.full_name || user.email || "there"}
          accountType={String((dashboard?.profile as (Profile & { account_type?: string }) | null)?.account_type || "personal")}
          isAdmin={Boolean(dashboard?.isAdmin)}
          view={view}
          setView={setView}
          onSignOut={() => void signOut()}
          notice={notice}
          onDismissNotice={clearNotice}
          busy={busy}
          loading={dashboardLoading}
          dashboard={dashboard}
          onRefresh={() => void refreshDashboard()}
          network={network}
          setNetwork={setNetwork}
          networkChoices={availableNetworks}
          selectedPlanType={selectedPlanType}
          setSelectedPlanType={setSelectedPlanType}
          plans={availablePlans}
          selectedPlan={selectedPlan}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          phone={phone}
          setPhone={setPhone}
          onBuy={handleBuy}
          dataCouponCode={dataCouponCode}
          setDataCouponCode={setDataCouponCode}
          onAirtimePurchase={handleAirtimePurchase}
        />
      ) : (
        <Storefront
          onAuth={(mode) => {
            setAuthMode(mode);
            setAuthOpen(true);
          }}
        />
      )}
      <AuthDialog open={authOpen && !user} onOpenChange={setAuthOpen} mode={authMode} setMode={setAuthMode} />
    </>
  );
}

function Storefront({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  const products = [
    { icon: <Database />, name: "Mobile data", detail: "Browse supplier-powered data plans", state: "Service catalogue" },
    { icon: <Smartphone />, name: "Airtime", detail: "Network top-ups when enabled", state: "Service catalogue" },
    { icon: <RadioTower />, name: "Cable TV", detail: "DStv, GOtv and StarTimes packages", state: "Service catalogue" },
    { icon: <Zap />, name: "Electricity", detail: "Supported distribution companies", state: "Service catalogue" },
  ];
  return (
    <main className="tr-public min-h-screen">
      <header className="tr-public-header">
        <div className="tr-public-inner">
          <Brand />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"><a href="#services">Services</a><a href="#how">How it works</a></nav>
          <div className="flex items-center gap-2"><Button variant="ghost" onClick={() => onAuth("signin")}>Log in</Button><Button onClick={() => onAuth("signup")} className="tr-primary-btn">Get started <ArrowRight /></Button></div>
        </div>
      </header>
      <section className="tr-hero">
        <div className="tr-hero-copy">
          <span className="tr-eyebrow"><span className="size-2 rounded-full bg-emerald-500" /> Your money, made simpler</span>
          <h1>One account.<br/><span>More control.</span></h1>
          <p>Personal, reseller and business accounts for digital services and payments — with transparent activity and secure wallet management.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Button size="lg" className="tr-primary-btn" onClick={() => onAuth("signup")}>Create your account <ArrowRight /></Button><Button size="lg" variant="outline" onClick={() => onAuth("signin")}>Log in</Button></div>
          <div className="tr-trustline"><ShieldCheck className="size-4"/> Secure account access <span/> Built for everyday Nigeria</div>
        </div>
        <div className="tr-hero-preview">
          <div className="tr-preview-top"><Brand/><span className="tr-avatar">T</span></div>
          <p className="tr-muted">Example wallet balance</p><div className="tr-preview-balance">₦—</div>
          <div className="tr-preview-actions"><span><Plus/>Add money</span><span><ArrowUpRight/>Send</span><span><CreditCard/>Cards</span></div>
          <div className="tr-preview-row"><span className="tr-mini-icon"><Smartphone/></span><span><b>Service payments</b><small>Track every transaction</small></span><strong>Activity</strong></div>
          <div className="tr-preview-row"><span className="tr-mini-icon green"><ArrowDownLeft/></span><span><b>Wallet funding</b><small>Dedicated account after approval</small></span><strong className="positive">Secure</strong></div>
        </div>
      </section>
      <section id="services" className="tr-public-section"><div className="tr-section-heading"><div><span className="tr-kicker">EVERYDAY SERVICES</span><h2>Everything in one place</h2></div><p>A connected account for payments, digital services and rewards.</p></div><div className="tr-product-grid">{products.map((item) => <article className="tr-product-card" key={item.name}><span className="tr-product-icon">{item.icon}</span><h3>{item.name}</h3><p>{item.detail}</p><small>{item.state}</small></article>)}</div></section>
      <section id="how" className="tr-how"><span className="tr-kicker">GET STARTED</span><h2>Simple from the first tap.</h2><div className="tr-how-grid"><div><b>01</b><h3>Create your account</h3><p>Sign up and securely access your personal wallet.</p></div><div><b>02</b><h3>Add money</h3><p>Fund your wallet using the available payment options.</p></div><div><b>03</b><h3>Pay with confidence</h3><p>Choose a service and follow your transaction history.</p></div></div></section>
      <footer className="tr-footer"><Brand/><span>Everyday payments, with more control.</span></footer>
    </main>
  );
}

function DashboardShell(props: {
  userName: string; accountType: string; isAdmin: boolean; view: ViewKey; setView: (view: ViewKey) => void;
  onSignOut: () => void; notice: string; onDismissNotice: () => void; busy: boolean;
  loading: boolean; dashboard: DashboardData | null; onRefresh: () => void;
  network: Network; setNetwork: (network: Network) => void; networkChoices: string[];
  selectedPlanType: "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"|""; setSelectedPlanType:(value:"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"|"")=>void;
  plans: DataPlan[]; selectedPlan: DataPlan | undefined; selectedPlanId: string; setSelectedPlanId: (id: string) => void;
  phone: string; setPhone: (phone: string) => void; dataCouponCode:string; setDataCouponCode:(code:string)=>void; onBuy: (event: FormEvent<HTMLFormElement>) => void;
  onAirtimePurchase: (payload: { networkCode: string; recipient: string; amount: number }) => Promise<void>;
}) {
  const accountLabel = props.accountType.replace(/[_-]/g, " ");
  const navItems: { key: ViewKey; label: string; icon: ReactNode; group: string }[] = [
    { key: "overview", label: "Overview", icon: <House />, group: "Main" },
    { key: "buy", label: "Data", icon: <Database />, group: "Services" },
    { key: "airtime", label: "Airtime", icon: <Smartphone />, group: "Services" },
    { key: "cable", label: "Cable TV", icon: <Tv />, group: "Services" },
    { key: "electricity", label: "Electricity", icon: <Lightbulb />, group: "Services" },
    { key: "epin", label: "Recharge PINs", icon: <Pin />, group: "Services" },
    { key: "data-pin", label: "Data PINs", icon: <PackageCheck />, group: "Services" },
    { key: "education", label: "Education PINs", icon: <ShieldCheck />, group: "Services" },
    { key: "internet", label: "Internet services", icon: <RadioTower />, group: "Services" },
    { key: "gift-cards", label: "Gift Cards", icon: <Gift />, group: "Services" },
    { key: "cards", label: "Virtual Cards", icon: <CreditCard />, group: "Finance" },
    { key: "fx", label: "FX Exchange", icon: <Globe2 />, group: "Finance" },
    { key: "referrals", label: "Referrals", icon: <Users />, group: "Rewards & growth" },
    { key: "coupons", label: "Coupons", icon: <TicketPercent />, group: "Rewards & growth" },
    { key: "promotions", label: "Promotions", icon: <Megaphone />, group: "Rewards & growth" },
    { key: "cashback", label: "Cashback", icon: <Coins />, group: "Rewards & growth" },
    { key: "loyalty", label: "Loyalty", icon: <Award />, group: "Rewards & growth" },
    { key: "fund", label: "Wallet", icon: <Wallet />, group: "Main" },
    { key: "activity", label: props.accountType === "business" ? "Reports & activity" : "Transactions", icon: <FileClock />, group: "Main" },
  ];
  return (
    <div className="tr-app-shell">
      <header className="tr-app-header"><div className="tr-header-inner"><Brand/><div className="tr-header-search"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span><input aria-label="Search" placeholder="Search" /></div><div className="tr-header-actions"><span className="tr-account-chip">{props.accountType.replace(/[_-]/g, " ")}</span><button className="tr-icon-button" aria-label="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button className="tr-user-pill" onClick={props.onSignOut} title="Sign out"><span>{(props.userName || "T").slice(0,1).toUpperCase()}</span><b>{props.userName.split(" ")[0]}</b><ChevronDown className="size-4"/></button></div></div></header>
      <div className="tr-app-layout"><aside className="tr-sidebar"><p className="tr-sidebar-label">MENU</p><nav>{(["Main","Services","Finance","Rewards & growth"] as const).map((group)=><section className="tr-nav-group" key={group}><p className="tr-sidebar-label">{group}</p>{navItems.filter((item)=>item.group===group).map((item)=><button key={item.key} onClick={()=>props.setView(item.key)} className={props.view===item.key?"active":""}><span>{item.icon}</span>{item.label}</button>)}</section>)}</nav><div className="tr-sidebar-bottom"><ShieldCheck/><b>Your account is protected</b><p>Your account, payments and personal information are protected by access controls.</p></div></aside>
        <main className="tr-main"><div className="tr-page-top"><div><p className="tr-muted">{accountLabel.toUpperCase()} ACCOUNT · {new Intl.DateTimeFormat("en-NG",{weekday:"long",day:"numeric",month:"long"}).format(new Date())}</p><h1>{headingForView(props.view, props.userName)}</h1></div><button className="tr-refresh" onClick={props.onRefresh} disabled={props.loading}><Clock3/> Refresh</button></div>
          {props.notice && <Notice message={props.notice} onClose={props.onDismissNotice}/>}
          {props.dashboard?.kyc?.status !== "approved" && props.dashboard && <KycAndFundingOnboarding dashboard={props.dashboard} onRefresh={props.onRefresh}/>}
          {props.loading && !props.dashboard ? <LoadingScreen compact/> : null}
          {props.view === "overview" && <Overview dashboard={props.dashboard} accountType={props.accountType} onNavigate={props.setView}/>}
          {props.view === "buy" && <BuyDataView {...props}/>}
          {props.view === "fund" && <FundWalletView {...props}/>}
          {props.view === "activity" && <ActivityView dashboard={props.dashboard}/>}
          {(["airtime","cable","electricity","epin","data-pin","education","internet","gift-cards","cards","fx","referrals","coupons","promotions","cashback","loyalty"] as ViewKey[]).includes(props.view) && <FeatureWorkspace view={props.view as FeatureView} accountType={props.accountType} catalogue={props.dashboard?.catalogue ?? []} catalogueOptions={props.dashboard?.catalogueOptions ?? []} busy={props.busy} onAirtimePurchase={props.onAirtimePurchase}/>}
        </main>
      </div>
      <nav className="tr-mobile-nav" aria-label="Account navigation">{([{key:"overview" as ViewKey,label:"Home",icon:<House/>},{key:"buy" as ViewKey,label:"Data",icon:<Database/>},{key:"airtime" as ViewKey,label:"Airtime",icon:<Smartphone/>},{key:"referrals" as ViewKey,label:"Rewards",icon:<Gift/>},{key:"fund" as ViewKey,label:"Wallet",icon:<Wallet/>}] as const).map((item)=><button key={item.key} onClick={()=>props.setView(item.key)} className={props.view===item.key || (item.key==="referrals" && ["referrals","coupons","promotions","cashback","loyalty"].includes(props.view))?"active":""}><span>{item.icon}</span>{item.label}</button>)}</nav>
    </div>
  );
}

function Overview({ dashboard, accountType, onNavigate }: { dashboard: DashboardData | null; accountType: string; onNavigate: (view: ViewKey) => void }) {
  const balance = dashboard?.wallet?.balance;
  const recent = [...(dashboard?.transactions ?? [])].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,5);
  const tiles: {icon:ReactNode;title:string;sub:string;status:string;tone:string;view:ViewKey}[] = [
    {icon:<Smartphone/>,title:"Airtime",sub:"Mobile network top-ups",status:"Supplier catalogue",tone:"purple",view:"airtime"},
    {icon:<Database/>,title:"Data",sub:"Browse available data bundles",status:"Supplier catalogue",tone:"blue",view:"buy"},
    {icon:<Tv/>,title:"Cable TV",sub:"TV subscriptions and packages",status:"Supplier catalogue",tone:"orange",view:"cable"},
    {icon:<Lightbulb/>,title:"Electricity",sub:"Meter verification and payments",status:"Supplier catalogue",tone:"green",view:"electricity"},
    {icon:<Pin/>,title:"Recharge PINs",sub:"Available PIN products",status:"Supplier catalogue",tone:"blue",view:"epin"},
    {icon:<PackageCheck/>,title:"Data PINs",sub:"Data vouchers for distribution",status:"Supplier catalogue",tone:"blue",view:"data-pin"},
    {icon:<ShieldCheck/>,title:"Education PINs",sub:"Examination vouchers",status:"Supplier catalogue",tone:"purple",view:"education"},
    {icon:<RadioTower/>,title:"Internet",sub:"Broadband and specialist data",status:"Supplier catalogue",tone:"green",view:"internet"},
    {icon:<Gift/>,title:"Gift Cards",sub:"Digital gift-card products",status:"Supplier catalogue",tone:"orange",view:"gift-cards"},
    {icon:<CreditCard/>,title:"Virtual Cards",sub:"Create and manage payment cards",status:"Card service",tone:"blue",view:"cards"},
  ];
  return <div className="tr-dashboard-content">
    <section className="tr-overview-grid"><div className="tr-balance-panel"><div className="tr-panel-top"><span>{accountType.toUpperCase().replace(/[_-]/g, " ")} ACCOUNT · NGN</span><button aria-label="Wallet options"><MoreHorizontal/></button></div><p className="tr-balance-caption">Total balance</p><div className="tr-balance-amount">{typeof balance === "number" ? formatNaira(balance) : "—"}</div><div className="tr-balance-bottom"><span><span className="tr-status-dot"/> {dashboard?.profile?.account_status === "suspended" ? "Account suspended" : dashboard?.profile?.account_status === "restricted" ? "Account restricted" : dashboard?.wallet ? "Account active" : "Wallet setup pending"}</span><button onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight/></button></div></div>
      <div className="tr-actions-panel"><div className="tr-widget-heading"><h2>Quick actions</h2><span>Manage money</span></div><div className="tr-quick-grid"><button onClick={()=>onNavigate("fund")}><span className="q-blue"><Plus/></span><b>Add money</b></button><button onClick={()=>onNavigate("buy")}><span className="q-dark"><ArrowUpRight/></span><b>Buy data</b></button><button onClick={()=>onNavigate("activity")}><span className="q-purple"><FileClock/></span><b>History</b></button><button onClick={()=>onNavigate("buy")}><span className="q-green"><Grid2X2/></span><b>All services</b></button></div></div></section>
    <section className="tr-service-section"><div className="tr-widget-heading"><div><h2>{accountType === "agent" ? "Reseller services" : accountType === "business" ? "Business services" : "Your services"}</h2><p>{accountType === "agent" ? "Access services for your resale business." : accountType === "business" ? "Manage digital service purchases for your organisation." : "What would you like to do today?"}</p></div><button onClick={()=>onNavigate("buy")}>See all <ArrowRight/></button></div><div className="tr-services-grid">{tiles.map((tile)=><button key={tile.title} className="tr-service-card" onClick={()=>onNavigate(tile.view)}><span className={`tr-service-icon ${tile.tone}`}>{tile.icon}</span><span className="tr-service-title">{tile.title}</span><span className="tr-service-sub">{tile.sub}</span><span className={`tr-service-status ${tile.status==="Available"?"live":""}`}>{tile.status}</span></button>)}</div></section>
    <section className="tr-service-section tr-rewards-section"><div className="tr-widget-heading"><div><h2>Rewards & growth</h2><p>Discover referral rewards, eligible offers and loyalty benefits.</p></div></div><div className="tr-services-grid">{[
      {view:"referrals" as ViewKey,title:"Referrals",sub:"Invite friends and track qualifying rewards",icon:<Users/>,tone:"blue"},
      {view:"coupons" as ViewKey,title:"Coupons",sub:"Apply eligible discount codes",icon:<TicketPercent/>,tone:"purple"},
      {view:"promotions" as ViewKey,title:"Promotions",sub:"Explore active platform campaigns",icon:<Megaphone/>,tone:"orange"},
      {view:"cashback" as ViewKey,title:"Cashback",sub:"Track earned and settled cashback",icon:<Coins/>,tone:"green"},
      {view:"loyalty" as ViewKey,title:"Loyalty",sub:"Points, tiers and redemption activity",icon:<Award/>,tone:"blue"},
    ].map((item)=><button key={item.view} className="tr-service-card" onClick={()=>onNavigate(item.view)}><span className={`tr-service-icon ${item.tone}`}>{item.icon}</span><span className="tr-service-title">{item.title}</span><span className="tr-service-sub">{item.sub}</span><span className="tr-service-status">View details</span></button>)}</div></section>
    <section className="tr-lower-grid"><div className="tr-widget-card"><div className="tr-widget-heading"><div><h2>{accountType === "business" ? "Business activity" : accountType === "agent" ? "Reseller activity" : "Recent transactions"}</h2><p>{accountType === "business" ? "Recent activity on your business wallet" : accountType === "agent" ? "Recent wallet and service activity" : "Your latest account activity"}</p></div><button onClick={()=>onNavigate("activity")}>View all <ArrowRight/></button></div>{recent.length?recent.map(entry=><TransactionRow key={entry.id} transaction={entry}/>):<EmptyState icon={<FileClock/>} title="No transactions yet" copy="Your wallet activity will appear here."/>}</div>
      {(dashboard?.plans?.length ?? 0) > 0 && <div className="tr-widget-card tr-network-card"><div className="tr-widget-heading"><div><h2>Mobile networks</h2><p>Networks returned by Topupmate</p></div></div>{Array.from(new Set(dashboard?.plans.map((plan) => plan.network) ?? [])).map((choice,index)=><button className="tr-network-row" key={choice} onClick={()=>onNavigate("buy")}><NetworkMark network={choice} index={index}/><span>{choice}</span><ArrowRight/></button>)}</div>}</section>
  </div>;
}

function AccountServiceTile({
  icon,
  title,
  description,
  status,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex min-h-44 flex-col border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid size-10 place-items-center ${tone}`}>{icon}</span>
        <span className="text-xs font-medium text-muted-foreground">{status}</span>
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-5 text-muted-foreground">{description}</p>
      {onClick && <Button variant="ghost" className="mt-2 h-9 w-fit px-0 text-primary" onClick={onClick}>Browse plans <ArrowRight /></Button>}
    </div>
  );
}

type FeatureView = Exclude<ViewKey, "overview" | "buy" | "fund" | "activity">;

const featureDetails: Record<FeatureView, {title:string;eyebrow:string;description:string;icon:ReactNode;group:"service"|"growth";emptyTitle:string;emptyCopy:string}> = {
  airtime:{title:"Buy airtime",eyebrow:"DIGITAL SERVICES",description:"Top up a mobile number using live supplier availability and your account's applicable price.",icon:<Smartphone/>,group:"service",emptyTitle:"Airtime catalogue unavailable",emptyCopy:"Airtime networks and denominations appear automatically from the live Topupmate catalogue."},
  cable:{title:"Cable TV",eyebrow:"DIGITAL SERVICES",description:"Verify a decoder or smart-card number, choose an available package and review the price before payment.",icon:<Tv/>,group:"service",emptyTitle:"TV packages not available yet",emptyCopy:"Packages returned by the active supplier are shown automatically with Admin-configured selling prices."},
  electricity:{title:"Electricity",eyebrow:"DIGITAL SERVICES",description:"Choose a supported distribution company, verify the meter and review the payable amount before purchase.",icon:<Lightbulb/>,group:"service",emptyTitle:"Electricity providers unavailable",emptyCopy:"Supported discos and meter-payment options will appear after the live provider catalogue is connected."},
  epin:{title:"Recharge PINs",eyebrow:"DIGITAL SERVICES",description:"Browse Topupmate recharge vouchers and denominations, with secure PIN delivery after confirmed fulfilment.",icon:<Pin/>,group:"service",emptyTitle:"Recharge PIN catalogue unavailable",emptyCopy:"Only supplier-confirmed PIN products and prices will be listed here."},
  "data-pin":{title:"Data PINs",eyebrow:"DIGITAL SERVICES",description:"Generate and manage supplier-backed mobile data vouchers for distribution.",icon:<PackageCheck/>,group:"service",emptyTitle:"Data PIN catalogue unavailable",emptyCopy:"Available data PIN plans appear automatically when Topupmate returns the catalogue."},
  education:{title:"Education PINs",eyebrow:"DIGITAL SERVICES",description:"Purchase supported WAEC, NECO and other examination PINs.",icon:<ShieldCheck/>,group:"service",emptyTitle:"Education PINs unavailable",emptyCopy:"Exam providers and current prices load from the Topupmate service catalogue."},
  internet:{title:"Internet services",eyebrow:"DIGITAL SERVICES",description:"Explore supported broadband and specialist data services from Topupmate.",icon:<RadioTower/>,group:"service",emptyTitle:"Internet services unavailable",emptyCopy:"Only supplier-returned plans will appear here."},
  "gift-cards":{title:"Gift Cards",eyebrow:"DIGITAL SERVICES",description:"Browse digital gift-card products and purchase eligible denominations.",icon:<Gift/>,group:"service",emptyTitle:"Gift-card catalogue is being connected",emptyCopy:"Topupmate gift cards use the supplier catalogue, denomination mapping and verified purchase/redeem flow."},
  cards:{title:"Virtual Cards",eyebrow:"CARDS & PAYMENTS",description:"Create and manage virtual payment cards, fund cards, review transactions and control card security.",icon:<CreditCard/>,group:"service",emptyTitle:"No virtual cards yet",emptyCopy:"Complete your cardholder details and approved KYC to request your first virtual card."},
  fx:{title:"FX Exchange",eyebrow:"CURRENCY",description:"Get a live provider quote and convert currencies using a time-limited rate.",icon:<Globe2/>,group:"service",emptyTitle:"FX conversion is not enabled yet",emptyCopy:"Live quotes and execution will be connected after quote expiry, wallet currency and settlement controls are implemented."},
  referrals:{title:"Refer and earn",eyebrow:"REWARDS & GROWTH",description:"Invite people to TolirexData and follow referral qualification and reward settlement.",icon:<Users/>,group:"growth",emptyTitle:"Your referral programme is not active yet",emptyCopy:"Your referral code and reward history will appear here when the programme is enabled by the platform."},
  coupons:{title:"Coupons",eyebrow:"REWARDS & GROWTH",description:"Use eligible coupon codes for discounts on supported services. Eligibility and limits are checked securely at redemption.",icon:<TicketPercent/>,group:"growth",emptyTitle:"No eligible coupons to show",emptyCopy:"Active coupons published for your account type will appear here. Expired or ineligible codes will not be presented as available."},
  promotions:{title:"Promotions",eyebrow:"REWARDS & GROWTH",description:"Discover platform campaigns, welcome offers and limited-time benefits available to your account.",icon:<Megaphone/>,group:"growth",emptyTitle:"No active promotions",emptyCopy:"Campaigns published by TolirexData will appear here with their eligibility, dates and terms."},
  cashback:{title:"Cashback",eyebrow:"REWARDS & GROWTH",description:"Review cashback earned from qualifying transactions, pending rewards and settled wallet credits.",icon:<Coins/>,group:"growth",emptyTitle:"No cashback activity yet",emptyCopy:"Cashback rules and reward history will appear when an eligible campaign is active. No reward is assumed or credited by this screen."},
  loyalty:{title:"Loyalty",eyebrow:"REWARDS & GROWTH",description:"Track loyalty points, membership tier and eligible redemption options.",icon:<Award/>,group:"growth",emptyTitle:"Loyalty programme not configured",emptyCopy:"Your points, tier and redemption options will appear when the loyalty programme is configured and enabled."},
};

function FeatureWorkspace({view,accountType,catalogue,catalogueOptions,busy,onAirtimePurchase}:{view:FeatureView;accountType:string;catalogue:CatalogueProduct[];catalogueOptions:CatalogueOption[];busy:boolean;onAirtimePurchase:(payload:{networkCode:string;recipient:string;amount:number;couponCode?:string})=>Promise<void>}) {
  const [airtimeNetwork,setAirtimeNetwork]=useState("");
  const [airtimePhone,setAirtimePhone]=useState("");
  const [airtimeAmount,setAirtimeAmount]=useState("100");
  const [airtimeCouponCode,setAirtimeCouponCode]=useState("");
  const [airtimeCustomAmount,setAirtimeCustomAmount]=useState(false);
  const [selectedProductId,setSelectedProductId]=useState("");
  const [selectedOptionCode,setSelectedOptionCode]=useState("");
  const [recipient,setRecipient]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [meterType,setMeterType]=useState<"prepaid"|"postpaid">("prepaid");
  const [serviceAmount,setServiceAmount]=useState("1000");
  const [quantity,setQuantity]=useState("1");
  const [giftCountry,setGiftCountry]=useState("ALL");
  const [giftCategory,setGiftCategory]=useState("ALL");
  const [giftSearch,setGiftSearch]=useState("");
  const [couponCode,setCouponCode]=useState("");
  const [internetAccountType,setInternetAccountType]=useState<"PhoneNumber"|"AccountNumber">("PhoneNumber");
  const [verifiedName,setVerifiedName]=useState("");
  const [serviceNotice,setServiceNotice]=useState("");
  const [fulfilment,setFulfilment]=useState<any>(null);
  const [lastGiftCardReference,setLastGiftCardReference]=useState("");
  const [lastServiceReference,setLastServiceReference]=useState("");
  const [servicePending,setServicePending]=useState(false);
  const [giftCardRetrievalPending,setGiftCardRetrievalPending]=useState(false);
  const [serviceBusy,setServiceBusy]=useState(false);
  const feature=featureDetails[view];
  const categoryCode=({airtime:"airtime",cable:"cable_tv",electricity:"electricity",epin:"recharge_pin","data-pin":"data_pin",education:"education",internet:"internet","gift-cards":"gift_card",cards:"virtual_card",fx:"fx_conversion"} as Record<string,string>)[view];
  const options=catalogueOptions.filter((option)=>option.category_code===categoryCode);
  const products=catalogue.filter((item)=>item.category_code===categoryCode);
  const selectedProduct=products.find((item)=>item.id===selectedProductId);
  const optionType=view==="cable"?"cable_provider":view==="electricity"?"operator":view==="internet"?"internet_provider":"network";
  const supplierOptions=options.filter((option)=>option.option_type===optionType);
  // Match IyanjuPay: keep network selection usable from real supplier plans
  // if a separate network option row is missing from the imported catalogue.
  const derivedAirtimeOptions: CatalogueOption[] = [];
  if(view==="airtime"&&!supplierOptions.length){
    const seenNetworks=new Set<string>();
    const networkNames:Record<string,string>={"1":"MTN","01":"MTN","2":"Airtel","02":"Airtel","3":"Glo","03":"Glo","4":"9mobile","04":"9mobile"};
    for(const item of catalogue.filter(item=>item.category_code==="data"&&item.network_or_operator)){
      const code=String(item.network_or_operator);
      if(seenNetworks.has(code))continue;
      seenNetworks.add(code);
      derivedAirtimeOptions.push({id:"derived-network-"+code,category_code:"airtime",option_type:"network",option_code:code,parent_option_code:null,name:networkNames[code]||code});
    }
  }
  const serviceOptions=supplierOptions.length?supplierOptions:derivedAirtimeOptions;
  const runExpanded=async(payload:any)=>{
    const result=await manageTopupmateExpandedService({data:payload});
    if(result?.error)throw new Error(String(result.error));
    return result;
  };
  const verifyService=async()=>{
    setServiceBusy(true);setServiceNotice("");setFulfilment(null);setVerifiedName("");
    try{
      const payload=view==="cable"
        ? {action:"verify" as const,service:"cable_tv",providerCode:selectedOptionCode,iuc:recipient}
        : {action:"verify" as const,service:"electricity",providerCode:selectedOptionCode,meterNumber:recipient,meterType};
      const result=await runExpanded(payload);
      setVerifiedName(result.customerName||"Verified customer");
      setServiceNotice(result.message||"Customer verified successfully.");
    }catch(error){setServiceNotice(messageOf(error,"Unable to verify this customer."));}
    finally{setServiceBusy(false);}
  };
  const buyExpanded=async()=>{
    if(!selectedProduct&&view!=="electricity"&&!(view==="internet"&&selectedOptionCode!=="smile")){setServiceNotice("Choose an available supplier product first.");return;}
    setServiceBusy(true);setServiceNotice("");setFulfilment(null);
    try{
      const category=categoryCode;
      const productPayload=selectedProduct?{productId:selectedProduct.id}:{};
      const optionPayload=selectedOptionCode?{optionCode:selectedOptionCode}:{};
      const base={action:"purchase" as const,categoryCode:category,...productPayload,...optionPayload,
        recipient,quantity:Number(quantity)||1,contactPhone:contactPhone||undefined,couponCode:couponCode.trim().toUpperCase()||undefined,idempotencyKey:crypto.randomUUID().replace(/-/g,"")};
      const payload=view==="electricity"?{...base,amount:Number(serviceAmount),meterType}
        :view==="cable"?{...base,subtype:"renew"}
        :view==="internet"?{...base,amount:selectedOptionCode==="smile"?undefined:Number(serviceAmount),accountType:internetAccountType}
        :view==="gift-cards"?{...base}
        :base;
      const result=await runExpanded(payload);
      const couponSummary=Number(result.discountAmount)>0?` ${result.couponCode} saved ${formatNaira(Number(result.discountAmount))}; you paid ${formatNaira(Number(result.chargedAmount))}.`:"";
      setServiceNotice(result.status==="successful"?(result.fulfilmentPending?"Purchase completed. Your gift-card code can be retrieved again below."+couponSummary:"Purchase completed successfully."+couponSummary):"Your request is awaiting Topupmate confirmation. Do not submit it again.");
      setFulfilment(result.fulfilment??null);
      setLastServiceReference(result.reference??"");
      setServicePending(["unknown","processing"].includes(result.status));
      setGiftCardRetrievalPending(view==="gift-cards"&&result.status==="successful"&&result.fulfilmentPending===true);
      setLastGiftCardReference(view==="gift-cards"&&result.status==="successful"?result.reference??"":"");
      setVerifiedName("");
    }catch(error){setServiceNotice(messageOf(error,"The purchase could not be completed."));}
    finally{setServiceBusy(false);}
  };
  const giftCountries=Array.from(new Set(products.map(item=>item.country_code).filter((value):value is string=>!!value)));
  const giftCategories=Array.from(new Set(products.map(item=>item.product_category).filter((value):value is string=>!!value)));
  const visibleGiftProducts=products.filter(item=>
    (giftCountry==="ALL"||item.country_code===giftCountry)&&
    (giftCategory==="ALL"||item.product_category===giftCategory)&&
    (!giftSearch.trim()||item.name.toLowerCase().includes(giftSearch.trim().toLowerCase()))
  );
  const selectedProducts=products.filter((item)=>!selectedOptionCode||!["cable","epin","data-pin"].includes(view)||!item.network_or_operator||item.network_or_operator===selectedOptionCode||({"1":"MTN","2":"Airtel","3":"Glo","4":"9mobile"}[String(item.network_or_operator)]===serviceOptions.find(o=>o.option_code===selectedOptionCode)?.name));
  const checkExpandedStatus=async()=>{
    if(!lastServiceReference)return;
    setServiceBusy(true);setServiceNotice("");
    try{
      const result=await runExpanded({action:"status",reference:lastServiceReference});
      setServicePending(["unknown","processing"].includes(result.status));
      if(result.status==="successful"){
        setServiceNotice("Topupmate confirmed this purchase as successful.");
        if(view==="gift-cards"){setLastGiftCardReference(lastServiceReference);setGiftCardRetrievalPending(true);}
      }else if(result.status==="refunded"||result.status==="failed"){
        setServiceNotice("Topupmate confirmed the purchase failed. The wallet refund status is "+result.status+".");
      }else setServiceNotice(result.message||"The supplier has not confirmed this purchase yet.");
    }catch(error){setServiceNotice(messageOf(error,"Unable to check this purchase yet."));}
    finally{setServiceBusy(false);}
  };
  const retrieveGiftCard=async()=>{
    if(!lastGiftCardReference)return;
    setServiceBusy(true);setServiceNotice("");
    try{const result=await runExpanded({action:"giftcard_redeem",reference:lastGiftCardReference});setFulfilment(result.fulfilment??null);setGiftCardRetrievalPending(result.status==="fulfilment_pending");setServiceNotice(result.status==="successful"?"Gift-card code retrieved successfully.":result.message||"Gift-card code is still processing.");}
    catch(error){setServiceNotice(messageOf(error,"Unable to retrieve the gift-card code."));}
    finally{setServiceBusy(false);}
  };
  return <div className="tr-feature-workspace">
    <section className="tr-feature-hero">
      <div className="tr-feature-icon">{feature.icon}</div>
      <div><span className="tr-kicker">{feature.eyebrow}</span><h2>{feature.title}</h2><p>{feature.description}</p></div>
      <span className="tr-feature-account">{accountType.replace(/[_-]/g," ")}</span>
    </section>
    {view==="cards" ? <VirtualCardsWorkspace busy={busy}/> : view==="airtime" ? <section className="tr-feature-panel">
      <div className="tr-feature-panel-heading"><div><h3>Buy airtime</h3><p>Networks and their identifiers come from the synchronized Topupmate catalogue.</p></div><span className="tr-catalogue-state"><i/>{serviceOptions.length?"Networks available":"No supplier networks available"}</span></div>
      {serviceOptions.length ? <form className="mt-5 grid max-w-xl gap-4" onSubmit={(event)=>{event.preventDefault();if(!/^\d{11}$/.test(airtimePhone)||!airtimeNetwork)return;void onAirtimePurchase({networkCode:airtimeNetwork,recipient:airtimePhone,amount:Number(airtimeAmount),couponCode:airtimeCouponCode.trim().toUpperCase()||undefined});}}>
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose mobile network</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{options.map((option,index)=><ProviderChoice key={option.id} name={option.name} code={option.option_code} selected={airtimeNetwork===option.option_code} index={index} onClick={()=>setAirtimeNetwork(option.option_code)}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">Phone number<Input inputMode="numeric" maxLength={11} placeholder="08012345678" value={airtimePhone} onChange={(event)=>setAirtimePhone(event.target.value.replace(/\D/g,""))} required/></label>
        <div className="grid gap-2"><p className="text-sm font-semibold">Select amount</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{[50,100,200,500,1000,2000,5000].map(value=><button key={value} type="button" onClick={()=>{setAirtimeAmount(String(value));setAirtimeCustomAmount(false);}} className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${airtimeAmount===String(value)&&!airtimeCustomAmount?"border-primary bg-primary/10 text-primary":"border-border bg-background"}`}>₦{value.toLocaleString("en-NG")}</button>)}<button type="button" onClick={()=>{setAirtimeCustomAmount(true);setAirtimeAmount("");}} className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${airtimeCustomAmount?"border-primary bg-primary/10 text-primary":"border-border bg-background"}`}>Custom</button></div>{airtimeCustomAmount&&<Input type="number" min={50} max={200000} step={1} value={airtimeAmount} onChange={event=>setAirtimeAmount(event.target.value)} placeholder="Enter amount" required/>}</div>
        <label className="grid gap-2 text-sm font-medium">Coupon code (optional)<Input value={airtimeCouponCode} onChange={event=>setAirtimeCouponCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32))} placeholder="Enter promotion code"/></label>
        <Button type="submit" disabled={busy||!airtimeNetwork||!/^\d{11}$/.test(airtimePhone)||Number(airtimeAmount)<50||Number(airtimeAmount)>200000}>{busy?"Processing…":"Continue to purchase"} <ArrowRight/></Button>
      </form> : <EmptyState icon={<Smartphone/>} title="Airtime networks unavailable" copy="The supplier has not returned any usable mobile networks yet. Synchronize the Topupmate catalogue and check the provider response."/>}
    </section> : ["cable","electricity","epin","data-pin","education","internet","gift-cards"].includes(view) ? <section className="tr-feature-panel">
      <div className="tr-feature-panel-heading"><div><h3>{view==="cable"?"Cable TV subscription":view==="electricity"?"Electricity payment":view==="epin"?"Recharge PINs":view==="data-pin"?"Data PINs":view==="education"?"Education PINs":view==="internet"?"Internet bundle":"Gift card purchase"}</h3><p>Live Topupmate catalogue · Admin-managed selling prices</p></div><span className="tr-catalogue-state"><i/>{products.length?"Products available":"No supplier products available"}</span></div>
      {serviceNotice&&<div role="status" className="my-4 rounded-xl border bg-secondary/50 p-3 text-sm">{serviceNotice}</div>}
      <label className="mt-4 grid max-w-xl gap-2 text-sm font-medium">Coupon code (optional)<Input value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32))} placeholder="Enter promotion code"/><span className="text-xs font-normal text-muted-foreground">The coupon is checked against the final server-calculated price before your wallet is charged.</span></label>
      {view==="cable"&&<div className="mt-5 grid max-w-xl gap-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose TV provider</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{serviceOptions.map((o,index)=><ProviderChoice key={o.id} name={o.name} code={o.option_code} selected={selectedOptionCode===o.option_code} index={index} onClick={()=>{setSelectedOptionCode(o.option_code);setSelectedProductId("");setVerifiedName("");setRecipient("");}}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">SmartCard / IUC number<Input value={recipient} onChange={e=>{setRecipient(e.target.value.replace(/\D/g,""));setVerifiedName("");}} maxLength={20} placeholder="Enter decoder number"/></label>
        <Button type="button" variant="outline" disabled={serviceBusy||!selectedOptionCode||recipient.length<8} onClick={()=>void verifyService()}>{serviceBusy?"Verifying…":"Verify decoder"}</Button>
        {verifiedName&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Verified customer: {verifiedName}</p>}
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose subscription package</p><div className="grid gap-2 sm:grid-cols-2">{selectedProducts.map(p=><ProductChoice key={p.id} product={p} selected={selectedProductId===p.id} onClick={()=>setSelectedProductId(p.id)}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">Contact phone (optional)<Input value={contactPhone} onChange={e=>setContactPhone(e.target.value.replace(/\D/g,""))} maxLength={11} placeholder="08012345678"/></label>
        <Button disabled={serviceBusy||!verifiedName||!selectedProductId||!selectedOptionCode} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Pay for subscription"} <ArrowRight/></Button>
      </div>}
      {view==="electricity"&&<div className="mt-5 grid max-w-xl gap-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose electricity provider</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{serviceOptions.map((o,index)=><ProviderChoice key={o.id} name={o.name} code={o.option_code} selected={selectedOptionCode===o.option_code} index={index} onClick={()=>{setSelectedOptionCode(o.option_code);setVerifiedName("");setRecipient("");}}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">Meter type<select className="h-11 border bg-background px-3" value={meterType} onChange={e=>{setMeterType(e.target.value as "prepaid"|"postpaid");setVerifiedName("");}}><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></label>
        <label className="grid gap-2 text-sm font-medium">Meter number<Input value={recipient} onChange={e=>{setRecipient(e.target.value.replace(/\D/g,""));setVerifiedName("");}} placeholder="Enter meter number"/></label>
        <Button type="button" variant="outline" disabled={serviceBusy||!selectedOptionCode||!recipient} onClick={()=>void verifyService()}>{serviceBusy?"Verifying…":"Verify meter"}</Button>
        {verifiedName&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Verified customer: {verifiedName}</p>}
        <label className="grid gap-2 text-sm font-medium">Amount (₦)<Input type="number" min={1} max={1000000} value={serviceAmount} onChange={e=>setServiceAmount(e.target.value)}/></label>
        <label className="grid gap-2 text-sm font-medium">Contact phone (optional)<Input value={contactPhone} onChange={e=>setContactPhone(e.target.value.replace(/\D/g,""))} maxLength={11}/></label>
        <Button disabled={serviceBusy||!verifiedName||Number(serviceAmount)<=0||!selectedOptionCode} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Pay electricity bill"} <ArrowRight/></Button>
      </div>}
      {["epin","data-pin"].includes(view)&&<div className="mt-5 grid max-w-xl gap-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose mobile network</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{serviceOptions.map((o,index)=><ProviderChoice key={o.id} name={o.name} code={o.option_code} selected={selectedOptionCode===o.option_code} index={index} onClick={()=>{setSelectedOptionCode(o.option_code);setSelectedProductId("");}}/>)}</div></div>
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose PIN denomination / plan</p><div className="grid gap-2 sm:grid-cols-2">{selectedProducts.map(p=><ProductChoice key={p.id} product={p} selected={selectedProductId===p.id} onClick={()=>setSelectedProductId(p.id)}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={100} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||!selectedOptionCode||Number(quantity)<1||Number(quantity)>100} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase PINs"} <ArrowRight/></Button>
      </div>}
      {view==="education"&&<div className="mt-5 grid max-w-xl gap-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose examination PIN</p><div className="grid gap-2 sm:grid-cols-2">{products.map(p=><ProductChoice key={p.id} product={p} selected={selectedProductId===p.id} onClick={()=>setSelectedProductId(p.id)}/>)}</div></div>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={20} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||Number(quantity)<1||Number(quantity)>20} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase examination PIN"} <ArrowRight/></Button>
      </div>}
      {view==="internet"&&<div className="mt-5 grid max-w-xl gap-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">Choose internet provider</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{serviceOptions.map((o,index)=><ProviderChoice key={o.id} name={o.name} code={o.option_code} selected={selectedOptionCode===o.option_code} index={index} onClick={()=>{setSelectedOptionCode(o.option_code);setSelectedProductId("");setVerifiedName("");setRecipient("");}}/>)}</div></div>
        {selectedOptionCode==="smile"?<div className="grid gap-2"><p className="text-sm font-semibold">Choose Smile bundle</p><div className="grid gap-2 sm:grid-cols-2">{products.map(p=><ProductChoice key={p.id} product={p} selected={selectedProductId===p.id} onClick={()=>setSelectedProductId(p.id)}/>)}</div></div>:selectedOptionCode&&<label className="grid gap-2 text-sm font-medium">Top-up amount (₦)<Input type="number" min={50} max={200000} value={serviceAmount} onChange={e=>setServiceAmount(e.target.value)}/></label>}
        <label className="grid gap-2 text-sm font-medium">ISP account / phone number<Input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder={selectedOptionCode==="smile"?"Smile account number or registered phone":"Enter phone number"}/></label>
        {selectedOptionCode==="smile"&&<label className="grid gap-2 text-sm font-medium">Account identifier type<select className="h-11 border bg-background px-3" value={internetAccountType} onChange={e=>setInternetAccountType(e.target.value as "PhoneNumber"|"AccountNumber")}><option value="PhoneNumber">Phone number</option><option value="AccountNumber">Account number</option></select></label>}
        <Button disabled={serviceBusy||!selectedOptionCode||!recipient||(selectedOptionCode==="smile"?!selectedProductId:Number(serviceAmount)<=0)} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":selectedOptionCode==="smile"?"Buy Smile bundle":"Buy internet top-up"} <ArrowRight/></Button>
      </div>}
      {view==="gift-cards"&&<div className="mt-5 grid max-w-3xl gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
          <label className="grid gap-2 text-sm font-medium">Search gift cards<Input value={giftSearch} onChange={e=>setGiftSearch(e.target.value)} placeholder="Search gift card brands"/></label>
          <label className="grid gap-2 text-sm font-medium">Country<select className="h-10 rounded-lg border bg-background px-3 text-sm" value={giftCountry} onChange={e=>setGiftCountry(e.target.value)}><option value="ALL">All countries</option>{giftCountries.map(country=><option key={country} value={country}>{country}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium">Category<select className="h-10 rounded-lg border bg-background px-3 text-sm" value={giftCategory} onChange={e=>setGiftCategory(e.target.value)}><option value="ALL">All categories</option>{giftCategories.map(category=><option key={category} value={category}>{category}</option>)}</select></label>
        </div>
        <div className="grid gap-2"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Choose gift card denomination</p><span className="text-xs text-muted-foreground">{visibleGiftProducts.length} available</span></div><div className="grid gap-2 sm:grid-cols-2">{visibleGiftProducts.map(p=><ProductChoice key={p.id} product={p} selected={selectedProductId===p.id} onClick={()=>setSelectedProductId(p.id)}/>)}</div>{visibleGiftProducts.length===0&&<EmptyState icon={<Gift/>} title="No matching gift cards" copy="Try another country, category or search term."/ >}</div>
        <label className="grid gap-2 text-sm font-medium">Recipient email<Input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="recipient@example.com"/></label>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={20} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||!/^\S+@\S+\.\S+$/.test(recipient)||Number(quantity)<1||Number(quantity)>20} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase gift card"} <ArrowRight/></Button>
      </div>}
      {products.length===0&&view!=="electricity"&&!(view==="internet"&&serviceOptions.length>0)&&<EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/>}
      {serviceNotice&&<div className="mt-4 text-sm text-muted-foreground">{serviceNotice}</div>}
      {lastServiceReference&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-xs font-semibold">Supplier reference</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{lastServiceReference}</p></div>{servicePending&&<Button type="button" variant="outline" size="sm" disabled={serviceBusy} onClick={()=>void checkExpandedStatus()}>{serviceBusy?"Checking…":"Check transaction status"}</Button>}</div>}
      {view==="gift-cards"&&lastGiftCardReference&&giftCardRetrievalPending&&<Button type="button" variant="outline" className="mt-4" disabled={serviceBusy} onClick={()=>void retrieveGiftCard()}>{serviceBusy?"Retrieving…":"Retrieve gift-card code"}</Button>}
      {fulfilment&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="text-sm font-semibold text-emerald-900">Supplier fulfilment details</h4><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-emerald-950">{JSON.stringify(fulfilment,null,2)}</pre></div>}
    </section> : feature.group==="service" ? <section className="tr-feature-panel"><div className="tr-feature-panel-heading"><div><h3>Available products</h3><p>Live supplier catalogue · Admin-controlled selling prices</p></div><span className="tr-catalogue-state"><i/>{products.length?"Products available":"No supplier products available"}</span></div>{products.length ? <div className="tr-catalogue-products">{products.map((item)=><div className="tr-catalogue-product" key={item.id}><div><strong>{item.name}</strong><span>{item.network_or_operator ?? item.description ?? item.category_name}</span></div><b>{formatNaira(item.selling_price)}</b></div>)}</div> : <EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/ >}{options.length>0&&<div className="mt-5 border-t pt-4"><h4 className="text-sm font-semibold text-foreground">Available networks and operators</h4><div className="mt-3 flex flex-wrap gap-2">{options.map(option=><span key={option.id} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground">{option.name}</span>)}</div></div>}</section> : <section className="tr-feature-panel"><div className="tr-feature-panel-heading"><div><h3>Your programme</h3><p>Offers and rewards are controlled by TolirexData</p></div><span className="tr-catalogue-state"><i/>Programme status</span></div><EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/></section>}
    <p className="tr-feature-footnote"><ShieldCheck/> Prices, eligibility and rewards are validated by the platform. This page does not invent offers, balances or successful transactions.</p>
  </div>;
}


function VirtualCardsWorkspace({busy}:{busy:boolean}) {
  const [cards,setCards]=useState<any[]>([]);
  const [operations,setOperations]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [profile,setProfile]=useState({firstName:"",lastName:"",phone:"",email:"",dateOfBirth:"",address:"",state:"",city:""});
  const [amount,setAmount]=useState("10");
  const [quoteResult,setQuoteResult]=useState<any|null>(null);
  const [quoteAt,setQuoteAt]=useState(0);
  const [selected,setSelected]=useState<any|null>(null);
  const [details,setDetails]=useState<any|null>(null);
  const [transactions,setTransactions]=useState<any|null>(null);
  const [showProfile,setShowProfile]=useState(false);
  const [reveal,setReveal]=useState(false);
  const run=async(payload:any)=>{
    const result=await manageTopupmateVirtualCard({data:payload});
    if(result?.error)throw new Error(String(result.error));
    return result;
  };
  const load=async()=>{setLoading(true);try{const r=await run({action:"list"});const next=r.cards??[];setCards(next);setOperations(r.operations??[]);setSelected(current=>current?next.find((item:any)=>item.id===current.id)??current:current);}catch(e){setNotice(messageOf(e,"Unable to load virtual cards."));}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const perform=async(payload:any)=>{
    setSaving(true);setNotice("");try{const r=await run(payload);setNotice(r.message??(r.status==="processing"?"Your request is processing.":"Request completed."));if(r.details){setDetails(r.details);setReveal(true);}if(r.transactions)setTransactions(r.transactions);await load();return r;}catch(e){setNotice(messageOf(e,"The card request could not be completed."));}finally{setSaving(false);}
  };
  const saveProfile=async()=>{const r=await perform({action:"save_profile",...profile});if(r?.success)setShowProfile(false);};
  const quoteCard=async()=>{
    const amountUsd=Number(amount);if(!Number.isFinite(amountUsd)||amountUsd<=0){setNotice("Enter a valid initial funding amount in USD.");return;}
    setSaving(true);setNotice("");try{const r=await run({action:"quote",kind:"create",amountUsd});setQuoteResult(r);setQuoteAt(Date.now());setNotice("Card funding quote calculated using current Admin pricing.");}catch(e){setNotice(messageOf(e,"Unable to calculate card funding cost."));}finally{setSaving(false);}
  };
  const create=async()=>{const amountUsd=Number(amount);if(!Number.isFinite(amountUsd)||amountUsd<=0){setNotice("Enter a valid initial funding amount in USD.");return;}if(!quoteResult||Number(quoteResult.amountUsd)!==amountUsd||Date.now()-quoteAt>60000){setNotice("Calculate a fresh card funding quote before creating the card.");return;}const r=await perform({action:"create",amountUsd,brand:"VISA",idempotencyKey:crypto.randomUUID().replace(/-/g,"")});if(r?.success&&r.card){const latest=await run({action:"list"});const issued=(latest.cards??[])[0];setCards(latest.cards??[]);if(issued)setSelected(issued);setDetails(r.card);setReveal(true);}};
  const cardAction=(action:"topup"|"withdraw"|"freeze"|"unfreeze"|"terminate")=>{
    if(!selected?.id){setNotice("Select a card first.");return;}
    if(action==="freeze"||action==="unfreeze"||action==="terminate"){
      if(!window.confirm(action==="terminate"?"Terminate this card permanently? This cannot be undone.":action==="freeze"?"Freeze this card?":"Unfreeze this card?"))return;
      void perform({action,cardId:selected.id,idempotencyKey:crypto.randomUUID().replace(/-/g,"")});
    }else{
      const value=window.prompt(action==="topup"?"How much USD would you like to add?":"How much USD would you like to withdraw?");
      if(!value)return;const amountUsd=Number(value);if(!Number.isFinite(amountUsd)||amountUsd<=0){setNotice("Enter a valid USD amount.");return;}
      void perform({action,cardId:selected.id,amountUsd,idempotencyKey:crypto.randomUUID().replace(/-/g,"")});
    }
  };
  return <section className="tr-feature-panel">
    <div className="tr-feature-panel-heading"><div><h3>Your virtual cards</h3><p>Issued by Topupmate · wallet operations are settled through TolirexData</p></div><Button variant="outline" size="sm" onClick={()=>void load()} disabled={loading}>Refresh</Button></div>
    {notice&&<div role="status" className="my-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">{notice}</div>}
    {loading?<LoadingScreen compact/>:cards.length===0?<div className="my-5 grid gap-4 rounded-xl border border-dashed p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong className="text-sm">Create your first virtual card</strong><p className="mt-1 text-sm text-muted-foreground">You need approved KYC and verified cardholder details before card issuance.</p></div><Button onClick={()=>setShowProfile(x=>!x)} variant="outline">Cardholder details</Button></div>:<div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(card=><button key={card.id} onClick={()=>{setSelected(card);setDetails(null);setTransactions(null);setReveal(false);}} className={`rounded-xl border p-4 text-left transition-colors ${selected?.id===card.id?"border-primary bg-primary/5":"hover:bg-secondary"}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider">{card.card_type} · {card.currency}</span><StatusBadge status={card.status}/></div><p className="mt-6 text-lg font-semibold tracking-widest">{card.masked_pan??"Virtual card"}</p><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>•••• {card.last4??"----"}</span><span>{card.expiry_month??"--"}/{card.expiry_year??"----"}</span></div></button>)}</div>}
    {showProfile&&<div className="my-4 rounded-xl border p-4"><h4 className="font-semibold">Cardholder details</h4><p className="mb-4 mt-1 text-xs text-muted-foreground">Saved securely for card issuance. Your approved BVN/NIN is taken from your KYC record, not this form.</p><div className="grid gap-3 sm:grid-cols-2">{([["firstName","First name"],["lastName","Last name"],["phone","Phone"],["email","Email"],["dateOfBirth","Date of birth"],["address","Street address"],["state","State"],["city","City"]] as const).map(([key,label])=><label key={key} className="grid gap-1 text-xs font-medium text-muted-foreground">{label}<Input type={key==="dateOfBirth"?"date":"text"} value={profile[key]} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))}/></label>)}</div><div className="mt-4 flex gap-2"><Button disabled={saving||busy} onClick={()=>void saveProfile()}>Save details</Button><Button variant="ghost" onClick={()=>setShowProfile(false)}>Cancel</Button></div></div>}
    <div className="my-4 flex flex-wrap items-end gap-2"><label className="flex items-center gap-2 text-xs text-muted-foreground">Initial funding (USD)<Input className="w-28" type="number" min="1" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setQuoteResult(null);}}/></label><Button variant="outline" onClick={()=>void quoteCard()} disabled={saving||busy||loading}>Calculate wallet cost</Button><Button onClick={()=>void create()} disabled={saving||busy||loading||!quoteResult||Number(quoteResult.amountUsd)!==Number(amount)||Date.now()-quoteAt>60000}>Create virtual card</Button><Button variant="ghost" onClick={()=>setShowProfile(x=>!x)}>{showProfile?"Hide details":"Cardholder details"}</Button></div>
    {quoteResult&&Number(quoteResult.amountUsd)===Number(amount)&&<div className="mb-4 rounded-xl border bg-secondary/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Estimated wallet charge</strong><strong className="text-base tabular-nums">{formatNaira(quoteResult.walletAmountNgn)}</strong></div><div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3"><span>Card funding: ${Number(quoteResult.amountUsd).toFixed(2)} USD</span><span>Creation fee: ${Number(quoteResult.creationFeeUsd??0).toFixed(2)} USD</span><span>Platform markup: ${Number(quoteResult.markupUsd??0).toFixed(2)} USD</span></div><p className="mt-2 text-[10px] text-muted-foreground">Quote valid for 60 seconds. The server recalculates the charge when you create the card.</p></div>}
    {operations.length>0&&<div className="mt-5 rounded-xl border p-4"><h4 className="font-semibold">Recent card activity</h4><div className="mt-3 divide-y">{operations.slice(0,8).map(op=><div key={op.id} className="flex items-center justify-between gap-3 py-3 text-xs"><div><strong className="capitalize">{op.action.replace("_"," ")}</strong><p className="mt-1 text-muted-foreground">{new Date(op.created_at).toLocaleString("en-NG")} · {op.reference}</p>{op.message&&<p className="mt-1 text-muted-foreground">{op.message}</p>}</div><div className="text-right"><StatusBadge status={op.status}/>{op.wallet_amount_ngn>0&&<p className="mt-1 text-muted-foreground">{formatNaira(op.wallet_amount_ngn)}</p>}</div></div>)}</div></div>}
    {selected&&<div className="mt-5 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Card controls</h4><p className="text-xs text-muted-foreground">{selected.masked_pan??"Selected card"} · {selected.status}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={()=>void perform({action:"details",cardId:selected.id})}>Card details</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction("topup")}>Fund card</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction("withdraw")}>Withdraw</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction(selected.status==="frozen"?"unfreeze":"freeze")}>{selected.status==="frozen"?"Unfreeze":"Freeze"}</Button><Button size="sm" variant="destructive" disabled={saving} onClick={()=>cardAction("terminate")}>Terminate</Button><Button size="sm" variant="ghost" onClick={()=>void perform({action:"transactions",cardId:selected.id,startDate:new Date(Date.now()-30*86400000).toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10),page:1})}>Transactions</Button></div></div>
    {reveal&&details&&<div className="mt-4 rounded-lg bg-secondary p-3"><div className="flex items-center justify-between"><strong className="text-sm">Card details</strong><Button size="sm" variant="ghost" onClick={()=>{setReveal(false);setDetails(null);}}>Hide</Button></div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(details,null,2)}</pre><p className="mt-2 text-[10px] text-muted-foreground">Sensitive details are shown only on request. Do not share your card number, expiry or CVV.</p></div>}
    {transactions&&<div className="mt-4 rounded-lg border p-3"><strong className="text-sm">Card transactions</strong><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(transactions,null,2)}</pre></div>}
    </div>}
  </section>;
}

function networkDisplayName(value: string) {
  const key = String(value ?? "").trim().toLowerCase();
  const known: Record<string,string> = {
    "1":"MTN", "2":"Airtel", "3":"Glo", "4":"9mobile",
    "mtn":"MTN", "airtel":"Airtel", "glo":"Glo",
    "9mobile":"9mobile", "etisalat":"9mobile"
  };
  return known[key] ?? value;
}

function BuyDataView(props: {
  dashboard: DashboardData | null;
  busy: boolean;
  network: Network;
  setNetwork: (network: Network) => void;
  networkChoices: string[];
  selectedPlanType:"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"|"";
  setSelectedPlanType:(value:"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"|"OTHER"|"")=>void;
  plans: DataPlan[];
  selectedPlan: DataPlan | undefined;
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  dataCouponCode: string;
  setDataCouponCode: (code: string) => void;
  onBuy: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const filteredPlans = props.plans.filter(plan => plan.network === props.network && plan.planType === props.selectedPlanType);
  const typeCounts = {
    DAILY: props.plans.filter(plan => plan.network === props.network && plan.planType === "DAILY").length,
    WEEKLY: props.plans.filter(plan => plan.network === props.network && plan.planType === "WEEKLY").length,
    MONTHLY: props.plans.filter(plan => plan.network === props.network && plan.planType === "MONTHLY").length,
    YEARLY: props.plans.filter(plan => plan.network === props.network && plan.planType === "YEARLY").length,
    OTHER: props.plans.filter(plan => plan.network === props.network && plan.planType === "OTHER").length,
  };
  const networkInitials = (name: string) => name === "9mobile" ? "9M" : name.slice(0,3).toUpperCase();
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-primary">Data bundles</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Choose your data plan</h2><p className="mt-1 text-sm text-slate-500">Select a network, choose a bundle type and find the plan that suits you.</p></div>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="size-5"/></span>
          </div>
        </div>
        <div className="space-y-6 p-5 sm:p-6">
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">1. Select network</h3><span className="text-xs text-slate-400">{props.networkChoices.length} available</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {props.networkChoices.map((choice,index) => {
                const label=networkDisplayName(choice);
                return <ProviderChoice key={choice} name={label} code={choice} selected={props.network===choice} index={index} onClick={()=>{props.setNetwork(choice);props.setSelectedPlanId("");props.setSelectedPlanType("DAILY");}}/>;
              })}
            </div>
          </div>
          <div>
            <div className="mb-3"><h3 className="text-sm font-semibold text-slate-800">2. Choose duration</h3><p className="mt-1 text-xs text-slate-500">Browse Daily, Weekly, Monthly, Yearly and other bundles.</p></div>
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1.5">
              {(["DAILY","WEEKLY","MONTHLY","YEARLY","OTHER"] as const).map(type => {
                const active=props.selectedPlanType===type;
                const label=type==="OTHER"?"Others":type.charAt(0)+type.slice(1).toLowerCase();
                return <button key={type} type="button" onClick={()=>{props.setSelectedPlanType(type);props.setSelectedPlanId("");}} aria-pressed={active} className={`rounded-lg px-2 py-3 text-sm font-semibold transition-all ${active ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {label}<span className={`ml-1.5 text-[10px] ${active?"text-primary/70":"text-slate-400"}`}>{props.network ? typeCounts[type] : ""}</span>
                </button>;
              })}
            </div>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">3. Select a plan</h3>{props.selectedPlanType && <span className="text-xs text-slate-400">{filteredPlans.length} plans</span>}</div>
            {!props.network ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-9 text-center"><Database className="mx-auto size-7 text-slate-300"/><p className="mt-2 text-sm font-medium text-slate-700">Choose your network</p><p className="mt-1 text-xs text-slate-500">Available data bundles will appear here.</p></div>
            : !props.selectedPlanType ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-9 text-center"><p className="text-sm font-medium text-slate-700">Choose a bundle type</p><p className="mt-1 text-xs text-slate-500">Choose a duration tab to see available data bundles.</p></div>
            : filteredPlans.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-9 text-center"><p className="text-sm font-medium text-slate-700">No {props.selectedPlanType.toLowerCase()} plans available for {networkDisplayName(props.network)}</p><p className="mt-1 text-xs text-slate-500">Try another bundle type or check back after the supplier catalogue is refreshed.</p></div>
            : <div className="grid gap-3 sm:grid-cols-2">
              {filteredPlans.map(plan => {
                const chosen=props.selectedPlan?.id===plan.id || props.selectedPlanId===plan.id;
                return <button key={plan.id} type="button" onClick={()=>props.setSelectedPlanId(plan.id)} aria-pressed={chosen} className={`flex min-h-[92px] items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all ${chosen ? "border-primary bg-primary/[.04] ring-2 ring-primary/10" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}>
                  <span className="min-w-0"><strong className="block text-lg font-bold tracking-tight text-slate-900">{plan.data_amount}</strong><span className="mt-1 block truncate text-xs text-slate-500">{plan.validity || "Data bundle"}</span><span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{props.selectedPlanType}</span></span>
                  <span className="shrink-0 text-right"><strong className="block text-base font-bold text-slate-900">{formatNaira(plan.price)}</strong>{chosen && <CheckCircle2 className="ml-auto mt-2 size-4 text-primary"/>}</span>
                </button>;
              })}
            </div>}
          </div>
          <p className="flex items-center gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-400"><ShieldCheck className="size-4"/> Live Topupmate bundles are displayed with the selling price configured by TolirexData.</p>
        </div>
      </section>
      <form onSubmit={props.onBuy} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileClock className="size-5"/></span><div><h2 className="text-base font-semibold text-slate-900">Order summary</h2><p className="mt-0.5 text-xs text-slate-500">Review your purchase details</p></div></div>
        <label className="mt-5 block text-xs font-semibold text-slate-700" htmlFor="data-phone">Recipient phone number</label>
        <Input id="data-phone" className="mt-2 h-11 rounded-xl border-slate-200" inputMode="numeric" autoComplete="tel" placeholder="08012345678" maxLength={11} value={props.phone} onChange={event=>props.setPhone(event.target.value.replace(/\D/g,""))} required/>
        <label className="mt-4 block text-xs font-semibold text-slate-700">Coupon code <span className="font-normal text-slate-400">(optional)</span><Input className="mt-2 h-11 rounded-xl border-slate-200" value={props.dataCouponCode} onChange={event=>props.setDataCouponCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32))} placeholder="Enter promotion code"/></label>
        <div className="my-5 border-t border-slate-100"/>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected plan</p><p className="mt-2 text-sm font-semibold text-slate-800">{props.selectedPlan ? `${networkDisplayName(props.selectedPlan.network)} · ${props.selectedPlan.data_amount}` : "Choose a plan to continue"}</p><p className="mt-1 text-xs text-slate-500">{props.selectedPlan ? (props.selectedPlan.validity || "Data bundle") : "Your selected bundle will appear here."}</p></div>
        <div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Wallet balance</span><strong className="font-semibold text-slate-800">{formatNaira(props.dashboard?.wallet?.balance ?? 0)}</strong></div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm font-semibold text-slate-700">Total</span><strong className="text-2xl font-bold tracking-tight text-slate-900">{formatNaira(props.selectedPlan?.price ?? 0)}</strong></div>
        <Button type="submit" className="mt-5 h-11 w-full rounded-xl" disabled={props.busy || !props.selectedPlan}>{props.busy ? "Processing…" : "Buy data"} <ArrowRight className="ml-1 size-4"/></Button>
        <p className="mt-3 text-center text-[11px] text-slate-400">Secure payment from your TolirexData wallet.</p>
      </form>
    </div>
  );
}

function FundWalletView(props: { dashboard: DashboardData | null; onRefresh: () => void }) {
  const account=props.dashboard?.virtualAccount;
  const kycStatus=props.dashboard?.kyc?.status;
  return <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_.9fr]">
    <section className="rounded-2xl border bg-background p-5 sm:p-6">
      {kycStatus === "approved" && <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Identity verification</p><p className="mt-1 text-sm font-medium text-emerald-900">KYC approved</p></div><CheckCircle2 className="size-5 text-emerald-600"/></div>}
      <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><ArrowDownLeft/></span><div><h2 className="font-semibold">Fund your wallet by bank transfer</h2><p className="text-sm text-muted-foreground">Your dedicated permanent account</p></div></div>
      {account?<div className="mt-6 rounded-xl bg-primary/5 p-5"><p className="text-xs text-muted-foreground">{account.bank_name}</p><p className="mt-2 text-3xl font-bold tracking-wider">{account.account_number}</p><p className="mt-2 text-sm font-semibold">{account.account_name}</p><p className="mt-1 text-xs text-muted-foreground">{account.currency} · Permanent virtual account</p><Button className="mt-4" variant="outline" onClick={()=>void navigator.clipboard?.writeText(account.account_number)}>Copy account number</Button></div>:<div className="mt-5"><p className="text-sm leading-6 text-muted-foreground">{kycStatus==="approved"?"Your KYC is approved and your permanent bank account is being provisioned. Refresh this page shortly if the account details do not appear.":"Complete and receive KYC approval. Your permanent Flutterwave bank account will then be generated automatically."}</p></div>}
    </section>
    <section className="rounded-2xl border bg-background p-5 sm:p-6"><h2 className="font-semibold">Automatic wallet funding</h2><ol className="mt-4 space-y-4 text-sm text-muted-foreground"><li>1. Transfer from any Nigerian bank to the permanent account shown here.</li><li>2. Flutterwave notifies TolirexData and the payment is verified against Flutterwave's transaction API.</li><li>3. Your wallet is credited automatically after successful verification.</li><li>4. Your transaction history and wallet balance update after settlement.</li></ol><p className="mt-5 border-t pt-4 text-xs leading-5 text-muted-foreground">Never transfer to an account number that is not displayed inside your signed-in TolirexData dashboard. Customer manual funding claims and payment-proof uploads are not supported.</p></section>
  </div>;
}
function ActivityView({ dashboard }: { dashboard: DashboardData | null }) {
  const transactions = [...(dashboard?.transactions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orders = [...(dashboard?.orders ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const serviceOrders = [...(dashboard?.serviceOrders ?? [])].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  
  return (
    <div className="space-y-6">
      <section className="border bg-background">
        <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Wallet transactions</h2><p className="mt-1 text-sm text-muted-foreground">Credits and data purchase debits</p></div>
        {transactions.length ? transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />) : <EmptyState icon={<Wallet />} title="No transactions yet" copy="Wallet credits and purchases will appear here." />}
      </section>
      <section className="border bg-background">
        <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Airtime & Data purchases</h2><p className="mt-1 text-sm text-muted-foreground">Live supplier order status and recipient details</p></div>
        {serviceOrders.length ? serviceOrders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 last:border-0">
          <div className="min-w-0"><p className="font-medium text-foreground">{order.recipient}</p><p className="mt-1 text-xs text-muted-foreground">Ref {order.request_id} · {new Date(order.created_at).toLocaleString("en-NG")}</p></div>
          <div className="text-right"><p className="font-semibold text-foreground">{formatNaira(order.amount)}</p><span className="text-xs capitalize text-muted-foreground">{order.status.replace(/_/g," ")}</span></div>
        </div>) : <EmptyState icon={<Smartphone/>} title="No Airtime or Data purchases yet" copy="Purchases and their supplier status will appear here."/>}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="border bg-background">
          <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Data purchase history</h2></div>
          {orders.length ? orders.map((order) => <OrderRow key={order.id} order={order} />) : <EmptyState icon={<Database />} title="No data orders yet" copy="Your completed purchases will show here." />}
        </section>

      </div>
    </div>
  );
}

function AuthDialog({ open, onOpenChange, mode, setMode }: { open: boolean; onOpenChange: (open: boolean) => void; mode: AuthMode; setMode: (mode: AuthMode) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"personal"|"agent"|"business">("personal");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        if (!isValidNigerianPhone(phone)) {
          setMessage("Enter an 11-digit Nigerian phone number starting with 0.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name.trim(), phone, account_type: accountType, business_legal_name: accountType === "business" ? businessName.trim() : "", agent_business_name: accountType === "agent" ? businessName.trim() : "" },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Check your email for a confirmation link. You can sign in after confirming your address.");
        } else {
          onOpenChange(false);
          setMessage("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onOpenChange(false);
      }
    } catch {
      setMessage(mode === "signin" ? "We couldn't verify that email and password. Please check them and try again." : "We couldn't create your account. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Wallet /></div>
          <DialogTitle>{mode === "signup" ? "Create your ToliRex account" : "Welcome back"}</DialogTitle>
          <DialogDescription>{mode === "signup" ? "One wallet for your everyday top-ups." : "Sign in to continue to your wallet."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-4">
          {mode === "signup" && <>
            <Field label="Account type"><select value={accountType} onChange={(event)=>setAccountType(event.target.value as "personal"|"agent"|"business")} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="personal">Personal account</option><option value="agent">Agent / Reseller account</option><option value="business">Business account</option></select></Field>
            {accountType !== "personal" && <Field label={accountType === "business" ? "Registered business name" : "Business / store name"}><Input value={businessName} onChange={event=>setBusinessName(event.target.value)} required/></Field>}
            <Field label="Full name"><Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <Field label="Phone number"><Input autoComplete="tel" inputMode="numeric" maxLength={11} placeholder="08012345678" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} required /></Field>
          </>}
          <Field label="Email address"><Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <Field label="Password"><Input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          {message && <p role="status" className="border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-sm leading-5 text-foreground">{message}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"} <ArrowRight /></Button>
        </form>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to ToliRex?"}{" "}
          <button type="button" className="font-semibold text-primary underline underline-offset-4" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>
            {mode === "signup" ? "Log in" : "Create account"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}

function providerLogoKey(name:string,code=""):string {
  const value=(name+" "+code).toLowerCase().replace(/[^a-z0-9]+/g," ");
  const entries:[RegExp,string][]=[
    [/\\bmtn\\b/,"mtn"],[/airtel/,"airtel"],[/\\bglo\\b|globacom/,"glo"],[/9 mobile|9mobile|etisalat/,"9mobile"],
    [/smile/,"smile"],[/alpha/,"alpha"],[/kirani/,"kirani"],[/ratel/,"ratel"],
    [/dstv/,"dstv"],[/gotv|go tv/,"gotv"],[/startime/,"startimes"],
    [/abuja|aedc/,"aedc"],[/benin|bedc/,"bedc"],[/enugu|eedc/,"eedc"],[/eko|ekedc/,"ekedc"],
    [/ibadan|ibedc/,"ibedc"],[/ikeja|ikedc/,"ikedc"],[/jos|jedc?/,"jed"],[/kaduna|kaedco/,"kaedco"],
    [/kano|kedco/,"kedco"],[/port harcourt|phedc/,"phed"],[/yola|yedc/,"yedc"],
    [/\\bwaec\\b/,"waec"],[/\\bneco\\b/,"neco"],[/\\bjamb\\b/,"jamb"],[/nabteb/,"nabteb"]
  ];
  return entries.find(([pattern])=>pattern.test(value))?.[1]??"";
}
function ProviderChoice({name,code,selected,index,onClick}:{name:string;code:string;selected:boolean;index:number;onClick:()=>void}) {
  const tones=["bg-emerald-50 text-emerald-700","bg-blue-50 text-blue-700","bg-amber-50 text-amber-700","bg-violet-50 text-violet-700"];
  const initials=name.trim().split(/\\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  const logo=providerLogoKey(name,code);
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-background p-2 text-center transition hover:border-primary/50 hover:bg-primary/[0.03] ${selected?"border-primary bg-primary/[0.06] ring-2 ring-primary/10":"border-border"}`}>
    <span className={`relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-extrabold ${tones[index%tones.length]}`}>
      {initials||name.slice(0,1).toUpperCase()}
      {logo&&<img src={`https://raw.githubusercontent.com/Al-awwaliyah/iyanjupay/main/public/providers/${logo}.svg`} alt="" className="absolute inset-0 size-full bg-white object-contain p-1.5" loading="lazy"/>}
    </span>
    <span className="block max-w-full truncate text-xs font-semibold">{name}</span>
  </button>;
}

function ProductChoice({product,selected,onClick}:{product:CatalogueProduct;selected:boolean;onClick:()=>void}) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition hover:border-primary/50 ${selected?"border-primary bg-primary/[0.05] ring-2 ring-primary/10":"border-border bg-background"}`}>
    <span className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg ${selected?"bg-primary/10 text-primary":"bg-secondary text-muted-foreground"}`}>{product.logo_url?<img src={product.logo_url} alt="" className="size-full bg-white object-contain p-1"/>:"▦"}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{product.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{product.country_code||product.description||"Supplier product"}</span></span>
    <span className="whitespace-nowrap text-sm font-bold">{formatNaira(product.selling_price)}</span>
  </button>;
}

function canonicalNetworkLabel(name:string,code:string):string {
  const value=(name+" "+code).toLowerCase().replace(/[^a-z0-9]/g,"");
  if(value.includes("mtn")||value==="1"||value==="01")return "MTN";
  if(value.includes("airtel")||value==="2"||value==="02")return "Airtel";
  if(value.includes("glo")||value==="3"||value==="03")return "Glo";
  if(value.includes("9mobile")||value.includes("etisalat")||value==="4"||value==="04")return "9mobile";
  return name||code;
}

function NetworkMark({ network, index }: { network: string; index: number }) {
  const tones = ["bg-chart-4/20 text-foreground", "bg-chart-5/15 text-chart-5", "bg-chart-2/15 text-chart-2", "bg-primary/10 text-primary"];
  const symbols: Record<string, string> = {};
  return <span className="inline-flex shrink-0 items-center gap-2"><span className={`grid size-8 place-items-center rounded-full text-xs font-bold ${tones[index % tones.length]}`}>{symbols[network] ?? network.slice(0, 1)}</span><span className="text-sm font-semibold text-foreground">{network}</span></span>;
}

function Brand() {
  return <a href="/" className="inline-flex min-w-0 items-center gap-2.5" aria-label="ToliRex Data home"><span className="dex-brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 11h24v5H21v18h-5V16H8z" fill="white"/><path d="M7 27c8 4 21 1 27-9" fill="none" stroke="#33d9ff" strokeWidth="2.5" strokeLinecap="round"/></svg></span><span className="whitespace-nowrap text-[1.08rem] font-extrabold tracking-[-.04em] text-foreground">Tolirex<span className="text-primary">Data</span></span></a>;
}

function ServiceItem({ icon, title, copy, status, tone }: { icon: ReactNode; title: string; copy: string; status: string; tone: string }) {
  return <div className="flex min-h-48 flex-col bg-background p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone} [&_svg]:size-5`}>{icon}</span><span className="text-xs font-medium text-muted-foreground">{status}</span></div><div className="mt-5"><h3 className="font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p></div></div>;
}

function NavButton({ item, active, onClick }: { item: { key: ViewKey; label: string; icon: ReactNode }; active: boolean; onClick: () => void }) {
  return <Button variant={active ? "secondary" : "ghost"} className={`w-full justify-start ${active ? "text-primary" : "text-muted-foreground"}`} onClick={onClick}><span className="[&_svg]:size-4">{item.icon}</span>{item.label}</Button>;
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const credit = transaction.direction === "credit";
  return <div className="flex items-center gap-3 border-b px-5 py-4 last:border-0"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${credit ? "bg-primary/10 text-primary" : "bg-chart-5/10 text-chart-5"}`}>{credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{transaction.description}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(transaction.created_at)}</p></div><strong className={`whitespace-nowrap text-sm ${credit ? "text-primary" : "text-foreground"}`}>{credit ? "+" : "−"}{formatNaira(transaction.amount)}</strong></div>;
}

function OrderRow({ order }: { order: DataOrder }) {
  return <div className="flex items-center justify-between gap-3 border-b px-5 py-4 last:border-0"><div><p className="text-sm font-medium text-foreground">{order.network} · {order.data_amount}</p><p className="mt-1 text-xs text-muted-foreground">{order.phone} · {formatDate(order.created_at)}</p></div><div className="text-right"><strong className="text-sm text-foreground">{formatNaira(order.amount)}</strong><StatusBadge status={order.status} /></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const pending = status === "pending";
  const positive = status === "successful" || status === "approved";
  const style = positive ? "bg-primary/10 text-primary" : pending ? "bg-chart-4/20 text-foreground" : "bg-destructive/10 text-destructive";
  return <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{titleCase(status)}</span>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-4 border bg-background p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-5">{icon}</span><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold text-foreground">{value}</p></div></div>;
}

function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="flex flex-col items-center px-5 py-10 text-center"><span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-5">{icon}</span><p className="mt-3 font-medium text-foreground">{title}</p><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium text-foreground">{label}{children}</label>;
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="status" className="mb-5 flex items-start justify-between gap-3 border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground"><span>{message}</span><Button variant="ghost" size="icon" className="-mr-2 -mt-1 shrink-0" onClick={onClose} aria-label="Dismiss message"><X /></Button></div>;
}

function LoadingScreen({ compact = false }: { compact?: boolean }) {
  return <div className={`flex items-center justify-center gap-3 text-sm text-muted-foreground ${compact ? "py-6" : "min-h-screen"}`}><span className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />Loading ToliRex Data…</div>;
}

function headingForView(view: ViewKey, name: string): string {
  if (view === "overview") return `Good to see you, ${name.split(" ")[0]}`;
  if (view === "buy") return "Buy data";
  if (view === "fund") return "Add money to your wallet";
  if (view === "activity") return "Your activity";
  if (view in featureDetails) return featureDetails[view as FeatureView].title;
  return "ToliRex Data admin";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
