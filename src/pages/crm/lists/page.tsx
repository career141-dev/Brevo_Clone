import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { List as ListIcon, ChevronLeft, ChevronRight, Search, MoreHorizontal, Plus, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { api } from "@/lib/api.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ListsPage() {
  const queryClient = useQueryClient();
  
  const navigate = useNavigate();
  
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Drawer Create List Form State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [nameError, setNameError] = useState("");
  const [folderError, setFolderError] = useState("");

  // Dialog Edit List Form State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<any | null>(null);
  const [editListName, setEditListName] = useState("");
  const [editFolderId, setEditFolderId] = useState("");
  const [editNameError, setEditNameError] = useState("");
  const [editFolderError, setEditFolderError] = useState("");

  // Dialog Create Folder Form State
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderNameError, setFolderNameError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: foldersData, isLoading: isLoadingFolders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.list(),
  });

  const { data: statsData } = useQuery({
    queryKey: ["lists-stats"],
    queryFn: () => api.lists.stats(),
  });

  const folderIdParam = activeFolderId === "all" ? undefined : Number(activeFolderId);

  const { data: listsData, isLoading: isLoadingLists } = useQuery({
    queryKey: ["lists", page, pageSize, debouncedSearch, folderIdParam],
    queryFn: () => api.lists.list({ 
      page, 
      pageSize, 
      q: debouncedSearch || undefined, 
      folderId: folderIdParam 
    }),
  });

  const folders = foldersData ?? [];
  const lists = listsData?.data ?? [];
  const total = listsData?.total ?? 0;
  const totalPages = listsData?.totalPages ?? 0;
  const totalLists = statsData?.lists ?? 204;

  const startRow = total ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  // Mutation to create list
  const createListMutation = useMutation({
    mutationFn: (data: { name: string; folderId: number }) => api.lists.create(data),
    onSuccess: () => {
      toast.success("List created successfully");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["lists-stats"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setDrawerOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create list");
    },
  });

  const resetForm = () => {
    setNewListName("");
    setSelectedFolderId("");
    setNameError("");
    setFolderError("");
  };

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!newListName.trim()) {
      setNameError("List name is required");
      hasError = true;
    } else if (newListName.length > 255) {
      setNameError("List name must be under 255 characters");
      hasError = true;
    } else {
      setNameError("");
    }

    if (!selectedFolderId) {
      setFolderError("Please select a folder");
      hasError = true;
    } else {
      setFolderError("");
    }

    if (hasError) return;

    createListMutation.mutate({
      name: newListName.trim(),
      folderId: Number(selectedFolderId),
    });
  };

  // Mutation to update list
  const updateListMutation = useMutation({
    mutationFn: (vars: { id: number; name: string; folderId: number }) =>
      api.lists.update(vars.id, { name: vars.name, folderId: vars.folderId }),
    onSuccess: () => {
      toast.success("List updated successfully");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setEditDialogOpen(false);
      setEditingList(null);
      setEditListName("");
      setEditFolderId("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update list");
    },
  });

  const handleUpdateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;

    let hasError = false;
    if (!editListName.trim()) {
      setEditNameError("List name is required");
      hasError = true;
    } else if (editListName.length > 255) {
      setEditNameError("List name must be under 255 characters");
      hasError = true;
    } else {
      setEditNameError("");
    }

    if (!editFolderId) {
      setEditFolderError("Please select a folder");
      hasError = true;
    } else {
      setEditFolderError("");
    }

    if (hasError) return;

    updateListMutation.mutate({
      id: editingList.id,
      name: editListName.trim(),
      folderId: Number(editFolderId),
    });
  };

  // Mutation to create folder
  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string }) => api.folders.create(data),
    onSuccess: () => {
      toast.success("Folder created successfully");
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      setFolderDialogOpen(false);
      setNewFolderName("");
      setFolderNameError("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create folder");
    },
  });

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      setFolderNameError("Folder name is required");
      return;
    }
    if (newFolderName.length > 255) {
      setFolderNameError("Folder name must be under 255 characters");
      return;
    }
    createFolderMutation.mutate({ name: newFolderName.trim() });
  };

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lists</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organise contacts into static lists and filter them by folder.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => {
              resetForm();
              setDrawerOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="size-4" />
            Create a list
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        {/* Toolbar with Search and Folder Filter Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b bg-muted/20">
          <div className="flex flex-1 items-center gap-3 w-full sm:max-w-md">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search lists by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9 text-xs"
              />
            </div>
            {/* Folder Dropdown */}
            <div className="w-64 shrink-0">
              <Select
                value={activeFolderId}
                onValueChange={(val) => {
                  if (val !== "create-new-folder-action") {
                    setActiveFolderId(val);
                    setPage(1);
                  }
                }}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent className="max-h-[360px] overflow-hidden flex flex-col p-0">
                  <div className="overflow-y-auto max-h-[300px] p-2.5 space-y-1 flex-1">
                    <SelectItem value="all">
                      <div className="flex flex-col text-left py-1">
                        <span className="font-semibold text-xs">All folders</span>
                        <span className="text-[10px] text-muted-foreground">{totalLists} lists</span>
                      </div>
                    </SelectItem>
                    {folders.map((folder: any) => (
                      <SelectItem key={folder.id} value={String(folder.id)}>
                        <div className="flex flex-col text-left py-1">
                          <span className="font-semibold text-xs">{folder.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {folder._count?.lists ?? 0} list{(folder._count?.lists ?? 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                  <div className="p-3 border-t bg-background select-none shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFolderDialogOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 h-8.5 text-[11px] font-semibold rounded-md border border-border"
                    >
                      <Plus className="size-3.5" />
                      Create a new folder
                    </Button>
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Lists Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-muted/20">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4">
                  List Name
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4">
                  List ID
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4">
                  Folder Name
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 text-center">
                  Total Contacts
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 whitespace-nowrap">
                  Creation Date
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 h-9 px-4 w-[60px] text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingLists || isLoadingFolders ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/40">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !lists || lists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-60 text-center px-4">
                    <div className="flex flex-col items-center justify-center">
                      <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-900/30 mb-4">
                        <ListIcon className="size-8 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground/70">
                        No lists found
                      </p>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        Try adjusting your filters or creating a list to get started.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                lists.map((list: any, idx: number) => (
                  <TableRow
                    key={list.id}
                    className={cn(
                      "border-b border-border/40 transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/15",
                      "hover:bg-muted/40"
                    )}
                  >
                    <TableCell className="px-4 py-3 font-medium text-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="size-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <ListIcon className="size-3.5 text-primary" />
                        </div>
                        <span className="truncate max-w-[240px]">{list.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {list.brevoId || list.id}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {list.folderName}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-center tabular-nums font-medium">
                      {list.contactCount ?? 0}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {list.createdAt ? format(new Date(list.createdAt), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/contacts?listId=${list.brevoId || list.id}&listName=${encodeURIComponent(list.name)}`)}>
                            View Contacts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setEditingList(list);
                            setEditListName(list.name);
                            setEditFolderId(list.folderId ? String(list.folderId) : "");
                            setEditNameError("");
                            setEditFolderError("");
                            setEditDialogOpen(true);
                          }}>
                            Edit List
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>{startRow}–{endRow} of {total.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px]">Page {page} of {totalPages.toLocaleString()}</span>
              <div className="flex items-center">
                <Button
                  variant="ghost" size="icon" className="size-7"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="size-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Slide-out Drawer Panel for Creating Lists */}
      <Sheet open={drawerOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setDrawerOpen(open);
      }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-6 flex flex-col gap-6">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold text-foreground">Create a list</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleCreateList} className="flex-1 flex flex-col justify-between">
            <div className="space-y-5">
              {/* List Name Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="listName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    List Name <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {newListName.length}/255
                  </span>
                </div>
                <Input
                  id="listName"
                  value={newListName}
                  onChange={(e) => {
                    if (e.target.value.length <= 255) {
                      setNewListName(e.target.value);
                      if (nameError) setNameError("");
                    }
                  }}
                  placeholder="Enter a list name"
                  maxLength={255}
                  className={cn("h-10 text-sm", nameError && "border-red-500 focus-visible:ring-red-500")}
                />
                {nameError && (
                  <p className="text-xs text-red-500 mt-1">{nameError}</p>
                )}
              </div>

              {/* Folder Selection Selector */}
              <div className="space-y-2">
                <Label htmlFor="folderSelect" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select a Folder <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedFolderId}
                  onValueChange={(val) => {
                    setSelectedFolderId(val);
                    if (folderError) setFolderError("");
                  }}
                >
                  <SelectTrigger id="folderSelect" className={cn("h-10 text-sm", folderError && "border-red-500 focus-visible:ring-red-500")}>
                    <SelectValue placeholder="Select a folder" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px] overflow-y-auto">
                    {folders.map((folder: any) => (
                      <SelectItem key={folder.id} value={String(folder.id)}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {folderError && (
                  <p className="text-xs text-red-500 mt-1">{folderError}</p>
                )}
              </div>
            </div>

            {/* Actions Panel Footer */}
            <div className="border-t pt-4 flex items-center justify-end gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDrawerOpen(false);
                  resetForm();
                }}
                className="h-10 text-sm"
                disabled={createListMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-10 text-sm min-w-[100px]"
                disabled={createListMutation.isPending}
              >
                {createListMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create List"
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Dialog Modal for Creating Folders */}
      <Dialog open={folderDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setNewFolderName("");
          setFolderNameError("");
        }
        setFolderDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a folder</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateFolder} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folderName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Folder Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="folderName"
                value={newFolderName}
                onChange={(e) => {
                  setNewFolderName(e.target.value);
                  if (folderNameError) setFolderNameError("");
                }}
                placeholder="Enter folder name (e.g. Operations)"
                maxLength={255}
                className={cn("h-10 text-sm", folderNameError && "border-red-500 focus-visible:ring-red-500")}
              />
              {folderNameError && (
                <p className="text-xs text-red-500 mt-1">{folderNameError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFolderDialogOpen(false)}
                className="h-10 text-sm"
                disabled={createFolderMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-10 text-sm min-w-[100px]"
                disabled={createFolderMutation.isPending}
              >
                {createFolderMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create Folder"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Dialog Modal for Editing Lists */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingList(null);
          setEditListName("");
          setEditFolderId("");
          setEditNameError("");
          setEditFolderError("");
        }
        setEditDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateList} className="space-y-4">
            {/* List Name */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="editListName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  List Name <span className="text-red-500">*</span>
                </Label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {editListName.length}/255
                </span>
              </div>
              <Input
                id="editListName"
                value={editListName}
                onChange={(e) => {
                  if (e.target.value.length <= 255) {
                    setEditListName(e.target.value);
                    if (editNameError) setEditNameError("");
                  }
                }}
                placeholder="Enter list name"
                maxLength={255}
                className={cn("h-10 text-sm", editNameError && "border-red-500 focus-visible:ring-red-500")}
              />
              {editNameError && (
                <p className="text-xs text-red-500 mt-1">{editNameError}</p>
              )}
            </div>

            {/* Folder Select */}
            <div className="space-y-2">
              <Label htmlFor="editFolderSelect" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Folder <span className="text-red-500">*</span>
              </Label>
              <Select
                value={editFolderId}
                onValueChange={(val) => {
                  setEditFolderId(val);
                  if (editFolderError) setEditFolderError("");
                }}
              >
                <SelectTrigger id="editFolderSelect" className={cn("h-10 text-sm", editFolderError && "border-red-500 focus-visible:ring-red-500")}>
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent className="max-h-[250px] overflow-y-auto">
                  {folders.map((folder: any) => (
                    <SelectItem key={folder.id} value={String(folder.id)}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editFolderError && (
                <p className="text-xs text-red-500 mt-1">{editFolderError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                className="h-10 text-sm"
                disabled={updateListMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-10 text-sm min-w-[100px]"
                disabled={updateListMutation.isPending}
              >
                {updateListMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
