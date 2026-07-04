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
// Request body:  { code: string, redirectUri: string }
//
// The function should:
//   1. Exchange `code` for Xero tokens (access_token, refresh_token, id_token, expires_in)
//      using the Xero client secret (server-side only).
//   2. Upsert the refresh_token / access_token / expires_at into a table like
//      `xero_connections`, keyed by the resolved user id.
//   3. Create-or-sign-in the corresponding Supabase user (e.g. via the Xero id_token's
//      email claim, using admin.createUser / generateLink, or signInWithIdToken).
//   4. Return a Supabase session so the frontend can adopt it:
//
// Response body (success): { session: { access_token: string, refresh_token: string } }
// Response body (error):   { error: string }
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMessage, setErrorMessage] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function completeSignIn() {
      console.log("🟢 STARTING SIGN-IN PROCESS");
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");

      if (errorParam) {
        console.error("❌ FAIL: Xero returned an explicit error parameter:", errorParam);
        setStatus("error");
        setErrorMessage(`Xero denied the request: ${errorParam}`);
        return;
      }

      const expectedState = sessionStorage.getItem("xero_oauth_state");
      console.log("🔍 STATE CHECK:", { urlState: state, sessionStorageState: expectedState });
      
      sessionStorage.removeItem("xero_oauth_state");

      if (!code || !state || !expectedState || state !== expectedState) {
        console.error("❌ FAIL: State mismatch or missing parameters", {
          hasCode: !!code,
          hasState: !!state,
          hasExpectedState: !!expectedState,
          statesMatch: state === expectedState
        });
        setStatus("error");
        setErrorMessage("Invalid or expired sign-in request. Please try again.");
        return;
      }

      console.log("🚀 PASS: State validation succeeded. Invoking Supabase Edge Function...");

      const { data, error } = await supabase.functions.invoke("xero-oauth-callback", {
        body: {
          code,
          redirectUri: import.meta.env.VITE_XERO_REDIRECT_URI as string,
        },
      });

      if (error || !data?.session) {
        console.error("❌ FAIL: Supabase Edge Function error:", error || "No session returned in data");
        setStatus("error");
        setErrorMessage(error?.message ?? "Could not complete Xero sign-in.");
        return;
      }

      console.log("🚀 PASS: Edge function returned a session successfully. Setting Supabase session...", data.session);

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        console.error("❌ FAIL: supabase.auth.setSession failed:", sessionError.message);
        setStatus("error");
        setErrorMessage(sessionError.message);
        return;
      }

      console.log("🎉 SUCCESS: Session established! Redirecting to dashboard...");
      navigate({ to: "/dashboard", replace: true });
    }

    completeSignIn().catch((err) => {
      console.error("💥 CRITICAL FAIL: Uncaught exception in sign-in sequence:", err);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="text-center">
        {status === "working" ? (
          <p className="text-sm text-muted-foreground">Finishing sign-in with Xero…</p>
        ) : (
          <>
            <p className="text-sm font-medium">Sign-in failed</p>
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