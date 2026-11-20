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
  completeDataOrder,
  createDataOrder,
  createFundingRequest,
  getDexDashboard,
  reviewFunding,
  saveDataPlan,
} from "@/lib/dex.functions";
import { formatNaira, isValidNigerianPhone } from "@/lib/dex-rules";
import tolirexMobile from "@/assets/tolirex-mobile.jpg";

type TableRows<K extends keyof SupabaseDatabase["public"]["Tables"]> = SupabaseDatabase["public"]["Tables"][K]["Row"];
type DataPlan = TableRows<"data_plans">;
type DataOrder = TableRows<"data_orders">;
type Funding = TableRows<"fundings">;
type WalletTransaction = TableRows<"wallet_transactions">;
type Profile = TableRows<"profiles">;
type DashboardData = {
  profile: Profile | null;
  wallet: TableRows<"wallets"> | null;
  plans: DataPlan[];
  orders: DataOrder[];
  fundings: Funding[];
  transactions: WalletTransaction[];
  users: Profile[];
  isAdmin: boolean;
};
type ViewKey = "overview" | "buy" | "fund" | "activity";
type Network = "MTN" | "Airtel" | "Glo" | "9mobile";
type AuthMode = "signin" | "signup";
type PlanEditor = { id: string; network: Network; dataAmount: string; validity: string; price: string; active: boolean };

const networkChoices: Network[] = ["MTN", "Airtel", "Glo", "9mobile"];
const fallbackPrices = [
  { network: "MTN" as Network, data: "1GB", validity: "30 days", price: 320 },
  { network: "Airtel" as Network, data: "2GB", validity: "30 days", price: 640 },
  { network: "Glo" as Network, data: "5GB", validity: "30 days", price: 1550 },
  { network: "9mobile" as Network, data: "10GB", validity: "30 days", price: 3050 },
];

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
  const [network, setNetwork] = useState<Network>("MTN");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [fundingAmount, setFundingAmount] = useState("");
  const [planEditor, setPlanEditor] = useState({
    id: "",
    network: "MTN" as Network,
    dataAmount: "",
    validity: "30 days",
    price: "",
    active: true,
  });

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
    () => (dashboard?.plans ?? []).filter((plan) => plan.network === network && (plan.active || dashboard?.isAdmin)),
    [dashboard?.isAdmin, dashboard?.plans, network],
  );
  const selectedPlan = availablePlans.find((plan) => plan.id === selectedPlanId) ?? availablePlans[0];

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
    setNotice("Live supplier ordering is not enabled yet. No wallet debit has been made.");
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

  const handleSavePlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number(planEditor.price);
    if (!planEditor.dataAmount.trim() || !Number.isFinite(price) || price <= 0) {
      setNotice("Add a plan size and a valid naira price.");
      return;
    }
    void action(async () => {
      await saveDataPlan({
        data: {
          id: planEditor.id || undefined,
          network: planEditor.network,
          dataAmount: planEditor.dataAmount,
          validity: planEditor.validity,
          price,
          active: planEditor.active,
        },
      });
      await refreshDashboard();
      setPlanEditor({ id: "", network: "MTN", dataAmount: "", validity: "30 days", price: "", active: true });
      setNotice("Data plan saved.");
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
          plans={availablePlans}
          selectedPlan={selectedPlan}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          phone={phone}
          setPhone={setPhone}
          onBuy={handleBuy}
          fundingAmount={fundingAmount}
          setFundingAmount={setFundingAmount}
          onFunding={handleFunding}
          onReviewFunding={handleReviewFunding}
          planEditor={planEditor}
          setPlanEditor={setPlanEditor}
          onSavePlan={handleSavePlan}
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
  network: Network; setNetwork: (network: Network) => void; plans: DataPlan[];
  selectedPlan: DataPlan | undefined; selectedPlanId: string; setSelectedPlanId: (id: string) => void;
  phone: string; setPhone: (phone: string) => void; onBuy: (event: FormEvent<HTMLFormElement>) => void;
  fundingAmount: string; setFundingAmount: (amount: string) => void;
  onFunding: (event: FormEvent<HTMLFormElement>) => void;
  onReviewFunding: (funding: Funding, decision: "approved" | "rejected") => void;
  planEditor: PlanEditor; setPlanEditor: (plan: PlanEditor) => void;
  onSavePlan: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const accountLabel = props.accountType.replace(/[_-]/g, " ");
  const navItems: { key: ViewKey; label: string; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <House /> },
    { key: "buy", label: props.accountType === "agent" ? "Reseller services" : props.accountType === "business" ? "Business services" : "Services", icon: <Sparkles /> },
    { key: "fund", label: "Wallet", icon: <Wallet /> },
    { key: "activity", label: props.accountType === "business" ? "Reports & activity" : "Transactions", icon: <FileClock /> },
  ];
  return (
    <div className="tr-app-shell">
      <header className="tr-app-header"><div className="tr-header-inner"><Brand/><div className="tr-header-search"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></span><input aria-label="Search" placeholder="Search" /></div><div className="tr-header-actions"><span className="tr-account-chip">{props.accountType.replace(/[_-]/g, " ")}</span><button className="tr-icon-button" aria-label="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button className="tr-user-pill" onClick={props.onSignOut} title="Sign out"><span>{(props.userName || "T").slice(0,1).toUpperCase()}</span><b>{props.userName.split(" ")[0]}</b><ChevronDown className="size-4"/></button></div></div></header>
      <div className="tr-app-layout"><aside className="tr-sidebar"><p className="tr-sidebar-label">MENU</p><nav>{navItems.map((item)=><button key={item.key} onClick={()=>props.setView(item.key)} className={props.view===item.key?"active":""}><span>{item.icon}</span>{item.label}</button>)}</nav><div className="tr-sidebar-bottom"><ShieldCheck/><b>Your account is protected</b><p>Your account, payments and personal information are protected by access controls.</p></div></aside>
        <main className="tr-main"><div className="tr-page-top"><div><p className="tr-muted">{accountLabel.toUpperCase()} ACCOUNT · {new Intl.DateTimeFormat("en-NG",{weekday:"long",day:"numeric",month:"long"}).format(new Date())}</p><h1>{headingForView(props.view, props.userName)}</h1></div><button className="tr-refresh" onClick={props.onRefresh} disabled={props.loading}><Clock3/> Refresh</button></div>
          {props.notice && <Notice message={props.notice} onClose={props.onDismissNotice}/>}
          {props.loading && !props.dashboard ? <LoadingScreen compact/> : null}
          {props.view === "overview" && <Overview dashboard={props.dashboard} accountType={props.accountType} onNavigate={props.setView}/>}
          {props.view === "buy" && <BuyDataView {...props}/>}
          {props.view === "fund" && <FundWalletView {...props}/>}
          {props.view === "activity" && <ActivityView dashboard={props.dashboard}/>}
        </main>
      </div>
      <nav className="tr-mobile-nav" aria-label="Account navigation">{navItems.map((item)=><button key={item.key} onClick={()=>props.setView(item.key)} className={props.view===item.key?"active":""}><span>{item.icon}</span>{item.label}</button>)}</nav>
    </div>
  );
}

