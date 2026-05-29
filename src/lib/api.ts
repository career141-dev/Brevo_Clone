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
    list: (params?: { q?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : "";
      return request<PaginatedResponse<any>>(`/contacts${suffix}`);
    },
    stats: () => request<{ total: number; subscribed: number; unsubscribed: number; bounced: number }>("/contacts/stats"),
    get: (id: string) => request<any>(`/contacts/${id}`),
    create: (data: any) => request<any>("/contacts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/contacts/${id}`, { method: "DELETE" }),
  },
  campaigns: {
    list: () => request<any[]>("/campaigns"),
    stats: () => request<{ total: number; sent: number; draft: number; scheduled: number }>("/campaigns/stats"),
  },
  brevo: {
    import: (apiKey: string) =>
      request<{ imported: number; skipped: number; total: number }>("/brevo/import", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
  },
};
