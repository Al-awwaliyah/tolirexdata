import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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
  reviewFunding,
} from "@/lib/dex.functions";
import { formatNaira, isValidNigerianPhone } from "@/lib/dex-rules";
import tolirexMobile from "@/assets/tolirex-mobile.jpg";

type TableRows<K extends keyof SupabaseDatabase["public"]["Tables"]> = SupabaseDatabase["public"]["Tables"][K]["Row"];
type DataPlan = { id: string; network: string; data_amount: string; validity: string; price: number; active: boolean };
type CatalogueProduct = { id: string; category_id: string; category_code: string; category_name: string; name: string; network_or_operator: string | null; description: string | null; face_value: number | null; selling_price: number; currency: string; sort_order: number };
type CatalogueOption = { id: string; category_code: string; option_type: string; option_code: string; parent_option_code: string | null; name: string };
type DataOrder = TableRows<"data_orders">;
type Funding = TableRows<"fundings">;
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
  fundings: Funding[];
  transactions: WalletTransaction[];
  users: Profile[];
  isAdmin: boolean;
};
type ViewKey = "overview" | "buy" | "fund" | "activity" | "airtime" | "cable" | "electricity" | "epin" | "data-pin" | "education" | "internet" | "gift-cards" | "cards" | "fx" | "referrals" | "coupons" | "promotions" | "cashback" | "loyalty";
type Network = string;
type AuthMode = "signin" | "signup";



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
  const [phone, setPhone] = useState("");
  const [fundingAmount, setFundingAmount] = useState("");


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

  useEffect(() => {
    if (!user) {
      setDashboard(null);
      setView("overview");
      return;
    }
    void refreshDashboard();
  }, [user?.id, refreshDashboard]);

  const availablePlans = useMemo(
    () => (dashboard?.plans ?? []).filter((plan) => (!network || plan.network === network) && (plan.active || dashboard?.isAdmin)),
    [dashboard?.isAdmin, dashboard?.plans, network],
  );
  const selectedPlan = availablePlans.find((plan) => plan.id === selectedPlanId) ?? availablePlans[0];
  const availableNetworks = useMemo(() => Array.from(new Set((dashboard?.plans ?? []).map((plan) => plan.network).filter(Boolean))), [dashboard?.plans]);

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
    if (!selectedPlan || !isValidNigerianPhone(phone)) { setNotice("Choose a published data plan and enter a valid Nigerian phone number."); return; }
    await action(async () => {
      const result = await purchaseAirtimeOrData({ data: { service:"data", productId:selectedPlan.id, networkCode:selectedPlan.network, recipient:phone, idempotencyKey:crypto.randomUUID().replace(/-/g,"") } });
      setNotice(result.status==="successful" ? "Data purchase completed successfully." : result.status==="refunded" ? "Supplier rejected the order; your wallet refund has been processed." : "Your order is processing or being checked. Check Transactions before submitting again.");
      await refreshDashboard();
    });
  };
  const handleAirtimePurchase = async (payload:{networkCode:string;recipient:string;amount:number}) => {
    await action(async () => {
      const result = await purchaseAirtimeOrData({ data:{ service:"airtime", ...payload, idempotencyKey:crypto.randomUUID().replace(/-/g,"") } });
      setNotice(result.status==="successful" ? "Airtime purchase completed successfully." : result.status==="refunded" ? "Supplier rejected the order; your wallet refund has been processed." : "Your order is processing or being checked. Check Transactions before submitting again.");
      await refreshDashboard();
    });
  };

  const handleFunding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("Permanent virtual-account funding is not enabled yet. Do not transfer money to unverified account details.");
  };

  const handleReviewFunding = (funding: Funding, decision: "approved" | "rejected") => action(async () => {
    await reviewFunding({ data: { fundingId: funding.id, decision } });
    await refreshDashboard();
    setNotice(`Funding request ${decision}.`);
  });



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
          plans={availablePlans}
          selectedPlan={selectedPlan}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          phone={phone}
          setPhone={setPhone}
          onBuy={handleBuy}
          onAirtimePurchase={handleAirtimePurchase}
          fundingAmount={fundingAmount}
          setFundingAmount={setFundingAmount}
          onFunding={handleFunding}
          onReviewFunding={handleReviewFunding}
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
  network: Network; setNetwork: (network: Network) => void; networkChoices: string[]; plans: DataPlan[];
  selectedPlan: DataPlan | undefined; selectedPlanId: string; setSelectedPlanId: (id: string) => void;
  phone: string; setPhone: (phone: string) => void; onBuy: (event: FormEvent<HTMLFormElement>) => void;
  onAirtimePurchase: (payload: { networkCode: string; recipient: string; amount: number }) => Promise<void>;
  fundingAmount: string; setFundingAmount: (amount: string) => void;
  onFunding: (event: FormEvent<HTMLFormElement>) => void;
  onReviewFunding: (funding: Funding, decision: "approved" | "rejected") => void;
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
      {(dashboard?.plans?.length ?? 0) > 0 && <div className="tr-widget-card tr-network-card"><div className="tr-widget-heading"><div><h2>Mobile networks</h2><p>Networks available in the published supplier catalogue</p></div></div>{Array.from(new Set(dashboard?.plans.map((plan) => plan.network) ?? [])).map((choice,index)=><button className="tr-network-row" key={choice} onClick={()=>onNavigate("buy")}><NetworkMark network={choice} index={index}/><span>{choice}</span><ArrowRight/></button>)}</div>}</section>
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
  airtime:{title:"Buy airtime",eyebrow:"DIGITAL SERVICES",description:"Top up a mobile number using live supplier availability and your account's applicable price.",icon:<Smartphone/>,group:"service",emptyTitle:"Airtime catalogue unavailable",emptyCopy:"Airtime networks and denominations will appear when a supplier catalogue is successfully synchronized and published."},
  cable:{title:"Cable TV",eyebrow:"DIGITAL SERVICES",description:"Verify a decoder or smart-card number, choose an available package and review the price before payment.",icon:<Tv/>,group:"service",emptyTitle:"TV packages not available yet",emptyCopy:"Only packages returned by a connected supplier and published by the platform will be shown here."},
  electricity:{title:"Electricity",eyebrow:"DIGITAL SERVICES",description:"Choose a supported distribution company, verify the meter and review the payable amount before purchase.",icon:<Lightbulb/>,group:"service",emptyTitle:"Electricity providers unavailable",emptyCopy:"Supported discos and meter-payment options will appear after the live provider catalogue is connected."},
  epin:{title:"Recharge PINs",eyebrow:"DIGITAL SERVICES",description:"Browse Topupmate recharge vouchers and denominations, with secure PIN delivery after confirmed fulfilment.",icon:<Pin/>,group:"service",emptyTitle:"Recharge PIN catalogue unavailable",emptyCopy:"Only supplier-confirmed PIN products and prices will be listed here."},
  "data-pin":{title:"Data PINs",eyebrow:"DIGITAL SERVICES",description:"Generate and manage supplier-backed mobile data vouchers for distribution.",icon:<PackageCheck/>,group:"service",emptyTitle:"Data PIN catalogue unavailable",emptyCopy:"Available data PIN plans will appear after Topupmate catalogue sync and admin publication."},
  education:{title:"Education PINs",eyebrow:"DIGITAL SERVICES",description:"Purchase supported WAEC, NECO and other examination PINs.",icon:<ShieldCheck/>,group:"service",emptyTitle:"Education PINs unavailable",emptyCopy:"Exam providers and current prices will load from Topupmate when published."},
  internet:{title:"Internet services",eyebrow:"DIGITAL SERVICES",description:"Explore supported broadband and specialist data services from Topupmate.",icon:<RadioTower/>,group:"service",emptyTitle:"Internet services unavailable",emptyCopy:"Only supplier-returned plans will appear here."},
  "gift-cards":{title:"Gift Cards",eyebrow:"DIGITAL SERVICES",description:"Browse digital gift-card products and purchase eligible denominations.",icon:<Gift/>,group:"service",emptyTitle:"Gift-card catalogue is being connected",emptyCopy:"Topupmate gift cards require a dedicated catalogue normalizer and verified purchase/redeem flow before publication."},
  cards:{title:"Virtual Cards",eyebrow:"CARDS & PAYMENTS",description:"Create and manage virtual payment cards, fund cards, review transactions and control card security.",icon:<CreditCard/>,group:"service",emptyTitle:"No virtual cards yet",emptyCopy:"Complete your cardholder details and approved KYC to request your first virtual card."},
  fx:{title:"FX Exchange",eyebrow:"CURRENCY",description:"Get a live provider quote and convert currencies using a time-limited rate.",icon:<Globe2/>,group:"service",emptyTitle:"FX conversion is not enabled yet",emptyCopy:"Live quotes and execution will be connected after quote expiry, wallet currency and settlement controls are implemented."},
  referrals:{title:"Refer and earn",eyebrow:"REWARDS & GROWTH",description:"Invite people to TolirexData and follow referral qualification and reward settlement.",icon:<Users/>,group:"growth",emptyTitle:"Your referral programme is not active yet",emptyCopy:"Your referral code and reward history will appear here when the programme is enabled by the platform."},
  coupons:{title:"Coupons",eyebrow:"REWARDS & GROWTH",description:"Use eligible coupon codes for discounts on supported services. Eligibility and limits are checked securely at redemption.",icon:<TicketPercent/>,group:"growth",emptyTitle:"No eligible coupons to show",emptyCopy:"Active coupons published for your account type will appear here. Expired or ineligible codes will not be presented as available."},
  promotions:{title:"Promotions",eyebrow:"REWARDS & GROWTH",description:"Discover platform campaigns, welcome offers and limited-time benefits available to your account.",icon:<Megaphone/>,group:"growth",emptyTitle:"No active promotions",emptyCopy:"Campaigns published by TolirexData will appear here with their eligibility, dates and terms."},
  cashback:{title:"Cashback",eyebrow:"REWARDS & GROWTH",description:"Review cashback earned from qualifying transactions, pending rewards and settled wallet credits.",icon:<Coins/>,group:"growth",emptyTitle:"No cashback activity yet",emptyCopy:"Cashback rules and reward history will appear when an eligible campaign is active. No reward is assumed or credited by this screen."},
  loyalty:{title:"Loyalty",eyebrow:"REWARDS & GROWTH",description:"Track loyalty points, membership tier and eligible redemption options.",icon:<Award/>,group:"growth",emptyTitle:"Loyalty programme not configured",emptyCopy:"Your points, tier and redemption options will appear when the loyalty programme is configured and enabled."},
};