function Overview({ dashboard, accountType, onNavigate }: { dashboard: DashboardData | null; accountType: string; onNavigate: (view: ViewKey) => void }) {
  const balance = dashboard?.wallet?.balance ?? 0;
  const recent = [...(dashboard?.transactions ?? [])].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,5);
  const tiles = [
    {icon:<Database/>,title:"Mobile data",sub:"Buy data bundles",status:"Available",tone:"blue"},
    {icon:<Smartphone/>,title:"Airtime",sub:"Top up a number",status:"Coming soon",tone:"purple"},
    {icon:<RadioTower/>,title:"TV",sub:"Manage subscriptions",status:"Coming soon",tone:"orange"},
    {icon:<Zap/>,title:"Electricity",sub:"Pay utility bills",status:"Coming soon",tone:"green"},
  ];
  return <div className="tr-dashboard-content">
    <section className="tr-overview-grid"><div className="tr-balance-panel"><div className="tr-panel-top"><span>{props.accountType.toUpperCase().replace(/[_-]/g, " ")} ACCOUNT · NGN</span><button aria-label="Wallet options"><MoreHorizontal/></button></div><p className="tr-balance-caption">Total balance</p><div className="tr-balance-amount">{formatNaira(balance)}</div><div className="tr-balance-bottom"><span><span className="tr-status-dot"/> Account active</span><button onClick={()=>onNavigate("fund")}>Add money <ArrowUpRight/></button></div></div>
      <div className="tr-actions-panel"><div className="tr-widget-heading"><h2>Quick actions</h2><span>Manage money</span></div><div className="tr-quick-grid"><button onClick={()=>onNavigate("fund")}><span className="q-blue"><Plus/></span><b>Add money</b></button><button onClick={()=>onNavigate("buy")}><span className="q-dark"><ArrowUpRight/></span><b>Buy data</b></button><button onClick={()=>onNavigate("activity")}><span className="q-purple"><FileClock/></span><b>History</b></button><button onClick={()=>onNavigate("buy")}><span className="q-green"><Grid2X2/></span><b>All services</b></button></div></div></section>
    <section className="tr-service-section"><div className="tr-widget-heading"><div><h2>{accountType === "agent" ? "Reseller services" : accountType === "business" ? "Business services" : "Your services"}</h2><p>{accountType === "agent" ? "Access services for your resale business." : accountType === "business" ? "Manage digital service purchases for your organisation." : "What would you like to do today?"}</p></div><button onClick={()=>onNavigate("buy")}>See all <ArrowRight/></button></div><div className="tr-services-grid">{tiles.map((tile)=><button key={tile.title} className="tr-service-card" onClick={()=>onNavigate("buy")}><span className={`tr-service-icon ${tile.tone}`}>{tile.icon}</span><span className="tr-service-title">{tile.title}</span><span className="tr-service-sub">{tile.sub}</span><span className={`tr-service-status ${tile.status==="Available"?"live":""}`}>{tile.status}</span></button>)}</div></section>
    <section className="tr-lower-grid"><div className="tr-widget-card"><div className="tr-widget-heading"><div><h2>{accountType === "business" ? "Business activity" : accountType === "agent" ? "Reseller activity" : "Recent transactions"}</h2><p>{accountType === "business" ? "Recent activity on your business wallet" : accountType === "agent" ? "Recent wallet and service activity" : "Your latest account activity"}</p></div><button onClick={()=>onNavigate("activity")}>View all <ArrowRight/></button></div>{recent.length?recent.map(entry=><TransactionRow key={entry.id} transaction={entry}/>):<EmptyState icon={<FileClock/>} title="No transactions yet" copy="Your wallet activity will appear here."/>}</div>
      <div className="tr-widget-card tr-network-card"><div className="tr-widget-heading"><div><h2>Mobile networks</h2><p>Choose a network to browse data</p></div></div>{networkChoices.map((choice,index)=><button className="tr-network-row" key={choice} onClick={()=>onNavigate("buy")}><NetworkMark network={choice} index={index}/><span>{choice}</span><ArrowRight/></button>)}</div></section>
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

