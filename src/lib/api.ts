import { toast } from "sonner";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
let refusalShown = false;

// The API verifies the Clerk session token when CLERK_SECRET_KEY is configured on the server.
// Queries fire on first render, before clerk-js has restored the session; without waiting they go out with no token (401).
async function authHeaders(): Promise<Record<string, string>> {
  for (let waited = 0; !(window as any).Clerk?.loaded && waited < 10_000; waited += 50) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const token = await (window as any).Clerk?.session?.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * `timeoutMs`: give up instead of waiting forever. 10 Nov: one request hung on a bad connection and Find in CAREER141's
 * progress froze at 38% while the search itself finished. Errors carry `status` (0 = no answer: timeout or network).
 */
async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const headers = { "Content-Type": "application/json", ...(await authHeaders()), ...rest.headers };
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...rest, headers, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
    if (res.ok) return (await res.json()) as T;
  } catch (e) {
    const slow = (e as Error)?.name === "TimeoutError";
    throw Object.assign(new Error(slow ? "The server took too long to answer." : "Could not reach the server."), { status: 0 });
  }
  const body = await res.json().catch(() => ({}));
  // A refused account used to see an empty app with zeros everywhere; say why, once per page load.
  // Only the sign-in refusal carries `reason`; other 403s (e.g. AWS cost access) must not tell people to sign out.
  if (res.status === 403 && body.reason && !refusalShown) {
    refusalShown = true;
    toast.error(`You're signed in, but ${body.reason ?? "this account can't use the app"}. Sign out and use your company email.`, { duration: 15000 });
  }
  const errorMessage = body.details
    ? `${body.error || 'Error'}: ${body.details}`
    : (body.error ?? `Request failed (${res.status})`);
  throw Object.assign(new Error(errorMessage), { response: { data: body }, status: res.status });
}

/** The HTTP status an api error carries: 0 when nothing answered (timeout or network), else the server's code. */
export const errorStatus = (e: unknown): number => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : 0;
};