function FeatureWorkspace({view,accountType,catalogue,catalogueOptions,busy,onAirtimePurchase}:{view:FeatureView;accountType:string;catalogue:CatalogueProduct[];catalogueOptions:CatalogueOption[];busy:boolean;onAirtimePurchase:(payload:{networkCode:string;recipient:string;amount:number})=>Promise<void>}) {
  const [airtimeNetwork,setAirtimeNetwork]=useState("");
  const [airtimePhone,setAirtimePhone]=useState("");
  const [airtimeAmount,setAirtimeAmount]=useState("100");
  const [selectedProductId,setSelectedProductId]=useState("");
  const [selectedOptionCode,setSelectedOptionCode]=useState("");
  const [recipient,setRecipient]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [meterType,setMeterType]=useState<"prepaid"|"postpaid">("prepaid");
  const [serviceAmount,setServiceAmount]=useState("1000");
  const [quantity,setQuantity]=useState("1");
  const [accountType,setAccountType]=useState<"PhoneNumber"|"AccountNumber">("PhoneNumber");
  const [verifiedName,setVerifiedName]=useState("");
  const [serviceNotice,setServiceNotice]=useState("");
  const [fulfilment,setFulfilment]=useState<any>(null);
  const [serviceBusy,setServiceBusy]=useState(false);
  const feature=featureDetails[view];
  const categoryCode=({airtime:"airtime",cable:"cable_tv",electricity:"electricity",epin:"recharge_pin","data-pin":"data_pin",education:"education",internet:"internet","gift-cards":"gift_card",cards:"virtual_card",fx:"fx_conversion"} as Record<string,string>)[view];
  const options=catalogueOptions.filter((option)=>option.category_code===categoryCode);
  const products=catalogue.filter((item)=>item.category_code===categoryCode);
  const selectedProduct=products.find((item)=>item.id===selectedProductId);
  const optionType=view==="cable"?"cable_provider":view==="electricity"?"operator":"network";
  const serviceOptions=options.filter((option)=>option.option_type===optionType);
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
    if(!selectedProduct&&view!=="electricity"){setServiceNotice("Choose a published supplier product first.");return;}
    setServiceBusy(true);setServiceNotice("");setFulfilment(null);
    try{
      const category=categoryCode;
      const productPayload=selectedProduct?{productId:selectedProduct.id}:{};
      const optionPayload=selectedOptionCode?{optionCode:selectedOptionCode}:{};
      const base={action:"purchase" as const,categoryCode:category,...productPayload,...optionPayload,
        recipient,quantity:Number(quantity)||1,contactPhone:contactPhone||undefined,idempotencyKey:crypto.randomUUID().replace(/-/g,"")};
      const payload=view==="electricity"?{...base,amount:Number(serviceAmount),meterType}
        :view==="cable"?{...base,subtype:"renew"}
        :view==="internet"?{...base,accountType}
        :view==="gift-cards"?{...base}
        :base;
      const result=await runExpanded(payload);
      setServiceNotice(result.status==="successful"?(result.fulfilmentPending?"Purchase completed. Gift-card code retrieval is pending; contact support if it does not appear.":"Purchase completed successfully."):"Your request is awaiting Topupmate confirmation. Do not submit it again.");
      setFulfilment(result.fulfilment??null);
      setVerifiedName("");
    }catch(error){setServiceNotice(messageOf(error,"The purchase could not be completed."));}
    finally{setServiceBusy(false);}
  };
  const selectedProducts=products.filter((item)=>!selectedOptionCode||!["cable","epin","data-pin"].includes(view)||!item.network_or_operator||item.network_or_operator===selectedOptionCode);
  return <div className="tr-feature-workspace">
    <section className="tr-feature-hero">
      <div className="tr-feature-icon">{feature.icon}</div>
      <div><span className="tr-kicker">{feature.eyebrow}</span><h2>{feature.title}</h2><p>{feature.description}</p></div>
      <span className="tr-feature-account">{accountType.replace(/[_-]/g," ")}</span>
    </section>
    {view==="cards" ? <VirtualCardsWorkspace busy={busy}/> : view==="airtime" ? <section className="tr-feature-panel">
      <div className="tr-feature-panel-heading"><div><h3>Buy airtime</h3><p>Networks come from the supplier catalogue; rates must be configured by an administrator.</p></div><span className="tr-catalogue-state"><i/>{options.length?"Networks synced":"No networks published"}</span></div>
      {options.length ? <form className="mt-5 grid max-w-xl gap-4" onSubmit={(event)=>{event.preventDefault();if(!/^\d{11}$/.test(airtimePhone)||!airtimeNetwork)return;void onAirtimePurchase({networkCode:airtimeNetwork,recipient:airtimePhone,amount:Number(airtimeAmount)});}}>
        <label className="grid gap-2 text-sm font-medium">Mobile network<select className="h-11 border bg-background px-3" value={airtimeNetwork} onChange={(event)=>setAirtimeNetwork(event.target.value)} required><option value="">Choose network</option>{options.map(option=><option key={option.id} value={option.option_code}>{option.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Phone number<Input inputMode="numeric" maxLength={11} placeholder="08012345678" value={airtimePhone} onChange={(event)=>setAirtimePhone(event.target.value.replace(/\D/g,""))} required/></label>
        <label className="grid gap-2 text-sm font-medium">Amount (₦)<Input type="number" min={50} max={200000} step={1} value={airtimeAmount} onChange={(event)=>setAirtimeAmount(event.target.value)} required/></label>
        <Button type="submit" disabled={busy||!airtimeNetwork||!/^\d{11}$/.test(airtimePhone)||Number(airtimeAmount)<50||Number(airtimeAmount)>200000}>{busy?"Processing…":"Continue to purchase"} <ArrowRight/></Button>
      </form> : <EmptyState icon={<Smartphone/>} title="Airtime networks are not published" copy="Networks become selectable after the supplier catalogue is synchronized and published."/>}
    </section> : ["cable","electricity","epin","data-pin","education","internet","gift-cards"].includes(view) ? <section className="tr-feature-panel">
      <div className="tr-feature-panel-heading"><div><h3>{view==="cable"?"Cable TV subscription":view==="electricity"?"Electricity payment":view==="epin"?"Recharge PINs":view==="data-pin"?"Data PINs":view==="education"?"Education PINs":view==="internet"?"Internet bundle":"Gift card purchase"}</h3><p>Live Topupmate catalogue · published products and admin-approved prices</p></div><span className="tr-catalogue-state"><i/>{products.length?"Products available":"No published products"}</span></div>
      {serviceNotice&&<div role="status" className="my-4 rounded-xl border bg-secondary/50 p-3 text-sm">{serviceNotice}</div>}
      {view==="cable"&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">TV provider<select className="h-11 border bg-background px-3" value={selectedOptionCode} onChange={e=>{setSelectedOptionCode(e.target.value);setSelectedProductId("");setVerifiedName("");}}><option value="">Choose provider</option>{serviceOptions.map(o=><option key={o.id} value={o.option_code}>{o.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">SmartCard / IUC number<Input value={recipient} onChange={e=>{setRecipient(e.target.value.replace(/\D/g,""));setVerifiedName("");}} maxLength={20} placeholder="Enter decoder number"/></label>
        <Button type="button" variant="outline" disabled={serviceBusy||!selectedOptionCode||recipient.length<8} onClick={()=>void verifyService()}>{serviceBusy?"Verifying…":"Verify decoder"}</Button>
        {verifiedName&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Verified customer: {verifiedName}</p>}
        <label className="grid gap-2 text-sm font-medium">Subscription package<select className="h-11 border bg-background px-3" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}><option value="">Choose package</option>{selectedProducts.map(p=><option key={p.id} value={p.id}>{p.name} — {formatNaira(p.selling_price)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Contact phone (optional)<Input value={contactPhone} onChange={e=>setContactPhone(e.target.value.replace(/\D/g,""))} maxLength={11} placeholder="08012345678"/></label>
        <Button disabled={serviceBusy||!verifiedName||!selectedProductId||!selectedOptionCode} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Pay for subscription"} <ArrowRight/></Button>
      </div>}
      {view==="electricity"&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">Electricity distribution company<select className="h-11 border bg-background px-3" value={selectedOptionCode} onChange={e=>{setSelectedOptionCode(e.target.value);setVerifiedName("");}}><option value="">Choose disco</option>{serviceOptions.map(o=><option key={o.id} value={o.option_code}>{o.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Meter type<select className="h-11 border bg-background px-3" value={meterType} onChange={e=>{setMeterType(e.target.value as "prepaid"|"postpaid");setVerifiedName("");}}><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></label>
        <label className="grid gap-2 text-sm font-medium">Meter number<Input value={recipient} onChange={e=>{setRecipient(e.target.value.replace(/\D/g,""));setVerifiedName("");}} placeholder="Enter meter number"/></label>
        <Button type="button" variant="outline" disabled={serviceBusy||!selectedOptionCode||!recipient} onClick={()=>void verifyService()}>{serviceBusy?"Verifying…":"Verify meter"}</Button>
        {verifiedName&&<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Verified customer: {verifiedName}</p>}
        <label className="grid gap-2 text-sm font-medium">Amount (₦)<Input type="number" min={1} max={1000000} value={serviceAmount} onChange={e=>setServiceAmount(e.target.value)}/></label>
        <label className="grid gap-2 text-sm font-medium">Contact phone (optional)<Input value={contactPhone} onChange={e=>setContactPhone(e.target.value.replace(/\D/g,""))} maxLength={11}/></label>
        <Button disabled={serviceBusy||!verifiedName||Number(serviceAmount)<=0||!selectedOptionCode} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Pay electricity bill"} <ArrowRight/></Button>
      </div>}
      {["epin","data-pin"].includes(view)&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">Mobile network<select className="h-11 border bg-background px-3" value={selectedOptionCode} onChange={e=>{setSelectedOptionCode(e.target.value);setSelectedProductId("");}}><option value="">Choose network</option>{serviceOptions.map(o=><option key={o.id} value={o.option_code}>{o.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">PIN denomination / plan<select className="h-11 border bg-background px-3" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}><option value="">Choose product</option>{selectedProducts.map(p=><option key={p.id} value={p.id}>{p.name} — {formatNaira(p.selling_price)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={100} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||!selectedOptionCode||Number(quantity)<1||Number(quantity)>100} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase PINs"} <ArrowRight/></Button>
      </div>}
      {view==="education"&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">Examination PIN product<select className="h-11 border bg-background px-3" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}><option value="">Choose exam PIN</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {formatNaira(p.selling_price)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={20} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||Number(quantity)<1||Number(quantity)>20} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase examination PIN"} <ArrowRight/></Button>
      </div>}
      {view==="internet"&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">Internet plan<select className="h-11 border bg-background px-3" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}><option value="">Choose bundle</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {formatNaira(p.selling_price)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Smile account / phone number<Input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Enter account number or phone"/></label>
        <label className="grid gap-2 text-sm font-medium">Account identifier type<select className="h-11 border bg-background px-3" value={accountType} onChange={e=>setAccountType(e.target.value as "PhoneNumber"|"AccountNumber")}><option value="PhoneNumber">Phone number</option><option value="AccountNumber">Account number</option></select></label>
        <Button disabled={serviceBusy||!selectedProductId||!recipient} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Buy internet plan"} <ArrowRight/></Button>
      </div>}
      {view==="gift-cards"&&<div className="mt-5 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm font-medium">Gift card product / denomination<select className="h-11 border bg-background px-3" value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}><option value="">Choose gift card</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {formatNaira(p.selling_price)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Recipient email<Input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="recipient@example.com"/></label>
        <label className="grid gap-2 text-sm font-medium">Quantity<Input type="number" min={1} max={20} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <Button disabled={serviceBusy||!selectedProductId||!/^\S+@\S+\.\S+$/.test(recipient)||Number(quantity)<1||Number(quantity)>20} onClick={()=>void buyExpanded()}>{serviceBusy?"Processing…":"Purchase gift card"} <ArrowRight/></Button>
      </div>}
      {products.length===0&&view!=="electricity"&&<EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/>}
      {serviceNotice&&<div className="mt-4 text-sm text-muted-foreground">{serviceNotice}</div>}
      {fulfilment&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="text-sm font-semibold text-emerald-900">Supplier fulfilment details</h4><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-emerald-950">{JSON.stringify(fulfilment,null,2)}</pre></div>}
    </section> : feature.group==="service" ? <section className="tr-feature-panel"><div className="tr-feature-panel-heading"><div><h3>Available products</h3><p>Supplier-sourced catalogue · published platform prices</p></div><span className="tr-catalogue-state"><i/>{products.length?"Published catalogue":"Not yet published"}</span></div>{products.length ? <div className="tr-catalogue-products">{products.map((item)=><div className="tr-catalogue-product" key={item.id}><div><strong>{item.name}</strong><span>{item.network_or_operator ?? item.description ?? item.category_name}</span></div><b>{formatNaira(item.selling_price)}</b></div>)}</div> : <EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/ >}{options.length>0&&<div className="mt-5 border-t pt-4"><h4 className="text-sm font-semibold text-foreground">Available networks and operators</h4><div className="mt-3 flex flex-wrap gap-2">{options.map(option=><span key={option.id} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground">{option.name}</span>)}</div></div>}</section> : <section className="tr-feature-panel"><div className="tr-feature-panel-heading"><div><h3>Your programme</h3><p>Offers and rewards are controlled by TolirexData</p></div><span className="tr-catalogue-state"><i/>Programme status</span></div><EmptyState icon={feature.icon} title={feature.emptyTitle} copy={feature.emptyCopy}/></section>}
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
  const create=async()=>{const amountUsd=Number(amount);if(!Number.isFinite(amountUsd)||amountUsd<=0){setNotice("Enter a valid initial funding amount in USD.");return;}const r=await perform({action:"create",amountUsd,brand:"VISA",idempotencyKey:crypto.randomUUID().replace(/-/g,"")});if(r?.success&&r.card){const latest=await run({action:"list"});const issued=(latest.cards??[])[0];setCards(latest.cards??[]);if(issued)setSelected(issued);setDetails(r.card);setReveal(true);}};
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
    <div className="my-4 flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setShowProfile(x=>!x)}> {showProfile?"Hide details":"Add / edit cardholder details"}</Button><Button variant="outline" onClick={()=>void create()} disabled={saving||busy||loading}>Create virtual card</Button><label className="flex items-center gap-2 text-xs text-muted-foreground">Initial funding (USD)<Input className="w-28" type="number" min="1" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
    {operations.length>0&&<div className="mt-5 rounded-xl border p-4"><h4 className="font-semibold">Recent card activity</h4><div className="mt-3 divide-y">{operations.slice(0,8).map(op=><div key={op.id} className="flex items-center justify-between gap-3 py-3 text-xs"><div><strong className="capitalize">{op.action.replace("_"," ")}</strong><p className="mt-1 text-muted-foreground">{new Date(op.created_at).toLocaleString("en-NG")} · {op.reference}</p>{op.message&&<p className="mt-1 text-muted-foreground">{op.message}</p>}</div><div className="text-right"><StatusBadge status={op.status}/>{op.wallet_amount_ngn>0&&<p className="mt-1 text-muted-foreground">{formatNaira(op.wallet_amount_ngn)}</p>}</div></div>)}</div></div>}
    {selected&&<div className="mt-5 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Card controls</h4><p className="text-xs text-muted-foreground">{selected.masked_pan??"Selected card"} · {selected.status}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={()=>void perform({action:"details",cardId:selected.id})}>Card details</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction("topup")}>Fund card</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction("withdraw")}>Withdraw</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>cardAction(selected.status==="frozen"?"unfreeze":"freeze")}>{selected.status==="frozen"?"Unfreeze":"Freeze"}</Button><Button size="sm" variant="destructive" disabled={saving} onClick={()=>cardAction("terminate")}>Terminate</Button><Button size="sm" variant="ghost" onClick={()=>void perform({action:"transactions",cardId:selected.id,startDate:new Date(Date.now()-30*86400000).toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10),page:1})}>Transactions</Button></div></div>
    {reveal&&details&&<div className="mt-4 rounded-lg bg-secondary p-3"><div className="flex items-center justify-between"><strong className="text-sm">Card details</strong><Button size="sm" variant="ghost" onClick={()=>{setReveal(false);setDetails(null);}}>Hide</Button></div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(details,null,2)}</pre><p className="mt-2 text-[10px] text-muted-foreground">Sensitive details are shown only on request. Do not share your card number, expiry or CVV.</p></div>}
    {transactions&&<div className="mt-4 rounded-lg border p-3"><strong className="text-sm">Card transactions</strong><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(transactions,null,2)}</pre></div>}
    </div>}
  </section>;
}

function BuyDataView(props: {
  dashboard: DashboardData | null;
  busy: boolean;
  network: Network;
  setNetwork: (network: Network) => void;
  networkChoices: string[];
  plans: DataPlan[];
  selectedPlan: DataPlan | undefined;
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  onBuy: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="border bg-background p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Choose a data plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only products published from the connected supplier catalogue will appear here. Plans and prices are never manually estimated.</p>
        {props.plans.length > 0 && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Select a network">
          {props.networkChoices.map((choice, index) => (
            <Button key={choice} variant={props.network === choice ? "default" : "outline"} onClick={() => { props.setNetwork(choice); props.setSelectedPlanId(""); }}>
              <span>{choice}</span>
            </Button>
          ))}
        </div>}
        {props.plans.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {props.plans.map((plan) => {
              const chosen = (props.selectedPlan?.id === plan.id) || props.selectedPlanId === plan.id;
              return (
                <button key={plan.id} type="button" onClick={() => props.setSelectedPlanId(plan.id)} className={`flex min-h-24 items-center justify-between gap-4 border p-4 text-left transition-colors ${chosen ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-secondary"}`}>
                  <span><strong className="block text-lg text-foreground">{plan.data_amount}</strong><span className="mt-1 block text-sm text-muted-foreground">{plan.validity}</span></span>
                  <span className="text-right"><strong className="block text-base text-foreground">{formatNaira(plan.price)}</strong>{chosen && <CheckCircle2 className="ml-auto mt-2 size-4 text-primary" />}</span>
                </button>
              );
            })}
          </div>
        ) : <EmptyState icon={<Database />} title="No plans available" copy="No supplier products have been published for this service yet. No static or estimated plans are shown." />}
      </section>
      <form onSubmit={props.onBuy} className="h-fit border bg-background p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Order details</h2>
        <p className="mt-1 text-sm text-muted-foreground">Data will be sent to the number you enter.</p>
        <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="data-phone">Recipient phone number</label>
        <Input id="data-phone" className="mt-2" inputMode="numeric" autoComplete="tel" placeholder="08012345678" maxLength={11} value={props.phone} onChange={(event) => props.setPhone(event.target.value.replace(/\D/g, ""))} required />
        <div className="my-5 border-t" />
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Selected plan</span><span className="font-medium text-foreground">{props.selectedPlan ? `${props.selectedPlan.network} ${props.selectedPlan.data_amount}` : "Choose a plan"}</span></div>
        <div className="mt-3 flex justify-between text-sm"><span className="text-muted-foreground">Wallet balance</span><span className="font-medium text-foreground">{formatNaira(props.dashboard?.wallet?.balance ?? 0)}</span></div>
        <div className="mt-4 flex justify-between border-t pt-4"><span className="font-medium text-foreground">Total</span><strong className="text-xl text-foreground">{formatNaira(props.selectedPlan?.price ?? 0)}</strong></div>
        <Button type="submit" className="mt-5 w-full" disabled={props.busy || !props.selectedPlan}>{props.busy ? "Processing…" : "Buy data"} <ArrowRight /></Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Payment comes directly from your ToliRex wallet.</p>
      </form>
    </div>
  );
}

function FundWalletView(props: { busy: boolean; fundingAmount: string; setFundingAmount: (amount: string) => void; onFunding: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_.9fr]">
      <form onSubmit={props.onFunding} className="border bg-background p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary"><ArrowDownLeft /></span><div><h2 className="font-semibold text-foreground">Request a wallet top-up</h2><p className="text-sm text-muted-foreground">Bank transfer</p></div></div>
        <label htmlFor="funding-amount" className="mt-7 block text-sm font-medium text-foreground">Amount in naira</label>
        <div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground">₦</span><Input id="funding-amount" className="pl-8" type="number" min="1" step="1" inputMode="numeric" placeholder="5,000" value={props.fundingAmount} onChange={(event) => props.setFundingAmount(event.target.value)} required /></div>
        <Button type="submit" className="mt-5 w-full" disabled={props.busy}>{props.busy ? "Submitting…" : "I Have Sent It"} <ArrowRight /></Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Submit only after you have transferred the amount to verified ToliRex bank details.</p>
      </form>
      <div className="border bg-background p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-full bg-chart-4/20 text-chart-4"><CreditCard className="size-4" /></span><div><h2 className="font-semibold text-foreground">Bank transfer details</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Account details have not been configured yet. Confirm verified transfer details with ToliRex before sending any money.</p></div></div>
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium text-foreground">After your request</p>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />Your request stays pending while it is reviewed.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Your wallet updates only after admin approval.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ActivityView({ dashboard }: { dashboard: DashboardData | null }) {
  const transactions = [...(dashboard?.transactions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orders = [...(dashboard?.orders ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const serviceOrders = [...(dashboard?.serviceOrders ?? [])].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const fundings = [...(dashboard?.fundings ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
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
          <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Legacy Data orders</h2></div>
          {orders.length ? orders.map((order) => <OrderRow key={order.id} order={order} />) : <EmptyState icon={<Database />} title="No data orders yet" copy="Your completed purchases will show here." />}
        </section>
        <section className="border bg-background">
          <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Funding requests</h2></div>
          {fundings.length ? fundings.map((funding) => <FundingRow key={funding.id} funding={funding} />) : <EmptyState icon={<ArrowDownLeft />} title="No funding requests" copy="Requests you submit will show here." />}
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
            data: { full_name: name.trim(), phone },
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

function FundingRow({ funding }: { funding: Funding }) {
  return <div className="flex items-center justify-between gap-3 border-b px-5 py-4 last:border-0"><div><p className="text-sm font-medium text-foreground">Bank transfer</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(funding.created_at)}</p></div><div className="text-right"><strong className="text-sm text-foreground">{formatNaira(funding.amount)}</strong><StatusBadge status={funding.status} /></div></div>;
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
