import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadExport } from "@/lib/api.ts";
import { toast } from "sonner";

import { useSearchParams } from "react-router-dom";

export function useContacts() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchParams] = useSearchParams();

  const listIdParam = searchParams.get("listId");
  const listId = listIdParam ? Number(listIdParam) : undefined;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const queryClient = useQueryClient();

  const contactsQuery = useQuery({
    queryKey: ["contacts", page, pageSize, debouncedSearch, listId],
    queryFn: () => api.contacts.list({ q: debouncedSearch || undefined, page, pageSize, listId }),
  });

  const contacts = contactsQuery.data?.data ?? [];
  const total = contactsQuery.data?.total ?? 0;
  const totalPages = contactsQuery.data?.totalPages ?? 0;
  const isLoading = contactsQuery.isLoading;
  const error = contactsQuery.error;

  const refreshContacts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }, [queryClient]);

  const handleSelectAll = useCallback((contactIds: number[]) => {
    setSelectedIds((prev) => {
      const allSelected = contactIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !contactIds.includes(id));
      }
      return [...new Set([...prev, ...contactIds])];
    });
  }, []);

  const handleSelectOne = useCallback((id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  }, []);

  const bulkBlocklistQ = useMutation({
    mutationFn: (vars: { contactIds: number[]; blocked: boolean }) =>
      api.contacts.updateBulkBlocklist(vars.contactIds, vars.blocked),
    onSuccess: (_, vars) => {
      setSelectedIds([]);
      refreshContacts();
      toast.success(vars.blocked ? "Contacts blocked" : "Contacts unblocked");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkAddToListQ = useMutation({
    mutationFn: (vars: { contactIds: number[]; listIds: number[] }) =>
      api.contacts.addToList(vars.contactIds, vars.listIds),
    onSuccess: () => {
      setSelectedIds([]);
      refreshContacts();
      toast.success("Contacts added to list");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkAssignQ = useMutation({
    mutationFn: (vars: { contactIds: number[]; ownerId: string }) =>
      api.contacts.assignOwner(vars.contactIds, vars.ownerId),
    onSuccess: () => {
      setSelectedIds([]);
      refreshContacts();
      toast.success("Owner assigned");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkExportQ = useMutation({
    mutationFn: (vars: { contactIds: number[]; format: "csv" | "json" }) =>
      downloadExport(vars.contactIds, vars.format),
    onSuccess: (_, vars) => {
      toast.success(`Contacts exported as ${vars.format.toUpperCase()}`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkAddToAutomationQ = useMutation({
    mutationFn: (vars: { contactIds: number[]; workflowId: number }) =>
      api.contacts.addToAutomation(vars.contactIds, vars.workflowId),
    onSuccess: () => {
      setSelectedIds([]);
      refreshContacts();
      toast.success("Contacts added to automation");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkDeleteQ = useMutation({
    mutationFn: (vars: { contactIds: number[] }) =>
      api.contacts.deleteBulk(vars.contactIds),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["contacts"] });
      const previousData = queryClient.getQueriesData({ queryKey: ["contacts"] });
      queryClient.setQueriesData({ queryKey: ["contacts"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((c: any) => !vars.contactIds.includes(c.id)),
          total: old.total - vars.contactIds.length,
        };
      });
      return { previousData };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousData) {
        for (const [key, data] of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(err.message);
    },
    onSuccess: () => {
      setSelectedIds([]);
      toast.success("Contacts deleted");
    },
    onSettled: () => {
      refreshContacts();
    },
  });

  const updateContactQ = useMutation({
    mutationFn: (vars: { id: number; data: any }) =>
      api.contacts.update(String(vars.id), vars.data),
    onSuccess: () => {
      refreshContacts();
      toast.success("Contact updated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    contacts,
    total,
    totalPages,
    isLoading,
    error,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    selectedIds,
    setSelectedIds,
    handleSelectAll,
    handleSelectOne,
    refreshContacts,
    bulkBlocklist: (contactIds: number[], blocked: boolean) =>
      bulkBlocklistQ.mutateAsync({ contactIds, blocked }),
    bulkAddToList: (contactIds: number[], listIds: number[]) =>
      bulkAddToListQ.mutateAsync({ contactIds, listIds }),
    bulkAssign: (contactIds: number[], ownerId: string) =>
      bulkAssignQ.mutateAsync({ contactIds, ownerId }),
    bulkExport: (contactIds: number[], format: "csv" | "json") =>
      bulkExportQ.mutateAsync({ contactIds, format }),
    bulkAddToAutomation: (contactIds: number[], workflowId: number) =>
      bulkAddToAutomationQ.mutateAsync({ contactIds, workflowId }),
    bulkDelete: (contactIds: number[]) =>
      bulkDeleteQ.mutateAsync({ contactIds }),
    updateContact: (id: number, data: any) =>
      updateContactQ.mutateAsync({ id, data }),
  };
}
