import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  MoreVertical, Code2, Bold, Italic, Underline, Strikethrough,
  Link, Image as ImageIcon, Smile, Code, Table2, AlignLeft,
  AlignCenter, AlignRight, AlignJustify, ListOrdered, List,
  IndentDecrease, IndentIncrease, RemoveFormatting, ChevronDown,
  Trash2, ExternalLink, Paperclip, FileText, FileUp, Quote, Minus, Sparkles, X, UserCheck,
  Highlighter, Type, Eraser, Check,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { api } from "@/lib/api.ts";
import { toast } from "sonner";

interface SimpleEditorProps {
  initialName?: string;
  initialHtml?: string;
  onSave: (name: string, html: string) => void;
  onCancel: () => void;
}

// ─── Emoji list ────────────────────────────────────────────────────────────────
const EMOJIS = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰",
  "😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥",
  "😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤","😒","😓","😔",
  "😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨",
  "😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","🥴","😠","😡","🤬","😷",
  "🤒","🤕","🤢","🤮","🤧","😇","🥳","🥺","🤠","🤡","🤥","🤫","🤭","🧐","🤓",
  "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚",
  "🖐️","✋","🖖","👏","🙌","🤲","🤝","🙏","✍️","💪","🦾","🦿","🦵","🦶","👂",
  "🦻","👃","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞",
  "💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️",
  "🌟","⭐","🌙","☀️","🌈","🌊","🔥","💧","🌿","🍀","🌸","🌺","🌻","🌹","🍁",
  "🎉","🎊","🎈","🎁","🎀","🏆","🥇","🎯","🎮","🎲","🎵","🎶","🎸","🎹","🎺",
];

// ─── Color swatches ─────────────────────────────────────────────────────────────
const COLORS = [
  "#000000","#434343","#666666","#999999","#b7b7b7","#cccccc","#d9d9d9","#ffffff",
  "#ff0000","#ff4500","#ff9900","#ffff00","#00ff00","#00ffff","#0000ff","#9900ff",
  "#e6b8a2","#f4cccc","#fce5cd","#fff2cc","#d9ead3","#d0e4f7","#cfe2f3","#d9d2e9",
  "#dd7e6b","#ea9999","#f9cb9c","#ffe599","#b6d7a8","#9fc5e8","#9fc5e8","#b4a7d6",
  "#cc4125","#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6fa8dc","#8e7cc3",
  "#a61c00","#cc0000","#e69138","#f1c232","#6aa84f","#45818e","#3d85c8","#674ea7",
  "#85200c","#990000","#b45f06","#bf9000","#38761d","#134f5c","#1155cc","#351c75",
  "#5b0f00","#660000","#783f04","#7f6000","#274e13","#0c343d","#1c4587","#20124d",
];

const HIGHLIGHT_PRESETS = [
  { label: "Yellow", color: "#fef08a" },
  { label: "Green", color: "#bbf7d0" },
  { label: "Red", color: "#fecaca" },
  { label: "Cyan", color: "#bae6fd" },
  { label: "Orange", color: "#fed7aa" },
  { label: "Pink", color: "#fbcfe8" },
  { label: "Purple", color: "#e9d5ff" },
  { label: "Gray", color: "#e2e8f0" },
];

const TEXT_COLOR_PRESETS = [
  { label: "Black", color: "#000000" },
  { label: "Dark Gray", color: "#334155" },
  { label: "Red", color: "#dc2626" },
  { label: "Blue", color: "#2563eb" },
  { label: "Green", color: "#16a34a" },
  { label: "Orange", color: "#ea580c" },
  { label: "Purple", color: "#9333ea" },
  { label: "White", color: "#ffffff" },
];

