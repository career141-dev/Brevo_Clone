const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
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
    stats: () => request<{ total: number; sent: number; draft: number; scheduled: number; sending: number }>("/campaigns/stats"),
    create: (data: { name: string; subject: string; fromName: string; fromEmail: string; templateHtml?: string; audienceType?: string; audienceId?: number }) =>
      request<any>("/campaigns", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: any) =>
      request<any>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    send: (id: number) =>
      request<any>(`/campaigns/${id}/send`, { method: "POST" }),
    delete: (id: number) =>
      request<any>(`/campaigns/${id}`, { method: "DELETE" }),
    deleteBulk: (campaignIds: number[]) =>
      request<{ success: boolean; affected: number }>("/campaigns/bulk", {
        method: "DELETE",
        body: JSON.stringify({ campaignIds }),
      }),
    duplicate: (id: number) =>
      request<any>(`/campaigns/${id}/duplicate`, { method: "POST" }),
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
      request<{ imported: number; skipped: number; total: number; listsImported: number; contactsLinked: number }>("/brevo/import", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    linkLists: (apiKey: string) =>
      request<{ contactsLinked: number; listsFound: number }>("/brevo/link-lists", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
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
    awsCosts: (range: "current_month" | "last_30" | "all_time") =>
      request<{
        total_cost_usd: number;
        range: string;
        period: { start: string; end: string };
        monthly_breakdown: { period: string; cost_usd: number; unit: string }[];
      }>(`/billing/aws-costs?range=${range}`),
  },
};

export async function downloadExport(contactIds: number[], format: "csv" | "json") {
  const res = await fetch(`${BASE}/contacts/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
