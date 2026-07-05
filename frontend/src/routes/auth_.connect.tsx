import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth_/connect")({
  head: () => ({
    meta: [
      { title: "Connect Xero — FlowSync" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectPage,
});

const XERO_CLIENT_ID = import.meta.env.VITE_XERO_CLIENT_ID as string;
const XERO_REDIRECT_URI = import.meta.env.VITE_XERO_REDIRECT_URI as string;

// Org-level data access, requested only when the user deliberately connects
// an organisation (this triggers Xero's tenant-consent screen, unlike the
// identity-only login scopes in auth.tsx).
//
// Xero deprecated the broad "accounting.transactions" and
// "accounting.reports.read" scopes in favour of granular per-resource ones
// (apps created from March 2026 onward can't request the broad scopes at
// all -- Xero's authorize endpoint rejects them with "invalid_scope").
// This app reads Invoices, Contacts, Organisation, and the P&L / Balance
// Sheet / Bank Summary reports, and writes demo bank transactions for
// seeding test data, so it requests just those granular scopes:
const CONNECT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices.read",
  "accounting.contacts.read",
  "accounting.settings.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.banksummary.read",
  "accounting.banktransactions",
  "accounting.contacts",
].join(" ");

function buildXeroAuthorizeUrl() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("xero_oauth_state", state);
  sessionStorage.setItem("xero_oauth_mode", "connect");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: CONNECT_SCOPES,
    state,
  });

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

function ConnectPage() {
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth", replace: true });
    });
  }, [navigate]);

  function handleConnect() {
    if (!XERO_CLIENT_ID || !XERO_REDIRECT_URI) {
      toast.error("Xero isn't configured yet. Missing client ID or redirect URI.");
      return;
    }
    setRedirecting(true);
    window.location.href = buildXeroAuthorizeUrl();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">FlowSync</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Connect an organisation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant FlowSync read access to a Xero organisation's invoices, contacts, and reports.
          </p>

          <button
            type="button"
            onClick={handleConnect}
            disabled={redirecting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {redirecting ? "Redirecting to Xero…" : "Connect Xero organisation"}
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            You'll be asked to pick an organisation and approve access on Xero's site.
          </p>
        </div>
      </div>
    </div>
  );
}