export default function SimpleEditor({
  initialName = "",
  initialHtml = "",
  onSave,
  onCancel,
}: SimpleEditorProps) {
  const [name, setName] = useState(initialName || "Untitled Template");
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [isSourceMode, setIsSourceMode] = useState(false);

  // Color pickers controlled state
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [customTextColor, setCustomTextColor] = useState("#dc2626");
  const [customHighlightColor, setCustomHighlightColor] = useState("#fef08a");
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableHovered, setTableHovered] = useState({ r: 0, c: 0 });
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNewTab, setLinkNewTab] = useState(false);
  const [savedRange, setSavedRange] = useState<Range | null>(null);

  // Document attachment popover & files state
  const [documentPopoverOpen, setDocumentPopoverOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("https://");
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string; url: string; ext: string }[]>([]);

  // Image resize state
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorRef.current && initialHtml && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialHtml;
    }
    updateCounts();
  }, [initialHtml]);

  // ── Counts ─────────────────────────────────────────────────────────────────
  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || "";
    setChars(text.length);
    setWords(text.trim() ? text.trim().split(/\s+/).length : 0);
  }, []);

  // ── execCommand wrapper ────────────────────────────────────────────────────
  const execCmd = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateCounts();
  };

  // ── Source toggle ──────────────────────────────────────────────────────────
  const toggleSourceMode = () => {
    if (isSourceMode) {
      if (editorRef.current && sourceRef.current)
        editorRef.current.innerHTML = sourceRef.current.value;
    } else {
      if (sourceRef.current && editorRef.current)
        sourceRef.current.value = editorRef.current.innerHTML;
    }
    setIsSourceMode(!isSourceMode);
    setSelectedImage(null);
  };

  // ── Persistent Selection Range Tracking ────────────────────────────────────
  const lastRangeRef = useRef<Range | null>(null);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0).cloneRange();
      setSavedRange(range);
      lastRangeRef.current = range;
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const targetRange = lastRangeRef.current || savedRange;
    if (!targetRange) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(targetRange);
    }
  }, [savedRange]);

  // Cross-browser & cross-platform (macOS / Windows) variable insertion
  const insertVariableAtSelection = (tag: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(tag);
      range.insertNode(textNode);

      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
      lastRangeRef.current = range.cloneRange();
    } else {
      document.execCommand("insertHTML", false, tag);
    }
    updateCounts();
  };

  // ── Bulletproof Clear Highlight Function (Removes background only) ─────────
  const clearHighlight = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("hiliteColor", false, "rgba(0,0,0,0)");
      document.execCommand("backColor", false, "rgba(0,0,0,0)");
    } catch {}

    try {
      // 1. Walk up the ancestor tree and clear any background-color on parent spans
      let curr: Node | null = range.commonAncestorContainer;
      while (curr && curr !== editorRef.current) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const el = curr as HTMLElement;
          if (el.style.backgroundColor || el.style.background || el.tagName === "MARK") {
            el.style.backgroundColor = "";
            el.style.background = "";
            if (el.tagName === "MARK") {
              const span = document.createElement("span");
              span.innerHTML = el.innerHTML;
              el.parentNode?.replaceChild(span, el);
            }
          }
        }
        curr = curr.parentNode;
      }

      // 2. Clear background on any descendant elements within the range
      const commonAncestor = range.commonAncestorContainer;
      const container = commonAncestor.nodeType === Node.ELEMENT_NODE
        ? (commonAncestor as HTMLElement)
        : commonAncestor.parentElement;

      if (container && editorRef.current.contains(container)) {
        const elements = container.querySelectorAll("span, mark, font, b, i, u, em, strong, p, div, a");
        elements.forEach((el: any) => {
          if (range.intersectsNode(el)) {
            el.style.backgroundColor = "";
            el.style.background = "";
            if (el.tagName === "MARK") {
              const span = document.createElement("span");
              span.innerHTML = el.innerHTML;
              el.parentNode?.replaceChild(span, el);
            }
          }
        });
      }
    } catch (e) {
      console.error("Clear highlight DOM cleanup error:", e);
    }

    saveSelection();
    updateCounts();
  };

  // ── Bulletproof Clear Text Color Function (Removes text color only) ────────
  const clearTextColor = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("foreColor", false, "#000000");
    } catch {}

    try {
      // 1. Walk up the ancestor tree and clear any font color on parent elements
      let curr: Node | null = range.commonAncestorContainer;
      while (curr && curr !== editorRef.current) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const el = curr as HTMLElement;
          if (el.style.color || el.tagName === "FONT") {
            el.style.color = "";
            if (el.tagName === "FONT") {
              el.removeAttribute("color");
            }
          }
        }
        curr = curr.parentNode;
      }

      // 2. Clear color on any descendant elements within the range
      const commonAncestor = range.commonAncestorContainer;
      const container = commonAncestor.nodeType === Node.ELEMENT_NODE
        ? (commonAncestor as HTMLElement)
        : commonAncestor.parentElement;

      if (container && editorRef.current.contains(container)) {
        const elements = container.querySelectorAll("span, font, b, i, u, em, strong, p, div, a");
        elements.forEach((el: any) => {
          if (range.intersectsNode(el)) {
            el.style.color = "";
            if (el.tagName === "FONT") el.removeAttribute("color");
          }
        });
      }
    } catch (e) {
      console.error("Clear text color DOM cleanup error:", e);
    }

    saveSelection();
    updateCounts();
  };

  // ── Robust Color & Highlight Formatting ────────────────────────────────────
  const applyColor = (cmd: "hiliteColor" | "foreColor", color: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const isClear = color === "transparent" || color === "inherit" || color === "clear" || color === "";

    if (cmd === "hiliteColor" && isClear) {
      clearHighlight();
      return;
    }

    if (cmd === "foreColor" && isClear) {
      clearTextColor();
      return;
    }

    // Restore the user's active selection
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    try {
      document.execCommand("styleWithCSS", false, "true");

      if (cmd === "foreColor") {
        document.execCommand("foreColor", false, color);
      } else if (cmd === "hiliteColor") {
        document.execCommand("hiliteColor", false, color);
        document.execCommand("backColor", false, color);
      }
    } catch (err) {
      console.error("Formatting error:", err);
    }

    saveSelection();
    updateCounts();
  };

  // ── Link logic ─────────────────────────────────────────────────────────────
  const openLinkPopover = () => {
    saveSelection();
    const sel = window.getSelection();
    const text = sel?.toString() || "";
    setLinkTitle(text);
    setLinkUrl("https://");
    setLinkNewTab(false);
    setLinkPopoverOpen(true);
  };

  const applyLink = () => {
    restoreSelection();
    editorRef.current?.focus();
    if (!linkTitle) {
      document.execCommand("createLink", false, linkUrl);
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        sel.getRangeAt(0).deleteContents();
        const a = document.createElement("a");
        a.href = linkUrl;
        a.textContent = linkTitle;
        if (linkNewTab) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        sel.getRangeAt(0).insertNode(a);
        sel.collapseToEnd();
      } else {
        const a = document.createElement("a");
        a.href = linkUrl;
        a.textContent = linkTitle || linkUrl;
        if (linkNewTab) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        document.execCommand("insertHTML", false, a.outerHTML);
      }
    }
    setLinkPopoverOpen(false);
    updateCounts();
  };

  // ── Image logic ────────────────────────────────────────────────────────────
  const insertImageUrl = () => {
    const url = prompt("Enter image URL:");
    if (!url) return;
    execCmd("insertHTML", `<img src="${url}" style="max-width:100%;width:100%;height:auto;display:block;margin:8px auto;" data-resizable="true" />`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl)
        execCmd("insertHTML", `<img src="${dataUrl}" style="max-width:100%;width:100%;height:auto;display:block;margin:8px auto;" data-resizable="true" />`);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Document / File attachment logic ───────────────────────────────────────
  const insertDocumentCard = (name: string, size: string, url: string) => {
    const fileExt = name.split('.').pop()?.toUpperCase() || 'FILE';
    let badgeBg = '#3b82f6';
    let badgeTextColor = '#ffffff';
    if (['PDF'].includes(fileExt)) badgeBg = '#ef4444';
    else if (['DOC', 'DOCX', 'PAGES'].includes(fileExt)) badgeBg = '#2563eb';
    else if (['XLS', 'XLSX', 'CSV', 'NUMBERS'].includes(fileExt)) badgeBg = '#10b981';
    else if (['PPT', 'PPTX', 'KEYNOTE'].includes(fileExt)) badgeBg = '#f97316';
    else if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(fileExt)) badgeBg = '#8b5cf6';
    else if (['TXT', 'MD', 'RTF'].includes(fileExt)) badgeBg = '#64748b';

    const html = `
      <div contenteditable="false" style="display:inline-flex;align-items:center;gap:12px;padding:10px 16px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;margin:10px 0;max-width:100%;font-family:system-ui,-apple-system,sans-serif;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,0.05);" data-file-attachment="true">
        <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;background-color:${badgeBg};color:${badgeTextColor};border-radius:8px;font-weight:700;font-size:11px;letter-spacing:0.5px;flex-shrink:0;text-transform:uppercase;line-height:1;text-align:center;">
          ${fileExt.slice(0, 4)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
          <a href="${url}" download="${name}" target="_blank" style="font-weight:600;font-size:14px;color:#0f172a;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
            ${name}
          </a>
          <span style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:8px;">
            <span>📎 Attachment ${size ? `• ${size}` : ''}</span>
            <span style="color:${badgeBg};font-weight:600;">Download / View</span>
          </span>
        </div>
      </div>
      <p><br></p>
    `;
    execCmd("insertHTML", html);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading ${file.name}...`);
    try {
      const result = await api.uploadFile(file);
      toast.dismiss(toastId);
      toast.success(`${file.name} uploaded!`);

      let fileSizeStr = "";
      if (result.size < 1024 * 1024) {
        fileSizeStr = `${(result.size / 1024).toFixed(1)} KB`;
      } else {
        fileSizeStr = `${(result.size / (1024 * 1024)).toFixed(2)} MB`;
      }
      
      const ext = result.fileName.split('.').pop()?.toUpperCase() || 'FILE';
      setAttachments((prev) => [
        ...prev.filter(a => a.url !== result.url),
        { id: String(Date.now()), name: result.fileName, size: fileSizeStr, url: result.url, ext }
      ]);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Upload failed: ${err.message || "Unknown error"}`);
    }
    if (documentFileInputRef.current) documentFileInputRef.current.value = "";
  };

  const applyDocumentUrl = () => {
    if (!docUrl) return;
    const title = docTitle.trim() || docUrl.split("/").pop() || "Attached Document";
    const ext = title.split('.').pop()?.toUpperCase() || 'FILE';
    setAttachments((prev) => [
      ...prev.filter(a => a.url !== docUrl),
      { id: String(Date.now()), name: title, size: "URL Link", url: docUrl, ext }
    ]);
    setDocumentPopoverOpen(false);
    setDocTitle("");
    setDocUrl("https://");
  };

  const insertCalloutBox = (type: "note" | "warning" | "success" = "note") => {
    let bg = "#f0f9ff";
    let border = "#0284c7";
    let icon = "💡";
    let title = "Note";
    if (type === "warning") {
      bg = "#fffbe0";
      border = "#d97706";
      icon = "⚠️";
      title = "Warning";
    } else if (type === "success") {
      bg = "#f0fdf4";
      border = "#16a34a";
      icon = "✅";
      title = "Tip";
    }

    const html = `
      <div style="background-color:${bg};border-left:4px solid ${border};padding:12px 16px;border-radius:6px;margin:12px 0;font-family:sans-serif;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px;">
          <span>${icon}</span> <span>${title}</span>
        </div>
        <div style="font-size:14px;color:#334155;line-height:1.5;">Add your detailed information or instructions here...</div>
      </div>
      <p><br></p>
    `;
    execCmd("insertHTML", html);
  };

  const insertBlockquote = () => {
    const html = `
      <blockquote style="border-left:3px solid #cbd5e1;padding-left:14px;margin:14px 0;color:#475569;font-style:italic;font-size:15px;line-height:1.6;">
        "Insert quote or emphasized text here..."
      </blockquote>
      <p><br></p>
    `;
    execCmd("insertHTML", html);
  };

  const insertHorizontalRule = () => {
    const html = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" /><p><br></p>`;
    execCmd("insertHTML", html);
  };

  // Click inside editor — select image
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      setSelectedImage(target as HTMLImageElement);
    } else {
      setSelectedImage(null);
    }
  };

  // Resize image by % of container
  const resizeImage = (pct: number) => {
    if (!selectedImage) return;
    selectedImage.style.width = `${pct}%`;
    selectedImage.style.maxWidth = "100%";
    selectedImage.style.height = "auto";
    // force re-render
    setSelectedImage({ ...selectedImage } as unknown as HTMLImageElement);
    setSelectedImage(selectedImage);
  };

  // Drag-to-resize handle
  const startDragResize = (e: React.MouseEvent) => {
    if (!selectedImage) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = selectedImage.offsetWidth;
    const ratio = selectedImage.naturalWidth / selectedImage.naturalHeight;

    const onMove = (mv: MouseEvent) => {
      const newW = Math.max(50, startW + (mv.clientX - startX));
      selectedImage.style.width = `${newW}px`;
      selectedImage.style.maxWidth = "none";
      selectedImage.style.height = `${newW / ratio}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setSelectedImage(selectedImage); // trigger re-render
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const deleteImage = () => {
    selectedImage?.remove();
    setSelectedImage(null);
    updateCounts();
  };

  // ── Table insert ───────────────────────────────────────────────────────────
  const insertTable = (rows: number, cols: number) => {
    let html = `<table style="border-collapse:collapse;width:100%;margin:8px 0;">`;
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        html += `<td style="border:1px solid #ccc;padding:8px 12px;min-width:60px;">&nbsp;</td>`;
      }
      html += "</tr>";
    }
    html += "</table><p><br></p>";
    execCmd("insertHTML", html);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    let html = isSourceMode
      ? sourceRef.current?.value || ""
      : editorRef.current?.innerHTML || "";

    if (attachments.length > 0) {
      const attHtml = attachments.map(a => `<span data-attachment-file="${a.url}" data-attachment-name="${a.name}" style="display:none;"></span>`).join("");
      if (!html.includes('data-attachment-file')) {
        html += attHtml;
      }
    }
    onSave(name, html);
  };



  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex flex-col z-50 overflow-hidden">

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="h-14 bg-card border-b flex items-center justify-between px-4 shrink-0 gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-base font-semibold border-transparent hover:border-input focus:border-input w-72 shadow-none bg-transparent"
          placeholder="Template Name"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" size="sm">Preview & Test</Button>
          <Button size="sm" onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save &amp; Quit
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {!isSourceMode && (
        <div className="h-11 bg-card border-b flex items-center px-3 gap-0.5 overflow-x-auto shrink-0">

          {/* Source */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSourceMode} title="Source Code">
            <Code2 className="size-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Font family */}
          <Select defaultValue="Arial" onValueChange={(v) => execCmd("fontName", v)}>
            <SelectTrigger className="w-28 h-8 border-transparent hover:border-input text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Arial","Helvetica","Times New Roman","Georgia","Courier New","Verdana","Trebuchet MS"].map(f => (
                <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Font size */}
          <Select defaultValue="3" onValueChange={(v) => execCmd("fontSize", v)}>
            <SelectTrigger className="w-16 h-8 border-transparent hover:border-input text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[["1","10"],["2","13"],["3","16"],["4","18"],["5","24"],["6","32"],["7","48"]].map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Personalization Tag / Variable Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                title="Insert Dynamic Contact Variable"
              >
                <UserCheck className="size-3.5" />
                <span>Add Variable</span>
                <ChevronDown className="size-3 opacity-60 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Dynamic Contact Tags
              </div>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{first_name}}"); }}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">First Name</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{first_name}}"}</code>
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{last_name}}"); }}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">Last Name</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{last_name}}"}</code>
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{full_name}}"); }}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">Full Name</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{full_name}}"}</code>
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{email}}"); }}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">Email Address</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{email}}"}</code>
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{company}}")} }
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">Company Name</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{company}}"}</code>
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{designation}}"); }}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">Job Title</span>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{designation}}"}</code>
              </DropdownMenuItem>
              <div className="h-px bg-border my-1" />
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                onClick={(e) => { e.preventDefault(); insertVariableAtSelection("{{unsubscribe_url}}"); }}
                className="cursor-pointer flex items-center justify-between text-red-600 dark:text-red-400"
              >
                <span className="font-medium">Unsubscribe Link</span>
                <code className="text-[10px] bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded">{"{{unsubscribe_url}}"}</code>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Basic formatting */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("bold")} title="Bold"><Bold className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("italic")} title="Italic"><Italic className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("underline")} title="Underline"><Underline className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("strikeThrough")} title="Strikethrough"><Strikethrough className="size-4" /></Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Font / Text color */}
          <Popover open={textColorOpen} onOpenChange={setTextColorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                title="Text Color"
                className="h-8 px-1.5 flex items-center gap-0.5 hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <div className="flex flex-col items-center justify-center">
                  <Type className="size-4 text-foreground" />
                  <div className="w-3.5 h-1 rounded-full bg-red-600 -mt-0.5" />
                </div>
                <ChevronDown className="size-2.5 opacity-60 ml-0.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-68 p-3 space-y-3 z-50" align="start" sideOffset={5} onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <Type className="size-3.5 text-primary" />
                  <span>Text Color</span>
                </div>
                <button
                  type="button"
                  className="text-[11px] text-slate-600 hover:text-primary dark:text-slate-400 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearTextColor();
                    setTextColorOpen(false);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    clearTextColor();
                    setTextColorOpen(false);
                  }}
                >
                  <Eraser className="size-3" />
                  Clear Text Color
                </button>
              </div>

              {/* Prominent Clear Text Color Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clearTextColor();
                  setTextColorOpen(false);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  clearTextColor();
                  setTextColorOpen(false);
                }}
              >
                <Eraser className="size-3.5" />
                <span>Default / Clear Text Color</span>
              </Button>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Standard Colors</span>
                <div className="flex items-center gap-1.5 justify-between">
                  {TEXT_COLOR_PRESETS.map((p) => (
                    <button
                      key={p.color}
                      type="button"
                      title={p.label}
                      className="w-5 h-5 rounded-full border border-gray-300 hover:scale-125 transition-transform cursor-pointer shadow-2xs"
                      style={{ backgroundColor: p.color }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyColor("foreColor", p.color);
                        setTextColorOpen(false);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        applyColor("foreColor", p.color);
                        setTextColorOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Swatch Grid */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Palette</span>
                <div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto p-0.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-5 h-5 rounded-xs border border-gray-300 hover:scale-125 transition-transform cursor-pointer"
                      style={{ backgroundColor: c }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyColor("foreColor", c);
                        setTextColorOpen(false);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        applyColor("foreColor", c);
                        setTextColorOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Custom Color Input */}
              <div className="pt-2 border-t space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground block">Custom Color:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customTextColor}
                    onChange={(e) => setCustomTextColor(e.target.value)}
                    className="w-7 h-7 rounded border cursor-pointer p-0 shrink-0"
                  />
                  <Input
                    value={customTextColor}
                    onChange={(e) => setCustomTextColor(e.target.value)}
                    placeholder="#000000"
                    className="h-7 text-xs font-mono uppercase"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-2.5 font-semibold shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyColor("foreColor", customTextColor);
                      setTextColorOpen(false);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      applyColor("foreColor", customTextColor);
                      setTextColorOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Text Highlight color */}
          <Popover open={highlightColorOpen} onOpenChange={setHighlightColorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                title="Text Highlight Color"
                className="h-8 px-1.5 flex items-center gap-0.5 hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <div className="flex flex-col items-center justify-center">
                  <Highlighter className="size-4 text-amber-500" />
                  <div className="w-3.5 h-1 rounded-full bg-yellow-400 -mt-0.5" />
                </div>
                <ChevronDown className="size-2.5 opacity-60 ml-0.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-68 p-3 space-y-3 z-50" align="start" sideOffset={5} onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <Highlighter className="size-3.5 text-amber-500" />
                  <span>Text Highlight</span>
                </div>
                <button
                  type="button"
                  className="text-[11px] text-red-600 hover:text-red-700 dark:text-red-400 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearHighlight();
                    setHighlightColorOpen(false);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    clearHighlight();
                    setHighlightColorOpen(false);
                  }}
                >
                  <Eraser className="size-3" />
                  Clear Highlight
                </button>
              </div>

              {/* Prominent Clear Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs font-semibold text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center gap-1.5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clearHighlight();
                  setHighlightColorOpen(false);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  clearHighlight();
                  setHighlightColorOpen(false);
                }}
              >
                <Eraser className="size-3.5" />
                <span>No Color (Remove Highlight)</span>
              </Button>

              {/* Quick Highlight Presets */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Highlight Colors</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {HIGHLIGHT_PRESETS.map((p) => (
                    <button
                      key={p.color}
                      type="button"
                      title={`Highlight ${p.label}`}
                      className="flex items-center gap-1.5 p-1 rounded border border-gray-200 dark:border-gray-700 hover:scale-105 transition-transform cursor-pointer text-left"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyColor("hiliteColor", p.color);
                        setHighlightColorOpen(false);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        applyColor("hiliteColor", p.color);
                        setHighlightColorOpen(false);
                      }}
                    >
                      <span className="w-4 h-4 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Swatch Grid */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All Swatches</span>
                <div className="grid grid-cols-8 gap-1 max-h-28 overflow-y-auto p-0.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-5 h-5 rounded-xs border border-gray-300 hover:scale-125 transition-transform cursor-pointer"
                      style={{ backgroundColor: c }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyColor("hiliteColor", c);
                        setHighlightColorOpen(false);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        applyColor("hiliteColor", c);
                        setHighlightColorOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Custom Color Input */}
              <div className="pt-2 border-t space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground block">Custom Highlight:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customHighlightColor}
                    onChange={(e) => setCustomHighlightColor(e.target.value)}
                    className="w-7 h-7 rounded border cursor-pointer p-0 shrink-0"
                  />
                  <Input
                    value={customHighlightColor}
                    onChange={(e) => setCustomHighlightColor(e.target.value)}
                    placeholder="#fef08a"
                    className="h-7 text-xs font-mono uppercase"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-2.5 font-semibold shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyColor("hiliteColor", customHighlightColor);
                      setHighlightColorOpen(false);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      applyColor("hiliteColor", customHighlightColor);
                      setHighlightColorOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Link popover */}
          <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost" size="icon" className="h-8 w-8" title="Insert Link"
                onClick={openLinkPopover}
              >
                <Link className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start" side="bottom">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Link target</label>
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://"
                    className="h-9 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && applyLink()}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Link title</label>
                  <Input
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Display text"
                    className="h-9 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && applyLink()}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkNewTab}
                    onChange={(e) => setLinkNewTab(e.target.checked)}
                    className="rounded"
                  />
                  Open in new tab
                </label>
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={applyLink} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-5">
                    Update
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Image */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Insert Image">
                <ImageIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={insertImageUrl}>From URL…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>Upload from computer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          {/* Attach Document & Files */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Attach Document or File">
                <Paperclip className="size-4 text-blue-600 dark:text-blue-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => documentFileInputRef.current?.click()} className="cursor-pointer">
                <FileUp className="size-4 mr-2 text-blue-500" />
                Upload File from Computer…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDocumentPopoverOpen(true)} className="cursor-pointer">
                <FileText className="size-4 mr-2 text-emerald-500" />
                Attach Document Link / URL…
              </DropdownMenuItem>
              <div className="h-px bg-border my-1" />
              <DropdownMenuItem onClick={() => insertCalloutBox("note")} className="cursor-pointer">
                <Sparkles className="size-4 mr-2 text-amber-500" />
                Insert Callout Note Box
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlockquote()} className="cursor-pointer">
                <Quote className="size-4 mr-2 text-purple-500" />
                Insert Quote Block
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertHorizontalRule()} className="cursor-pointer">
                <Minus className="size-4 mr-2 text-gray-500" />
                Insert Horizontal Line
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Document URL attachment popover */}
          <Popover open={documentPopoverOpen} onOpenChange={setDocumentPopoverOpen}>
            <PopoverContent className="w-80 p-4" align="start" side="bottom">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold border-b pb-2">
                  <Paperclip className="size-4 text-primary" />
                  Attach Document / File
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Document URL *</label>
                  <Input
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://example.com/document.pdf"
                    className="h-9 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && applyDocumentUrl()}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Document Title (Optional)</label>
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. Project Specs v2.pdf"
                    className="h-9 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && applyDocumentUrl()}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setDocumentPopoverOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={applyDocumentUrl} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Attach File
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <input
            type="file"
            ref={documentFileInputRef}
            onChange={handleDocumentUpload}
            className="hidden"
            accept="*/*"
          />

          {/* Emoji */}
          {/* Emoji Popover */}
          <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Insert Emoji"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <Smile className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2 z-50" align="start" sideOffset={5}>
              <div className="grid grid-cols-10 gap-0.5 max-h-48 overflow-y-auto">
                {EMOJIS.map((em, i) => (
                  <button
                    key={i}
                    className="text-lg hover:bg-gray-100 dark:hover:bg-slate-800 rounded p-0.5 leading-none cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      restoreSelection();
                      execCmd("insertText", em);
                      setEmojiPickerOpen(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Code block */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Code Block"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execCmd("insertHTML", `<pre style="background:#f4f4f4;padding:12px 16px;border-radius:6px;font-family:monospace;font-size:13px;border:1px solid #e0e0e0;"><code>// code here</code></pre><p><br></p>`)}
          >
            <Code className="size-4" />
          </Button>

          {/* Table Popover */}
          <Popover open={tablePickerOpen} onOpenChange={setTablePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Insert Table"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <Table2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 z-50" align="start" sideOffset={5}>
              <p className="text-xs text-gray-500 mb-2">
                {tableHovered.r > 0 ? `${tableHovered.r} × ${tableHovered.c}` : "Select table size"}
              </p>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
                {Array.from({ length: 6 }, (_, r) =>
                  Array.from({ length: 8 }, (_, c) => (
                    <div
                      key={`${r}-${c}`}
                      className="w-5 h-5 border rounded-sm cursor-pointer transition-colors"
                      style={{
                        backgroundColor: r < tableHovered.r && c < tableHovered.c ? "#3b82f6" : "transparent",
                        borderColor: r < tableHovered.r && c < tableHovered.c ? "#3b82f6" : "#d1d5db",
                      }}
                      onMouseEnter={() => setTableHovered({ r: r + 1, c: c + 1 })}
                      onClick={() => {
                        insertTable(r + 1, c + 1);
                        setTablePickerOpen(false);
                      }}
                    />
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Alignment */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("justifyLeft")} title="Align Left"><AlignLeft className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("justifyCenter")} title="Align Center"><AlignCenter className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("justifyRight")} title="Align Right"><AlignRight className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("justifyFull")} title="Justify"><AlignJustify className="size-4" /></Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Lists / indent */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("insertOrderedList")} title="Ordered List"><ListOrdered className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("insertUnorderedList")} title="Unordered List"><List className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("outdent")} title="Outdent"><IndentDecrease className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("indent")} title="Indent"><IndentIncrease className="size-4" /></Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Clear formatting */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd("removeFormat")} title="Clear Formatting"><RemoveFormatting className="size-4" /></Button>
        </div>
      )}

      {/* ── Editor Canvas ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-muted/30 flex justify-center p-8">
        <div className="relative w-full max-w-4xl space-y-3">

          {/* Gmail / Outlook Style Top Attachment Bar */}
          {attachments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border shadow-sm rounded-md px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Paperclip className="size-4 text-blue-600 dark:text-blue-400" />
                <span>Attached Files ({attachments.length}):</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 shadow-xs text-xs"
                  >
                    <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold uppercase shrink-0">
                      {att.ext.slice(0, 3)}
                    </div>
                    <div className="flex flex-col max-w-[180px]">
                      <a href={att.url} target="_blank" rel="noreferrer" className="font-semibold text-slate-800 dark:text-slate-200 hover:underline truncate">
                        {att.name}
                      </a>
                      <span className="text-[10px] text-slate-500">{att.size || "Attached File"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))}
                      className="text-slate-400 hover:text-red-500 ml-1 cursor-pointer"
                      title="Remove attachment"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* White email canvas */}
          <div className="bg-white min-h-[600px] border shadow-sm rounded-md relative">
            {isSourceMode ? (
              <textarea
                ref={sourceRef}
                className="w-full h-full min-h-[600px] p-6 font-mono text-sm resize-none focus:outline-none rounded-md"
                placeholder="<html><body>...</body></html>"
              />
            ) : (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => { updateCounts(); saveSelection(); }}
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                onFocus={saveSelection}
                onClick={handleEditorClick}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                  saveSelection();
                }}
                className="w-full min-h-[600px] p-8 outline-none"
                style={{
                  fontFamily: "Arial, sans-serif",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "#222",
                }}
              />
            )}
            {/* Word / char counter */}
            <div className="absolute bottom-3 right-4 text-xs text-muted-foreground pointer-events-none select-none">
              Words : {words} &nbsp;&nbsp; Characters : {chars}
            </div>
          </div>

          {/* ── Image resize toolbar (inline below image) ───────────────── */}
          {!isSourceMode && selectedImage && (
            <div
              className="mt-2 flex items-center gap-1 bg-gray-900 text-white rounded-lg px-2 py-1.5 w-fit mx-auto shadow-xl"
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="text-xs text-gray-400 mr-1">Resize:</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImage(25)}>Small (25%)</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImage(50)}>Medium (50%)</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImage(75)}>Large (75%)</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImage(100)}>Full (100%)</Button>
              <div className="w-px h-4 bg-gray-600 mx-1" />
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-gray-700 px-2 flex items-center gap-1" onClick={deleteImage}>
                <Trash2 className="size-3" /> Remove
              </Button>
            </div>
          )}

          {/* ── Drag handle overlay on selected image ────────────────────── */}
          {!isSourceMode && selectedImage && (() => {
            const img = selectedImage;
            const rect = img.getBoundingClientRect();
            const canvasRect = editorRef.current?.getBoundingClientRect();
            if (!canvasRect) return null;
            return (
              <>
                {/* Blue border ring around selected image */}
                <div
                  className="pointer-events-none absolute border-2 border-blue-500 rounded-sm z-10"
                  style={{
                    top: rect.top - canvasRect.top + (editorRef.current?.scrollTop || 0) + 32,
                    left: rect.left - canvasRect.left + 32,
                    width: rect.width,
                    height: rect.height,
                  }}
                />
                {/* Bottom-right drag handle */}
                <div
                  className="absolute bg-white border-2 border-blue-500 rounded-sm z-20 cursor-nwse-resize"
                  style={{
                    top: rect.top - canvasRect.top + (editorRef.current?.scrollTop || 0) + 32 + rect.height - 6,
                    left: rect.left - canvasRect.left + 32 + rect.width - 6,
                    width: 12,
                    height: 12,
                  }}
                  onMouseDown={startDragResize}
                />
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}