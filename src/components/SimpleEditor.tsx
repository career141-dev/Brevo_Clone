import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  MoreVertical, Code2, Bold, Italic, Underline, Strikethrough,
  Link, Image as ImageIcon, Smile, Code, Table2, AlignLeft,
  AlignCenter, AlignRight, AlignJustify, ListOrdered, List,
  IndentDecrease, IndentIncrease, RemoveFormatting, ChevronDown,
  Trash2, Paperclip, FileText, FileUp, Quote, Minus, Sparkles, X, UserCheck,
  Search, Baseline, WrapText,
} from "lucide-react";
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

// ─── Emoji list with categorization ──────────────────────────────────────────
const EMOJIS = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰",
  "😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥",
  "😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤","😒","😓","😔",
  "😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨",
  "😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","🥴","😠","😡","🤬","😷",
  "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚",
  "🖐️","✋","🖖","👏","🙌","🤲","🤝","🙏","✍️","💪","🦾","🦿","🦵","🦶","👂",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗",
  "🌟","⭐","🌙","☀️","🌈","🌊","🔥","💧","🌿","🍀","🌸","🌺","🌻","🌹","🍁",
  "🎉","🎊","🎈","🎁","🎀","🏆","🥇","🎯","🎮","🎲","🎵","🎶","🎸","🎹","🎺",
  "💼","📊","📈","📉","💡","🔔","✉️","📧","📦","🚀","⚡","⏳","🕒","✅","❌",
];

// ─── Font / Text Color Palette ────────────────────────────────────────────────
const TEXT_COLORS = [
  "#000000","#1e293b","#334155","#475569","#64748b","#94a3b8","#cbd5e1","#ffffff",
  "#991b1b","#c2410c","#b45309","#15803d","#047857","#0e7490","#1d4ed8","#4338ca",
  "#dc2626","#ea580c","#d97706","#16a34a","#059669","#0284c7","#2563eb","#6d28d9",
  "#ef4444","#f97316","#f59e0b","#22c55e","#10b981","#06b6d4","#3b82f6","#8b5cf6",
  "#581c87","#701a75","#831843","#881337","#78350f","#713f12","#14532d","#0c4a6e",
];

// ─── Highlight Color Palette (High-contrast Soft Tones) ──────────────────────
const HIGHLIGHT_QUICK = [
  { name: "Yellow", color: "#fef08a", bg: "bg-yellow-200" },
  { name: "Green", color: "#bbf7d0", bg: "bg-green-200" },
  { name: "Cyan", color: "#bae6fd", bg: "bg-sky-200" },
  { name: "Pink", color: "#fbcfe8", bg: "bg-pink-200" },
  { name: "Orange", color: "#fed7aa", bg: "bg-orange-200" },
  { name: "Purple", color: "#e9d5ff", bg: "bg-purple-200" },
  { name: "Coral", color: "#fecaca", bg: "bg-red-200" },
  { name: "Lime", color: "#d9f99d", bg: "bg-lime-200" },
];

const HIGHLIGHT_COLORS = [
  "#fef08a","#fef9c3","#fde047","#fef3c7","#fde68a","#fffbeb",
  "#bbf7d0","#dcfce7","#86efac","#d1fae5","#ecfdf5","#a7f3d0",
  "#bae6fd","#e0f2fe","#7dd3fc","#cffafe","#ecfeff","#38bdf8",
  "#fbcfe8","#fce7f3","#f472b6","#fee2e2","#fff1f2","#fda4af",
  "#fed7aa","#ffedd5","#fdba74","#e9d5ff","#f3e8ff","#d8b4fe",
];

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Impact", value: "Impact, Charcoal, sans-serif" },
];

const FONT_SIZES = [
  { label: "10px", value: "10px" },
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
  { label: "40px", value: "40px" },
  { label: "48px", value: "48px" },
];