/** Brevo imports run on the server in the background: start the job, then poll until it finishes. */
async function runBrevoJob<T>(path: string, apiKey: string): Promise<T> {
  const { jobId } = await request<{ jobId: string }>(path, { method: "POST", body: JSON.stringify({ apiKey }) });
  while (true) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = await request<{ status: string; result?: T; error?: string }>(`/brevo/jobs/${jobId}`);
    if (job.status === "done") return job.result as T;
    if (job.status === "failed") throw new Error(job.error ?? "Import failed");
  }
}

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const api = {
  contacts: {
    list: (params?: { q?: string; page?: number; pageSize?: number; listId?: number }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      if (params?.listId) qs.set("listId", String(params.listId));
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<PaginatedResponse<any>>(`/contacts${suffix}`);
    },
    stats: (params?: { listId?: number; listIds?: string }) => {
      const qs = new URLSearchParams();
      if (params?.listIds) qs.set("listIds", params.listIds);
      else if (params?.listId) qs.set("listId", String(params.listId));
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<{ total: number; subscribed: number; unsubscribed: number; bounced: number }>(`/contacts/stats${suffix}`);
    },
    get: (id: string) => request<any>(`/contacts/${id}`),
    create: (data: any) => request<any>("/contacts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/contacts/${id}`, { method: "DELETE" }),
    updateBulkBlocklist: (contactIds: number[], blocked: boolean) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk/blocklist", {
        method: "PATCH",
        body: JSON.stringify({ contactIds, blocked }),
      }),
    addToList: (contactIds: number[], listIds: number[]) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk/lists", {
        method: "POST",
        body: JSON.stringify({ contactIds, listIds }),
      }),
    removeFromList: (contactIds: number[], listIds: number[]) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk/remove-from-lists", {
        method: "POST",
        body: JSON.stringify({ contactIds, listIds }),
      }),
    importList: (data: { listName: string; folderId: number; contacts: { email: string; name: string }[] }) =>
      request<{ listId: number; listName: string; created: number; existing: number; skipped: number; total: number }>(
        "/contacts/import-list",
        { method: "POST", body: JSON.stringify(data) },
      ),
    assignOwner: (contactIds: number[], ownerId: string) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk/assign", {
        method: "POST",
        body: JSON.stringify({ contactIds, ownerId }),
      }),
    addToAutomation: (contactIds: number[], workflowId: number) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk/automation", {
        method: "POST",
        body: JSON.stringify({ contactIds, workflowId }),
      }),
    deleteBulk: (contactIds: number[]) =>
      request<{ success: boolean; affected: number }>("/contacts/bulk", {
        method: "DELETE",
        body: JSON.stringify({ contactIds }),
      }),
  },
  folders: {
    list: () => request<any[]>("/folders"),
    create: (data: { name: string }) =>
      request<any>("/folders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  lists: {
    list: (params?: { type?: string; q?: string; folderId?: number; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.type) qs.set("type", params.type);
      if (params?.q) qs.set("q", params.q);
      if (params?.folderId) qs.set("folderId", String(params.folderId));
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<PaginatedResponse<any>>(`/lists${suffix}`);
    },
    stats: () => request<{ total: number; lists: number; segments: number }>("/lists/stats"),
    create: (data: { name: string; folderId: number }) =>
      request<any>("/lists", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name: string; folderId: number }) =>
      request<any>(`/lists/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ success: boolean }>(`/lists/${id}`, {
        method: "DELETE",
      }),
  },
  campaigns: {
    list: () => request<any[]>("/campaigns"),
    get: (id: number) => request<any>(`/campaigns/${id}`),
    stats: () => request<{ total: number; sent: number; draft: number; scheduled: number; sending: number }>("/campaigns/stats"),
    create: (data: { name: string; subject: string; fromName: string; fromEmail: string; templateHtml?: string; audienceType?: string; audienceId?: number }) =>
      request<any>("/campaigns", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) =>
      request<any>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    send: (id: number) =>
      request<any>(`/campaigns/${id}/send`, { method: "POST" }),
    schedule: (id: number, scheduledAt: string) =>
      request<{ success: boolean; scheduledAt: string; warnings: string[] }>(`/campaigns/${id}/schedule`, { method: "POST", body: JSON.stringify({ scheduledAt }) }),
    sendTest: (id: number, testEmail: string, draftData?: any) =>
      request<any>(`/campaigns/${id}/send-test`, {
        method: "POST",
        body: JSON.stringify({ testEmail, ...draftData }),
      }),
    delete: (id: number) =>
      request<any>(`/campaigns/${id}`, { method: "DELETE" }),
    deleteBulk: (campaignIds: number[]) =>
      request<{ success: boolean; affected: number }>("/campaigns/bulk", {
        method: "DELETE",
        body: JSON.stringify({ campaignIds }),
      }),
    duplicate: (id: number) =>
      request<any>(`/campaigns/${id}/duplicate`, { method: "POST" }),
    progress: (id: number) => request<CampaignProgress>(`/campaigns/${id}/progress`),
    estimate: (id: number) =>
      request<{ recipients: number; alreadySent: number; timing: SendTiming | null }>(`/campaigns/${id}/estimate`),
    pause: (id: number) => request<{ success: boolean; waiting: number }>(`/campaigns/${id}/pause`, { method: "POST" }),
    resume: (id: number) =>
      request<{ success: boolean; remainingToSend: number; warnings: string[] }>(`/campaigns/${id}/resume`, { method: "POST" }),
  },
  companies: {
    list: (params?: { q?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<PaginatedResponse<any>>(`/companies${suffix}`);
    },
    stats: () => request<{ total: number }>("/companies/stats"),
  },
  segments: {
    list: () => request<any[]>("/segments"),
    stats: () => request<{ total: number }>("/segments/stats"),
  },
  automations: {
    list: () => request<any[]>("/automations"),
  },
  templates: {
    list: () => request<any[]>("/templates"),
    get: (id: number) => request<any>(`/templates/${id}`),
    create: (data: { name: string; subject?: string; contentHtml: string; previewText?: string }) =>
      request<any>("/templates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; subject?: string; contentHtml?: string; previewText?: string }) =>
      request<any>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/templates/${id}`, { method: "DELETE" }),
  },
  brevo: {
    import: (apiKey: string) =>
      runBrevoJob<{ imported: number; skipped: number; total: number; listsImported: number; contactsLinked: number }>("/brevo/import", apiKey),
    linkLists: (apiKey: string) => runBrevoJob<{ contactsLinked: number; listsFound: number }>("/brevo/link-lists", apiKey),
  },
  career141: {
    access: () => request<{ connected: boolean }>("/career141", { timeoutMs: 20_000 }),
    read: (query: string) =>
      request<{ id: string; readBy: "model" | "words"; rule: Career141Rule }>("/career141/discover", { method: "POST", body: JSON.stringify({ query }), timeoutMs: 70_000 }),
    run: (id: string, rule: Career141Rule) =>
      request<{ id: string; status: string }>(`/career141/discover/${id}/run`, { method: "POST", body: JSON.stringify({ rule }), timeoutMs: 20_000 }),
    status: (id: string) => request<Career141Search>(`/career141/discover/${id}`, { timeoutMs: 20_000 }),
    stop: (id: string) => request<{ id: string; status: string }>(`/career141/discover/${id}/stop`, { method: "POST", timeoutMs: 20_000 }),
    rows: (id: string, cursor?: string | null) =>
      request<{ rows: Career141Row[]; nextCursor: string | null }>(`/career141/discover/${id}/rows${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { timeoutMs: 30_000 }),
    /** Every person found, or only `emails` (what the page's filters show). */
    save: (id: string, emails?: string[]) =>
      request<{ listId: number; listName: string; added: number; alreadyHad: number }>(`/career141/discover/${id}/save`, {
        method: "POST",
        body: JSON.stringify(emails ? { emails } : {}),
        timeoutMs: 130_000,
      }),
    /** The CSV needs the sign-in token, so it is fetched and handed to the browser as a file rather than linked. */
    download: async (id: string) => {
      const res = await fetch(`${BASE}/career141/discover/${id}/csv`, { headers: await authHeaders(), signal: AbortSignal.timeout(130_000) })
        .catch((e: Error) => { throw new Error(e?.name === "TimeoutError" ? "The file took too long. Try again." : "Could not reach the server."); });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Download failed (${res.status})`);
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "career141-contacts.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  },
  analytics: {
    campaigns: () => request<any[]>("/analytics/campaigns"),
    campaignDetail: (id: number) => request<any>(`/analytics/campaigns/${id}`),
    contactEvents: (id: number, params?: { page?: number; pageSize?: number; q?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      if (params?.q) qs.set("q", params.q);
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<PaginatedResponse<any>>(`/analytics/campaigns/${id}/contact-events${suffix}`);
    },
    // A plain link sent no Bearer token and ignored VITE_API_URL; fetch it and save the file instead.
    exportCsv: async (id: number) => {
      const res = await fetch(`${BASE}/analytics/campaigns/${id}/export`, { headers: await authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${id}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  senders: {
    list: () => request<{ id: number; name: string; email: string }[]>("/senders"),
    create: (data: { name: string; email: string }) => request<any>("/senders", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ success: boolean }>(`/senders/${id}`, { method: "DELETE" }),
    quota: () => request<{ max: number; sent: number; remaining: number }>("/senders/quota"),
    status: (identities: string[]) => request<Record<string, any>>("/senders/status", { method: "POST", body: JSON.stringify({ identities }) }),
    awsIdentities: () =>
      request<{ identities: { email: string; verificationStatus: string; dkimStatus: string; dkimEnabled: boolean }[] }>("/senders/aws-identities"),
    sync: () => request<{ synced: number }>("/senders/sync", { method: "POST" }),
  },
  domains: {
    list: () =>
      request<{ domains: { domain: string; verificationStatus: string; dkimStatus: string; dkimEnabled: boolean }[] }>("/domains"),
    getDnsRecords: (domain: string) =>
      request<{ records: { type: string; name: string; value: string }[] }>(`/domains/dns-records?domain=${encodeURIComponent(domain)}`),
    add: (domain: string) =>
      request<any>("/domains", { method: "POST", body: JSON.stringify({ domain }) }),
    remove: (domain: string) =>
      request<{ success: boolean }>(`/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }),
    sync: () =>
      request<{ synced: number }>("/domains/sync", { method: "POST" }),
  },
  billing: {
    summary: (range: "current_month" | "last_30" | "all_time") =>
      request<{
        range: string;
        campaigns: {
          id: number;
          name: string;
          status: string;
          sentAt: string | null;
          createdAt: string;
          fromEmail: string;
          emailsSent: number;
          cost_usd: number;
        }[];
        summary: {
          total_emails_sent: number;
          total_cost_usd: number;
          campaign_count: number;
          sent_campaign_count: number;
        };
        pricing_note: string;
      }>(`/billing/summary?range=${range}`),
    exchangeRate: () =>
      request<{ usd_to_lkr: number; updated_at: string; source: string }>("/billing/exchange-rate"),
    sendLimits: () =>
      request<{
        daily: { limit: number; used: number };
        monthly: { limit: number; used: number; estimated_cost_usd: number };
        aws: { limit_24h: number | null; sent_24h: number | null; per_second: number | null } | null;
      }>("/billing/send-limits"),
    awsCosts: (range: "current_month" | "last_30" | "all_time") =>
      request<{
        total_cost_usd: number;
        range: string;
        period: { start: string; end: string };
        monthly_breakdown: { period: string; cost_usd: number; unit: string }[];
      }>(`/billing/aws-costs?range=${range}`),
  },
  uploadFile: (file: File) =>
    new Promise<{ url: string; fileName: string; size: number }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const fileData = ev.target?.result as string;
          const res = await request<{ url: string; fileName: string; size: number }>("/upload", {
            method: "POST",
            body: JSON.stringify({ fileName: file.name, fileData }),
          });
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    }),
};

export async function downloadExport(contactIds: number[], format: "csv" | "json") {
  const res = await fetch(`${BASE}/contacts/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ contactIds, format }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export type CampaignProgress = {
  name: string;
  subject: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  lastError: string | null;
  pauseReason: string | null;
  // Set while the sender is asleep waiting for the daily limit or AWS's own quota to free up.
  waiting: { reason: "daily_limit" | "aws_quota"; inSeconds: number } | null;
  // Only while sending with emails still queued. Seconds are counted from when the server answered.
  timing: SendTiming | null;
};

export type SendTiming = {
  rate: number;
  perDay: number | null;
  room: number | null; // emails that may still go today
  finishInSeconds: number | null;
  resumesInSeconds: number | null;
  pausesAtMonthlyLimit: boolean;
  monthlyLeft: number | null;
  othersSending: number; // other campaigns sending at the same time share the speed and the day's limit
};

/** Find in CAREER141: the shapes of ta-system docs/CONTACT-DISCOVERY-API.md. */
export type Career141Rule = {
  label: string;
  titles: string[];
  exclude: string[];
  levels: number[];
  skills: string[];
  includePastRoles: boolean;
};

export type Career141Search = {
  id: string;
  status: "read" | "running" | "done" | "failed";
  scanned: number;
  found: number;
  meaning: string | null;
  error: string | null;
  query: string;
  readBy: "model" | "words";
  rule: Career141Rule;
  startedAt?: number | null;
  stopped?: boolean; // a person pressed Stop: done with what was found so far
};

export type Career141Row = {
  email: string;
  name?: string;
  phone?: string;
  title?: string;
  level?: string;
  employer?: string;
  location?: string;
  linkedinUrl?: string;
  kind: "current" | "previous" | "meaning";
  matchedBy?: string;
};
