"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  Link2,
  Minus,
  Monitor,
  MousePointerClick,
  Settings2,
  Smartphone,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import {
  DEFAULT_EMAIL_DESIGN,
  DEFAULT_EMAIL_FOOTER,
  EMAIL_AUDIENCES,
  EMAIL_BLOCK_LABELS,
  formatErrorMessage,
  renderEmailDocument,
  type EmailAlign,
  type EmailBlock,
  type EmailBlockType,
  type EmailDesign,
  type EmailFooter,
  type EmailFooterLink,
} from "@passenger/core";

const APP_URL = "https://usepassenger.com";

// Sentinel for the audience selector's "one specific address" option. The
// address itself is stored in the audience field, never this marker.
const SINGLE_AUDIENCE_VALUE = "__single_address__";

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const BLOCK_ORDER: EmailBlockType[] = ["heading", "paragraph", "image", "button", "divider", "spacer"];

const BLOCK_ICONS: Record<EmailBlockType, typeof Type> = {
  heading: Type,
  paragraph: AlignLeft,
  image: ImageIcon,
  button: MousePointerClick,
  divider: Minus,
  spacer: ArrowDown,
};

export interface EmailTemplateDraft {
  id?: Id<"adminEmails">;
  templateId?: Id<"emailTemplates">;
  name?: string;
  subject: string;
  audience: string;
  listId?: Id<"emailLists">;
  blocks: EmailBlock[];
  design: EmailDesign;
  footer?: EmailFooter;
  scheduledFor?: number;
}

