"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, Pencil, Play, Trash2, X } from "lucide-react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { formatErrorMessage, renderEmailDocument, type EmailBlock, type EmailDesign, type EmailFooter } from "@passenger/core";

const EMAIL_APP_URL = "https://usepassenger.com";

export interface EmailTemplateRow {
  id: Id<"emailTemplates">;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  design: EmailDesign;
  footer?: EmailFooter;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailTemplatesPanelProps {
  canManage: boolean;
  onNew: () => void;
  onEdit: (template: EmailTemplateRow) => void;
  onUse: (template: EmailTemplateRow) => void;
}

function prettyDate(ms: number) {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function EmailTemplatesPanel({ canManage, onNew, onEdit, onUse }: EmailTemplatesPanelProps) {
  const templates = useQuery(api.emailTemplates.list) as EmailTemplateRow[] | undefined;
  const remove = useMutation(api.emailTemplates.remove);

  const [previewing, setPreviewing] = useState<EmailTemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const previewHtml = previewing
    ? renderEmailDocument({ subject: previewing.subject, blocks: previewing.blocks, design: previewing.design, footer: previewing.footer, appUrl: EMAIL_APP_URL }).html
    : "";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setBanner(null);
    try {
      await remove({ id: deleteTarget.id });
      setDeleteTarget(null);
      setBanner({ tone: "success", text: "Template deleted" });
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not delete this template.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="figma-notifications-tab-panel">
      {banner && (
        <div className={`figma-notifications-banner ${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"}>
          <span>{banner.text}</span>
          <button type="button" className="figma-notifications-banner-close" onClick={() => setBanner(null)} aria-label="Dismiss banner">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="figma-notifications-actions-bar">
        <button type="button" className="figma-notifications-send-btn" onClick={onNew} disabled={!canManage}>
          New template
        </button>
        {!canManage && (
          <p className="figma-notifications-view-note" role="status">You can view templates, but creating and editing them requires the notifications.manage permission.</p>
        )}
      </div>

      <div className="figma-notifications-table-card">
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>Template name</th>
              <th>Default subject</th>
              <th>Updated</th>
              <th>Created by</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates === undefined ? (
              <tr>
                <td colSpan={5} className="figma-empty-row">Loading templates…</td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="figma-empty-row">No templates saved yet</td>
              </tr>
            ) : (
              templates.map(template => (
                <tr key={template.id}>
                  <td className="font-medium">{template.name}</td>
                  <td>{template.subject}</td>
                  <td>{prettyDate(template.updatedAt)}</td>
                  <td>{template.createdByName}</td>
                  <td className="td-actions">
                    <div className="notif-row-actions">
                      <button type="button" className="figma-notifications-btn-primary notif-btn-sm" onClick={() => onUse(template)} disabled={!canManage}>
                        <Play size={14} />
                        Use
                      </button>
                      <button type="button" className="notif-row-btn" aria-label="Preview template" title="Preview" onClick={() => setPreviewing(template)}>
                        <Eye size={16} />
                      </button>
                      <button type="button" className="notif-row-btn" aria-label="Edit template" title="Edit" onClick={() => onEdit(template)} disabled={!canManage}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="notif-row-btn danger" aria-label="Delete template" title="Delete" onClick={() => setDeleteTarget(template)} disabled={!canManage}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewing && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setPreviewing(null)}>
          <div className="figma-notifications-modal figma-notifications-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>{previewing.name}</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setPreviewing(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="figma-notifications-view-body">
              <div className="figma-notifications-view-row">
                <span className="view-label">Default subject:</span>
                <span className="view-value font-medium">{previewing.subject}</span>
              </div>
            </div>
            <div className="figma-notifications-preview">
              <iframe title="Template preview" srcDoc={previewHtml} />
            </div>
            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setPreviewing(null)}>
                Close
              </button>
              {canManage && (
                <button
                  type="button"
                  className="figma-notifications-btn-primary"
                  onClick={() => { const template = previewing; setPreviewing(null); onEdit(template); }}
                >
                  Edit template
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="figma-notifications-modal" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>Delete Template</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="figma-notifications-view-note">
              Delete "{deleteTarget.name}"? This removes it for the whole team and cannot be undone.
            </p>
            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? "Deleting…" : "Delete template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}