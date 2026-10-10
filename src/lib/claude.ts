// The one place the Claude key lives.
//
// Sixty API routes could each grow their own fetch call to Anthropic, and then
// the key, the retry behaviour, the timeout and the spending would be in sixty
// places and consistent in none. Everything that asks Claude anything goes
// through here.
//
// What this is for, and what it is not for. Claude explains, drafts and
// proposes. It does not compute pay, quote a fee, or decide anything on its
// own. The numbers come from the engine and the database; this turns them into
// sentences, or suggests something a person then confirms. That is not
// timidity — a model that states a figure will eventually state a wrong one,
// and in this system wrong figures are somebody's salary or somebody's fee.

import type { SupabaseClient } from "@supabase/supabase-js";

const API = "https://api.anthropic.com/v1/messages";

// Fable for writing — Abhinav's choice, and the right one for prose that has
// to sound like a person rather than a form letter.
//
// But not for judging whether two records are one family. That task is a
// refusal as often as an assent — two different boys called Shivansh, with
// different fathers, in different societies — and getting the no right is the
// whole value of it. So the judge keeps its own model and its own variable.
export const MODELS = {
  write: process.env.ANTHROPIC_MODEL || "claude-fable-5",
  judge: process.env.ANTHROPIC_MODEL_JUDGE || "claude-sonnet-5-5",
} as const;

export type Feature = "enquiry_summary" | "duplicate_judge" | "morning_brief" | "followup_draft";

export type AskOptions = {
  feature: Feature;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  /** What this was about — an enquiry id, a month — so a bad answer can be traced back. */
  entityId?: string | number | null;
  /** Written to eurokids.ai_call when given. Never the prompt, only the shape of the call. */
  log?: SupabaseClient;
  actor?: string | null;
};

// No temperature anywhere. Fable rejects it outright — "`temperature` is
// deprecated for this model" — which would have failed every summary and
// every brief at the moment of asking, not subtly but completely. Rather than
// keep a table of which model tolerates which knob, nothing here sets it: the
// defaults are what we want in every case anyway.

export class ClaudeUnavailable extends Error {}

export const claudeReady = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * Ask Claude once, and write down that we did.
 *
 * Throws rather than returning an empty string: a summary that silently comes
 * back blank looks like a family with nothing to say about them, which is a
 * worse lie than an error message.
 */
export async function ask(o: AskOptions): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ClaudeUnavailable("ANTHROPIC_API_KEY is not set on this deployment.");

  const model = o.model || MODELS.write;
  const started = Date.now();

  const record = async (ok: boolean, inTok: number | null, outTok: number | null, error?: string) => {
    if (!o.log) return;
    // Logging must never be the reason a feature fails.
    await o.log.schema("eurokids").from("ai_call").insert({
      feature: o.feature, model, entity_id: o.entityId == null ? null : String(o.entityId),
      in_tokens: inTok, out_tokens: outTok, ms: Date.now() - started, ok,
      error: error?.slice(0, 500) ?? null, actor: o.actor ?? null,
    }).then(() => {}, () => {});
  };

  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: o.maxTokens ?? 1024, system: o.system,
        messages: [{ role: "user", content: o.user }],
      }),
      // A screen waiting on this has a person in front of it.
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "Claude took too long to answer." : (e as Error).message;
    await record(false, null, null, msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    // The three that actually happen, said in words rather than as a status
    // code — an expired key reads as "it is broken" otherwise.
    const msg = res.status === 401 ? "Claude rejected the API key — it may have expired or been revoked."
      : res.status === 404 ? `Claude does not know the model “${model}”. Check ANTHROPIC_MODEL.`
      : res.status === 429 ? "Claude is rate-limiting us. Try again in a moment."
      : `Claude said ${res.status}: ${body}`;
    await record(false, null, null, msg);
    throw new Error(msg);
  }

  const json = await res.json();
  const text: string = (json.content || []).map((c: { text?: string }) => c.text || "").join("").trim();
  await record(true, json.usage?.input_tokens ?? null, json.usage?.output_tokens ?? null);

  if (!text) throw new Error("Claude answered with nothing.");
  return text;
}

/** Ask for JSON and get JSON, or an error that says so. */
export async function askJson<T>(o: AskOptions): Promise<T> {
  const text = await ask(o);
  // A stray sentence either side of the object would otherwise throw away a
  // whole batch of perfectly good answers.
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error("Claude's answer was not JSON.");
  try { return JSON.parse(m[0]) as T; }
  catch { throw new Error("Claude's answer looked like JSON but would not parse."); }
}

// The school, in the words it uses about itself. Shared, so every drafted
// message sounds like the same place rather than like four different schools.
export const SCHOOL_VOICE = `You are writing for EuroKids JMD Enclave, a preschool and day care in Undri, Pune, run by Veena Educational Services. Established 2017, around 3,000 families have been through it, 6,000 sq ft of play area. Programmes: Play Group, Nursery, Euro Junior, Euro Senior, Day Care, Summer Camp.

How the school writes: warm but not gushing, plain English a Pune parent reads easily, no exclamation marks, no marketing adjectives, no emoji. Short sentences. Never invent a fee, a date, a timing, a policy or anything about a particular child — if you were not given it, leave it out or say the office will confirm. Indian English conventions: "admission", "the fee", "Std", lakh and crore where relevant.`;
