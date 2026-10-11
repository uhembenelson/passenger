"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Download, Search, Trash2, X } from "lucide-react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { formatErrorMessage } from "@passenger/core";

export interface WaitlistSignupRow {
  id: Id<"waitlistSignups">;
  name: string;
  email: string;
  state: string;
  confirmationStatus: "pending" | "sent" | "failed";
  createdAt: number;
}

const CONFIRMATION: Record<WaitlistSignupRow["confirmationStatus"], { label: string; className: string }> = {
  sent: { label: "Confirmed", className: "status-sent" },
  pending: { label: "Pending", className: "status-scheduled" },
  failed: { label: "Not delivered", className: "status-failed" },
};

function prettyDate(ms: number) {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function EmailWaitlistPanel({ canManage }: { canManage: boolean }) {
  const signups = useQuery(api.adminWaitlist.list) as WaitlistSignupRow[] | undefined;
  const remove = useMutation(api.adminWaitlist.remove);

  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WaitlistSignupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => {
    if (!signups) return signups;
    const needle = query.trim().toLowerCase();
    if (!needle) return signups;
    return signups.filter(signup => `${signup.name} ${signup.email} ${signup.state}`.toLowerCase().includes(needle));
  }, [signups, query]);

  const exportCsv = () => {
    if (!filtered?.length) return;
    const header = ["Name", "Email", "State", "Confirmation", "Joined"].map(csvCell).join(",");
    const rows = filtered.map(signup =>
      [signup.name, signup.email, signup.state, CONFIRMATION[signup.confirmationStatus].label, prettyDate(signup.createdAt)].map(csvCell).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "passenger-waitlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setBanner(null);
    try {
      await remove({ id: deleteTarget.id });
      setBanner({ tone: "success", text: `Removed ${deleteTarget.email} from the waitlist` });
      setDeleteTarget(null);
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not remove this signup.") });
    } finally {
      setBusy(false);
    }
  };

  const total = signups?.length ?? 0;

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

      <div className="figma-notifications-actions-bar figma-waitlist-actions">
        <label className="figma-notifications-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="Search the waitlist"
            placeholder="Search name, email or state"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="figma-notifications-btn-secondary notif-btn-sm"
          onClick={exportCsv}
          disabled={!filtered?.length}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      <div className="figma-notifications-table-card">
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>State</th>
              <th>Joined</th>
              <th>Confirmation</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {signups === undefined ? (
              <tr>
                <td colSpan={6} className="figma-empty-row">Loading the waitlist…</td>
              </tr>
            ) : filtered && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="figma-empty-row">
                  {total === 0 ? "No waitlist signups yet" : "No signups match your search"}
                </td>
              </tr>
            ) : (
              filtered?.map(signup => (
                <tr key={signup.id}>
                  <td className="font-medium">{signup.name}</td>
                  <td>{signup.email}</td>
                  <td>{signup.state}</td>
                  <td>{prettyDate(signup.createdAt)}</td>
                  <td>
                    <span className={`figma-notifications-status-tag ${CONFIRMATION[signup.confirmationStatus].className}`}>
                      {CONFIRMATION[signup.confirmationStatus].label}
                    </span>
                  </td>
                  <td className="td-actions">
                    <div className="notif-row-actions">
                      <button
                        type="button"
                        className="notif-row-btn danger"
                        aria-label={`Remove ${signup.email}`}
                        title="Remove from waitlist"
                        onClick={() => setDeleteTarget(signup)}
                        disabled={!canManage}
                      >
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

      {signups !== undefined && total > 0 && (
        <p className="figma-notifications-view-note" role="status">
          {filtered && filtered.length !== total
            ? `Showing ${filtered.length} of ${total} signups.`
            : `${total} ${total === 1 ? "person has" : "people have"} joined the waitlist.`}
          {canManage ? "" : " Removing signups requires the notifications.manage permission."}
        </p>
      )}

      {deleteTarget && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="figma-notifications-modal" onClick={(event) => event.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>Remove Signup</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="figma-notifications-view-note">
              Remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) from the waitlist? They will no longer be reachable as a waitlist audience, and this cannot be undone.
            </p>
            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? "Removing…" : "Remove signup"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