export interface EmailListRow {
  id: Id<"emailLists">;
  name: string;
  description?: string;
  memberCount: number;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailTemplateBuilderProps {
  initial: EmailTemplateDraft;
  canManage: boolean;
  mode?: "email" | "template";
  onClose: () => void;
  onSaved: (message: string) => void;
}

function blockId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlock(type: EmailBlockType): EmailBlock {
  switch (type) {
    case "heading":
      return { id: blockId(), type, text: "A clear, useful heading", align: "left", level: "h2" };
    case "paragraph":
      return { id: blockId(), type, text: "Write your message here. Keep it short, specific and kind.", align: "left" };
    case "image":
      return { id: blockId(), type, url: "", alt: "", href: "", width: "full", align: "center" };
    case "button":
      return { id: blockId(), type, label: "Open Passenger", href: APP_URL, align: "left", variant: "primary" };
    case "divider":
      return { id: blockId(), type };
    case "spacer":
      return { id: blockId(), type, size: "medium" };
  }
}

export function starterBlocks(): EmailBlock[] {
  return [
    { id: blockId(), type: "heading", text: "Hello from Passenger", align: "left", level: "h1" },
    {
      id: blockId(),
      type: "paragraph",
      text: "Share what is happening, what a person should do next, and anything they need to know. Plain language works best.",
      align: "left",
    },
    { id: blockId(), type: "button", label: "Open Passenger", href: APP_URL, align: "left", variant: "primary" },
  ];
}

function toLocalInput(ms: number) {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EmailTemplateBuilder({ initial, canManage, onClose, onSaved, mode = "email" }: EmailTemplateBuilderProps) {
  const createEmail = useMutation(api.adminEmails.create);
  const updateEmail = useMutation(api.adminEmails.update);
  const sendEmail = useMutation(api.adminEmails.sendNow);
  const generateUploadUrl = useMutation(api.adminEmails.generateImageUploadUrl);
  const resolveImage = useMutation(api.adminEmails.resolveImage);
  const createTemplate = useMutation(api.emailTemplates.create);
  const updateTemplate = useMutation(api.emailTemplates.update);
  const emailLists = useQuery(api.emailLists.list) as EmailListRow[] | undefined;

  const [subject, setSubject] = useState(initial.subject);
  const [name, setName] = useState(initial.name ?? "");
  const initialSingle = isEmailAddress(initial.audience ?? "");
  const [audience, setAudience] = useState(initialSingle ? EMAIL_AUDIENCES[0] : initial.audience || EMAIL_AUDIENCES[0]);
  const [listId, setListId] = useState<Id<"emailLists"> | undefined>(initial.listId);
  const [singleMode, setSingleMode] = useState(initialSingle);
  const [singleEmail, setSingleEmail] = useState(initialSingle ? initial.audience ?? "" : "");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial.blocks);
  const [design, setDesign] = useState<EmailDesign>({ ...DEFAULT_EMAIL_DESIGN, ...initial.design });
  const [footer, setFooter] = useState<EmailFooter>({ ...DEFAULT_EMAIL_FOOTER, ...initial.footer });
  // Open on the Email settings panel (audience, subject, layout) rather than a
  // randomly selected block, so required fields are visible straight away.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(initial.scheduledFor));
  const [scheduleAt, setScheduleAt] = useState(initial.scheduledFor ? toLocalInput(initial.scheduledFor) : "");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<"save" | "send" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [templatePrompt, setTemplatePrompt] = useState(false);
  const [templatePromptName, setTemplatePromptName] = useState("");

  const subjectInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [subjectFieldError, setSubjectFieldError] = useState(false);
  const [nameFieldError, setNameFieldError] = useState(false);

  const dragFrom = useRef<number | null>(null);

  const audienceOptions = useMemo(() => {
    const single = { value: SINGLE_AUDIENCE_VALUE, label: "A specific address" };
    const base = EMAIL_AUDIENCES.map(value => ({ value, label: value }));
    const listOptions = (emailLists ?? []).map(list => ({ value: `list:${list.id}`, label: `List: ${list.name}` }));
    return [single, ...base, ...listOptions];
  }, [emailLists]);
  const selectedAudienceValue = singleMode ? SINGLE_AUDIENCE_VALUE : listId ? `list:${listId}` : audience;
  const effectiveAudience = singleMode ? singleEmail.trim() : audience;
  const chooseAudience = (value: string) => {
    if (value === SINGLE_AUDIENCE_VALUE) {
      setSingleMode(true);
      setListId(undefined);
      return;
    }
    setSingleMode(false);
    setSingleEmail("");
    if (value.startsWith("list:")) {
      const id = value.slice(5) as Id<"emailLists">;
      const list = (emailLists ?? []).find(candidate => candidate.id === id);
      setListId(id);
      setAudience(list ? `List: ${list.name}` : value);
    } else {
      setListId(undefined);
      setAudience(value);
    }
  };

  const audienceTotal = useQuery(api.adminEmails.audienceCount, { audience: effectiveAudience, listId: listId ?? undefined }) as number | undefined;
  const isTemplate = mode === "template";
  const rawPreviewHtml = useMemo(() => renderEmailDocument({ subject, blocks, design, footer, appUrl: APP_URL }).html, [subject, blocks, design, footer]);
  const [previewHtml, setPreviewHtml] = useState(rawPreviewHtml);
  const selected = blocks.find(block => block.id === selectedId) ?? null;
  const readOnly = !canManage || busy !== null;

  // Debounce the preview document so typing does not tear down the iframe on
  // every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setPreviewHtml(rawPreviewHtml), 250);
    return () => clearTimeout(timer);
  }, [rawPreviewHtml]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const updateBlock = (id: string, patch: Record<string, unknown>) => {
    setBlocks(prev => prev.map(block => (block.id === id ? ({ ...block, ...patch } as EmailBlock) : block)));
  };

