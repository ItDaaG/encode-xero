import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — FlowSync" },
      { name: "description", content: "Sign in to your FlowSync account with Xero." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

// Set these in your env (e.g. .env / .env.local)
// VITE_XERO_CLIENT_ID=xxxxxxxx
// VITE_XERO_REDIRECT_URI=https://yourapp.com/auth/callback
const XERO_CLIENT_ID = import.meta.env.VITE_XERO_CLIENT_ID as string;
const XERO_REDIRECT_URI = import.meta.env.VITE_XERO_REDIRECT_URI as string;

// Adjust scopes to whatever your app actually needs.
// offline_access is required to get a refresh token back.
const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.invoices",
  "offline_access"
].join(" ");

function buildXeroAuthorizeUrl() {
  // Basic CSRF protection: generate a state value and verify it in the callback.
  const state = crypto.randomUUID();
  sessionStorage.setItem("xero_oauth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: XERO_SCOPES,
    state,
  });

  return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  function handleXeroSignIn() {
    if (!XERO_CLIENT_ID || !XERO_REDIRECT_URI) {
      toast.error("Xero sign-in isn't configured yet. Missing client ID or redirect URI.");
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
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your FlowSync dashboard with your Xero account.
          </p>

          <button
            type="button"
            onClick={handleXeroSignIn}
            disabled={redirecting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {redirecting ? "Redirecting to Xero…" : "Sign in with Xero"}
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            You'll be redirected to Xero to authorize FlowSync, then brought back here.
          </p>
        </div>
      </div>
    </div>
  );
}