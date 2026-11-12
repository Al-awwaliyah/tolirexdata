import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Database,
  FileClock,
  House,
  LogOut,
  Menu,
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
type ViewKey = "overview" | "buy" | "fund" | "activity" | "admin";
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
      { title: "DEX Sub | Data, airtime and bills made simple" },
      { name: "description", content: "Buy affordable Nigerian mobile data with DEX Sub. Fast, secure wallet payments for MTN, Airtel, Glo and 9mobile." },
      { property: "og:title", content: "DEX Sub | Data, airtime and bills made simple" },
      { property: "og:description", content: "Affordable Nigerian mobile data with fast, secure wallet payments." },
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
      setNotice(messageOf(error, "We couldn't load your DEX Sub account."));
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
    if (!selectedPlan) {
      setNotice("Choose an available data plan first.");
      return;
    }
    if (!isValidNigerianPhone(phone)) {
      setNotice("Enter an 11-digit Nigerian phone number starting with 0.");
      return;
    }
    await action(async () => {
      const order = await createDataOrder({ data: { planId: selectedPlan.id, phone } });
      setNotice("Order placed. Your data is being processed.");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await completeDataOrder({ data: { orderId: order.id } });
      await refreshDashboard();
      setNotice("Data order completed successfully.");
      setPhone("");
    });
  };

  const handleFunding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(fundingAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice("Enter a valid amount in naira.");
      return;
    }
    await action(async () => {
      await createFundingRequest({ data: { amount } });
      await refreshDashboard();
      setFundingAmount("");
      setNotice("Funding request submitted. Your wallet will update after admin confirmation.");
    });
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
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex" aria-label="Main navigation">
          <a href="#plans" className="transition-colors hover:text-foreground">Data plans</a>
          <a href="#services" className="transition-colors hover:text-foreground">Services</a>
          <a href="#reviews" className="transition-colors hover:text-foreground">Reviews</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => onAuth("signin")}>Log in</Button>
          <Button onClick={() => onAuth("signup")}>Create account <ArrowRight /></Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-6 px-5 pb-16 pt-7 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pb-20 md:pt-10">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
            <span className="size-2 rounded-full bg-primary" /> Made for everyday Nigeria
          </div>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl md:text-6xl">
            Buy cheap data, airtime & bills in <span className="text-primary">seconds.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
            Your everyday top-ups, all in one place. Pick a network, choose a plan and pay from your DEX Sub wallet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => onAuth("signup")}>Get started <ArrowRight /></Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}>
              See data prices <ChevronDown />
            </Button>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Networks supported</span>
            {networkChoices.map((choice, index) => <NetworkMark key={choice} network={choice} index={index} />)}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md md:max-w-lg">
          <img
            src={new URL("../assets/dex-sub-mobile.jpg", import.meta.url).href}
            alt="DEX Sub mobile wallet and top-up services"
            className="mx-auto aspect-square w-full object-contain"
            fetchPriority="high"
          />
          <div className="absolute bottom-5 left-2 flex items-center gap-3 border bg-background/95 px-4 py-3 shadow-sm sm:left-0">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></span>
            <span><strong className="block text-sm text-foreground">Secure wallet payments</strong><small className="text-muted-foreground">Your balance, always in view</small></span>
          </div>
        </div>
      </section>

      <section id="plans" className="border-y bg-secondary/50">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">DATA PLANS</p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">More data. Less stress.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">Simple plan choices across the networks you already use.</p>
          </div>
          <div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {fallbackPrices.map((plan, index) => (
              <div key={plan.network} className="flex min-h-52 flex-col justify-between bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <NetworkMark network={plan.network} index={index} />
                  <span className="text-xs text-muted-foreground">{plan.validity}</span>
                </div>
                <div className="mt-8">
                  <p className="text-2xl font-semibold text-foreground">{plan.data}</p>
                  <p className="mt-1 text-sm text-muted-foreground">from <span className="font-semibold text-foreground">{formatNaira(plan.price)}</span></p>
                </div>
                <Button variant="ghost" className="mt-4 w-fit px-0 text-primary" onClick={() => onAuth("signup")}>Choose plan <ArrowRight /></Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Sample prices shown. Confirm current prices after signing in.</p>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-primary">ONE SIMPLE WALLET</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">The essentials, all together.</h2>
        </div>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <ServiceItem icon={<Database />} title="Mobile data" copy="Choose a plan for MTN, Airtel, Glo or 9mobile." tone="bg-primary/10 text-primary" />
          <ServiceItem icon={<Smartphone />} title="Airtime" copy="Top up your line when you need it." tone="bg-chart-3/15 text-chart-3" />
          <ServiceItem icon={<RadioTower />} title="TV subscriptions" copy="Keep your entertainment subscriptions in reach." tone="bg-chart-2/15 text-chart-2" />
          <ServiceItem icon={<Zap />} title="Electricity" copy="Pay your utility bills from one place." tone="bg-chart-4/20 text-chart-4" />
        </div>
        <p className="mt-7 max-w-2xl border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">
          Data purchases are available now. Airtime, TV and electricity payments are shown as service categories and are not connected to live providers yet.
        </p>
      </section>

      <section id="reviews" className="border-y bg-secondary/50">
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">A BETTER TOP-UP ROUTINE</p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">Small wins, every day.</h2>
            </div>
            <p className="text-xs text-muted-foreground">Example feedback — replace with verified customer reviews.</p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ["Fast and simple", "“I can pick a plan and check out without the extra steps.”"],
              ["My balance at a glance", "“It's helpful to see what I have before buying data.”"],
              ["The networks I use", "“Having my network options together makes top-ups easier.”"],
            ].map(([title, quote]) => (
              <figure key={title} className="border bg-background p-5">
                <div className="mb-5 flex gap-1 text-chart-4" aria-label="Example review"><Sparkles className="size-4" /><Sparkles className="size-4" /><Sparkles className="size-4" /><Sparkles className="size-4" /><Sparkles className="size-4" /></div>
                <blockquote className="text-base leading-7 text-foreground">{quote}</blockquote>
                <figcaption className="mt-5 text-sm font-semibold text-muted-foreground">{title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-sm text-muted-foreground md:px-10">
        <Brand />
        <p>Built for everyday top-ups in Nigeria.</p>
      </footer>
    </main>
  );
}

function DashboardShell(props: {
  userName: string;
  isAdmin: boolean;
  view: ViewKey;
  setView: (view: ViewKey) => void;
  onSignOut: () => void;
  notice: string;
  onDismissNotice: () => void;
  busy: boolean;
  loading: boolean;
  dashboard: DashboardData | null;
  onRefresh: () => void;
  network: Network;
  setNetwork: (network: Network) => void;
  plans: DataPlan[];
  selectedPlan: DataPlan | undefined;
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  onBuy: (event: FormEvent<HTMLFormElement>) => void;
  fundingAmount: string;
  setFundingAmount: (amount: string) => void;
  onFunding: (event: FormEvent<HTMLFormElement>) => void;
  onReviewFunding: (funding: Funding, decision: "approved" | "rejected") => void;
  planEditor: PlanEditor;
  setPlanEditor: (plan: PlanEditor) => void;
  onSavePlan: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const navItems: { key: ViewKey; label: string; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <House /> },
    { key: "buy", label: "Buy data", icon: <Database /> },
    { key: "fund", label: "Add money", icon: <Wallet /> },
    { key: "activity", label: "Activity", icon: <FileClock /> },
    ...(props.isAdmin ? [{ key: "admin" as const, label: "Admin", icon: <ShieldCheck /> }] : []),
  ];
  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{props.userName}</span>
            <Button variant="outline" size="sm" onClick={props.onSignOut} disabled={props.busy}><LogOut /> <span className="hidden sm:inline">Log out</span></Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r bg-background p-4 lg:block">
          <p className="px-3 pb-3 pt-2 text-xs font-semibold text-muted-foreground">YOUR ACCOUNT</p>
          <nav className="space-y-1" aria-label="Account navigation">
            {navItems.map((item) => <NavButton key={item.key} item={item} active={props.view === item.key} onClick={() => props.setView(item.key)} />)}
          </nav>
          <div className="mt-8 border-t pt-5">
            <div className="flex items-start gap-3 px-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span>
              <p className="text-xs leading-5 text-muted-foreground">Your wallet is protected. Purchases and funding reviews are recorded.</p>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-4 pb-24 pt-7 sm:px-6 lg:px-9 lg:pb-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{formatDate(new Date().toISOString())}</p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{headingForView(props.view, props.userName)}</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={props.onRefresh} disabled={props.loading}><Clock3 /> Refresh</Button>
          </div>
          {props.notice && <Notice message={props.notice} onClose={props.onDismissNotice} />}
          {props.loading && !props.dashboard ? <LoadingScreen compact /> : null}
          {props.view === "overview" && <Overview dashboard={props.dashboard} onNavigate={props.setView} />}
          {props.view === "buy" && <BuyDataView {...props} />}
          {props.view === "fund" && <FundWalletView {...props} />}
          {props.view === "activity" && <ActivityView dashboard={props.dashboard} />}
          {props.view === "admin" && props.isAdmin && <AdminView {...props} />}
          {props.view === "admin" && !props.isAdmin && <Overview dashboard={props.dashboard} onNavigate={props.setView} />}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Account navigation">
        {navItems.filter((item) => item.key !== "admin").slice(0, 4).map((item) => (
          <button key={item.key} type="button" onClick={() => props.setView(item.key)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${props.view === item.key ? "text-primary" : "text-muted-foreground"}`}>
            <span className="[&_svg]:size-5">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Overview({ dashboard, onNavigate }: { dashboard: DashboardData | null; onNavigate: (view: ViewKey) => void }) {
  const balance = dashboard?.wallet?.balance ?? 0;
  const recent = [...(dashboard?.transactions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);
  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-[1.3fr_.7fr]">
        <div className="relative overflow-hidden bg-primary p-6 text-primary-foreground sm:p-8">
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm text-primary-foreground/80">WALLET BALANCE</p>
              <p className="mt-3 text-4xl font-semibold">{formatNaira(balance)}</p>
              <p className="mt-2 text-sm text-primary-foreground/80">Available for data purchases</p>
            </div>
            <span className="grid size-12 place-items-center rounded-full bg-primary-foreground/15"><Wallet className="size-6" /></span>
          </div>
          <div className="relative z-10 mt-8 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => onNavigate("fund")}><Plus /> Add money</Button>
            <Button className="border border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" onClick={() => onNavigate("buy")}><Database /> Buy data</Button>
          </div>
          <span className="pointer-events-none absolute -bottom-20 -right-12 size-52 rounded-full border-[24px] border-primary-foreground/10" />
        </div>
        <div className="flex flex-col justify-between border bg-background p-6">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">QUICK BUY</p>
              <CircleDollarSign className="size-5 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-foreground">A little data goes a long way.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose your network and find a plan that works for you.</p>
          </div>
          <Button variant="outline" className="mt-6 w-fit" onClick={() => onNavigate("buy")}>Browse plans <ArrowRight /></Button>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="border bg-background">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div><h2 className="font-semibold text-foreground">Recent wallet activity</h2><p className="mt-1 text-sm text-muted-foreground">Your latest money in and out</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("activity")}>View all <ArrowRight /></Button>
          </div>
          {recent.length ? recent.map((entry) => <TransactionRow key={entry.id} transaction={entry} />) : <EmptyState icon={<FileClock />} title="No wallet activity yet" copy="Your purchases and funding requests will show here." />}
        </div>
        <div className="border bg-background p-5">
          <h2 className="font-semibold text-foreground">Popular networks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick a provider to start browsing plans.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {networkChoices.map((choice, index) => (
              <button key={choice} type="button" className="flex items-center gap-2 border p-3 text-left transition-colors hover:bg-secondary" onClick={() => onNavigate("buy")}>
                <NetworkMark network={choice} index={index} /><ArrowRight className="ml-auto size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </section>
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
        <p className="mt-3 text-center text-xs text-muted-foreground">Payment comes directly from your DEX Sub wallet.</p>
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
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Submit only after you have transferred the amount to verified DEX Sub bank details.</p>
      </form>
      <div className="border bg-background p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-full bg-chart-4/20 text-chart-4"><CreditCard className="size-4" /></span><div><h2 className="font-semibold text-foreground">Bank transfer details</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Account details have not been configured yet. Confirm verified transfer details with DEX Sub before sending any money.</p></div></div>
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
          <DialogTitle>{mode === "signup" ? "Create your DEX Sub account" : "Welcome back"}</DialogTitle>
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
          {mode === "signup" ? "Already have an account?" : "New to DEX Sub?"}{" "}
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
  return <a href="/" className="inline-flex items-center gap-2.5" aria-label="DEX Sub home"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Zap className="size-5 fill-current" /></span><span className="text-lg font-bold text-foreground">DEX <span className="text-primary">Sub</span></span></a>;
}

function ServiceItem({ icon, title, copy, tone }: { icon: ReactNode; title: string; copy: string; tone: string }) {
  return <div className="flex items-start gap-4"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone} [&_svg]:size-5`}>{icon}</span><div><h3 className="font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p></div></div>;
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
  return <div className={`flex items-center justify-center gap-3 text-sm text-muted-foreground ${compact ? "py-6" : "min-h-screen"}`}><span className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />Loading DEX Sub…</div>;
}

function headingForView(view: ViewKey, name: string): string {
  if (view === "overview") return `Good to see you, ${name.split(" ")[0]}`;
  if (view === "buy") return "Buy mobile data";
  if (view === "fund") return "Add money to your wallet";
  if (view === "activity") return "Your activity";
  return "DEX Sub admin";
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