function BuyDataView(props: {
  dashboard: DashboardData | null;
  busy: boolean;
  network: Network;
  setNetwork: (network: Network) => void;
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
        <p className="mt-1 text-sm text-muted-foreground">Select your network and the plan for your line.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Select a network">
          {networkChoices.map((choice, index) => (
            <Button key={choice} variant={props.network === choice ? "default" : "outline"} onClick={() => { props.setNetwork(choice); props.setSelectedPlanId(""); }}>
              <NetworkMark network={choice} index={index} />
            </Button>
          ))}
        </div>
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
        ) : <EmptyState icon={<Database />} title="No plans available" copy="There are no active plans for this network right now." />}
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
  const fundings = [...(dashboard?.fundings ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="space-y-6">
      <section className="border bg-background">
        <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Wallet transactions</h2><p className="mt-1 text-sm text-muted-foreground">Credits and data purchase debits</p></div>
        {transactions.length ? transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />) : <EmptyState icon={<Wallet />} title="No transactions yet" copy="Wallet credits and purchases will appear here." />}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="border bg-background">
          <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Data orders</h2></div>
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

function AdminView(props: {
  dashboard: DashboardData | null;
  busy: boolean;
  onReviewFunding: (funding: Funding, decision: "approved" | "rejected") => void;
  planEditor: PlanEditor;
  setPlanEditor: (plan: PlanEditor) => void;
  onSavePlan: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dashboard = props.dashboard;
  const pendingFundings = dashboard?.fundings.filter((funding) => funding.status === "pending") ?? [];
  const userName = (userId: string) => dashboard?.users.find((profile) => profile.id === userId)?.full_name || dashboard?.users.find((profile) => profile.id === userId)?.email || userId.slice(0, 8);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Smartphone />} label="Accounts" value={String(dashboard?.users.length ?? 0)} />
        <Metric icon={<PackageCheck />} label="Data orders" value={String(dashboard?.orders.length ?? 0)} />
        <Metric icon={<Clock3 />} label="Pending fundings" value={String(pendingFundings.length)} />
      </div>
      <section className="border bg-background">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-foreground">Funding requests to review</h2><p className="mt-1 text-sm text-muted-foreground">Approval credits the customer wallet automatically.</p></div><span className="rounded-full bg-chart-4/20 px-2.5 py-1 text-xs font-semibold text-foreground">{pendingFundings.length} pending</span></div>
        {pendingFundings.length ? pendingFundings.map((funding) => (
          <div key={funding.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 last:border-0">
            <div><p className="font-medium text-foreground">{userName(funding.user_id)}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(funding.created_at)} · Bank transfer</p></div>
            <div className="flex items-center gap-4"><strong className="text-foreground">{formatNaira(funding.amount)}</strong><Button size="sm" disabled={props.busy} onClick={() => props.onReviewFunding(funding, "approved")}><Check /> Approve</Button><Button size="sm" variant="outline" disabled={props.busy} onClick={() => props.onReviewFunding(funding, "rejected")}><X /> Reject</Button></div>
          </div>
        )) : <EmptyState icon={<CheckCircle2 />} title="All caught up" copy="There are no pending funding requests." />}
      </section>
      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <form onSubmit={props.onSavePlan} className="h-fit border bg-background p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-foreground">{props.planEditor.id ? "Edit data plan" : "Add a data plan"}</h2><p className="mt-1 text-sm text-muted-foreground">Set network, bundle, validity and price.</p></div>{props.planEditor.id && <Button size="icon" variant="ghost" type="button" title="Clear plan form" onClick={() => props.setPlanEditor({ id: "", network: "MTN", dataAmount: "", validity: "30 days", price: "", active: true })}><X /></Button>}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Network"><select className="h-10 w-full border bg-background px-3 text-sm" value={props.planEditor.network} onChange={(event) => props.setPlanEditor({ ...props.planEditor, network: event.target.value as Network })}>{networkChoices.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Data amount"><Input value={props.planEditor.dataAmount} onChange={(event) => props.setPlanEditor({ ...props.planEditor, dataAmount: event.target.value })} placeholder="1GB" required /></Field>
            <Field label="Validity"><Input value={props.planEditor.validity} onChange={(event) => props.setPlanEditor({ ...props.planEditor, validity: event.target.value })} placeholder="30 days" required /></Field>
            <Field label="Price (₦)"><Input type="number" min="1" step="1" value={props.planEditor.price} onChange={(event) => props.setPlanEditor({ ...props.planEditor, price: event.target.value })} required /></Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={props.planEditor.active} onChange={(event) => props.setPlanEditor({ ...props.planEditor, active: event.target.checked })} />Available for purchase</label>
          <Button className="mt-5 w-full" disabled={props.busy}>{props.planEditor.id ? "Save changes" : "Add plan"}</Button>
        </form>
        <section className="border bg-background">
          <div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Data plan catalogue</h2><p className="mt-1 text-sm text-muted-foreground">Edit a plan to update its price or availability.</p></div>
          <div className="max-h-[470px] overflow-auto">
            {(dashboard?.plans ?? []).map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0">
                <div className="min-w-0"><p className="font-medium text-foreground">{plan.network} · {plan.data_amount}</p><p className="text-sm text-muted-foreground">{plan.validity} · {plan.active ? "Available" : "Paused"}</p></div>
                <div className="flex items-center gap-3"><strong className="whitespace-nowrap text-sm text-foreground">{formatNaira(plan.price)}</strong><Button variant="outline" size="sm" onClick={() => props.setPlanEditor({ id: plan.id, network: plan.network as Network, dataAmount: plan.data_amount, validity: plan.validity, price: String(plan.price), active: plan.active })}>Edit</Button></div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="border bg-background"><div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Recent customer accounts</h2></div>{(dashboard?.users ?? []).slice(0, 12).map((profile) => <div key={profile.id} className="flex flex-wrap justify-between gap-2 border-b px-5 py-3 last:border-0"><span className="font-medium text-foreground">{profile.full_name || "New customer"}</span><span className="text-sm text-muted-foreground">{profile.email} · {profile.phone}</span></div>)}</section>
        <section className="border bg-background"><div className="border-b px-5 py-4"><h2 className="font-semibold text-foreground">Recent data orders</h2></div>{(dashboard?.orders ?? []).slice(0, 12).map((order) => <div key={order.id} className="flex flex-wrap justify-between gap-2 border-b px-5 py-3 last:border-0"><span className="font-medium text-foreground">{userName(order.user_id)} · {order.network} {order.data_amount}</span><span className="text-sm text-muted-foreground">{formatNaira(order.amount)} · {titleCase(order.status)}</span></div>)}</section>
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
  const symbols: Record<string, string> = { MTN: "M", Airtel: "A", Glo: "G", "9mobile": "9" };
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
  if (view === "buy") return "Buy mobile data";
  if (view === "fund") return "Add money to your wallet";
  if (view === "activity") return "Your activity";
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
