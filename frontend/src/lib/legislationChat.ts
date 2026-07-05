// Server function bridging the chat UI to the Python ADK agent server
// (agents/root_agent -> legislation_agent), which runs as its own local
// process (`adk api_server`) since it's a separate Python runtime from this
// Node app. Only reachable server-side -- the browser never talks to the
// agent server directly, and never supplies its own user id: that comes
// from the verified Supabase session via requireSupabaseAuth, so a chat
// message can never make the agent fetch another customer's Xero data.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADK_BASE_URL = process.env.ADK_API_BASE_URL ?? "http://127.0.0.1:8001";
const ADK_APP_NAME = "root_agent";

interface AdkEventPart {
  text?: string;
}

interface AdkEvent {
  author?: string;
  content?: { parts?: AdkEventPart[] };
}

async function ensureSession(userId: string, sessionId: string): Promise<void> {
  const res = await fetch(
    `${ADK_BASE_URL}/apps/${ADK_APP_NAME}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
  if (res.ok) return;

  const createRes = await fetch(
    `${ADK_BASE_URL}/apps/${ADK_APP_NAME}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!createRes.ok) {
    throw new Error(`Failed to create agent session: ${createRes.status} ${await createRes.text()}`);
  }
}

export const sendLegislationChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { message: string; sessionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { message, sessionId } = data;
    const userId = context.userId;

    await ensureSession(userId, sessionId);

    const runRes = await fetch(`${ADK_BASE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_name: ADK_APP_NAME,
        user_id: userId,
        session_id: sessionId,
        new_message: { role: "user", parts: [{ text: message }] },
      }),
    });

    if (!runRes.ok) {
      throw new Error(`Agent request failed: ${runRes.status} ${await runRes.text()}`);
    }

    const events = (await runRes.json()) as AdkEvent[];

    // The agent may transfer between sub-agents and make tool calls along
    // the way -- the last event carrying actual text is the real reply.
    let reply: string | undefined;
    for (const event of events) {
      for (const part of event.content?.parts ?? []) {
        if (part.text && part.text.trim().length > 0) reply = part.text;
      }
    }

    if (!reply) {
      throw new Error("The assistant didn't return a text response.");
    }

    return { reply };
  });