const LINE_SPACINGS = [
  { label: "1.0 (Single)", value: "1.0" },
  { label: "1.15", value: "1.15" },
  { label: "1.3", value: "1.3" },
  { label: "1.5 (1.5x)", value: "1.5" },
  { label: "1.75", value: "1.75" },
  { label: "2.0 (Double)", value: "2.0" },
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

  // Active formatting state
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    justifyLeft: false,
    justifyCenter: false,
    justifyRight: false,
    justifyFull: false,
    insertOrderedList: false,
    insertUnorderedList: false,
  });

  // Current font styling
  const [currentFont, setCurrentFont] = useState("Arial");
  const [currentFontSize, setCurrentFontSize] = useState("16px");

  // Selection tracking
  const savedRangeRef = useRef<Range | null>(null);

  // Font Color & Highlight Color popover states
  const [fontColorOpen, setFontColorOpen] = useState(false);
  const [customFontColor, setCustomFontColor] = useState("#ef4444");
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [customHighlightColor, setCustomHighlightColor] = useState("#fef08a");

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNewTab, setLinkNewTab] = useState(false);

  // Image popover state
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageAltInput, setImageAltInput] = useState("");

  // Document attachment popover & files state
  const [documentPopoverOpen, setDocumentPopoverOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("https://");
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string; url: string; ext: string }[]>([]);

  // Image selection & resize state
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageOverlayPos, setImageOverlayPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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

  // ── Range & Selection Handling ─────────────────────────────────────────────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0).cloneRange();
      savedRangeRef.current = range;

      // Update active format state
      try {
        setActiveFormats({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"),
          strikeThrough: document.queryCommandState("strikeThrough"),
          justifyLeft: document.queryCommandState("justifyLeft"),
          justifyCenter: document.queryCommandState("justifyCenter"),
          justifyRight: document.queryCommandState("justifyRight"),
          justifyFull: document.queryCommandState("justifyFull"),
          insertOrderedList: document.queryCommandState("insertOrderedList"),
          insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        });
      } catch {
        // queryCommandState not supported in some contexts
      }
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (!savedRangeRef.current) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  }, []);

  // Update selected image overlay position
  useEffect(() => {
    if (!selectedImage || !editorRef.current) {
      setImageOverlayPos(null);
      return;
    }

    const updateImgPos = () => {
      if (!selectedImage || !editorRef.current) return;
      const rect = selectedImage.getBoundingClientRect();
      const canvasRect = editorRef.current.getBoundingClientRect();
      setImageOverlayPos({
        top: rect.top - canvasRect.top + (editorRef.current.scrollTop || 0),
        left: rect.left - canvasRect.left + (editorRef.current.scrollLeft || 0),
        width: rect.width,
        height: rect.height,
      });
    };

    updateImgPos();
    window.addEventListener("resize", updateImgPos);
    return () => window.removeEventListener("resize", updateImgPos);
  }, [selectedImage]);

  // ── Execute standard command ───────────────────────────────────────────────
  const execCmd = (command: string, value?: string) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    saveSelection();
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

  // ── Insert HTML at cursor ──────────────────────────────────────────────────
  const insertHtmlAtSelection = (html: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const el = document.createElement("div");
      el.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node: Node | null = null;
      let lastNode: Node | null = null;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
        sel.removeAllRanges();
        sel.addRange(range);
        savedRangeRef.current = range.cloneRange();
      }
    } else if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand("insertHTML", false, html);
    }
    updateCounts();
    saveSelection();
  };

  // ── Apply Inline CSS Style (Font Size, Font Family, Line Height) ───────────
  const applyInlineStyle = (styleProp: string, styleValue: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current?.contains(sel.anchorNode)) {
      editorRef.current?.focus();
      return;
    }

    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      // If nothing selected, set on parent block or insert empty span
      const parentBlock = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;

      if (parentBlock && editorRef.current.contains(parentBlock) && parentBlock !== editorRef.current) {
        parentBlock.style.setProperty(styleProp, styleValue);
      }
      return;
    }

    try {
      const contents = range.extractContents();
      const span = document.createElement("span");
      span.style.setProperty(styleProp, styleValue);
      span.appendChild(contents);
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } catch (err) {
      console.error("Apply inline style error:", err);
    }
    updateCounts();
    saveSelection();
  };

  // ── Color & Highlight application & clearing ──────────────────────────────
  const applyColor = (type: "foreColor" | "hiliteColor", color: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current?.contains(sel.anchorNode)) {
      editorRef.current?.focus();
      return;
    }

    const range = sel.getRangeAt(0);
    const isClear = color === "transparent" || color === "inherit" || color === "clear";

    if (isClear) {
      // 1. Strip styles from any ancestor elements within the editor hierarchy
      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
      while (node && node !== editorRef.current && editorRef.current?.contains(node)) {
        if (node instanceof HTMLElement) {
          if (type === "hiliteColor") {
            node.style.removeProperty("background-color");
            node.style.removeProperty("backgroundColor");
            node.style.removeProperty("background");
          } else {
            node.style.removeProperty("color");
            if (node.tagName === "FONT") {
              node.removeAttribute("color");
            }
          }
        }
        node = node.parentElement;
      }

      // 2. Clear on any child nodes within the selection
      if (!range.collapsed) {
        try {
          const fragment = range.extractContents();
          const cleanNode = (n: Node) => {
            if (n instanceof HTMLElement) {
              if (type === "hiliteColor") {
                n.style.removeProperty("background-color");
                n.style.removeProperty("backgroundColor");
                n.style.removeProperty("background");
              } else {
                n.style.removeProperty("color");
                if (n.tagName === "FONT") {
                  n.removeAttribute("color");
                }
              }
            }
            n.childNodes.forEach(cleanNode);
          };
          cleanNode(fragment);
          range.insertNode(fragment);

          const newRange = document.createRange();
          newRange.selectNodeContents(fragment);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedRangeRef.current = newRange.cloneRange();
        } catch (err) {
          console.error("Clean fragment error:", err);
        }
      }

      // 3. Browser native clear commands
      try {
        document.execCommand("styleWithCSS", false, "true");
        if (type === "hiliteColor") {
          document.execCommand("hiliteColor", false, "transparent");
          document.execCommand("backColor", false, "transparent");
        } else {
          document.execCommand("foreColor", false, "#222222");
        }
      } catch {
        // ignore
      }

      saveSelection();
      updateCounts();
      return;
    }

    // Applying color
    if (!range.collapsed) {
      try {
        const fragment = range.extractContents();
        const span = document.createElement("span");
        if (type === "hiliteColor") {
          span.style.backgroundColor = color;
          span.style.padding = "1px 2px";
          span.style.borderRadius = "2px";
        } else {
          span.style.color = color;
        }
        span.appendChild(fragment);
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();

        saveSelection();
        updateCounts();
        return;
      } catch (err) {
        console.error("Color apply error:", err);
      }
    }

    // Fallback execCommand
    try {
      document.execCommand("styleWithCSS", false, "true");
      if (type === "hiliteColor") {
        document.execCommand("hiliteColor", false, color);
      } else {
        document.execCommand("foreColor", false, color);
      }
    } catch {
      // ignore
    }
    saveSelection();
    updateCounts();
  };

  // ── Variable Tag Insertion ─────────────────────────────────────────────────
  const insertVariable = (tag: string) => {
    const chipHtml = `<span contenteditable="false" style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;display:inline-block;margin:0 2px;user-select:all;border:1px solid #bae6fd;">${tag}</span>&nbsp;`;
    insertHtmlAtSelection(chipHtml);
  };

  // ── Link logic ─────────────────────────────────────────────────────────────
  const openLinkPopover = () => {
    saveSelection();
    const sel = window.getSelection();
    const text = sel?.toString() || "";
    setLinkTitle(text);
    setLinkUrl("https://");
    setLinkNewTab(true);
    setLinkPopoverOpen(true);
  };

  const applyLink = () => {
    restoreSelection();
    if (!linkUrl || linkUrl === "https://") {
      setLinkPopoverOpen(false);
      return;
    }

    const title = linkTitle.trim() || linkUrl;
    const targetAttr = linkNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
    const linkHtml = `<a href="${linkUrl}"${targetAttr} style="color:#2563eb;text-decoration:underline;">${title}</a>&nbsp;`;
    insertHtmlAtSelection(linkHtml);
    setLinkPopoverOpen(false);
  };

  // ── Image insertion & uploading ────────────────────────────────────────────
  const applyImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    const altText = imageAltInput.trim() ? ` alt="${imageAltInput.trim()}"` : '';
    const imgHtml = `<img src="${imageUrlInput.trim()}"${altText} style="max-width:100%;width:100%;height:auto;display:block;margin:12px auto;border-radius:6px;" data-resizable="true" /><p><br></p>`;
    insertHtmlAtSelection(imgHtml);
    setImageUrlInput("");
    setImageAltInput("");
    setImagePopoverOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        const imgHtml = `<img src="${dataUrl}" alt="${file.name}" style="max-width:100%;width:100%;height:auto;display:block;margin:12px auto;border-radius:6px;" data-resizable="true" /><p><br></p>`;
        insertHtmlAtSelection(imgHtml);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Document Attachment Card insertion ─────────────────────────────────────
  const insertDocumentCard = (name: string, size: string, url: string) => {
    const fileExt = name.split('.').pop()?.toUpperCase() || 'FILE';
    let badgeBg = '#3b82f6';
    if (['PDF'].includes(fileExt)) badgeBg = '#ef4444';
    else if (['DOC', 'DOCX', 'PAGES'].includes(fileExt)) badgeBg = '#2563eb';
    else if (['XLS', 'XLSX', 'CSV', 'NUMBERS'].includes(fileExt)) badgeBg = '#10b981';
    else if (['PPT', 'PPTX', 'KEYNOTE'].includes(fileExt)) badgeBg = '#f97316';
    else if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(fileExt)) badgeBg = '#8b5cf6';
    else if (['TXT', 'MD', 'RTF'].includes(fileExt)) badgeBg = '#64748b';

    const cardHtml = `
      <div contenteditable="false" style="display:inline-flex;align-items:center;gap:12px;padding:10px 16px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;margin:10px 0;max-width:100%;font-family:system-ui,-apple-system,sans-serif;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,0.05);" data-file-attachment="true">
        <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;background-color:${badgeBg};color:#ffffff;border-radius:8px;font-weight:700;font-size:11px;letter-spacing:0.5px;flex-shrink:0;text-transform:uppercase;line-height:1;text-align:center;">
          ${fileExt.slice(0, 4)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
          <a href="${url}" download="${name}" target="_blank" style="font-weight:600;font-size:14px;color:#0f172a;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
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
    insertHtmlAtSelection(cardHtml);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading ${file.name}...`);
    try {
      const result = await api.uploadFile(file);
      toast.dismiss(toastId);
      toast.success(`${file.name} attached!`);

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

      // Automatically insert the interactive download card directly into the email body
      insertDocumentCard(result.fileName, fileSizeStr, result.url);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Upload failed: ${err.message || "Unknown error"}`);
    }
    if (documentFileInputRef.current) documentFileInputRef.current.value = "";
  };

  const applyDocumentUrl = () => {
    if (!docUrl || docUrl === "https://") return;
    const title = docTitle.trim() || docUrl.split("/").pop() || "Attached Document";
    const ext = title.split('.').pop()?.toUpperCase() || 'FILE';
    setAttachments((prev) => [
      ...prev.filter(a => a.url !== docUrl),
      { id: String(Date.now()), name: title, size: "URL Link", url: docUrl, ext }
    ]);
    insertDocumentCard(title, "Link", docUrl);
    setDocumentPopoverOpen(false);
    setDocTitle("");
    setDocUrl("https://");
  };

  // ── Blocks: Callouts, Quote, Code, Table, HR ───────────────────────────────
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
        <div style="font-size:14px;color:#334155;line-height:1.5;">Add your note or message here...</div>
      </div>
      <p><br></p>
    `;
    insertHtmlAtSelection(html);
  };

  const insertBlockquote = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "Insert quote or highlighted passage here...";
    const html = `
      <blockquote style="border-left:3px solid #cbd5e1;padding-left:14px;margin:14px 0;color:#475569;font-style:italic;font-size:15px;line-height:1.6;">
        "${text}"
      </blockquote>
      <p><br></p>
    `;
    insertHtmlAtSelection(html);
  };

  const insertCodeBlock = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "// Your code here\nconsole.log('Hello world!');";
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `
      <pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px 16px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5;color:#0f172a;overflow-x:auto;margin:12px 0;"><code>${escaped}</code></pre>
      <p><br></p>
    `;
    insertHtmlAtSelection(html);
  };

  const insertHorizontalRule = () => {
    const html = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" /><p><br></p>`;
    insertHtmlAtSelection(html);
  };

  const insertTable = (rows: number, cols: number) => {
    let html = `<table style="border-collapse:collapse;width:100%;margin:12px 0;">`;
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        html += `<td style="border:1px solid #cbd5e1;padding:8px 12px;min-width:60px;vertical-align:top;">&nbsp;</td>`;
      }
      html += "</tr>";
    }
    html += "</table><p><br></p>";
    insertHtmlAtSelection(html);
  };

  // ── Image Click, Resize & Alignment ────────────────────────────────────────
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      setSelectedImage(target as HTMLImageElement);
    } else {
      setSelectedImage(null);
    }
  };

  const resizeImagePct = (pct: number) => {
    if (!selectedImage) return;
    selectedImage.style.width = `${pct}%`;
    selectedImage.style.maxWidth = "100%";
    selectedImage.style.height = "auto";
    setSelectedImage({ ...selectedImage } as unknown as HTMLImageElement);
    setSelectedImage(selectedImage);
    updateCounts();
  };

  const alignImage = (align: "left" | "center" | "right") => {
    if (!selectedImage) return;
    selectedImage.style.display = "block";
    if (align === "left") {
      selectedImage.style.marginLeft = "0";
      selectedImage.style.marginRight = "auto";
    } else if (align === "center") {
      selectedImage.style.marginLeft = "auto";
      selectedImage.style.marginRight = "auto";
    } else if (align === "right") {
      selectedImage.style.marginLeft = "auto";
      selectedImage.style.marginRight = "0";
    }
    setSelectedImage({ ...selectedImage } as unknown as HTMLImageElement);
    setSelectedImage(selectedImage);
    updateCounts();
  };

  const deleteImage = () => {
    selectedImage?.remove();
    setSelectedImage(null);
    updateCounts();
  };

  // Drag-to-resize handle
  const startDragResize = (e: React.MouseEvent) => {
    if (!selectedImage) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = selectedImage.offsetWidth;
    const ratio = selectedImage.naturalWidth / selectedImage.naturalHeight || 1;

    const onMove = (mv: MouseEvent) => {
      const newW = Math.max(60, startW + (mv.clientX - startX));
      selectedImage.style.width = `${newW}px`;
      selectedImage.style.maxWidth = "100%";
      selectedImage.style.height = `${newW / ratio}px`;
      // Trigger re-render of overlay
      setSelectedImage(selectedImage);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      updateCounts();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ── Save Handler ───────────────────────────────────────────────────────────
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



  // ── Table size picker ─────────────────────────────────────────────────────
  const TablePicker = () => {
    const [hovered, setHovered] = useState({ r: 0, c: 0 });
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Insert Table"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          >
            <Table2 className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 z-50" align="start">
          <p className="text-xs text-gray-500 mb-2">
            {hovered.r > 0 ? `${hovered.r} × ${hovered.c}` : "Select table size"}
          </p>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
            {Array.from({ length: 6 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => (
                <div
                  key={`${r}-${c}`}
                  className="w-5 h-5 border rounded-sm cursor-pointer transition-colors"
                  style={{
                    backgroundColor: r < hovered.r && c < hovered.c ? "#3b82f6" : "transparent",
                    borderColor: r < hovered.r && c < hovered.c ? "#3b82f6" : "#d1d5db",
                  }}
                  onMouseEnter={() => setHovered({ r: r + 1, c: c + 1 })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertTable(r + 1, c + 1);
                  }}
                />
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // ── Emoji picker with search ──────────────────────────────────────────────
  const EmojiPicker = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const filteredEmojis = EMOJIS.filter(() => true);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Insert Emoji"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
          >
            <Smile className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-2 z-50" align="start">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search emojis..."
              className="h-8 text-xs pl-8"
            />
          </div>
          <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1">
            {filteredEmojis.map((em, i) => (
              <button
                key={i}
                type="button"
                className="text-lg hover:bg-slate-100 dark:hover:bg-slate-800 rounded p-1 leading-none text-center cursor-pointer transition-transform hover:scale-125"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertHtmlAtSelection(`<span>${em}</span>`);
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

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
          <Button size="sm" onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save &amp; Quit
          </Button>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {!isSourceMode && (
        <div className="h-11 bg-card border-b flex items-center px-3 gap-0.5 overflow-x-auto shrink-0 select-none">

          {/* Source Mode Toggle */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSourceMode} title="Source Code">
            <Code2 className="size-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Font Family Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs font-medium"
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                title="Font Family"
              >
                <span className="truncate max-w-[80px]">{currentFont}</span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 z-50">
              {FONT_FAMILIES.map((f) => (
                <DropdownMenuItem
                  key={f.label}
                  className="cursor-pointer text-xs"
                  style={{ fontFamily: f.value }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCurrentFont(f.label);
                    applyInlineStyle("font-family", f.value);
                  }}
                >
                  {f.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Font Size Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs font-medium"
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                title="Font Size"
              >
                <span>{currentFontSize}</span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-28 z-50">
              {FONT_SIZES.map((s) => (
                <DropdownMenuItem
                  key={s.label}
                  className="cursor-pointer text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCurrentFontSize(s.label);
                    applyInlineStyle("font-size", s.value);
                  }}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Line Spacing Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs font-medium"
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                title="Line Spacing"
              >
                <WrapText className="size-3.5 mr-0.5" />
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36 z-50">
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase">
                Line Spacing
              </div>
              {LINE_SPACINGS.map((ls) => (
                <DropdownMenuItem
                  key={ls.label}
                  className="cursor-pointer text-xs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyInlineStyle("line-height", ls.value);
                  }}
                >
                  {ls.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
            <DropdownMenuContent align="start" className="w-56 z-50">
              <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Dynamic Contact Tags
              </div>
              {[
                { label: "First Name", tag: "{{first_name}}" },
                { label: "Last Name", tag: "{{last_name}}" },
                { label: "Full Name", tag: "{{full_name}}" },
                { label: "Email Address", tag: "{{email}}" },
                { label: "Company Name", tag: "{{company}}" },
                { label: "Job Title", tag: "{{designation}}" },
              ].map((v) => (
                <DropdownMenuItem
                  key={v.tag}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertVariable(v.tag);
                  }}
                  className="cursor-pointer flex items-center justify-between"
                >
                  <span className="font-medium text-xs">{v.label}</span>
                  <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{v.tag}</code>
                </DropdownMenuItem>
              ))}
              <div className="h-px bg-border my-1" />
              <DropdownMenuItem
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertVariable("{{unsubscribe_url}}");
                }}
                className="cursor-pointer flex items-center justify-between text-red-600 dark:text-red-400"
              >
                <span className="font-medium text-xs">Unsubscribe Link</span>
                <code className="text-[10px] bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded">{"{{unsubscribe_url}}"}</code>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Basic formatting buttons */}
          <Button
            variant={activeFormats.bold ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }}
            title="Bold (Ctrl+B)"
          >
            <Bold className="size-4" />
          </Button>
          <Button
            variant={activeFormats.italic ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }}
            title="Italic (Ctrl+I)"
          >
            <Italic className="size-4" />
          </Button>
          <Button
            variant={activeFormats.underline ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }}
            title="Underline (Ctrl+U)"
          >
            <Underline className="size-4" />
          </Button>
          <Button
            variant={activeFormats.strikeThrough ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("strikeThrough"); }}
            title="Strikethrough"
          >
            <Strikethrough className="size-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Font color */}
          <Popover open={fontColorOpen} onOpenChange={setFontColorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Font / Text Color"
                className="relative h-8 w-8 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <div className="flex flex-col items-center pointer-events-none">
                  <Baseline className="size-3.5" />
                  <span className="w-4 h-1 rounded-sm bg-red-500 mt-0.5" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3.5 space-y-3 z-50 shadow-xl" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Font / Text Color</span>
                <button
                  type="button"
                  className="text-[11px] text-red-600 hover:text-red-700 hover:underline cursor-pointer font-medium"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyColor("foreColor", "inherit");
                  }}
                  onClick={() => {
                    applyColor("foreColor", "inherit");
                    setFontColorOpen(false);
                  }}
                >
                  Default Color
                </button>
              </div>

              {/* Text Color Grid */}
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Theme &amp; Standard Colors
                  </span>
                  <div className="grid grid-cols-8 gap-1.5">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="w-6 h-6 rounded-sm border border-gray-300 hover:scale-125 transition-transform cursor-pointer shadow-xs focus:ring-2 focus:ring-primary"
                        style={{ backgroundColor: c }}
                        title={`Text color ${c}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyColor("foreColor", c);
                        }}
                        onClick={() => {
                          applyColor("foreColor", c);
                          setFontColorOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Color Wheel & Hex Input */}
              <div className="pt-2 border-t space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">Custom Text Color:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customFontColor}
                    onChange={(e) => setCustomFontColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer p-0 shrink-0"
                  />
                  <Input
                    value={customFontColor}
                    onChange={(e) => setCustomFontColor(e.target.value)}
                    placeholder="#000000"
                    className="h-8 text-xs font-mono uppercase"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs px-3 font-semibold shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyColor("foreColor", customFontColor);
                    }}
                    onClick={() => {
                      applyColor("foreColor", customFontColor);
                      setFontColorOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Highlight color */}
          <Popover open={highlightColorOpen} onOpenChange={setHighlightColorOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Highlight Color"
                className="relative h-8 w-8 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
              >
                <div className="flex flex-col items-center pointer-events-none">
                  <span className="text-xs font-bold leading-none">A</span>
                  <span className="w-4 h-1 rounded-sm bg-yellow-300 mt-0.5" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3.5 space-y-3 z-50 shadow-xl" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Highlight Color</span>
                <button
                  type="button"
                  className="text-[11px] text-red-600 hover:text-red-700 hover:underline cursor-pointer font-medium"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyColor("hiliteColor", "transparent");
                  }}
                  onClick={() => {
                    applyColor("hiliteColor", "transparent");
                    setHighlightColorOpen(false);
                  }}
                >
                  No Highlight (Clear)
                </button>
              </div>

              {/* Quick Highlight Pills */}
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Quick Highlighters
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {HIGHLIGHT_QUICK.map((hq) => (
                      <button
                        key={hq.name}
                        type="button"
                        className="flex items-center gap-1 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-700 hover:scale-105 transition-transform text-[11px] font-medium cursor-pointer"
                        style={{ backgroundColor: hq.color }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyColor("hiliteColor", hq.color);
                        }}
                        onClick={() => {
                          applyColor("hiliteColor", hq.color);
                          setHighlightColorOpen(false);
                        }}
                      >
                        <span className="text-slate-800 text-[10px] truncate">{hq.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pastel Swatch Grid */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Pastel Highlighting Tones
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {HIGHLIGHT_COLORS.map((c, idx) => (
                      <button
                        key={`${c}-${idx}`}
                        type="button"
                        className="w-8 h-6 rounded border border-gray-300 hover:scale-115 transition-transform cursor-pointer shadow-xs focus:ring-2 focus:ring-primary"
                        style={{ backgroundColor: c }}
                        title={`Highlight color ${c}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyColor("hiliteColor", c);
                        }}
                        onClick={() => {
                          applyColor("hiliteColor", c);
                          setHighlightColorOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Highlighter Wheel & Hex Input */}
              <div className="pt-2 border-t space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">Custom Highlight Color:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customHighlightColor}
                    onChange={(e) => setCustomHighlightColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer p-0 shrink-0"
                  />
                  <Input
                    value={customHighlightColor}
                    onChange={(e) => setCustomHighlightColor(e.target.value)}
                    placeholder="#fef08a"
                    className="h-8 text-xs font-mono uppercase"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs px-3 font-semibold shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyColor("hiliteColor", customHighlightColor);
                    }}
                    onClick={() => {
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
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Insert Link"
                onMouseDown={(e) => {
                  e.preventDefault();
                  openLinkPopover();
                }}
              >
                <Link className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 z-50" align="start" side="bottom">
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Insert Link</div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Link Target URL *</label>
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="h-8 text-xs"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && applyLink()}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Display Text (Optional)</label>
                  <Input
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="Click here"
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyLink()}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkNewTab}
                    onChange={(e) => setLinkNewTab(e.target.checked)}
                    className="rounded"
                  />
                  Open in new tab
                </label>
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={applyLink} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs px-4">
                    Insert Link
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Image Menu & Popover */}
          <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Insert Image"
                  onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
                >
                  <ImageIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 z-50">
                <PopoverTrigger asChild>
                  <DropdownMenuItem className="cursor-pointer text-xs">
                    Insert from Image URL…
                  </DropdownMenuItem>
                </PopoverTrigger>
                <DropdownMenuItem
                  className="cursor-pointer text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload from Computer…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <PopoverContent className="w-80 p-4 z-50" align="start">
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Insert Image via URL</div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Image URL *</label>
                  <Input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="h-8 text-xs"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && applyImageUrl()}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Alt Text (Optional)</label>
                  <Input
                    value={imageAltInput}
                    onChange={(e) => setImageAltInput(e.target.value)}
                    placeholder="Describe the image"
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyImageUrl()}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setImagePopoverOpen(false)} className="h-8 text-xs">Cancel</Button>
                  <Button size="sm" onClick={applyImageUrl} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
                    Add Image
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          {/* Attach Document & Files */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Attach Document or Card"
                onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
              >
                <Paperclip className="size-4 text-blue-600 dark:text-blue-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 z-50">
              <DropdownMenuItem
                onClick={() => documentFileInputRef.current?.click()}
                className="cursor-pointer text-xs"
              >
                <FileUp className="size-4 mr-2 text-blue-500" />
                Upload File from Computer…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDocumentPopoverOpen(true)}
                className="cursor-pointer text-xs"
              >
                <FileText className="size-4 mr-2 text-emerald-500" />
                Attach Document Link / URL…
              </DropdownMenuItem>
              <div className="h-px bg-border my-1" />
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); insertCalloutBox("note"); }}
                className="cursor-pointer text-xs"
              >
                <Sparkles className="size-4 mr-2 text-amber-500" />
                Insert Callout Note Box
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); insertBlockquote(); }}
                className="cursor-pointer text-xs"
              >
                <Quote className="size-4 mr-2 text-purple-500" />
                Insert Quote Block
              </DropdownMenuItem>
              <DropdownMenuItem
                onMouseDown={(e) => { e.preventDefault(); insertHorizontalRule(); }}
                className="cursor-pointer text-xs"
              >
                <Minus className="size-4 mr-2 text-gray-500" />
                Insert Horizontal Line
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Document URL attachment popover */}
          <Popover open={documentPopoverOpen} onOpenChange={setDocumentPopoverOpen}>
            <PopoverContent className="w-80 p-4 z-50" align="start" side="bottom">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold border-b pb-2">
                  <Paperclip className="size-4 text-primary" />
                  Attach Document / File
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Document URL *</label>
                  <Input
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://example.com/document.pdf"
                    className="h-8 text-xs"
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
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyDocumentUrl()}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setDocumentPopoverOpen(false)} className="h-8 text-xs">Cancel</Button>
                  <Button size="sm" onClick={applyDocumentUrl} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
                    Attach Card
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

          {/* Emoji Picker */}
          <EmojiPicker />

          {/* Code block */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Code Block"
            onMouseDown={(e) => { e.preventDefault(); insertCodeBlock(); }}
          >
            <Code className="size-4" />
          </Button>

          {/* Table Picker */}
          <TablePicker />
          <div className="w-px h-5 bg-border mx-1" />

          {/* Alignments */}
          <Button
            variant={activeFormats.justifyLeft ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("justifyLeft"); }}
            title="Align Left"
          >
            <AlignLeft className="size-4" />
          </Button>
          <Button
            variant={activeFormats.justifyCenter ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("justifyCenter"); }}
            title="Align Center"
          >
            <AlignCenter className="size-4" />
          </Button>
          <Button
            variant={activeFormats.justifyRight ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("justifyRight"); }}
            title="Align Right"
          >
            <AlignRight className="size-4" />
          </Button>
          <Button
            variant={activeFormats.justifyFull ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("justifyFull"); }}
            title="Justify"
          >
            <AlignJustify className="size-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Lists / indent */}
          <Button
            variant={activeFormats.insertOrderedList ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }}
            title="Numbered List"
          >
            <ListOrdered className="size-4" />
          </Button>
          <Button
            variant={activeFormats.insertUnorderedList ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }}
            title="Bullet List"
          >
            <List className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("outdent"); }}
            title="Decrease Indent"
          >
            <IndentDecrease className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("indent"); }}
            title="Increase Indent"
          >
            <IndentIncrease className="size-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />

          {/* Clear formatting */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onMouseDown={(e) => { e.preventDefault(); execCmd("removeFormat"); }}
            title="Clear Formatting"
          >
            <RemoveFormatting className="size-4" />
          </Button>
        </div>
      )}

      {/* ── Editor Canvas ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-muted/30 flex justify-center p-8">
        <div className="relative w-full max-w-4xl space-y-3">

          {/* Gmail / Outlook Style Top Attachment Bar */}
          {attachments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border shadow-xs rounded-md px-5 py-3 flex items-center justify-between gap-3">
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
          <div className="bg-white min-h-[600px] border shadow-xs rounded-md relative">

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
                  fontFamily: "Arial, Helvetica, sans-serif",
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

          {/* ── Image Resize & Alignment Toolbar ─────────────────────────── */}
          {!isSourceMode && selectedImage && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-1.5 w-fit mx-auto shadow-xl z-30"
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="text-xs text-gray-400 mr-1">Size:</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImagePct(25)}>25%</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImagePct(50)}>50%</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImagePct(75)}>75%</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => resizeImagePct(100)}>100%</Button>

              <div className="w-px h-4 bg-gray-600 mx-1" />
              <span className="text-xs text-gray-400 mr-1">Align:</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => alignImage("left")}>Left</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => alignImage("center")}>Center</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-100 hover:bg-gray-700 px-2" onClick={() => alignImage("right")}>Right</Button>

              <div className="w-px h-4 bg-gray-600 mx-1" />
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-gray-700 px-2 flex items-center gap-1" onClick={deleteImage}>
                <Trash2 className="size-3" /> Delete
              </Button>
            </div>
          )}

          {/* ── Drag handle overlay on selected image ────────────────────── */}
          {!isSourceMode && selectedImage && imageOverlayPos && (
            <>
              <div
                className="pointer-events-none absolute border-2 border-blue-500 rounded-sm z-20"
                style={{
                  top: `${imageOverlayPos.top}px`,
                  left: `${imageOverlayPos.left}px`,
                  width: `${imageOverlayPos.width}px`,
                  height: `${imageOverlayPos.height}px`,
                }}
              />
              <div
                className="absolute bg-white border-2 border-blue-500 rounded-sm z-30 cursor-nwse-resize"
                style={{
                  top: `${imageOverlayPos.top + imageOverlayPos.height - 6}px`,
                  left: `${imageOverlayPos.left + imageOverlayPos.width - 6}px`,
                  width: 12,
                  height: 12,
                }}
                onMouseDown={startDragResize}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}