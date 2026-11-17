// Reading the school mailbox.
//
// The hub has sent mail for months and never read any. Everything a parent
// writes back — a corrected email address, a question about a fee, a reply
// to a welcome letter — lands in admin@ and is answered, if at all, in
// Gmail, which means the hub's record of a family stops at what we said to
// them.
//
// No new credential was needed for this. The domain is on Google Workspace
// and SMTP_USER/SMTP_PASS already hold an app password for admin@, because
// that is how fee statements go out; the same password reads the mailbox
// over IMAP. Gmail's IMAP host is the only thing that had to be assumed, and
// it is derived from the SMTP host rather than hard-coded, so a move to
// another provider changes one environment variable and not this file.
//
// Read-only, deliberately. The connection is opened with a readonly lock, so
// nothing here can mark a message read, move it or delete it: a coordinator
// glancing at the inbox in the hub must not silently change what the person
// actually working the mailbox sees in Gmail.

import { ImapFlow, type FetchMessageObject } from "imapflow";

const USER = process.env.IMAP_USER || process.env.SMTP_USER || "";
const PASS = process.env.IMAP_PASS || process.env.SMTP_PASS || "";

// smtp.gmail.com → imap.gmail.com. Most providers follow the same shape, and
// IMAP_HOST overrides it for the ones that do not.
const HOST =
  process.env.IMAP_HOST ||
  (process.env.SMTP_HOST || "").replace(/^smtp\./i, "imap.") ||
  "imap.gmail.com";

export const mailboxReady = () => Boolean(HOST && USER && PASS);
export const mailboxAddress = () => USER;

export type Summary = {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string | null;
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  preview: string;
};

export type Full = Summary & { html: string | null; text: string | null };

const when = (d?: string | Date | null): string | null => {
  if (!d) return null;
  const v = d instanceof Date ? d : new Date(d);
  return isNaN(v.getTime()) ? null : v.toISOString();
};

const addr = (a?: { name?: string; address?: string }[] | null) =>
  (a || []).map((x) => x.address || "").filter(Boolean).join(", ");
const addrName = (a?: { name?: string; address?: string }[] | null) =>
  (a?.[0]?.name || a?.[0]?.address || "").trim();

async function open() {
  const client = new ImapFlow({
    host: HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: USER, pass: PASS },
    // ImapFlow logs every command at info level by default, which on a
    // serverless function means the message bodies end up in the platform's
    // log stream. A mailbox is not something to leave lying around in logs.
    logger: false,
  });
  await client.connect();
  return client;
}

/** Newest first. `limit` is how many to read back, not a page offset. */
export async function list(box = "INBOX", limit = 40, search?: string): Promise<Summary[]> {
  const client = await open();
  try {
    const lock = await client.getMailboxLock(box, { readOnly: true });
    try {
      const total = (client.mailbox as { exists: number }).exists || 0;
      if (!total) return [];

      // A search goes to the server, because the alternative is pulling the
      // whole mailbox down to filter it here.
      let uids: number[] | null = null;
      if (search && search.trim()) {
        const q = search.trim();
        uids = (await client.search({ or: [{ subject: q }, { from: q }, { body: q }] }, { uid: true })) || [];
        if (!uids.length) return [];
        uids = uids.slice(-limit);
      }

      const range = uids ? uids.join(",") : `${Math.max(1, total - limit + 1)}:${total}`;
      const out: Summary[] = [];
      for await (const m of client.fetch(
        range,
        { envelope: true, flags: true, bodyStructure: true, internalDate: true },
        { uid: Boolean(uids) },
      )) {
        out.push(summarise(m));
      }
      return out.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function one(uid: number, box = "INBOX"): Promise<Full | null> {
  const client = await open();
  try {
    const lock = await client.getMailboxLock(box, { readOnly: true });
    try {
      const m = await client.fetchOne(
        String(uid),
        { envelope: true, flags: true, bodyStructure: true, internalDate: true, source: true },
        { uid: true },
      );
      if (!m) return null;

      // Bodies are pulled as parts rather than parsing the whole source, so a
      // message with a 10 MB attachment does not become a 10 MB response.
      const html = await part(client, uid, m, "text/html");
      const text = await part(client, uid, m, "text/plain");
      return { ...summarise(m), html, text };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function summarise(m: FetchMessageObject): Summary {
  const env = m.envelope || ({} as NonNullable<FetchMessageObject["envelope"]>);
  const flags = m.flags || new Set<string>();
  return {
    uid: m.uid,
    seq: m.seq,
    subject: (env.subject || "(no subject)").slice(0, 300),
    from: addr(env.from),
    fromName: addrName(env.from),
    to: addr(env.to),
    // envelope.date is typed as string | Date because IMAP servers are not
    // consistent about it, so it is normalised rather than assumed.
    date: when(env.date) || when(m.internalDate),
    seen: flags.has("\\Seen"),
    answered: flags.has("\\Answered"),
    flagged: flags.has("\\Flagged"),
    hasAttachments: hasAttachment(m.bodyStructure),
    preview: "",
  };
}

type Node = { type?: string; disposition?: string; childNodes?: Node[]; part?: string };

function hasAttachment(node?: Node): boolean {
  if (!node) return false;
  if ((node.disposition || "").toLowerCase() === "attachment") return true;
  return (node.childNodes || []).some(hasAttachment);
}

function findPart(node: Node | undefined, type: string): string | null {
  if (!node) return null;
  if ((node.type || "").toLowerCase() === type && (node.disposition || "").toLowerCase() !== "attachment") {
    return node.part || "1";
  }
  for (const c of node.childNodes || []) {
    const hit = findPart(c, type);
    if (hit) return hit;
  }
  return null;
}

async function part(client: ImapFlow, uid: number, m: FetchMessageObject, type: string) {
  const id = findPart(m.bodyStructure as Node, type);
  if (!id) return null;
  try {
    const d = await client.download(String(uid), id, { uid: true });
    if (!d?.content) return null;
    const chunks: Buffer[] = [];
    for await (const c of d.content) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString("utf8").slice(0, 400_000);
  } catch {
    return null;
  }
}