  const addBlock = (type: EmailBlockType) => {
    const block = createBlock(type);
    setBlocks(prev => [...prev, block]);
    setSelectedId(block.id);
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(block => block.id !== id));
    setSelectedId(current => (current === id ? null : current));
  };

  const duplicateBlock = (id: string) => {
    setBlocks(prev => {
      const index = prev.findIndex(block => block.id === id);
      if (index === -1) return prev;
      const clone = { ...prev[index], id: blockId() } as EmailBlock;
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    setBlocks(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const dropBlock = (index: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragIndex(null);
    if (from === null || from === index) return;
    setBlocks(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  };

  const uploadImage = async (id: string, file: File) => {
    setBusy("upload");
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("The upload did not complete. Please try again.");
      const payload = (await response.json()) as { storageId?: string };
      if (!payload.storageId) throw new Error("The upload did not complete. Please try again.");
      const url = await resolveImage({ storageId: payload.storageId as Id<"_storage"> });
      const current = blocks.find(block => block.id === id);
      const fallbackAlt = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
      const alt = current && current.type === "image" && current.alt.trim() ? current.alt : fallbackAlt;
      updateBlock(id, { url, alt });
      setBusy(null);
    } catch (uploadError) {
      setError(formatErrorMessage(uploadError, "Could not upload that image."));
      setBusy(null);
    }
  };

  const scheduleTimestamp = () => {
    if (!scheduleEnabled) return undefined;
    if (!scheduleAt) throw new Error("Choose when this email should send.");
    const value = new Date(scheduleAt).getTime();
    if (Number.isNaN(value) || value <= Date.now()) throw new Error("Choose a future date and time to send this email.");
    return value;
  };

  const markSubjectMissing = (message: string) => {
    setSubjectFieldError(true);
    setNameFieldError(false);
    requestAnimationFrame(() => {
      subjectInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      subjectInputRef.current?.focus({ preventScroll: true });
    });
    throw new Error(message);
  };

  const persist = async (): Promise<Id<"adminEmails"> | Id<"emailTemplates">> => {
    if (subject.trim().length < 3) {
      markSubjectMissing(isTemplate ? "Add a default subject of at least 3 characters." : "Add a subject of at least 3 characters.");
    }
    if (blocks.length === 0) throw new Error("Add at least one block to the email.");
    if (!isTemplate && singleMode && !isEmailAddress(singleEmail)) {
      throw new Error("Enter a valid email address to send to.");
    }
    if (isTemplate) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setSubjectFieldError(false);
        setNameFieldError(true);
        requestAnimationFrame(() => {
          nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          nameInputRef.current?.focus({ preventScroll: true });
        });
        throw new Error("Give the template a name.");
      }
      if (initial.templateId) {
        await updateTemplate({ id: initial.templateId, name: trimmedName, subject, blocks, design, footer });
        return initial.templateId;
      }
      return (await createTemplate({ name: trimmedName, subject, blocks, design, footer })) as Id<"emailTemplates">;
    }
    const scheduledFor = scheduleTimestamp();
    if (initial.id) {
      await updateEmail({ id: initial.id, subject, blocks, design, footer, audience: effectiveAudience, listId, scheduledFor });
      return initial.id;
    }
    return (await createEmail({ subject, blocks, design, footer, audience: effectiveAudience, listId, scheduledFor })) as Id<"adminEmails">;
  };

  const handleSaveDraft = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    setSubjectFieldError(false);
    setNameFieldError(false);
    try {
      await persist();
      onSaved(isTemplate ? "Template saved" : "Draft saved");
    } catch (saveError) {
      setError(formatErrorMessage(saveError, isTemplate ? "Could not save this template." : "Could not save this email."));
      setBusy(null);
    }
  };

  const handleSubmit = async () => {
    setConfirmSend(false);
    setBusy("send");
    setError(null);
    setNotice(null);
    setSubjectFieldError(false);
    setNameFieldError(false);
    try {
      const id = await persist();
      if (scheduleEnabled) {
        onSaved("Email scheduled");
        return;
      }
      const result = (await sendEmail({ id: id as Id<"adminEmails"> })) as { recipientCount: number };
      const count = result?.recipientCount ?? 0;
      onSaved(`Email sent to ${count} recipient${count === 1 ? "" : "s"}`);
    } catch (submitError) {
      setError(formatErrorMessage(submitError, "Could not send this email."));
      setBusy(null);
    }
  };

  const requestSubmit = () => {
    if (scheduleEnabled) {
      void handleSubmit();
      return;
    }
    setConfirmSend(true);
  };

  const openTemplatePrompt = () => {
    setTemplatePromptName(subject.trim() || "");
    setTemplatePrompt(true);
  };

  const saveAsTemplate = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    setSubjectFieldError(false);
    setNameFieldError(false);
    try {
      if (subject.trim().length < 3) {
        markSubjectMissing("Add a subject of at least 3 characters, then save it as a template.");
      }
      if (blocks.length === 0) throw new Error("Add at least one block to the email.");
      const trimmedName = templatePromptName.trim();
      if (!trimmedName) throw new Error("Give the template a name.");
      await createTemplate({ name: trimmedName, subject, blocks, design, footer });
      setTemplatePrompt(false);
      setNotice("Saved as a reusable template. Start from it next time in Templates.");
    } catch (templateError) {
      setError(formatErrorMessage(templateError, "Could not save this template."));
      setBusy(null);
    }
  };

  return (
    <div className="email-builder-overlay" role="dialog" aria-modal="true" aria-label="Email template builder">
      <div className="email-builder">
        <header className="email-builder-topbar">
          <div className="email-builder-topbar-left">
            <button type="button" className="email-builder-icon-btn" onClick={onClose} aria-label="Close builder">
              <X size={18} />
            </button>
            <div className="email-builder-titles">
              <span className="email-builder-eyebrow">
                {isTemplate ? (initial.templateId ? "Edit template" : "New template") : initial.id ? "Edit email" : "New email"}
              </span>
              {isTemplate ? (
                <input
                  className={`email-builder-subject${nameFieldError ? " field-invalid" : ""}`}
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  maxLength={80}
                  placeholder="Template name"
                  aria-invalid={nameFieldError || undefined}
                  onChange={event => {
                    setName(event.target.value);
                    setNameFieldError(false);
                  }}
                  disabled={!canManage}
                />
              ) : (
                <input
                  className={`email-builder-subject${subjectFieldError ? " field-invalid" : ""}`}
                  ref={subjectInputRef}
                  type="text"
                  value={subject}
                  maxLength={140}
                  placeholder="Subject line"
                  aria-invalid={subjectFieldError || undefined}
                  onChange={event => {
                    setSubject(event.target.value);
                    setSubjectFieldError(false);
                  }}
                  disabled={!canManage}
                />
              )}
              {isTemplate && nameFieldError && (
                <span className="email-builder-subject-error" role="alert">
                  Give the template a name.
                </span>
              )}
              {!isTemplate && subjectFieldError && (
                <span className="email-builder-subject-error" role="alert">
                  Add a subject of at least 3 characters.
                </span>
              )}
            </div>
          </div>
          <div className="email-builder-topbar-right">
            <div className="email-builder-device" role="group" aria-label="Preview width">
              <button
                type="button"
                className={device === "desktop" ? "active" : ""}
                onClick={() => setDevice("desktop")}
                aria-label="Desktop preview"
              >
                <Monitor size={16} />
              </button>
              <button
                type="button"
                className={device === "mobile" ? "active" : ""}
                onClick={() => setDevice("mobile")}
                aria-label="Mobile preview"
              >
                <Smartphone size={16} />
              </button>
            </div>
            {isTemplate ? (
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleSaveDraft()} disabled={readOnly}>
                {busy === "save" ? "Saving…" : "Save template"}
              </button>
            ) : (
              <>
                <button type="button" className="figma-notifications-btn-secondary" onClick={openTemplatePrompt} disabled={readOnly}>
                  Save as template
                </button>
                <button type="button" className="figma-notifications-btn-secondary" onClick={() => void handleSaveDraft()} disabled={readOnly}>
                  {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                <button type="button" className="figma-notifications-btn-primary" onClick={requestSubmit} disabled={readOnly}>
                  {busy === "send" ? "Working…" : scheduleEnabled ? "Schedule email" : "Send now"}
                </button>
              </>
            )}
          </div>
        </header>

        {notice && (
          <div className="figma-notifications-banner">
            <span>{notice}</span>
            <button type="button" className="figma-notifications-banner-close" onClick={() => setNotice(null)} aria-label="Dismiss notice">
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div className="figma-notifications-banner error" role="alert">
            <span>{error}</span>
            <button type="button" className="figma-notifications-banner-close" onClick={() => setError(null)} aria-label="Dismiss error">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="email-builder-body">
          <aside className="email-builder-library">
            <div className="email-builder-panel">
              <h3>Add a block</h3>
              <div className="email-builder-palette">
                {BLOCK_ORDER.map(type => {
                  const Icon = BLOCK_ICONS[type];
                  return (
                    <button key={type} type="button" onClick={() => addBlock(type)} disabled={readOnly}>
                      <Icon size={16} />
                      <span>{EMAIL_BLOCK_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="email-builder-panel email-builder-panel-grow">
              <h3>Layout</h3>
              {blocks.length === 0 ? (
                <p className="email-builder-empty">No blocks yet. Add one to start building the email.</p>
              ) : (
                <ul className="email-builder-outline">
                  {blocks.map((block, index) => (
                    <li
                      key={block.id}
                      className={`${block.id === selectedId ? "selected" : ""} ${dragIndex === index ? "dragging" : ""}`}
                      draggable={!readOnly}
                      onDragStart={() => {
                        dragFrom.current = index;
                        setDragIndex(index);
                      }}
                      onDragOver={event => event.preventDefault()}
                      onDrop={() => dropBlock(index)}
                      onDragEnd={() => {
                        dragFrom.current = null;
                        setDragIndex(null);
                      }}
                    >
                      <button type="button" className="email-builder-outline-main" onClick={() => setSelectedId(block.id)}>
                        <span className="email-builder-outline-index">{EMAIL_BLOCK_LABELS[block.type]}</span>
                        <span className="email-builder-outline-text">{outlineText(block)}</span>
                      </button>
                      <div className="email-builder-outline-tools">
                        <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0 || readOnly} aria-label="Move up">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1 || readOnly} aria-label="Move down">
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" onClick={() => duplicateBlock(block.id)} disabled={readOnly} aria-label="Duplicate block">
                          <Copy size={14} />
                        </button>
                        <button type="button" onClick={() => removeBlock(block.id)} disabled={readOnly} aria-label="Delete block">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={`email-builder-outline-jump ${selectedId === null ? "active" : ""}`}
                onClick={() => setSelectedId(null)}
              >
                <Settings2 size={15} />
                <span>Email settings and footer</span>
              </button>
            </div>
          </aside>

          <main className="email-builder-canvas">
            <div className={`email-builder-frame ${device}`}>
              <iframe title="Email preview" srcDoc={previewHtml} />
            </div>
          </main>

          <aside className="email-builder-inspector">
            {selected ? (
              <BlockInspector
                block={selected}
                readOnly={readOnly}
                uploading={busy === "upload"}
                onUpdate={patch => updateBlock(selected.id, patch)}
                onUpload={file => void uploadImage(selected.id, file)}
                onDelete={() => removeBlock(selected.id)}
                onDeselect={() => setSelectedId(null)}
              />
            ) : (
              <div className="email-builder-panel">
                <h3>Email settings</h3>

                {isTemplate ? (
                  <div className="figma-notifications-field">
                    <label>
                      Default subject <span className="figma-notifications-required">*</span>
                    </label>
                    <input
                      className={subjectFieldError ? "field-invalid" : ""}
                      ref={subjectInputRef}
                      type="text"
                      value={subject}
                      maxLength={140}
                      placeholder="Subject new emails start with"
                      aria-invalid={subjectFieldError || undefined}
                      onChange={event => {
                        setSubject(event.target.value);
                        setSubjectFieldError(false);
                      }}
                      disabled={!canManage}
                    />
                    {subjectFieldError && (
                      <span className="figma-notifications-field-error" role="alert">
                        Add a default subject of at least 3 characters.
                      </span>
                    )}
                    <span className="figma-notifications-field-hint">
                      New emails built from this template start with this subject. The sender can change it before sending.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="figma-notifications-field">
                      <label>Audience</label>
                      <div className="figma-notifications-select-wrap">
                        <select value={selectedAudienceValue} onChange={event => chooseAudience(event.target.value)} disabled={!canManage}>
                          {audienceOptions.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {singleMode && (
                        <input
                          type="email"
                          className="figma-notifications-single-email"
                          value={singleEmail}
                          placeholder="name@example.com"
                          onChange={event => setSingleEmail(event.target.value)}
                          disabled={!canManage}
                          aria-label="Recipient email address"
                        />
                      )}
                      <span className="figma-notifications-field-hint">
                        {singleMode
                          ? isEmailAddress(singleEmail)
                            ? "This email goes to just this one address."
                            : "Enter the email address to send to."
                          : audienceTotal === undefined
                            ? "Counting recipients…"
                            : `This will reach ${audienceTotal} recipient${audienceTotal === 1 ? "" : "s"}.`}
                      </span>
                    </div>

                    <label className="figma-notifications-check">
                      <input type="checkbox" checked={scheduleEnabled} onChange={event => setScheduleEnabled(event.target.checked)} disabled={!canManage} />
                      <span>Schedule for later</span>
                    </label>

                    {scheduleEnabled && (
                      <div className="figma-notifications-field">
                        <label>Send at</label>
                        <input type="datetime-local" value={scheduleAt} onChange={event => setScheduleAt(event.target.value)} disabled={!canManage} />
                      </div>
                    )}
                  </>
                )}

                <h3>Layout</h3>
                <div className="email-builder-grid-2">
                  <div className="figma-notifications-field">
                    <label>Content width</label>
                    <input
                      type="number"
                      min={480}
                      max={720}
                      step={20}
                      value={design.width}
                      onChange={event => setDesign(prev => ({ ...prev, width: Number(event.target.value) || prev.width }))}
                      disabled={!canManage}
                    />
                  </div>
                  <div className="figma-notifications-field">
                    <label>Side padding</label>
                    <input
                      type="number"
                      min={16}
                      max={72}
                      step={4}
                      value={design.padding}
                      onChange={event => setDesign(prev => ({ ...prev, padding: Number(event.target.value) || prev.padding }))}
                      disabled={!canManage}
                    />
                  </div>
                </div>
                <div className="email-builder-grid-2">
                  <div className="figma-notifications-field">
                    <label>Page background</label>
                    <div className="email-builder-color">
                      <input
                        type="color"
                        value={design.background}
                        onChange={event => setDesign(prev => ({ ...prev, background: event.target.value }))}
                        disabled={!canManage}
                      />
                      <span>{design.background}</span>
                    </div>
                  </div>
                  <div className="figma-notifications-field">
                    <label>Card background</label>
                    <div className="email-builder-color">
                      <input
                        type="color"
                        value={design.contentBackground}
                        onChange={event => setDesign(prev => ({ ...prev, contentBackground: event.target.value }))}
                        disabled={!canManage}
                      />
                      <span>{design.contentBackground}</span>
                    </div>
                  </div>
                </div>

                <FooterEditor
                  footer={footer}
                  readOnly={!canManage}
                  onChange={patch => setFooter(prev => ({ ...prev, ...patch }))}
                />

                <p className="figma-notifications-field-hint">
                  Select a block on the left to edit its text, links, images and alignment. Drag blocks to reorder them.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {!isTemplate && confirmSend && (
        <div className="email-builder-confirm" role="dialog" aria-modal="true" aria-label="Confirm send">
          <div className="email-builder-confirm-card">
            <h3>Send this email now?</h3>
            <p>
              "{subject.trim() || "Untitled email"}" will be sent to {audienceTotal === undefined ? "the selected audience" : `${audienceTotal} recipient${audienceTotal === 1 ? "" : "s"}`}. This cannot be undone.
            </p>
            <div className="email-builder-confirm-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setConfirmSend(false)}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleSubmit()}>
                Send now
              </button>
            </div>
          </div>
        </div>
      )}

      {!isTemplate && templatePrompt && (
        <div className="email-builder-confirm" role="dialog" aria-modal="true" aria-label="Save as template">
          <div className="email-builder-confirm-card">
            <h3>Save as a reusable template</h3>
            <p>This saves the current layout, images and footer so you can start a new email from it later.</p>
            <div className="figma-notifications-field">
              <label>Template name</label>
              <input
                type="text"
                value={templatePromptName}
                maxLength={80}
                placeholder="e.g. Weekly digest"
                onChange={event => setTemplatePromptName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="email-builder-confirm-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setTemplatePrompt(false)}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void saveAsTemplate()} disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function outlineText(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return block.text.trim() || "Empty";
    case "image":
      return block.url ? block.alt.trim() || block.url : "No image selected";
    case "button":
      return block.label.trim() || "Button";
    case "divider":
      return "Divider";
    case "spacer":
      return `${block.size[0].toUpperCase()}${block.size.slice(1)} space`;
  }
}

function AlignPicker({ value, onChange, disabled }: { value: EmailAlign; onChange: (value: EmailAlign) => void; disabled?: boolean }) {
  const options: { value: EmailAlign; icon: typeof AlignLeft; label: string }[] = [
    { value: "left", icon: AlignLeft, label: "Align left" },
    { value: "center", icon: AlignCenter, label: "Align centre" },
    { value: "right", icon: AlignRight, label: "Align right" },
  ];
  return (
    <div className="email-builder-align" role="group" aria-label="Alignment">
      {options.map(option => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
            aria-label={option.label}
            disabled={disabled}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

interface FooterEditorProps {
  footer: EmailFooter;
  readOnly: boolean;
  onChange: (patch: Partial<EmailFooter>) => void;
}

// The footer is shared by every block-based email, so its copy and links are
// edited here rather than as a block. Layout controls the alignment and whether
// the links sit in a row or stack on their own lines.
function FooterEditor({ footer, readOnly, onChange }: FooterEditorProps) {
  const links = footer.links;
  const replaceLink = (index: number, patch: Partial<EmailFooterLink>) => {
    onChange({ links: links.map((link, i) => (i === index ? { ...link, ...patch } : link)) });
  };
  const addLink = () => {
    if (links.length >= 6) return;
    onChange({ links: [...links, { label: "", href: "" }] });
  };
  const removeLink = (index: number) => onChange({ links: links.filter((_, i) => i !== index) });
  const moveLink = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange({ links: next });
  };

  return (
    <div className="email-builder-footer-editor">
      <h3>Footer</h3>

      <div className="figma-notifications-field">
        <label>Brand name</label>
        <input type="text" value={footer.brand} maxLength={60} placeholder="Passenger" onChange={event => onChange({ brand: event.target.value })} disabled={readOnly} />
      </div>

      <div className="figma-notifications-field">
        <label>Tagline</label>
        <input
          type="text"
          value={footer.tagline}
          maxLength={160}
          placeholder="Good things move with people."
          onChange={event => onChange({ tagline: event.target.value })}
          disabled={readOnly}
        />
      </div>

      <div className="email-builder-grid-2">
        <div className="figma-notifications-field">
          <label>Alignment</label>
          <AlignPicker value={footer.align} onChange={value => onChange({ align: value })} disabled={readOnly} />
        </div>
        <div className="figma-notifications-field">
          <label>Links layout</label>
          <div className="figma-notifications-select-wrap">
            <select
              value={footer.linkLayout}
              onChange={event => onChange({ linkLayout: event.target.value as EmailFooter["linkLayout"] })}
              disabled={readOnly}
            >
              <option value="inline">In a row</option>
              <option value="stacked">Stacked</option>
            </select>
            <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="figma-notifications-field">
        <label>Links</label>
        {links.length === 0 ? (
          <p className="figma-notifications-field-hint">No footer links yet.</p>
        ) : (
          <ul className="email-builder-footer-links">
            {links.map((link, index) => (
              <li key={index}>
                <div className="email-builder-footer-link-fields">
                  <input
                    type="text"
                    value={link.label}
                    maxLength={40}
                    placeholder="Label"
                    onChange={event => replaceLink(index, { label: event.target.value })}
                    disabled={readOnly}
                  />
                  <input
                    type="url"
                    value={link.href}
                    placeholder="https://…"
                    onChange={event => replaceLink(index, { href: event.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="email-builder-footer-link-tools">
                  <button type="button" onClick={() => moveLink(index, -1)} disabled={index === 0 || readOnly} aria-label="Move link up">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveLink(index, 1)} disabled={index === links.length - 1 || readOnly} aria-label="Move link down">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeLink(index)} disabled={readOnly} aria-label="Remove link">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="figma-notifications-btn-secondary email-builder-footer-add"
          onClick={addLink}
          disabled={readOnly || links.length >= 6}
        >
          Add link
        </button>
      </div>

      <div className="figma-notifications-field">
        <label>Footer note</label>
        <textarea
          rows={3}
          value={footer.reason}
          maxLength={300}
          placeholder="Why the recipient is getting this."
          onChange={event => onChange({ reason: event.target.value })}
          disabled={readOnly}
        />
      </div>

      <div className="figma-notifications-field">
        <label>Address</label>
        <input
          type="text"
          value={footer.address}
          maxLength={200}
          placeholder="Passenger, Jos, Plateau State, Nigeria."
          onChange={event => onChange({ address: event.target.value })}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

interface BlockInspectorProps {
  block: EmailBlock;
  readOnly: boolean;
  uploading: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

function BlockInspector({ block, readOnly, uploading, onUpdate, onUpload, onDelete, onDeselect }: BlockInspectorProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="email-builder-panel">
      <div className="email-builder-inspector-head">
        <h3>{EMAIL_BLOCK_LABELS[block.type]}</h3>
        <button type="button" className="email-builder-link" onClick={onDeselect}>
          Email settings
        </button>
      </div>

      {block.type === "heading" && (
        <>
          <div className="figma-notifications-field">
            <label>Heading text</label>
            <input type="text" value={block.text} maxLength={160} onChange={event => onUpdate({ text: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Size</label>
            <div className="figma-notifications-select-wrap">
              <select value={block.level} onChange={event => onUpdate({ level: event.target.value })} disabled={readOnly}>
                <option value="h1">Large</option>
                <option value="h2">Medium</option>
                <option value="h3">Small</option>
              </select>
              <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="figma-notifications-field">
            <label>Alignment</label>
            <AlignPicker value={block.align} onChange={value => onUpdate({ align: value })} disabled={readOnly} />
          </div>
        </>
      )}

      {block.type === "paragraph" && (
        <>
          <div className="figma-notifications-field">
            <label>Text</label>
            <textarea rows={6} value={block.text} maxLength={2500} onChange={event => onUpdate({ text: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Alignment</label>
            <AlignPicker value={block.align} onChange={value => onUpdate({ align: value })} disabled={readOnly} />
          </div>
        </>
      )}

      {block.type === "image" && (
        <>
          <div className="figma-notifications-field">
            <label>Image</label>
            {block.url ? (
              <div className="email-builder-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.url} alt={block.alt} />
              </div>
            ) : (
              <p className="figma-notifications-field-hint">No image selected yet.</p>
            )}
            <div className="email-builder-upload-row">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => fileInput.current?.click()} disabled={readOnly || uploading}>
                <Upload size={15} />
                {uploading ? "Uploading…" : "Upload image"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                  event.target.value = "";
                }}
              />
            </div>
            <input
              type="url"
              value={block.url}
              placeholder="https://…"
              onChange={event => onUpdate({ url: event.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="figma-notifications-field">
            <label>Description (alt text)</label>
            <input type="text" value={block.alt} maxLength={300} onChange={event => onUpdate({ alt: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Link when clicked (optional)</label>
            <input type="url" value={block.href ?? ""} placeholder="https://…" onChange={event => onUpdate({ href: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Width</label>
            <div className="figma-notifications-select-wrap">
              <select value={block.width} onChange={event => onUpdate({ width: event.target.value })} disabled={readOnly}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="full">Full width</option>
              </select>
              <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="figma-notifications-field">
            <label>Alignment</label>
            <AlignPicker value={block.align} onChange={value => onUpdate({ align: value })} disabled={readOnly} />
          </div>
        </>
      )}

      {block.type === "button" && (
        <>
          <div className="figma-notifications-field">
            <label>Button label</label>
            <input type="text" value={block.label} maxLength={60} onChange={event => onUpdate({ label: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Link</label>
            <input type="url" value={block.href} placeholder="https://…" onChange={event => onUpdate({ href: event.target.value })} disabled={readOnly} />
          </div>
          <div className="figma-notifications-field">
            <label>Style</label>
            <div className="figma-notifications-select-wrap">
              <select value={block.variant} onChange={event => onUpdate({ variant: event.target.value })} disabled={readOnly}>
                <option value="primary">Filled</option>
                <option value="secondary">Outlined</option>
              </select>
              <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="figma-notifications-field">
            <label>Alignment</label>
            <AlignPicker value={block.align} onChange={value => onUpdate({ align: value })} disabled={readOnly} />
          </div>
        </>
      )}

      {block.type === "divider" && (
        <p className="figma-notifications-field-hint">A divider draws a thin line to separate sections.</p>
      )}

      {block.type === "spacer" && (
        <div className="figma-notifications-field">
          <label>Spacing</label>
          <div className="figma-notifications-select-wrap">
            <select value={block.size} onChange={event => onUpdate({ size: event.target.value })} disabled={readOnly}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
            <svg className="figma-notifications-select-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      <div className="email-builder-inspector-foot">
        <button type="button" className="email-builder-danger" onClick={onDelete} disabled={readOnly}>
          <Trash2 size={15} />
          Delete block
        </button>
        <span className="email-builder-hint">
          <Link2 size={14} />
          Links open in a new tab
        </span>
      </div>
    </div>
  );
}
