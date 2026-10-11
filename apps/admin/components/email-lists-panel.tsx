"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { EMAIL_AUDIENCES, formatErrorMessage } from "@passenger/core";

export interface EmailListSummaryRow {
  id: Id<"emailLists">;
  name: string;
  description?: string;
  memberCount: number;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

export interface ListMemberRow {
  id: Id<"emailListMembers">;
  email: string;
  name?: string;
  isUser: boolean;
  addedAt: number;
}

interface ListEditorState {
  mode: "create" | "edit";
  list?: EmailListSummaryRow;
}

const MAX_BATCH = 500;

function prettyDate(ms: number) {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseBatch(text: string): { email: string; name?: string }[] {
  const members: { email: string; name?: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    if (comma !== -1) {
      const email = line.slice(0, comma).trim();
      const name = line.slice(comma + 1).trim();
      members.push(name ? { email, name } : { email });
    } else {
      members.push({ email: line });
    }
  }
  return members;
}

export function EmailListsPanel({ canManage }: { canManage: boolean }) {
  const lists = useQuery(api.emailLists.list) as EmailListSummaryRow[] | undefined;
  const suppressed = useQuery(api.emailContacts.suppressed) as { email: string; unsubscribedAt: number }[] | undefined;

  const create = useMutation(api.emailLists.create);
  const update = useMutation(api.emailLists.update);
  const remove = useMutation(api.emailLists.remove);
  const addMembers = useMutation(api.emailLists.addMembers);
  const removeMember = useMutation(api.emailLists.removeMember);
  const importAudience = useMutation(api.emailLists.importAudience);
  const restoreEmail = useMutation(api.emailContacts.restoreEmail);

  const [editor, setEditor] = useState<ListEditorState | null>(null);
  const [managing, setManaging] = useState<EmailListSummaryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailListSummaryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Manage-members modal state
  const detail = useQuery(api.emailLists.get, managing ? { id: managing.id } : "skip") as
    | { id: Id<"emailLists">; name: string; memberCount: number; members: ListMemberRow[]; truncated: boolean }
    | undefined;
  const [singleEmail, setSingleEmail] = useState("");
  const [singleName, setSingleName] = useState("");
  const [batchText, setBatchText] = useState("");
  const [importAudienceValue, setImportAudienceValue] = useState<string>(EMAIL_AUDIENCES[0]);
  const [manageNote, setManageNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [listBusy, setListBusy] = useState(false);

  // Editor modal state
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);

  const openCreate = () => {
    setBanner(null);
    setEditorName("");
    setEditorDescription("");
    setEditorError(null);
    setEditor({ mode: "create" });
  };

  const openEdit = (list: EmailListSummaryRow) => {
    setBanner(null);
    setEditorName(list.name);
    setEditorDescription(list.description ?? "");
    setEditorError(null);
    setEditor({ mode: "edit", list });
  };

  const openManage = (list: EmailListSummaryRow) => {
    setBanner(null);
    setSingleEmail("");
    setSingleName("");
    setBatchText("");
    setImportAudienceValue(EMAIL_AUDIENCES[0]);
    setManageNote(null);
    setManaging(list);
  };

  const handleSaveList = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setEditorError(null);
    try {
      const name = editorName.trim();
      const description = editorDescription.trim() || undefined;
      if (editor?.mode === "edit" && editor.list) {
        await update({ id: editor.list.id, name, description });
        setBanner({ tone: "success", text: "List updated" });
      } else {
        await create({ name, description });
        setBanner({ tone: "success", text: "List created" });
      }
      setEditor(null);
    } catch (error) {
      setEditorError(formatErrorMessage(error, "Could not save this list."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setBanner(null);
    try {
      await remove({ id: deleteTarget.id });
      setDeleteTarget(null);
      setBanner({ tone: "success", text: "List deleted" });
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not delete this list.") });
    } finally {
      setBusy(false);
    }
  };

  const handleAddSingle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!managing) return;
    if (!singleEmail.trim()) {
      setManageNote({ tone: "error", text: "Enter an email address." });
      return;
    }
    setListBusy(true);
    setManageNote(null);
    try {
      const result = (await addMembers({ listId: managing.id, members: [{ email: singleEmail.trim(), name: singleName.trim() || undefined }] })) as { added: number; skipped: number };
      setSingleEmail("");
      setSingleName("");
      setManageNote({ tone: "success", text: result.added === 1 ? "Address added to the list" : `Added ${result.added} address${result.added === 1 ? "" : "es"}${result.skipped ? ` (${result.skipped} already present)` : ""}` });
    } catch (error) {
      setManageNote({ tone: "error", text: formatErrorMessage(error, "Could not add this address.") });
    } finally {
      setListBusy(false);
    }
  };

  const handleAddBatch = async () => {
    if (!managing) return;
    const members = parseBatch(batchText);
    if (members.length === 0) {
      setManageNote({ tone: "error", text: "Paste at least one address, one per line." });
      return;
    }
    if (members.length > MAX_BATCH) {
      setManageNote({ tone: "error", text: `Add up to ${MAX_BATCH} addresses at a time.` });
      return;
    }
    setListBusy(true);
    setManageNote(null);
    try {
      const result = (await addMembers({ listId: managing.id, members })) as { added: number; skipped: number };
      setBatchText("");
      setManageNote({ tone: "success", text: `Added ${result.added} of ${members.length} address${members.length === 1 ? "" : "es"}${result.skipped ? ` (${result.skipped} already present)` : ""}` });
    } catch (error) {
      setManageNote({ tone: "error", text: formatErrorMessage(error, "Could not add those addresses.") });
    } finally {
      setListBusy(false);
    }
  };

  const handleImportAudience = async () => {
    if (!managing) return;
    setListBusy(true);
    setManageNote(null);
    try {
      const result = (await importAudience({ listId: managing.id, audience: importAudienceValue })) as { added: number; skipped: number };
      setManageNote({ tone: "success", text: result.added === 0 ? `Everyone in ${importAudienceValue} was already on the list` : `Imported ${result.added} of ${importAudienceValue.toLocaleLowerCase()}${result.skipped ? ` (${result.skipped} already present)` : ""}` });
    } catch (error) {
      setManageNote({ tone: "error", text: formatErrorMessage(error, "Could not import that audience.") });
    } finally {
      setListBusy(false);
    }
  };

  const handleRemoveMember = async (member: ListMemberRow) => {
    if (!managing) return;
    setListBusy(true);
    setManageNote(null);
    try {
      await removeMember({ memberId: member.id });
    } catch (error) {
      setManageNote({ tone: "error", text: formatErrorMessage(error, "Could not remove this address.") });
    } finally {
      setListBusy(false);
    }
  };

  const handleRestore = async (email: string) => {
    setBusy(true);
    setBanner(null);
    try {
      await restoreEmail({ email });
      setBanner({ tone: "success", text: `${email} can receive broadcasts again` });
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not restore this address.") });
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
        <button type="button" className="figma-notifications-send-btn" onClick={openCreate} disabled={!canManage}>
          New list
        </button>
        {!canManage && (
          <p className="figma-notifications-view-note" role="status">You can view lists, but creating and editing them requires the notifications.manage permission.</p>
        )}
      </div>

      <div className="figma-notifications-table-card">
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>List name</th>
              <th>Members</th>
              <th>Created by</th>
              <th>Updated</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists === undefined ? (
              <tr>
                <td colSpan={5} className="figma-empty-row">Loading lists…</td>
              </tr>
            ) : lists.length === 0 ? (
              <tr>
                <td colSpan={5} className="figma-empty-row">No email lists yet. Create one to reuse a group of addresses.</td>
              </tr>
            ) : (
              lists.map(list => (
                <tr key={list.id}>
                  <td>
                    <div className="email-list-name-cell">
                      <span className="font-medium">{list.name}</span>
                      {list.description && <span className="email-list-description">{list.description}</span>}
                    </div>
                  </td>
                  <td>
                    <span className="email-list-count"><Users size={14} />{list.memberCount}</span>
                  </td>
                  <td>{list.createdByName}</td>
                  <td>{prettyDate(list.updatedAt)}</td>
                  <td className="td-actions">
                    <div className="notif-row-actions">
                      <button type="button" className="figma-notifications-btn-primary notif-btn-sm" onClick={() => openManage(list)} disabled={!canManage}>
                        <UserPlus size={14} />
                        Manage
                      </button>
                      <button type="button" className="notif-row-btn" aria-label="Edit list" title="Edit" onClick={() => openEdit(list)} disabled={!canManage}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="notif-row-btn danger" aria-label="Delete list" title="Delete" onClick={() => setDeleteTarget(list)} disabled={!canManage}>
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

      <div className="figma-notifications-table-card">
        <div className="notif-panel-head">
          <div>
            <h3>Opted-out addresses</h3>
            <p className="figma-notifications-field-hint">These addresses unsubscribed from broadcast emails and are skipped automatically on future sends.</p>
          </div>
          <span className="email-list-count"><Users size={14} />{suppressed?.length ?? 0}</span>
        </div>
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Unsubscribed</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppressed === undefined ? (
              <tr>
                <td colSpan={3} className="figma-empty-row">Loading…</td>
              </tr>
            ) : suppressed.length === 0 ? (
              <tr>
                <td colSpan={3} className="figma-empty-row">No addresses have opted out of broadcasts.</td>
              </tr>
            ) : (
              suppressed.map(contact => (
                <tr key={contact.email}>
                  <td>{contact.email}</td>
                  <td>{prettyDate(contact.unsubscribedAt)}</td>
                  <td className="td-actions">
                    <button type="button" className="figma-notifications-btn-secondary notif-btn-sm" onClick={() => void handleRestore(contact.email)} disabled={!canManage || busy}>
                      Restore
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setEditor(null)}>
          <div className="figma-notifications-modal" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>{editor.mode === "edit" ? "Edit List" : "New Email List"}</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setEditor(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveList} className="figma-notifications-modal-form">
              <div className="figma-notifications-field">
                <label>List name</label>
                <input type="text" value={editorName} onChange={(event) => setEditorName(event.target.value)} placeholder="e.g. Launch supporters" required maxLength={80} />
              </div>
              <div className="figma-notifications-field">
                <label>Description <span className="figma-notifications-field-hint">(optional)</span></label>
                <textarea value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} placeholder="Why this list exists, so the next person knows who is on it." rows={3} maxLength={240} />
              </div>
              {editorError && <p className="figma-notifications-view-note" role="alert">{editorError}</p>}
              <div className="figma-notifications-modal-actions">
                <button type="button" className="figma-notifications-btn-secondary" onClick={() => setEditor(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="figma-notifications-btn-primary" disabled={busy}>
                  {busy ? "Saving…" : editor.mode === "edit" ? "Save changes" : "Create list"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managing && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setManaging(null)}>
          <div className="figma-notifications-modal figma-notifications-modal-lists" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>{managing.name}</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setManaging(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            {manageNote && (
              <div className={`figma-notifications-banner ${manageNote.tone}`} role={manageNote.tone === "error" ? "alert" : "status"}>
                <span>{manageNote.text}</span>
              </div>
            )}

            <div className="email-lists-manage-section">
              <h4>Add addresses</h4>
              <form onSubmit={handleAddSingle} className="email-lists-single-row">
                <div className="figma-notifications-field">
                  <label>Email</label>
                  <input type="email" value={singleEmail} onChange={(event) => setSingleEmail(event.target.value)} placeholder="name@email.com" />
                </div>
                <div className="figma-notifications-field">
                  <label>Name <span className="figma-notifications-field-hint">(optional)</span></label>
                  <input type="text" value={singleName} onChange={(event) => setSingleName(event.target.value)} placeholder="Jane Doe" />
                </div>
                <button type="submit" className="figma-notifications-btn-secondary notif-btn-sm" disabled={!canManage || listBusy}>
                  Add
                </button>
              </form>

              <div className="figma-notifications-field">
                <label>Add a batch</label>
                <textarea
                  value={batchText}
                  onChange={(event) => setBatchText(event.target.value)}
                  placeholder="One address per line, or: email, Full Name"
                  rows={4}
                />
              </div>
              <button type="button" className="figma-notifications-btn-secondary notif-btn-sm" onClick={() => void handleAddBatch()} disabled={!canManage || listBusy}>
                Add batch
              </button>

              <div className="email-lists-import-row">
                <div className="figma-notifications-select-wrap">
                  <select value={importAudienceValue} onChange={(event) => setImportAudienceValue(event.target.value)} disabled={!canManage || listBusy}>
                    {EMAIL_AUDIENCES.map(audience => (
                      <option key={audience} value={audience}>{audience}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="figma-notifications-btn-secondary notif-btn-sm" onClick={() => void handleImportAudience()} disabled={!canManage || listBusy}>
                  Import
                </button>
              </div>
              <p className="figma-notifications-field-hint">Import adds the matching Passenger accounts and waitlist signups to this list. Existing addresses are skipped.</p>
            </div>

            <div className="email-lists-manage-section">
              <div className="email-lists-members-head">
                <h4>Members</h4>
                <span className="email-list-count"><Users size={14} />{detail?.memberCount ?? managing.memberCount}</span>
              </div>
              {detail === undefined ? (
                <p className="figma-notifications-view-note">Loading members…</p>
              ) : detail.members.length === 0 ? (
                <p className="figma-notifications-view-note">No members yet. Add addresses above or import an audience.</p>
              ) : (
                <div className="email-lists-members-scroll">
                  {detail.members.map(member => (
                    <div className="email-lists-member-row" key={member.id}>
                      <div className="email-lists-member-main">
                        <span className="font-medium">{member.name ?? member.email}</span>
                        {member.name && <span className="email-list-description">{member.email}</span>}
                        <span className={`email-list-link-tag ${member.isUser ? "" : "is-external"}`}>{member.isUser ? "Passenger account" : "Outside address"}</span>
                      </div>
                      <button
                        type="button"
                        className="notif-row-btn danger"
                        aria-label={`Remove ${member.email}`}
                        title="Remove from list"
                        onClick={() => void handleRemoveMember(member)}
                        disabled={!canManage || listBusy}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {detail.truncated && (
                    <p className="figma-notifications-field-hint">Showing the most recent members. The full list is still used when sending.</p>
                  )}
                </div>
              )}
            </div>

            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setManaging(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
          <div className="figma-notifications-modal" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>Delete List</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="figma-notifications-view-note">
              Delete "{deleteTarget.name}" with {deleteTarget.memberCount} member{deleteTarget.memberCount === 1 ? "" : "s"}? This cannot be undone, and lists used by a sent or scheduled email cannot be deleted.
            </p>
            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? "Deleting…" : "Delete list"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}