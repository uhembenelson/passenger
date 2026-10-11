"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ChevronDown, MoreVertical, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { DEFAULT_EMAIL_DESIGN, DEFAULT_EMAIL_FOOTER, EMAIL_AUDIENCES, formatErrorMessage, renderEmailDocument, type EmailBlock, type EmailDesign, type EmailFooter } from "@passenger/core";
import { EmailTemplateBuilder, starterBlocks, type EmailTemplateDraft } from "./email-template-builder";
import { EmailTemplatesPanel, type EmailTemplateRow } from "./email-templates-panel";
import { EmailListsPanel } from "./email-lists-panel";
import { EmailWaitlistPanel } from "./email-waitlist-panel";

const EMAIL_APP_URL = "https://usepassenger.com";

type AdminEmailStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

interface AdminEmailRow {
  id: Id<"adminEmails">;
  subject: string;
  blocks: EmailBlock[];
  design?: EmailDesign;
  footer?: EmailFooter;
  audience: string;
  listId?: Id<"emailLists">;
  status: AdminEmailStatus;
  scheduledFor?: number;
  sentAt?: number;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  lastError?: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

const EMAIL_STATUS_LABELS: Record<AdminEmailStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export interface AdminNotification {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "Push" | "Email" | "In-App";
  audience: string;
  status: "Scheduled" | "Sent";
  message: string;
}

const INITIAL_NOTIFICATIONS: AdminNotification[] = [
  {
    id: "notif-1",
    title: "System Update Alert",
    date: "12/02/2025",
    time: "10:00 AM",
    type: "Push",
    audience: "All users",
    status: "Scheduled",
    message: "Our system will undergo maintenance at 12 AM",
  },
  {
    id: "notif-2",
    title: "Weekly Summary",
    date: "12/02/2025",
    time: "10:00 AM",
    type: "Email",
    audience: "Tier-1 users",
    status: "Sent",
    message: "Your weekly package delivery statistics are now ready to review.",
  },
  {
    id: "notif-3",
    title: "In-App Feature Notice",
    date: "12/02/2025",
    time: "10:00 AM",
    type: "In-App",
    audience: "Tier-2 users",
    status: "Sent",
    message: "Check out real-time traveller route tracking on your active deliveries.",
  },
];

export function NotificationsManagement({ canManage = true }: { canManage?: boolean }) {
  const [tab, setTab] = useState<"notifications" | "emails">("notifications");
  return (
    <div className="figma-notifications-page">
      <div className="figma-notifications-header-row">
        <div className="figma-notifications-header-left">
          <h1>Notifications</h1>
        </div>
      </div>

      <div className="figma-notifications-tabs" role="tablist" aria-label="Notification channels">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notifications"}
          className={tab === "notifications" ? "active" : ""}
          onClick={() => setTab("notifications")}
        >
          Notifications
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "emails"}
          className={tab === "emails" ? "active" : ""}
          onClick={() => setTab("emails")}
        >
          Emails
        </button>
      </div>

      {tab === "notifications" ? <NotificationsTab /> : <EmailsTab canManage={canManage} />}
    </div>
  );
}

