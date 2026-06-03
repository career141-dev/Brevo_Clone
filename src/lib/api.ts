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
    stats: () => request<{ total: number; subscribed: number; unsubscribed: number; bounced: number }>("/contacts/stats"),
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
  },
  campaigns: {
    list: () => request<any[]>("/campaigns"),
    stats: () => request<{ total: number; sent: number; draft: number; scheduled: number }>("/campaigns/stats"),
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
