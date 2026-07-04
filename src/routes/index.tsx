import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe2, LineChart, Bell, Layers, TrendingUp, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowSync</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#who" className="hover:text-foreground">Who it's for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.primary/12),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Xero-native · Built for multi-country operators
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-6xl">
              One view of your business, <span className="text-muted-foreground">across every country.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              FlowSync connects every Xero organisation you own, converts each branch into your home currency,
              and surfaces the insights you'd never spot inside a single account.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start syncing your entities <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-3 text-sm font-medium hover:bg-accent"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-3 gap-4 text-center">
            {[
              { k: "3", v: "Xero orgs demo" },
              { k: "1", v: "Home currency" },
              { k: "0", v: "Spreadsheets" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card p-5">
                <div className="text-3xl font-semibold">{s.k}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-secondary/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">The intelligence lives between your branches.</h2>
            <p className="mt-3 text-muted-foreground">
              No single Xero account can tell you which branch is dragging your margin, or which one is quietly running leaner. FlowSync can.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Globe2, title: "Connect every entity", body: "OAuth into unlimited Xero organisations. Each keeps its own local currency and its own books." },
              { icon: LineChart, title: "Consolidated in your currency", body: "Live FX rates normalise every branch's P&L into your home currency. See total revenue, profit, and cash in one glance." },
              { icon: TrendingUp, title: "Rank & compare", body: "Which location is most profitable this month? Which margin is slipping? Ranked automatically." },
              { icon: Bell, title: "Anomaly alerts", body: "If a branch drops week-on-week, you hear about it before you would have noticed manually." },
              { icon: Zap, title: "Monday digest", body: "A consolidated report lands in your inbox every Monday. Zero logins, zero manual work." },
              { icon: Layers, title: "Opportunity surfacing", body: "When one branch runs leaner than another for the same inputs, we flag it as a replicable efficiency." },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Built for the way you actually operate.</h2>
              <p className="mt-3 text-muted-foreground">
                Today, running the same brand across three countries means three logins, three currencies, and a spreadsheet held together with hope.
                FlowSync replaces that entire workflow.
              </p>
              <ol className="mt-8 space-y-5">
                {[
                  ["Connect", "Authorise FlowSync against each Xero organisation. Takes under a minute per branch."],
                  ["Aggregate", "We pull P&L, revenue, expenses, and bank positions on a schedule."],
                  ["Normalise", "Every figure is converted into your home currency using live FX rates."],
                  ["Act", "Get ranked branch performance, alerts on anomalies, and a weekly digest by email."],
                ].map(([step, body], i) => (
                  <li key={step} className="flex gap-4">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold">{step}</div>
                      <div className="text-sm text-muted-foreground">{body}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div id="who" className="rounded-2xl border border-border bg-card p-8">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Who it's for</div>
              <h3 className="mt-2 text-2xl font-semibold">Entrepreneurs running the same brand across borders.</h3>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Franchise owners with 2–5 locations across countries",
                  "Regional chain operators (F&B, retail, services)",
                  "International service businesses billing in multiple currencies",
                  "Founders who've outgrown a bookkeeper-built spreadsheet",
                ].map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create your FlowSync account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-primary text-primary-foreground">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <span className="font-medium text-foreground">FlowSync</span>
            <span>— multi-entity business intelligence.</span>
          </div>
          <div>© {new Date().getFullYear()} FlowSync. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}