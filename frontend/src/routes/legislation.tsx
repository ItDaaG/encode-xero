import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { sendLegislationChatMessage } from "@/lib/legislationChat";
import { Layers, Send } from "lucide-react";

export const Route = createFileRoute("/legislation")({
  head: () => ({
    meta: [
      { title: "Legislation Assistant — FlowSync" },
      { name: "description", content: "Ask about tax and business legislation for your connected organisations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LegislationChatPage,
});

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// The agent's replies are markdown (headers, bold, lists, rules) -- style
// each element directly since this project has no @tailwindcss/typography
// plugin installed.
const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => <h1 className="mt-3 mb-2 text-base font-semibold first:mt-0" {...props} />,
  h2: (props: ComponentPropsWithoutRef<"h2">) => <h2 className="mt-3 mb-2 text-base font-semibold first:mt-0" {...props} />,
  h3: (props: ComponentPropsWithoutRef<"h3">) => <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0" {...props} />,
  p: (props: ComponentPropsWithoutRef<"p">) => <p className="mb-2 leading-relaxed last:mb-0" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold" {...props} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: (props: ComponentPropsWithoutRef<"li">) => <li {...props} />,
  hr: () => <hr className="my-3 border-border" />,
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="underline underline-offset-2 hover:text-primary" target="_blank" rel="noreferrer" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />
  ),
};

const SUGGESTIONS = [
  "Am I close to the UK VAT registration threshold?",
  "What's the current UAE corporate tax rate?",
  "What are Germany's small business tax rules?",
];

function LegislationChatPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      setReady(true);
    });
  }, [navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const { reply } = await sendLegislationChatMessage({
        data: { message: trimmed, sessionId: sessionIdRef.current },
      });
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong asking the assistant.");
    } finally {
      setSending(false);
    }
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowSync</span>
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
        <div className="mb-6">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Legislation Assistant
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ask about tax legislation</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Grounded in live search across UK, UAE, and German tax authorities, combined with your
            actual connected Xero figures. Not a substitute for professional tax advice.
          </p>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-border bg-card">
          <div className="flex-1 space-y-4 overflow-y-auto p-6" style={{ minHeight: "20rem", maxHeight: "60vh" }}>
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-xl border border-border bg-background px-4 py-3 text-sm">
                    <ReactMarkdown components={markdownComponents}>{m.text}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2 border-t border-border p-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about tax or business legislation…"
              disabled={sending}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
