import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth_/callback")({
  head: () => ({
    meta: [
      { title: "Signing in — FlowSync" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

// Expected contract for the "xero-oauth-callback" edge function:
//
// Request body: { code: string, redirectUri: string, mode: "login" | "connect" }
// Header (mode = "connect" only): Authorization: Bearer <current supabase access_token>
//
//   mode = "login":
//     Exchange code -> identity only -> create-or-sign-in the Supabase user ->
//     return a new session for the frontend to adopt.
//     Response: { session: { access_token, refresh_token } }
//
//   mode = "connect":
//     Exchange code -> org tokens -> identify the CALLER from the Authorization
//     header (they're already signed in) -> upsert into xero_connections keyed
//     to that user_id. No new session needed, frontend already has one.
//     Response: { ok: true }
//
// Response body (either mode, on failure): { error: string }
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMessage, setErrorMessage] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // If Xero didn't give us something usable (explicit denial, tenant consent
    // denied, stale/missing state, etc.) but the user is already signed in from
    // a prior successful login, don't show an error — just send them back in.
    async function fallBackToExistingSession(reason: string) {
      console.warn("⚠️ No usable code/state — checking for existing session. Reason:", reason);
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        toast.error("That Xero action didn't complete, but you're still signed in.");
        navigate({ to: "/dashboard", replace: true });
        return true;
      }
      return false;
    }

    async function completeSignIn() {
      const mode = (sessionStorage.getItem("xero_oauth_mode") as "login" | "connect") ?? "login";
      console.log("🟢 STARTING CALLBACK. mode =", mode);

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");
      const errorDescription = params.get("error_description");

      sessionStorage.removeItem("xero_oauth_mode");

      if (errorParam) {
        console.error("❌ Xero returned an error:", errorParam, errorDescription);
        const handled = await fallBackToExistingSession(`error=${errorParam}`);
        if (handled) return;
        setStatus("error");
        setErrorMessage(errorDescription || `Xero denied the request: ${errorParam}`);
        return;
      }

      const expectedState = sessionStorage.getItem("xero_oauth_state");
      sessionStorage.removeItem("xero_oauth_state");

      if (!code || !state || !expectedState || state !== expectedState) {
        console.error("❌ State mismatch or missing parameters", {
          hasCode: !!code,
          hasState: !!state,
          hasExpectedState: !!expectedState,
          statesMatch: state === expectedState,
        });
        const handled = await fallBackToExistingSession("missing or mismatched code/state");
        if (handled) return;
        setStatus("error");
        setErrorMessage("Invalid or expired sign-in request. Please try again.");
        return;
      }

      console.log("🚀 PASS: State validated. Invoking edge function...");

      // For "connect" mode we need to prove who's calling, since the edge
      // function isn't creating a session here — it's attaching org tokens
      // to whoever is already signed in.
      let authHeader: Record<string, string> | undefined;
      if (mode === "connect") {
        const { data: current } = await supabase.auth.getSession();
        if (!current.session) {
          setStatus("error");
          setErrorMessage("You need to be signed in to connect an organisation.");
          return;
        }
        authHeader = { Authorization: `Bearer ${current.session.access_token}` };
      }

      const { data, error } = await supabase.functions.invoke("xero-oauth-callback", {
        body: {
          code,
          redirectUri: import.meta.env.VITE_XERO_REDIRECT_URI as string,
          mode,
        },
        headers: authHeader,
      });

      if (error) {
        console.error("❌ Edge function error:", error);
        setStatus("error");
        setErrorMessage(error.message ?? "Could not complete the request.");
        return;
      }

      if (mode === "connect") {
        console.log("🎉 SUCCESS: Organisation connected.");
        toast.success("Xero organisation connected.");
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      // mode === "login"
      if (!data?.session) {
        setStatus("error");
        setErrorMessage("Sign-in didn't return a session.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        console.error("❌ setSession failed:", sessionError.message);
        setStatus("error");
        setErrorMessage(sessionError.message);
        return;
      }

      console.log("🎉 SUCCESS: Signed in.");
      navigate({ to: "/dashboard", replace: true });
    }

    completeSignIn().catch((err) => {
      console.error("💥 Uncaught exception in callback:", err);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="text-center">
        {status === "working" ? (
          <p className="text-sm text-muted-foreground">Finishing up with Xero…</p>
        ) : (
          <>
            <p className="text-sm font-medium">Something went wrong</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
            <a href="/auth" className="mt-4 inline-block text-sm underline">
              Try again
            </a>
          </>
        )}
      </div>
    </div>
  );
}