function NotificationsTab() {
  const [notifications, setNotifications] = useState<AdminNotification[]>(INITIAL_NOTIFICATIONS);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Success banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [viewItem, setViewItem] = useState<AdminNotification | null>(null);
  const [editItem, setEditItem] = useState<AdminNotification | null>(null);

  // Form State for Add / Schedule
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<"Push" | "Email" | "In-App">("Push");
  const [formAudience, setFormAudience] = useState("All users");
  const [formMessage, setFormMessage] = useState("");
  const [scheduleDate, setScheduleDate] = useState("12/02/2025");
  const [scheduleTime, setScheduleTime] = useState("10:00 AM");

  // Form State for Edit
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<"Push" | "Email" | "In-App">("Push");
  const [editAudience, setEditAudience] = useState("All users");
  const [editMessage, setEditMessage] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editStatus, setEditStatus] = useState<"Scheduled" | "Sent">("Scheduled");

  // Close menus on outside click. Clicks inside a row's menu wrapper (the
  // trigger or the open menu itself) must not reset the state, otherwise the
  // same click that opens the menu would immediately close it again.
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target && target.closest(".figma-notifications-menu-wrapper")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // Format current date and time
  const getNowFormatted = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateStr = `${day}/${month}/${year}`;
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return { dateStr, timeStr };
  };

  const handleOpenAddModal = () => {
    setFormTitle("");
    setFormType("Push");
    setFormAudience("All users");
    setFormMessage("");
    const { dateStr, timeStr } = getNowFormatted();
    setScheduleDate(dateStr);
    setScheduleTime(timeStr);
    setIsAddModalOpen(true);
  };

  // Direct "Send Now" from Add Notification modal
  const handleSendNowDirect = (e: React.FormEvent) => {
    e.preventDefault();
    const { dateStr, timeStr } = getNowFormatted();
    const newNotif: AdminNotification = {
      id: `notif-${Date.now()}`,
      title: formTitle.trim() || "System Notification",
      type: formType,
      audience: formAudience,
      message: formMessage.trim(),
      date: dateStr,
      time: timeStr,
      status: "Sent",
    };

    setNotifications((prev) => [newNotif, ...prev]);
    setIsAddModalOpen(false);
    setSuccessBanner("Notification Sent Successfully");
  };

  // Move from Add modal to Schedule modal
  const handleProceedToSchedule = () => {
    setIsAddModalOpen(false);
    setIsScheduleModalOpen(true);
  };

  // Submit from Schedule modal
  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const newNotif: AdminNotification = {
      id: `notif-${Date.now()}`,
      title: formTitle.trim() || "System Notification",
      type: formType,
      audience: formAudience,
      message: formMessage.trim(),
      date: scheduleDate.trim() || "12/02/2025",
      time: scheduleTime.trim() || "10:00 AM",
      status: "Scheduled",
    };

    setNotifications((prev) => [newNotif, ...prev]);
    setIsScheduleModalOpen(false);
    setSuccessBanner("Notification Scheduled Successfully");
  };

  // Handle View
  const handleView = (notif: AdminNotification) => {
    setViewItem(notif);
    setOpenMenuId(null);
  };

  // Handle Edit Start
  const handleStartEdit = (notif: AdminNotification) => {
    setEditItem(notif);
    setEditTitle(notif.title);
    setEditType(notif.type);
    setEditAudience(notif.audience);
    setEditMessage(notif.message);
    setEditDate(notif.date);
    setEditTime(notif.time);
    setEditStatus(notif.status);
    setOpenMenuId(null);
  };

  // Handle Edit Save
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === editItem.id
          ? {
              ...item,
              title: editTitle.trim(),
              type: editType,
              audience: editAudience,
              message: editMessage.trim(),
              date: editDate.trim(),
              time: editTime.trim(),
              status: editStatus,
            }
          : item
      )
    );
    setEditItem(null);
    setSuccessBanner("Notification Updated Successfully");
  };

  // Handle Delete
  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    setOpenMenuId(null);
  };

  return (
    <div className="figma-notifications-tab-panel">
      {/* Success Banner */}
      <div className="figma-notifications-header-row">
        <div className="figma-notifications-header-left">
          {successBanner && (
            <div className="figma-notifications-success-pill" role="status">
              <CheckCircle2 size={18} />
              <span>{successBanner}</span>
              <button
                type="button"
                className="figma-notifications-pill-close"
                onClick={() => setSuccessBanner(null)}
                aria-label="Dismiss banner"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="figma-notifications-actions-bar">
        <button
          type="button"
          className="figma-notifications-send-btn"
          onClick={handleOpenAddModal}
        >
          Send notification
        </button>
      </div>

      {/* Notifications Table */}
      <div className="figma-notifications-table-card">
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Type</th>
              <th>Audience</th>
              <th>Status</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((item) => (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{item.time}</td>
                <td>{item.type}</td>
                <td>{item.audience}</td>
                <td>
                  <span className={`figma-notifications-status-tag status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </td>
                <td className="td-actions">
                  <div className="figma-notifications-menu-wrapper">
                    <button
                      type="button"
                      className="figma-notifications-action-trigger"
                      aria-label="Actions"
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {openMenuId === item.id && (
                      <div className="figma-notifications-dropdown" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="figma-notifications-dropdown-item"
                          onClick={() => handleView(item)}
                        >
                          View Notification
                        </button>
                        <div className="figma-notifications-dropdown-divider" />
                        <button
                          type="button"
                          className="figma-notifications-dropdown-item"
                          onClick={() => handleStartEdit(item)}
                        >
                          Edit Notification
                        </button>
                        <div className="figma-notifications-dropdown-divider" />
                        <button
                          type="button"
                          className="figma-notifications-dropdown-item danger"
                          onClick={() => handleDelete(item.id)}
                        >
                          Delete Notification
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {notifications.length === 0 && (
              <tr>
                <td colSpan={6} className="figma-empty-row">
                  No notifications recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Add Notification */}
      {isAddModalOpen && (
        <div
          className="figma-notifications-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="figma-notifications-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="figma-notifications-modal-header">
              <h2>Add Notification</h2>
              <button
                type="button"
                className="figma-notifications-modal-close"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendNowDirect} className="figma-notifications-modal-form">
              <div className="figma-notifications-field">
                <label>Title</label>
                <input
                  type="text"
                  placeholder=""
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-field">
                <label>Notification Type</label>
                <div className="figma-notifications-select-wrap">
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "Push" | "Email" | "In-App")}
                  >
                    <option value="Push">Push Notification</option>
                    <option value="Email">Email</option>
                    <option value="In-App">In-App Notification</option>
                  </select>
                  <ChevronDown size={18} className="figma-notifications-select-arrow" />
                </div>
              </div>

              <div className="figma-notifications-field">
                <label>Target Audience</label>
                <div className="figma-notifications-select-wrap">
                  <select
                    value={formAudience}
                    onChange={(e) => setFormAudience(e.target.value)}
                  >
                    <option value="All Users">All Users</option>
                    <option value="Tier-1 users">Tier-1 users</option>
                    <option value="Tier-2 users">Tier-2 users</option>
                    <option value="Drivers">Drivers</option>
                    <option value="Senders">Senders</option>
                  </select>
                  <ChevronDown size={18} className="figma-notifications-select-arrow" />
                </div>
              </div>

              <div className="figma-notifications-field">
                <label>Message</label>
                <textarea
                  rows={5}
                  placeholder=""
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-modal-actions">
                <button
                  type="button"
                  className="figma-notifications-btn-secondary"
                  onClick={handleProceedToSchedule}
                >
                  Schedule Notification
                </button>
                <button
                  type="submit"
                  className="figma-notifications-btn-primary"
                >
                  Send Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Schedule Notification */}
      {isScheduleModalOpen && (
        <div
          className="figma-notifications-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsScheduleModalOpen(false)}
        >
          <div
            className="figma-notifications-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="figma-notifications-modal-header">
              <h2>Schedule Notification</h2>
              <button
                type="button"
                className="figma-notifications-modal-close"
                onClick={() => setIsScheduleModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmSchedule} className="figma-notifications-modal-form">
              <div className="figma-notifications-field">
                <label>Date</label>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-field">
                <label>Time</label>
                <input
                  type="text"
                  placeholder="00:00"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-modal-actions">
                <button
                  type="submit"
                  className="figma-notifications-btn-primary"
                >
                  Send Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Notification */}
      {viewItem && (
        <div
          className="figma-notifications-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewItem(null)}
        >
          <div
            className="figma-notifications-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="figma-notifications-modal-header">
              <h2>View Notification</h2>
              <button
                type="button"
                className="figma-notifications-modal-close"
                onClick={() => setViewItem(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="figma-notifications-view-body">
              <div className="figma-notifications-view-row">
                <span className="view-label">Title:</span>
                <span className="view-value font-medium">{viewItem.title}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Type:</span>
                <span className="view-value">{viewItem.type}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Target Audience:</span>
                <span className="view-value">{viewItem.audience}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Status:</span>
                <span className={`figma-notifications-status-tag status-${viewItem.status.toLowerCase()}`}>
                  {viewItem.status}
                </span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Date & Time:</span>
                <span className="view-value">{viewItem.date} · {viewItem.time}</span>
              </div>
              <div className="figma-notifications-view-row figma-notifications-view-msg">
                <span className="view-label">Message:</span>
                <p className="view-msg-text">{viewItem.message}</p>
              </div>
            </div>

            <div className="figma-notifications-modal-actions">
              <button
                type="button"
                className="figma-notifications-btn-secondary"
                onClick={() => setViewItem(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="figma-notifications-btn-primary"
                onClick={() => {
                  const item = viewItem;
                  setViewItem(null);
                  handleStartEdit(item);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Notification */}
      {editItem && (
        <div
          className="figma-notifications-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditItem(null)}
        >
          <div
            className="figma-notifications-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="figma-notifications-modal-header">
              <h2>Edit Notification</h2>
              <button
                type="button"
                className="figma-notifications-modal-close"
                onClick={() => setEditItem(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="figma-notifications-modal-form">
              <div className="figma-notifications-field">
                <label>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-field">
                <label>Notification Type</label>
                <div className="figma-notifications-select-wrap">
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as "Push" | "Email" | "In-App")}
                  >
                    <option value="Push">Push Notification</option>
                    <option value="Email">Email</option>
                    <option value="In-App">In-App Notification</option>
                  </select>
                  <ChevronDown size={18} className="figma-notifications-select-arrow" />
                </div>
              </div>

              <div className="figma-notifications-field">
                <label>Target Audience</label>
                <div className="figma-notifications-select-wrap">
                  <select
                    value={editAudience}
                    onChange={(e) => setEditAudience(e.target.value)}
                  >
                    <option value="All Users">All Users</option>
                    <option value="Tier-1 users">Tier-1 users</option>
                    <option value="Tier-2 users">Tier-2 users</option>
                    <option value="Drivers">Drivers</option>
                    <option value="Senders">Senders</option>
                  </select>
                  <ChevronDown size={18} className="figma-notifications-select-arrow" />
                </div>
              </div>

              <div className="figma-notifications-field">
                <label>Date</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-field">
                <label>Time</label>
                <input
                  type="text"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-field">
                <label>Status</label>
                <div className="figma-notifications-select-wrap">
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "Scheduled" | "Sent")}
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Sent">Sent</option>
                  </select>
                  <ChevronDown size={18} className="figma-notifications-select-arrow" />
                </div>
              </div>

              <div className="figma-notifications-field">
                <label>Message</label>
                <textarea
                  rows={4}
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  required
                />
              </div>

              <div className="figma-notifications-modal-actions">
                <button
                  type="submit"
                  className="figma-notifications-btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEmailDate(value?: number): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function emailDisplayDate(row: AdminEmailRow): string {
  if (row.status === "scheduled") return formatEmailDate(row.scheduledFor);
  if (row.status === "sent" || row.status === "failed") return formatEmailDate(row.sentAt);
  return formatEmailDate(row.createdAt);
}

function EmailsTab({ canManage }: { canManage: boolean }) {
  const emails = useQuery(api.adminEmails.list) as AdminEmailRow[] | undefined;
  const remove = useMutation(api.adminEmails.remove);
  const sendNow = useMutation(api.adminEmails.sendNow);

  const [sub, setSub] = useState<"emails" | "templates" | "lists" | "waitlist">("emails");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<{ initial: EmailTemplateDraft; mode: "email" | "template" } | null>(null);
  const [viewEmail, setViewEmail] = useState<AdminEmailRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEmailRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target && target.closest(".figma-notifications-menu-wrapper")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  const openCompose = () => {
    setBanner(null);
    setBuilder({
      mode: "email",
      initial: {
        subject: "",
        audience: EMAIL_AUDIENCES[0],
        blocks: starterBlocks(),
        design: { ...DEFAULT_EMAIL_DESIGN },
        footer: { ...DEFAULT_EMAIL_FOOTER },
      },
    });
  };

  const openEdit = (row: AdminEmailRow) => {
    setOpenMenuId(null);
    if (row.status === "sending" || row.status === "sent") {
      setBanner({ tone: "error", text: "This email can no longer be edited." });
      return;
    }
    setBanner(null);
    setBuilder({
      mode: "email",
      initial: {
        id: row.id,
        subject: row.subject,
        audience: row.audience,
        listId: row.listId,
        blocks: row.blocks,
        design: { ...DEFAULT_EMAIL_DESIGN, ...(row.design ?? {}) },
        footer: { ...DEFAULT_EMAIL_FOOTER, ...(row.footer ?? {}) },
        scheduledFor: row.scheduledFor,
      },
    });
  };

  const openTemplateNew = () => {
    setBanner(null);
    setBuilder({
      mode: "template",
      initial: {
        subject: "",
        name: "",
        audience: EMAIL_AUDIENCES[0],
        blocks: starterBlocks(),
        design: { ...DEFAULT_EMAIL_DESIGN },
        footer: { ...DEFAULT_EMAIL_FOOTER },
      },
    });
  };

  const openTemplateEdit = (template: EmailTemplateRow) => {
    setBanner(null);
    setBuilder({
      mode: "template",
      initial: {
        templateId: template.id,
        name: template.name,
        subject: template.subject,
        audience: EMAIL_AUDIENCES[0],
        blocks: template.blocks,
        design: { ...DEFAULT_EMAIL_DESIGN, ...(template.design ?? {}) },
        footer: { ...DEFAULT_EMAIL_FOOTER, ...(template.footer ?? {}) },
      },
    });
  };

  const useTemplate = (template: EmailTemplateRow) => {
    setBanner(null);
    setBuilder({
      mode: "email",
      initial: {
        templateId: template.id,
        name: template.name,
        subject: template.subject,
        audience: EMAIL_AUDIENCES[0],
        blocks: template.blocks,
        design: { ...DEFAULT_EMAIL_DESIGN, ...(template.design ?? {}) },
        footer: { ...DEFAULT_EMAIL_FOOTER, ...(template.footer ?? {}) },
      },
    });
  };

  const handleBuilderSaved = (message: string) => {
    setBuilder(null);
    setBanner({ tone: "success", text: message });
  };

  const handleSendExisting = async (row: AdminEmailRow) => {
    setOpenMenuId(null);
    setBusy(true);
    setBanner(null);
    try {
      const result = (await sendNow({ id: row.id })) as { recipientCount: number };
      const count = result?.recipientCount ?? 0;
      setBanner({ tone: "success", text: `Email sent to ${count} recipient${count === 1 ? "" : "s"}` });
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not send this email.") });
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
      setBanner({ tone: "success", text: "Email deleted" });
    } catch (error) {
      setBanner({ tone: "error", text: formatErrorMessage(error, "Could not delete this email.") });
    } finally {
      setBusy(false);
    }
  };

  const rows = emails ?? [];
  const previewHtml = viewEmail
    ? renderEmailDocument({ subject: viewEmail.subject, blocks: viewEmail.blocks, design: viewEmail.design, footer: viewEmail.footer, appUrl: EMAIL_APP_URL }).html
    : "";

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

      <div className="figma-notifications-subtabs" role="tablist" aria-label="Email tools">
        <button type="button" role="tab" aria-selected={sub === "emails"} className={`figma-notifications-subtab${sub === "emails" ? " active" : ""}`} onClick={() => setSub("emails")}>
          Emails
        </button>
        <button type="button" role="tab" aria-selected={sub === "templates"} className={`figma-notifications-subtab${sub === "templates" ? " active" : ""}`} onClick={() => setSub("templates")}>
          Templates
        </button>
        <button type="button" role="tab" aria-selected={sub === "lists"} className={`figma-notifications-subtab${sub === "lists" ? " active" : ""}`} onClick={() => setSub("lists")}>
          Lists
        </button>
        <button type="button" role="tab" aria-selected={sub === "waitlist"} className={`figma-notifications-subtab${sub === "waitlist" ? " active" : ""}`} onClick={() => setSub("waitlist")}>
          Waitlist
        </button>
      </div>

      {sub === "emails" && (
        <>
          <div className="figma-notifications-actions-bar">
            <button type="button" className="figma-notifications-send-btn" onClick={openCompose} disabled={!canManage}>
              Compose email
            </button>
          </div>

          {!canManage && (
            <p className="figma-notifications-view-note" role="status">You can view sent emails, but composing and sending requires the notifications.manage permission.</p>
          )}

          <div className="figma-notifications-table-card">
        <table className="figma-notifications-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Audience</th>
              <th>Recipients</th>
              <th>Date</th>
              <th>Status</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {emails === undefined ? (
              <tr>
                <td colSpan={6} className="figma-empty-row">Loading emails…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="figma-empty-row">No emails recorded</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.subject}</td>
                  <td>{row.audience}</td>
                  <td>{row.status === "sending" || row.status === "sent" || row.status === "failed" ? `${row.sentCount} of ${row.recipientCount}` : "—"}</td>
                  <td>{emailDisplayDate(row)}</td>
                  <td>
                    <span className={`figma-notifications-status-tag status-${row.status}`}>
                      {EMAIL_STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="td-actions">
                    <div className="figma-notifications-menu-wrapper">
                      <button
                        type="button"
                        className="figma-notifications-action-trigger"
                        aria-label="Actions"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === row.id ? null : row.id); }}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenuId === row.id && (
                        <div className="figma-notifications-dropdown" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="figma-notifications-dropdown-item" onClick={() => { setViewEmail(row); setOpenMenuId(null); }}>
                            View email
                          </button>
                          {canManage && (row.status === "draft" || row.status === "scheduled" || row.status === "failed") && (
                            <>
                              <div className="figma-notifications-dropdown-divider" />
                              <button type="button" className="figma-notifications-dropdown-item" onClick={() => void handleSendExisting(row)} disabled={busy}>
                                Send now
                              </button>
                              <div className="figma-notifications-dropdown-divider" />
                              <button type="button" className="figma-notifications-dropdown-item" onClick={() => openEdit(row)}>
                                Edit email
                              </button>
                            </>
                          )}
                          {canManage && row.status !== "sending" && (
                            <>
                              <div className="figma-notifications-dropdown-divider" />
                              <button type="button" className="figma-notifications-dropdown-item danger" onClick={() => { setDeleteTarget(row); setOpenMenuId(null); }}>
                                Delete email
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {sub === "templates" && (
        <EmailTemplatesPanel
          canManage={canManage}
          onNew={openTemplateNew}
          onEdit={openTemplateEdit}
          onUse={useTemplate}
        />
      )}

      {sub === "lists" && <EmailListsPanel canManage={canManage} />}

      {sub === "waitlist" && <EmailWaitlistPanel canManage={canManage} />}

      {builder && (
        <EmailTemplateBuilder
          initial={builder.initial}
          mode={builder.mode}
          canManage={canManage}
          onClose={() => setBuilder(null)}
          onSaved={handleBuilderSaved}
        />
      )}

      {viewEmail && (
        <div className="figma-notifications-modal-overlay" role="dialog" aria-modal="true" onClick={() => setViewEmail(null)}>
          <div className="figma-notifications-modal figma-notifications-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="figma-notifications-modal-header">
              <h2>View Email</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setViewEmail(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="figma-notifications-view-body">
              <div className="figma-notifications-view-row">
                <span className="view-label">Subject:</span>
                <span className="view-value font-medium">{viewEmail.subject}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Audience:</span>
                <span className="view-value">{viewEmail.audience}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Status:</span>
                <span className={`figma-notifications-status-tag status-${viewEmail.status}`}>{EMAIL_STATUS_LABELS[viewEmail.status] ?? viewEmail.status}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Recipients:</span>
                <span className="view-value">
                  {viewEmail.status === "draft" ? "Not sent yet" : `${viewEmail.sentCount} of ${viewEmail.recipientCount} delivered${viewEmail.failedCount ? `, ${viewEmail.failedCount} failed` : ""}`}
                </span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Date:</span>
                <span className="view-value">{emailDisplayDate(viewEmail)}</span>
              </div>
              <div className="figma-notifications-view-row">
                <span className="view-label">Created by:</span>
                <span className="view-value">{viewEmail.createdByName}</span>
              </div>
              {viewEmail.lastError && (
                <div className="figma-notifications-view-row">
                  <span className="view-label">Last error:</span>
                  <span className="view-value">{viewEmail.lastError}</span>
                </div>
              )}
            </div>

            <div className="figma-notifications-preview">
              <iframe title="Email preview" srcDoc={previewHtml} />
            </div>

            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setViewEmail(null)}>
                Close
              </button>
              {canManage && viewEmail.status !== "sending" && viewEmail.status !== "sent" && (
                <button
                  type="button"
                  className="figma-notifications-btn-primary"
                  onClick={() => { const row = viewEmail; setViewEmail(null); openEdit(row); }}
                >
                  Edit
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
              <h2>Delete Email</h2>
              <button type="button" className="figma-notifications-modal-close" onClick={() => setDeleteTarget(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="figma-notifications-view-note">
              Delete "{deleteTarget.subject}"? This removes it from the email history and cannot be undone.
            </p>
            <div className="figma-notifications-modal-actions">
              <button type="button" className="figma-notifications-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="figma-notifications-btn-primary" onClick={() => void handleDelete()} disabled={busy}>
                {busy ? "Deleting…" : "Delete email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
