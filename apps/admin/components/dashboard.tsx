"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowRight, ArrowUpRight, Bell, Box, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Clock3, CreditCard, EllipsisVertical, FileDown, Flag, Headset, Home, Info, LayoutDashboard, MapPin, Menu, MessageSquareMore, Package, Pencil, Route, Search, Send, Settings, ShieldCheck, Star, Timer, Trash2, Truck, Users, Waypoints, X, type LucideIcon } from "lucide-react";
import { formatErrorMessage, money, PERMISSIONS, STATUS_LABELS, tripRoute, type DashboardSnapshot, type PermissionKey, type Shipment, type Person, type Trip, type Dispute, type Offer, type SupportUserDetails, type SupportActivityEntry, type AgentScoreboardEntry } from "@passenger/core";
import { useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SystemSettings } from "./system-settings";
import { SecurityCompliance } from "./security-compliance";
import { RealTimeMonitoring } from "./real-time-monitoring";
import { SupportWorkspace } from "./support-workspace";
import { NotificationsManagement } from "./notifications-management";

export type AdminAction =
  | { type: "user"; id: string; decision: "verified" | "rejected"; tier?: "Tier 1" | "Tier 2" | "Tier 3"; note: string }
  | { type: "review"; id: string; decision: "approve" | "reject"; note: string }
  | { type: "dispute"; id: string; resolution: "refund" | "release"; note: string; externalReference: string }
  | { type: "payout"; id: string; note: string; externalReference: string };
type View = "overview" | "deliveries" | "routes" | "offers" | "verifications" | "compliance" | "disputes" | "payments" | "notifications" | "audit" | "support" | "settings" | "security" | "monitoring";
export type Selection = { type: "parcel" | "route" | "user" | "dispute" | "payout" | "audit"; id: string } | { type: "guide" };
export type ActionHandler = (action: AdminAction) => Promise<void>;
type Props = { snapshot: DashboardSnapshot; onAction: ActionHandler; accountControl?: ReactNode; renderOperations?: (selection: Selection) => ReactNode; onCreateChat?: (args: { userId: Id<"users">; subject?: string; body: string }) => Promise<Id<"supportChats">>; onSendMessage?: (args: { chatId: Id<"supportChats">; body: string }) => Promise<unknown>; onCreateFaq?: (args: { question: string; answer: string }) => Promise<unknown>; onUpdateFaq?: (args: { id: Id<"faqs">; question: string; answer: string }) => Promise<unknown>; onDeleteFaq?: (args: { id: Id<"faqs"> }) => Promise<unknown>; onMarkResolved?: (args: { chatId: Id<"supportChats">; resolution: string; note: string }) => Promise<unknown>; onReopenChat?: (args: { chatId: Id<"supportChats"> }) => Promise<unknown>; onQaReview?: (args: { chatId: Id<"supportChats">; score: "approved" | "needs_work"; note: string }) => Promise<unknown>; onClaimView?: (args: { chatId: Id<"supportChats"> }) => Promise<{ claimed: boolean; currentViewer?: string; currentViewerId?: string } | undefined>; onReleaseView?: (args: { chatId: Id<"supportChats"> }) => Promise<unknown>; onHandover?: (args: { chatId: Id<"supportChats">; newAgentId: Id<"users">; newAgentName: string }) => Promise<unknown>; onCreateSetting?: (args: { key: string; title: string; body: string }) => Promise<unknown>; onUpdateSetting?: (args: { id: Id<"settings">; title: string; body: string }) => Promise<unknown>; onDeleteSetting?: (args: { id: Id<"settings"> }) => Promise<unknown>; onUpdateFeeConfig?: (args: { platformFeePercent: number; baseFeeNaira: number; distanceRateNairaPerKm: number; minFeeNaira: number; categoryMultipliers?: Record<string, number>; weightMultipliers?: { minKg: number; maxKg: number; multiplier: number }[] }) => Promise<unknown>; onCreateEscrow?: (args: { policyName: string; type: string; releaseTime: string }) => Promise<unknown>; onUpdateEscrow?: (args: { id: Id<"escrowPolicies">; policyName: string; type: string; releaseTime: string }) => Promise<unknown>; onDeleteEscrow?: (args: { id: Id<"escrowPolicies"> }) => Promise<unknown>; onCreateCancellation?: (args: { ruleName: string; refundType: string; refundPercent: number; window: string }) => Promise<unknown>; onUpdateCancellation?: (args: { id: Id<"cancellationPolicies">; ruleName: string; refundType: string; refundPercent: number; window: string }) => Promise<unknown>; onDeleteCancellation?: (args: { id: Id<"cancellationPolicies"> }) => Promise<unknown>; onCreateKycTier?: (args: { tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string }) => Promise<unknown>;
onUpdateKycTier?: (args: { id: Id<"kycTiers">; tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string }) => Promise<unknown>;
onDeleteKycTier?: (args: { id: Id<"kycTiers"> }) => Promise<unknown>;
onUpdateTier?: (args: { userId: Id<"users">; tier: "Tier 1" | "Tier 2" | "Tier 3" }) => Promise<unknown>;
onUpdateServiceArea?: (args: { baseLocation: string; destinations: string[] }) => Promise<unknown>;
onCreateAdminRole?: (args: { name: string }) => Promise<unknown>;
onUpdateAdminRole?: (args: { id: Id<"adminRoles">; name: string }) => Promise<unknown>;
onDeleteAdminRole?: (args: { id: Id<"adminRoles"> }) => Promise<unknown>;
onCreateTeamMember?: (args: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<unknown>;
onInviteTeamMember?: (args: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<{ tempPassword: string; memberId: Id<"teamMembers"> } | undefined>;
onUpdateTeamMember?: (args: { id: Id<"teamMembers">; adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<unknown>;
onDeleteTeamMember?: (args: { id: Id<"teamMembers"> }) => Promise<unknown>;
onCreatePermission?: (args: { name: string }) => Promise<unknown>;
onUpdatePermission?: (args: { id: Id<"permissions">; name: string }) => Promise<unknown>;
onDeletePermission?: (args: { id: Id<"permissions"> }) => Promise<unknown>;
onSetPermissionGrant?: (args: { permissionId: Id<"permissions">; adminRoleId: Id<"adminRoles">; roleTitle: string; granted: boolean }) => Promise<unknown> };
const nav: { id: View; title: string; icon: LucideIcon; group: string }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { id: "deliveries", title: "Deliveries", icon: Package, group: "WORKSPACE" },
  { id: "routes", title: "Travel routes", icon: Route, group: "WORKSPACE" },
  { id: "offers", title: "Traveller offers", icon: Users, group: "WORKSPACE" },
  { id: "verifications", title: "Verifications", icon: ShieldCheck, group: "TRUST & OPERATIONS" },
  { id: "disputes", title: "Disputes & incidents", icon: Flag, group: "TRUST & OPERATIONS" },
  { id: "payments", title: "Payments", icon: CreditCard, group: "TRUST & OPERATIONS" },
  { id: "notifications", title: "Notifications", icon: Bell, group: "TRUST & OPERATIONS" },
  { id: "audit", title: "Activity log", icon: Activity, group: "TRUST & OPERATIONS" },
  { id: "support", title: "Support", icon: ShieldCheck, group: "TRUST & OPERATIONS" },
  { id: "settings", title: "System Settings", icon: Settings, group: "WORKSPACE" },
  { id: "security", title: "Security", icon: ShieldCheck, group: "WORKSPACE" },
  { id: "monitoring", title: "Real-time Monitoring", icon: Activity, group: "WORKSPACE" },
];
const figmaSidebarNav: { id: View; title: string; icon: LucideIcon; count?: "pendingUsers" | "openDisputes" | "unread" }[] = [
  { id: "overview", title: "Dashboard", icon: Home },
  { id: "compliance", title: "Compliance", icon: ShieldCheck, count: "pendingUsers" },
  { id: "verifications", title: "Users", icon: Users },
  { id: "deliveries", title: "Deliveries", icon: Truck },
  { id: "payments", title: "Transactions", icon: CircleDollarSign },
  { id: "offers", title: "Carry offers", icon: MessageSquareMore },
  { id: "support", title: "Support", icon: Headset, count: "openDisputes" },
  { id: "settings", title: "System Settings", icon: Settings },
  { id: "security", title: "Security", icon: ShieldCheck },
  { id: "monitoring", title: "Real-time Monitoring", icon: Timer },
  { id: "notifications", title: "Notifications", icon: Bell, count: "unread" },
];
const tabPermission: Partial<Record<View, PermissionKey>> = {
  compliance: PERMISSIONS.COMPLIANCE_VIEW,
  verifications: PERMISSIONS.USERS_VIEW,
  deliveries: PERMISSIONS.DELIVERIES_VIEW,
  routes: PERMISSIONS.TRIPS_VIEW,
  disputes: PERMISSIONS.PAYMENTS_VIEW,
  audit: PERMISSIONS.SECURITY_VIEW,
  payments: PERMISSIONS.PAYMENTS_VIEW,
  offers: PERMISSIONS.SUPPORT_VIEW,
  support: PERMISSIONS.SUPPORT_VIEW,
  settings: PERMISSIONS.SETTINGS_VIEW,
  security: PERMISSIONS.SECURITY_VIEW,
  monitoring: PERMISSIONS.MONITORING_VIEW,
  notifications: PERMISSIONS.NOTIFICATIONS_VIEW,
};
const figmaViewTitles: Partial<Record<View, string>> = {
  overview: "Dashboard",
  deliveries: "Deliveries",
  routes: "Travel routes",
  settings: "System Settings",
  security: "Security and Compliance",
  monitoring: "Real-time Monitoring",
  offers: "Carry offers",
  compliance: "Compliance",
  verifications: "Users",
  disputes: "Disputes & incidents",
  support: "Support",
  payments: "Transactions",
  notifications: "Notifications",
  audit: "Security",
};
export const fullDate = (value?: number) => value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
export const humanize = (value: string) => value.replaceAll("_", " ");
const RESOLUTION_TYPES = ["no_action_needed", "information_provided", "refund_issued", "resolution_recorded", "shipment_arranged", "account_action", "other"];
const QA_ACTION_LABELS: Record<string, string> = { message: "Message sent", resolve: "Resolved", reopen: "Reopened", qa_review: "QA reviewed", assigned: "Assigned" };
const openCase = (snapshot: DashboardSnapshot, id: string) => snapshot.disputes.some(d => d.shipmentId === id && d.status === "open");
function lastSevenDaysSeries<T>(now: number, rows: T[], getTimestamp: (row: T) => number, getValue: (row: T) => number) {
  const dayMs = 86400000;
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const start = startOfToday.getTime() - (6 - index) * dayMs;
    const end = start + dayMs;
    return {
      label: new Date(start).toLocaleDateString("en-GB", { weekday: "short" }),
      value: rows.filter(row => {
        const timestamp = getTimestamp(row);
        return timestamp >= start && timestamp < end;
      }).reduce((sum, row) => sum + getValue(row), 0),
    };
  });
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) { return <span aria-hidden="true" className={`avatar ${small ? "small" : ""} tone-${name.length % 4}`}>{name.split(" ").map(p => p[0]).slice(0, 2).join("")}</span>; }
export function Status({ status }: { status: string }) { return <span className={`status status-${status}`}><span />{STATUS_LABELS[status as Shipment["status"]] ?? humanize(status)}</span>; }
export function Empty({ title = "No records yet", description = "New records will appear here when they are available." }: { title?: string; description?: string }) { return <div className="empty"><CheckCheck size={28} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></div>; }
export function Detail({ label, value }: { label: string; value: ReactNode }) { return <div><dt>{label}</dt><dd>{value ?? "Not provided"}</dd></div>; }
export function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) { return <section className="panel operations-panel"><div className="section-title padded"><div><h2>{title}</h2>{count !== undefined && <span className="neutral-count">{count}</span>}</div></div>{children}</section>; }
function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="period-filter"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}><option value="all">All statuses</option>{options.map(s => <option key={s} value={s}>{humanize(s)}</option>)}</select></label>; }

export function Dashboard({ snapshot, onAction, accountControl, renderOperations, onCreateChat, onSendMessage, onCreateFaq, onUpdateFaq, onDeleteFaq, onMarkResolved, onReopenChat, onQaReview, onClaimView, onReleaseView, onHandover, onCreateSetting, onUpdateSetting, onDeleteSetting, onUpdateFeeConfig, onCreateEscrow, onUpdateEscrow, onDeleteEscrow, onCreateCancellation, onUpdateCancellation, onDeleteCancellation, onCreateKycTier, onUpdateKycTier, onDeleteKycTier, onUpdateTier, onUpdateServiceArea, onCreateAdminRole, onUpdateAdminRole, onDeleteAdminRole, onCreateTeamMember, onInviteTeamMember, onUpdateTeamMember, onDeleteTeamMember, onCreatePermission, onUpdatePermission, onDeletePermission, onSetPermissionGrant }: Props) {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState("");
  const [openUserMenu, setOpenUserMenu] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [paymentsTab, setPaymentsTab] = useState<"transactions" | "refunds">("transactions");
  const [supportTab, setSupportTab] = useState<"chats" | "faqs" | "contact" | "qa">("chats");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [showAddFaq, setShowAddFaq] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Id<"faqs"> | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const matchingHandover = (name: string) => !handoverQuery || name.toLowerCase().includes(handoverQuery.toLowerCase());
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
const [composer, setComposer] = useState("");
  const [userDetailsUserId, setUserDetailsUserId] = useState<Id<"users"> | null>(null);
  const [resolvingChatId, setResolvingChatId] = useState<Id<"supportChats"> | null>(null);
  const [resolutionType, setResolutionType] = useState("no_action_needed");
  const [resolutionNote, setResolutionNote] = useState("");
  const [qaChatId, setQaChatId] = useState<Id<"supportChats"> | null>(null);
  const [qaScore, setQaScore] = useState<"approved" | "needs_work">("approved");
  const [qaNote, setQaNote] = useState("");
  const [qaAgentFilter, setQaAgentFilter] = useState("all");
  const [handoverChatId, setHandoverChatId] = useState<Id<"supportChats"> | null>(null);
  const [handoverQuery, setHandoverQuery] = useState("");
  const [presenceBanner, setPresenceBanner] = useState<string | null>(null);
  const supportActivity = useQuery(api.support.supportActivity, {});
  const scoreboard = useQuery(api.support.agentScoreboard, {});
  const [sweep, setSweep] = useState<{ step: number } | null>(null);
  const sweepTimer = useRef<number | null>(null);

  const selectChat = async (chatId: string) => {
    if (selectedChatId && onReleaseView) {
      await onReleaseView({ chatId: selectedChatId as Id<"supportChats"> }).catch(() => {});
    }
    setSelectedChatId(chatId);
    setPresenceBanner(null);
    if (onClaimView) {
      const result = await onClaimView({ chatId: chatId as Id<"supportChats"> }).catch(() => null);
      if (result && !result.claimed && result.currentViewer) {
        setPresenceBanner(result.currentViewer);
      }
    }
  };

  const goBack = async () => {
    if (selectedChatId && onReleaseView) {
      await onReleaseView({ chatId: selectedChatId as Id<"supportChats"> }).catch(() => {});
    }
    setSelectedChatId(null);
    setPresenceBanner(null);
  };
  const userDetails = useQuery(api.support.getUserDetails, userDetailsUserId ? { userId: userDetailsUserId } : "skip");
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { shipments, people, trips, disputes, events } = snapshot;
  const viewerIsCompliance = snapshot.viewer?.role === "compliance";
  const viewerPerms = snapshot.viewerPermissions ?? [];
  const hasPerm = (permission: PermissionKey) => viewerPerms.includes(permission);
  const sidebarItems = figmaSidebarNav.filter(item => {
    const required = tabPermission[item.id];
    return !required || hasPerm(required);
  });
  const sweepActiveId = sweep ? sidebarItems[sweep.step]?.id : null;
  const offers = snapshot.offers ?? [];
  const notifications = snapshot.notifications ?? [];
  const supportChats = snapshot.supportChats ?? [];
  const supportMessages = snapshot.supportMessages ?? [];
  const faqs = snapshot.faqs ?? [];
  const pendingUsers = people.filter(p => p.verification === "pending");
  const pendingShipments = shipments.filter(s => s.status === "pending_review");
  const openDisputes = disputes.filter(d => d.status === "open");
  const exceptions = shipments.filter(s => s.exception || ["failed", "payout_failed", "reconciliation_required"].includes(s.paymentStatus) || s.status === "matched" && !!s.payByAt && s.payByAt <= now);
  const title = figmaViewTitles[view] ?? nav.find(n => n.id === view)!.title;
  const matching = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const statusMatch = (status: string) => filter === "all" || filter === status;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { function key(e: KeyboardEvent) { if (e.key === "Escape") setMobileNav(false); const target = e.target as HTMLElement; if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable && !selection) { e.preventDefault(); searchRef.current?.focus(); } } window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [selection]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 6000); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (selection?.type !== "user" || view === "verifications" || view === "compliance") return;
    setView("verifications");
  }, [selection, view]);
  useEffect(() => {
    function closeMenus() { setOpenUserMenu(null); }
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);
  useEffect(() => () => {
    if (sweepTimer.current !== null) window.clearTimeout(sweepTimer.current);
  }, []);
  const SWEEP_MS = 50;
  function navigate(next: View) {
    const required = tabPermission[next];
    if (required && !hasPerm(required)) {
      next = "overview";
    }
    const fromIndex = sweepTimer.current !== null && sweep ? sweep.step : sidebarItems.findIndex(item => item.id === view);
    const toIndex = sidebarItems.findIndex(item => item.id === next);
    setView(next); setQuery(""); setFilter("all"); setPage(0); setMobileNav(false); setSelection(null);
    if (sweepTimer.current !== null) window.clearTimeout(sweepTimer.current);
    sweepTimer.current = null;
    setSweep(null);
    if (toIndex !== -1 && fromIndex !== -1 && fromIndex !== toIndex) {
      const dir = toIndex > fromIndex ? 1 : -1;
      let step = fromIndex;
      setSweep({ step });
      sweepTimer.current = window.setTimeout(function tick() {
        step += dir;
        if (step === toIndex) { setSweep(null); sweepTimer.current = null; return; }
        setSweep({ step });
        sweepTimer.current = window.setTimeout(tick, SWEEP_MS);
      }, SWEEP_MS);
    }
    requestAnimationFrame(() => headingRef.current?.focus());
  }
  async function submit(action: AdminAction) {
    try {
      await onAction(action);
      setToast("Server acknowledged the operation. Current records and audit history show its outcome.");
    } catch (error) {
      setToast(formatErrorMessage(error, "Operation failed. Please try again."));
    }
  }
  function exportUsersReport() {
    const rows = [["Name", "Email address", "Phone number", "Status"]].concat(peopleShown.map(person => [person.name, person.email ?? "", person.phone, person.suspended ? "Suspended" : person.verification === "verified" ? "Active" : humanize(person.verification)]));
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "passenger-users-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  const filteredShipments = shipments.filter(s => matching(`${s.reference} ${s.senderName} ${s.travellerName ?? ""} ${s.origin} ${s.destination} ${s.description} ${s.exception ?? ""}`) && (filter === "exceptions" ? exceptions.some(e => e.id === s.id) : view === "payments" ? statusMatch(s.paymentStatus) : statusMatch(s.status))).sort((a, b) => b.updatedAt - a.updatedAt);
  const pageSize = view === "overview" ? 5 : 10;
  const safePage = Math.min(page, Math.max(0, Math.ceil(filteredShipments.length / pageSize) - 1));
  const visible = filteredShipments.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const peopleShown = people.filter(p => matching(`${p.name} ${p.phone} ${p.identityNote ?? ""}`) && (filter === "suspended" ? p.suspended : statusMatch(p.verification)));
  const tripsShown = trips.filter(t => matching(`${tripRoute(t).join(" ")} ${t.travellerName}`) && statusMatch(t.status ?? "active"));
  const offersShown = offers.filter(o => matching(`${o.travellerName} ${shipments.find(s => s.id === o.shipmentId)?.reference ?? ""} ${o.note}`) && statusMatch(o.status));
  const disputesShown = disputes.filter(d => matching(`${d.reason} ${d.informationRequest ?? ""} ${shipments.find(s => s.id === d.shipmentId)?.reference ?? ""}`) && statusMatch(d.status));
  const eventsShown = events.filter(e => matching(`${e.action} ${e.detail} ${e.actorName}`));
  const unread = notifications.filter(n => !n.readAt).length;
  const activeUsers = people.filter(p => !p.suspended).length;
  const totalDeliveries = shipments.length;
  const totalTransactions = shipments.reduce((sum, shipment) => sum + shipment.feeNaira, 0);
  const deliveredShipments = shipments.filter(s => s.deliveredAt && s.createdAt);
  const avgDeliveryHours = deliveredShipments.length
    ? Math.round(deliveredShipments.reduce((sum, shipment) => sum + Math.max(0, ((shipment.deliveredAt ?? shipment.updatedAt) - shipment.createdAt) / 3600000), 0) / deliveredShipments.length)
    : 0;
  const successfulDeliveries = shipments.filter(s => s.status === "delivered").length;
  const successRate = totalDeliveries ? Math.round(successfulDeliveries / totalDeliveries * 100) : 0;
  const userGrowthValue = people.length;
  const flaggedUsers = people.filter(p => p.suspended || p.verification === "rejected" || p.verification === "pending");
  const userGrowthSeries = lastSevenDaysSeries(now, people, person => person.joinedAt, () => 1);
  const walletTransactions = snapshot.walletTransactions ?? [];
  const WALLET_KIND_LABELS: Record<string, string> = { top_up: "Top Up", parcel_hold: "Parcel Hold", parcel_refund: "Parcel Refund", payout: "Payout" };
  const filteredWallet = walletTransactions.filter(t => paymentsTab === "refunds" ? t.kind === "parcel_refund" : t.kind !== "parcel_refund").filter(t => matching(`${t.reference} ${t.note} ${people.find(p => p.id === t.userId)?.name ?? ""}`)).sort((a, b) => b.createdAt - a.createdAt);
  const totalTransactionNaira = walletTransactions.filter(t => t.kind !== "parcel_refund").reduce((sum, t) => sum + t.amountNaira, 0);
  const totalRefundNaira = walletTransactions.filter(t => t.kind === "parcel_refund").reduce((sum, t) => sum + t.amountNaira, 0);
  const walletPageSize = 10;
  const walletPageCount = Math.max(1, Math.ceil(filteredWallet.length / walletPageSize));
  const walletPage = Math.min(page, walletPageCount - 1);
  const visibleWallet = filteredWallet.slice(walletPage * walletPageSize, (walletPage + 1) * walletPageSize);
  const revenueSeries = lastSevenDaysSeries(now, shipments, shipment => shipment.createdAt, shipment => shipment.feeNaira);
  const deliveriesShown = shipments.filter(shipment => matching(`${shipment.reference} ${shipment.origin} ${shipment.destination} ${shipment.description} ${shipment.travellerName ?? ""}`) && statusMatch(shipment.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  const deliveriesPageSize = 8;
  const deliveriesPage = Math.min(page, Math.max(0, Math.ceil(deliveriesShown.length / deliveriesPageSize) - 1));
  const visibleDeliveries = deliveriesShown.slice(deliveriesPage * deliveriesPageSize, (deliveriesPage + 1) * deliveriesPageSize);
  const deliveriesPageCount = Math.max(1, Math.ceil(deliveriesShown.length / deliveriesPageSize));
  return <div className={`app-shell app-shell-${view}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar sidebar-figma ${mobileNav ? "is-open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-figma-header">
          <a className="sidebar-figma-brand" href="#overview" onClick={e => { e.preventDefault(); navigate("overview"); }}><span>Passenger</span></a>
          <button className="sidebar-figma-alert" aria-label={`Notifications, ${unread} unread`} onClick={() => navigate("notifications")}>
            <Bell size={24} />
            {unread > 0 && <span className="sidebar-figma-alert-dot" />}
          </button>
        </div>
        <nav className="sidebar-figma-nav">
          {/* {nav.map(item => {
            const count = item.id === "verifications" ? pendingUsers.length : item.id === "disputes" ? openDisputes.length : item.id === "notifications" ? unread : 0;
            return <button key={item.id} className={`sidebar-figma-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <item.icon size={24} />
              <span>{item.title}</span>
              {count > 0 && <i className="sidebar-figma-count">{count}</i>}
            </button>;
          })} */}
          {sidebarItems.map((item, index) => {
            const count = item.count === "pendingUsers" ? pendingUsers.length : item.count === "openDisputes" ? openDisputes.length : item.count === "unread" ? unread : 0;
            const sweeping = sweepActiveId != null;
            const displayClass = sweeping ? (item.id === sweepActiveId ? "sweep-pass" : "") : view === item.id ? "active" : "";
            return <button key={`${item.title}-${index}`} className={`sidebar-figma-item ${displayClass}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}>
              <item.icon size={24} />
              <span>{item.title}</span>
              {count > 0 && <i className="sidebar-figma-count">{count}</i>}
            </button>;
          })}
        </nav>
        {accountControl && (
          <div className="sidebar-figma-footer">
            <Avatar name={snapshot.viewer?.name ?? "Admin"} small />
            <div className="sidebar-figma-footer-copy">
              <strong>{snapshot.viewer?.name ?? "Administrator"}</strong>
              <small>{snapshot.viewer?.role === "compliance" ? "Compliance officer" : "Administrator"}</small>
            </div>
            <span className="sidebar-figma-signout">{accountControl}</span>
          </div>
        )}
      </aside>
    <div className={`main-shell main-shell-${view}`}>
      {view !== "overview" && view !== "verifications" && view !== "compliance" && view !== "deliveries" && view !== "payments" && view !== "support" && view !== "settings" && view !== "security" && view !== "monitoring" && view !== "notifications" && <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" aria-expanded={mobileNav}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-right"><span className="environment live"><span />Live records</span><button className="icon-button notification-button" aria-label={`Notifications, ${unread} unread`} onClick={() => navigate("notifications")}><Bell size={19} />{unread > 0 && <i />}</button></div></header>}
      <main id="main-content" className={`main-content main-content-${view}`}>
        {view === "overview"
          ? <>
              <div className="figma-dashboard-header"><h1 ref={headingRef} tabIndex={-1}>Dashboard</h1><div className="figma-dashboard-header-spacer" aria-hidden="true" /></div>
              <div className="figma-dashboard-stack">
                <div className="figma-kpi-grid">
                  <FigmaMetricCard title="Active users" value={String(activeUsers)} />
                  <FigmaMetricCard title="Total deliveries" value={String(totalDeliveries)} />
                  <FigmaMetricCard title="Total transactions" value={money(totalTransactions)} />
                  <FigmaMetricCard title="Avg. delivery time" value={`${avgDeliveryHours || 0}hrs`} />
                </div>
                <div className="figma-success-row">
                  <FigmaMetricCard title="Delivery success rate" value={`${successRate}%`} compact />
                </div>
                <div className="figma-chart-grid">
                  <FigmaChartCard title="Users Growth" period="Last 7 days" summary={`Users: ${userGrowthValue}`} kind="area" data={userGrowthSeries} />
                  <FigmaChartCard title="Revenue" period="Last 7 days" summary={money(totalTransactions)} kind="bar" data={revenueSeries} />
                </div>
                <section className="figma-flagged-section">
                  <div className="figma-section-title">Flagged users</div>
                  <div className="figma-flagged-table-wrap">
                    <table className="figma-flagged-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Issue Type</th>
                          <th>Description</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flaggedUsers.slice(0, 5).map(user => <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{user.suspended ? "Suspended" : user.verification === "rejected" ? "Rejected" : "Pending"}</td>
                          <td>{user.suspensionReason || user.identityNote || "Needs review before operational access."}</td>
                          <td><button className="figma-table-action" onClick={() => setSelection({ type: "user", id: user.id })}>View</button></td>
                        </tr>)}
                        {!flaggedUsers.length && <tr><td colSpan={4} className="figma-empty-row">No flagged users</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          : view === "verifications" || view === "compliance" || view === "deliveries" || view === "payments" || view === "support" || view === "settings" || view === "security" || view === "monitoring" || view === "notifications"
            ? null
            : <><div className="page-heading"><div><p className="eyebrow">OPERATIONS WORKSPACE</p><h1 ref={headingRef} tabIndex={-1}>{title}</h1><p>Live records. Thoughtful decisions. An accountable trail.</p></div><span className="date-chip"><Clock3 size={15} />{new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
              <div className="content-toolbar"><div className="workspace-tabs"><button onClick={() => navigate("overview")}>Overview</button><button onClick={() => { navigate("deliveries"); setFilter("exceptions"); }}>Exceptions<span>{exceptions.length}</span></button></div><label className="global-search"><Search size={16} /><input ref={searchRef} aria-label={`Search ${title}`} placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /><kbd>/</kbd>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</label></div></>}
        {view === "deliveries" && <section className="figma-deliveries-page"><div className="figma-deliveries-header"><h1 ref={headingRef} tabIndex={-1}>Deliveries management</h1></div><div className="figma-deliveries-kpis"><FigmaMetricCard title="Ongoing Deliveries" value={String(shipments.filter(s => ["matched", "funded", "in_transit"].includes(s.status)).length)} compact /><FigmaMetricCard title="Resolved Deliveries" value={String(shipments.filter(s => ["delivered", "cancelled"].includes(s.status)).length)} compact /></div><div className="figma-deliveries-section"><div className="figma-section-title">All Deliveries</div><div className="figma-deliveries-controls"><div className="figma-deliveries-controls-left"><label className="figma-users-search"><Search size={20} /><input ref={searchRef} aria-label="Search deliveries" placeholder="Search deliveries" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label className="figma-users-filter"><span>Filter</span><ChevronDown size={18} /><select aria-label="Filter deliveries" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All</option>{Object.keys(STATUS_LABELS).map(status => <option key={status} value={status}>{humanize(status)}</option>)}</select></label></div><button className="figma-users-report" onClick={() => {
          const rows = [["Parcel Type", "Route", "Traveler", "Delivery Fee", "Service Fee", "Date", "Status"]].concat(deliveriesShown.map(shipment => [shipment.weightKg <= 1 ? "Small" : shipment.weightKg <= 5 ? "Medium" : "Large", `${shipment.origin} -> ${shipment.destination}`, shipment.travellerName ?? "-", money(shipment.feeNaira), money(shipment.quote ? shipment.quote.platformFeeKobo / 100 : Math.round(shipment.feeNaira * 0.1)), new Date(shipment.createdAt).toLocaleDateString("en-GB"), humanize(shipment.status)]));
          const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "passenger-deliveries-report.csv";
          link.click();
          URL.revokeObjectURL(url);
        }}><FileDown size={18} />Generate report</button></div><div className="figma-deliveries-table-wrap"><table className="figma-deliveries-table"><thead><tr><th>Parcel Type</th><th>Route</th><th>Traveler</th><th>Delivery Fee</th><th>Service Fee</th><th>Date</th><th>Status</th></tr></thead><tbody>{visibleDeliveries.map(shipment => <tr key={shipment.id}><td>{shipment.weightKg <= 1 ? "Small" : shipment.weightKg <= 5 ? "Medium" : "Large"}</td><td>{shipment.origin} -&gt; {shipment.destination}</td><td>{shipment.travellerName ?? "-"}</td><td>{money(shipment.feeNaira)}</td><td>{money(shipment.quote ? shipment.quote.platformFeeKobo / 100 : Math.round(shipment.feeNaira * 0.1))}</td><td>{new Date(shipment.createdAt).toLocaleDateString("en-GB")}</td><td><button className="figma-delivery-status-chip" onClick={() => setSelection({ type: "parcel", id: shipment.id })}>{shipment.status === "in_transit" ? "In Transit" : shipment.status === "delivered" ? "Delivered" : STATUS_LABELS[shipment.status]}<ChevronDown size={14} /></button></td></tr>)}{!visibleDeliveries.length && <tr><td colSpan={7} className="figma-empty-row">No deliveries found</td></tr>}</tbody></table></div>{deliveriesPageCount > 1 && <div className="figma-deliveries-pagination"><button disabled={deliveriesPage === 0} onClick={() => setPage(current => Math.max(0, current - 1))}>Previous</button>{Array.from({ length: deliveriesPageCount }, (_, index) => <button key={index} className={index === deliveriesPage ? "active" : ""} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={deliveriesPage === deliveriesPageCount - 1} onClick={() => setPage(current => Math.min(deliveriesPageCount - 1, current + 1))}>Next</button></div>}</div></section>}
        {view === "payments" && <section className="figma-payments-page"><div className="figma-payments-header"><h1 ref={headingRef} tabIndex={-1}>Transactions management</h1></div><div className="figma-payments-kpis"><FigmaMetricCard title="Total Transactions" value={money(totalTransactionNaira)} compact /><FigmaMetricCard title="Total Refund" value={money(totalRefundNaira)} compact /></div><div className="figma-payments-tabs"><button className={paymentsTab === "transactions" ? "active" : ""} onClick={() => { setPaymentsTab("transactions"); setPage(0); }}>Transactions</button><button className={paymentsTab === "refunds" ? "active" : ""} onClick={() => { setPaymentsTab("refunds"); setPage(0); }}>Refunds</button></div><div className="figma-payments-controls"><div className="figma-payments-controls-left"><label className="figma-users-search"><Search size={20} /><input ref={searchRef} aria-label="Search transactions" placeholder="Search transactions" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label className="figma-users-filter"><span>Filter</span><ChevronDown size={18} /><select aria-label="Filter transactions" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All</option>{paymentsTab === "transactions" ? ["top_up", "parcel_hold", "payout"].map(k => <option key={k} value={k}>{WALLET_KIND_LABELS[k]}</option>) : <option value="parcel_refund">{WALLET_KIND_LABELS.parcel_refund}</option>}</select></label></div><button className="figma-users-report" onClick={() => {
          const rows = [["User", "Transaction Type", "Amount", "Date", "Time"]].concat(visibleWallet.map(t => [people.find(p => p.id === t.userId)?.name ?? "-", WALLET_KIND_LABELS[t.kind] ?? t.kind, money(t.amountNaira), new Date(t.createdAt).toLocaleDateString("en-GB"), new Date(t.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })]));
          const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "passenger-transactions-report.csv";
          link.click();
          URL.revokeObjectURL(url);
        }}><FileDown size={18} />Generate report</button></div><div className="figma-payments-table-wrap"><table className="figma-payments-table"><thead><tr><th>User</th><th>Transaction Type</th><th>Amount</th><th>Date</th><th>Time</th></tr></thead><tbody>{visibleWallet.map(t => <tr key={t.id}><td>{people.find(p => p.id === t.userId)?.name ?? "-"}</td><td>{WALLET_KIND_LABELS[t.kind] ?? t.kind}</td><td>{money(t.amountNaira)}</td><td>{new Date(t.createdAt).toLocaleDateString("en-GB")}</td><td>{new Date(t.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td></tr>)}{!visibleWallet.length && <tr><td colSpan={5} className="figma-empty-row">No transactions found</td></tr>}</tbody></table></div>{walletPageCount > 1 && <div className="figma-payments-pagination"><button disabled={walletPage === 0} onClick={() => setPage(current => Math.max(0, current - 1))}>Previous</button>{Array.from({ length: walletPageCount }, (_, index) => <button key={index} className={index === walletPage ? "active" : ""} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={walletPage === walletPageCount - 1} onClick={() => setPage(current => Math.min(walletPageCount - 1, current + 1))}>Next</button></div>}</section>}
        {view === "routes" && <><div className="table-controls"><SelectFilter label="Journey status" value={filter} onChange={setFilter} options={["active", "cancelled", "completed"]} /></div><div className="route-grid">{tripsShown.map(t => <button className="panel route-card" key={t.id} onClick={() => setSelection({ type: "route", id: t.id })}><div className="route-card-top"><span className="route-icon"><Route size={21} /></span><Status status={t.status ?? "active"} /></div><h2>{t.origin}<ArrowRight size={20} />{t.destination}</h2><p>{t.stops?.length ? `Via ${t.stops.join(" → ")}` : "Direct route"}</p><p><Clock3 size={14} />{fullDate(t.departureAt)}</p><div className="route-capacity"><span>{t.capacityKg} kg <small>total capacity</small></span><strong>{t.maxParcelWeightKg ?? t.capacityKg} kg<small> max parcel</small></strong></div><div className="route-card-bottom"><Avatar name={t.travellerName} small /><span>{t.travellerName}</span><ArrowUpRight size={17} /></div></button>)}</div>{!tripsShown.length && <Empty title="No journeys found" description="Published journeys matching this view will appear here." />}</>}
        {view === "offers" && <Panel title="Carry offers" count={offersShown.length}><div className="notice">Carry offers and delivery proposals will appear here.</div><div className="member-list">{offersShown.map(o => <OfferRow key={o.id} offer={o} snapshot={snapshot} now={now} onSelect={setSelection} />)}</div>{!offersShown.length && <Empty title="No carry offers yet" description="Carry offers matching this view will appear here." />}</Panel>}
        {(view === "verifications" || view === "compliance") && (selection?.type === "user"
          ? <FigmaUserDetailPage user={people.find(person => person.id === selection.id)} shipments={shipments} walletTransactions={snapshot.walletTransactions ?? []} reviews={snapshot.reviews ?? []} onAction={submit} onUpdateTier={onUpdateTier} viewerIsCompliance={hasPerm(PERMISSIONS.COMPLIANCE_MANAGE)} onBack={() => setSelection(null)} />
          : <section className="figma-users-page"><div className="figma-users-header"><h1 ref={headingRef} tabIndex={-1}>{view === "compliance" ? "Compliance" : "User management"}</h1></div><div className="figma-users-controls"><div className="figma-users-controls-left"><label className="figma-users-search"><Search size={20} /><input ref={searchRef} aria-label="Search users" placeholder="Search users" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label className="figma-users-filter"><span>Filter</span><ChevronDown size={18} /><select aria-label="Filter users" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All</option><option value="required">Required</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></label></div><button className="figma-users-report" onClick={exportUsersReport}><FileDown size={18} />Generate report</button></div><div className="figma-users-table-wrap"><table className="figma-users-table"><thead><tr><th>Name</th><th>Email address</th><th>Phone number</th><th>Status</th><th>Actions</th></tr></thead><tbody>{peopleShown.map(person => <tr key={person.id}><td><button className="figma-user-name-button" onClick={() => setSelection({ type: "user", id: person.id })}>{person.name}</button></td><td>{person.email ?? "-"}</td><td>{person.phone}</td><td><span className={`figma-user-status ${person.suspended ? "suspended" : person.verification === "verified" ? "active" : "pending"}`}>{person.suspended ? "Suspended" : person.verification === "verified" ? "Active" : person.verification === "rejected" ? "Rejected" : person.verification === "required" ? "Required" : "Pending"}</span></td><td><div className="figma-user-actions"><button className="figma-user-menu-trigger" aria-label={`Actions for ${person.name}`} onClick={event => { event.stopPropagation(); setOpenUserMenu(current => current === person.id ? null : person.id); }}><EllipsisVertical size={18} /></button>{openUserMenu === person.id && <div className="figma-user-menu" onClick={event => event.stopPropagation()}><button onClick={() => { setOpenUserMenu(null); setSelection({ type: "user", id: person.id }); }}>Open user</button><button onClick={() => { setOpenUserMenu(null); setSelection({ type: "user", id: person.id }); }}>Review details</button></div>}</div></td></tr>)}{!peopleShown.length && <tr><td colSpan={5} className="figma-empty-row">No users found</td></tr>}</tbody></table></div></section>)}
        {view === "disputes" && <Panel title="Disputes & incident inbox" count={disputesShown.length}><div className="table-controls"><SelectFilter label="Dispute status" value={filter} onChange={setFilter} options={["open", "resolved"]} /></div><div className="dispute-list">{disputesShown.map(d => <button className="dispute-row" key={d.id} onClick={() => setSelection({ type: "dispute", id: d.id })}><span className="dispute-icon"><Flag size={20} /></span><span className="dispute-info"><strong>{shipments.find(s => s.id === d.shipmentId)?.reference ?? "Delivery dispute"}<Status status={d.status} /></strong><span>{d.reason}</span><small>{d.informationRequest ? "Information requested · " : ""}{fullDate(d.createdAt)}</small></span><ArrowUpRight size={18} /></button>)}</div>{!disputesShown.length && <Empty title="A clear road ahead" description="No disputes match this view. Delivery exceptions remain visible in the delivery queue." />}</Panel>}
        {view === "notifications" && <NotificationsManagement />}
        {view === "audit" && <Panel title="Searchable audit trail" count={events.length}><div className="notice">Operational records may contain sensitive information. Use only for case handling; never copy evidence URLs or proof secrets into notes.</div><div className="audit-list">{eventsShown.map(event => <button className="audit-item" key={event.id} onClick={() => setSelection({ type: "audit", id: event.id })}><span className="audit-dot"><Activity size={15} /></span><span className="audit-text"><strong>{event.action}</strong><span>{event.detail}</span><small>{event.actorName}</small></span><time dateTime={new Date(event.createdAt).toISOString()}>{fullDate(event.createdAt)}</time><ArrowUpRight size={14} /></button>)}</div>{!eventsShown.length && <Empty title="Nothing to report yet" description="Server-recorded operational events appear here." />}</Panel>}
        {view === "support" && (["chats"].includes(supportTab) ? <><div className="figma-support-tabs"><button className="active" onClick={() => setSupportTab("chats")}>Requests</button><button onClick={() => { setSelectedChatId(null); setSupportTab("faqs"); }}>FAQs</button><button onClick={() => { setSelectedChatId(null); setSupportTab("qa"); }}>Quality and activity</button></div><SupportWorkspace snapshot={snapshot} selectedId={selectedChatId} onSelect={setSelectedChatId} onOpenRecord={selection => { if (selection.type === "user") setUserDetailsUserId(selection.id as Id<"users">); else setSelection(selection); }} /></> : <section className={supportTab === "chats" && selectedChatId ? "figma-support-page figma-support-page-conv" : "figma-support-page"}>{supportTab !== "chats" || !selectedChatId ? <><div className="figma-support-header"><h1 ref={headingRef} tabIndex={-1}>Support</h1></div><div className="figma-support-tabs"><button className={supportTab === "chats" ? "active" : ""} onClick={() => { setSupportTab("chats"); setSelectedChatId(null); }}>Live Chats</button><button className={supportTab === "faqs" ? "active" : ""} onClick={() => setSupportTab("faqs")}>FAQs</button><button className={supportTab === "contact" ? "active" : ""} onClick={() => setSupportTab("contact")}>Contact</button><button className={supportTab === "qa" ? "active" : ""} onClick={() => setSupportTab("qa")}>QA &amp; Ops</button></div>{supportTab === "chats" && <div className="figma-support-chat-list">{supportChats.map(chat => <button key={chat.id} className={`figma-support-chat-item ${selectedChatId === chat.id ? "selected" : ""}`} onClick={() => selectChat(chat.id)}><div className="figma-support-chat-left"><span className={`figma-support-chat-dot ${chat.status === "unresolved" ? "active" : ""}`} /><div className="figma-support-chat-avatar" style={{ background: `hsl(${(chat.userName ?? "U").charCodeAt(0) * 7 % 360}, 55%, 65%)` }} /><div className="figma-support-chat-info"><span className="figma-support-chat-name">{chat.userName ?? "Unknown"}</span><span className="figma-support-chat-preview">{chat.lastMessage || "No messages yet"}</span>{chat.assignedByName && <span className="figma-support-chat-assignee">Assigned to {chat.assignedByName}</span>}</div></div><div className="figma-support-chat-right"><span className={`figma-support-chat-badge ${chat.status}`}>{chat.status === "unresolved" ? "Unresolved" : chat.status === "resolved" ? "Resolved" : "Closed"}</span><span className="figma-support-chat-time">{fullDate(chat.lastMessageAt)}</span></div></button>)}{!supportChats.length && <div className="figma-empty-row">No support chats yet</div>}</div>}{supportTab === "faqs" && <div className="figma-support-faqs"><div className="figma-support-faqs-header"><h2>FAQs</h2><button className="figma-support-add-faq" onClick={() => { setEditingFaq(null); setFaqQuestion(""); setFaqAnswer(""); setShowAddFaq(true); }}><span>+</span>Add new FAQ</button></div><div className="figma-support-faq-list">{faqs.map(faq => <div key={faq.id} className="figma-support-faq-card"><button className="figma-support-faq-toggle" onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}><span>{faq.question}</span><ChevronDown size={18} className={expandedFaq === faq.id ? "rotated" : ""} /></button>{expandedFaq === faq.id && <div className="figma-support-faq-answer">{faq.answer}</div>}<div className="figma-support-faq-actions"><button className="figma-support-faq-edit" aria-label="Edit FAQ" onClick={() => { setEditingFaq(faq.id as Id<"faqs">); setFaqQuestion(faq.question); setFaqAnswer(faq.answer); setShowAddFaq(true); }}><Pencil size={14} /></button><button className="figma-support-faq-delete" aria-label="Delete FAQ" onClick={async () => { if (!onDeleteFaq) return; if (!window.confirm("Delete this FAQ?")) return; try { await onDeleteFaq({ id: faq.id as Id<"faqs"> }); setToast("FAQ deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete FAQ.")); } }}><Trash2 size={14} /></button></div></div>)}{!faqs.length && <div className="figma-empty-row">No FAQs yet</div>}</div></div>}{supportTab === "contact" && <div className="figma-support-contact"><label className="figma-users-search"><Search size={20} /><input ref={searchRef} aria-label="Search contacts" placeholder="Search.." value={query} onChange={e => setQuery(e.target.value)} /></label><div className="figma-support-contact-list">{people.filter(p => matching(`${p.name} ${p.phone} ${p.email ?? ""}`)).map(person => <button key={person.id} className="figma-support-chat-item" onClick={async () => { if (!onCreateChat) return; try { const chatId = await onCreateChat({ userId: person.id as Id<"users">, subject: `Support with ${person.name}`, body: `Chat started with ${person.name}` }); setSelectedChatId(chatId); setSupportTab("chats"); } catch (err) { setToast(formatErrorMessage(err, "Failed to start support chat.")); } }}><div className="figma-support-chat-left"><div className="figma-support-chat-avatar" style={{ background: `hsl(${person.name.charCodeAt(0) * 7 % 360}, 55%, 65%)` }} /><div className="figma-support-chat-info"><span className="figma-support-chat-name">{person.name}</span><span className="figma-support-chat-preview">{person.email ?? person.phone}</span></div></div><div className="figma-support-chat-right"><span className="figma-support-chat-time">{fullDate(person.joinedAt)}</span></div></button>)}{!people.filter(p => matching(`${p.name} ${p.phone} ${p.email ?? ""}`)).length && <div className="figma-empty-row">No contacts found</div>}</div></div>}{supportTab === "qa" && <div className="figma-support-qa"><div className="figma-support-qa-section"><div className="figma-section-title">Agent scoreboard</div>{!scoreboard && <div className="figma-empty-row">Loading…</div>}{scoreboard && <div className="figma-deliveries-table-wrap"><table className="figma-deliveries-table"><thead><tr><th>Agent</th><th>Open</th><th>Resolved</th><th>Reopened</th><th>Avg first response</th><th>QA</th></tr></thead><tbody>{(scoreboard ?? []).map(row => <tr key={row.agentName}><td>{row.agentName}</td><td>{row.openAssigned}</td><td>{row.resolved}</td><td>{row.reopened}</td><td>{row.avgFirstResponseMs === null ? "—" : `${Math.round(row.avgFirstResponseMs / 60000)}m`}</td><td>{row.qaApproved} approved / {row.qaNeedsWork} needs work · {row.qaTotal} reviewed</td></tr>)}{!scoreboard?.length && <tr><td colSpan={6} className="figma-empty-row">No support activity yet</td></tr>}</tbody></table></div>}</div><div className="figma-support-qa-section"><div className="figma-section-title">Needs QA review</div><div className="figma-deliveries-table-wrap"><table className="figma-deliveries-table"><thead><tr><th>User</th><th>Resolution</th><th>Note</th><th>Status</th><th>Resolved by</th></tr></thead><tbody>{supportChats.filter(c => (c.status === "resolved" || c.status === "closed") && !c.qaReviewedAt).slice(0, 20).map(chat => <tr key={chat.id} className="figma-qa-clickable" onClick={() => { setSelectedChatId(chat.id); setSupportTab("chats"); }}><td><button className="figma-user-name-button" onClick={() => { setSelectedChatId(chat.id); setSupportTab("chats"); }}>{chat.userName ?? "User"}</button></td><td>{chat.resolution ? humanize(chat.resolution) : "Resolved"}</td><td>{chat.resolutionNote ?? "—"}</td><td><span className={`figma-user-status pending`}>{chat.status === "closed" ? "Closed" : "Resolved"}</span></td><td>{chat.resolvedByName ?? "—"}</td></tr>)}{!supportChats.some(c => (c.status === "resolved" || c.status === "closed") && !c.qaReviewedAt) && <tr><td colSpan={5} className="figma-empty-row">Everything quality-checked</td></tr>}</tbody></table></div></div><div className="figma-support-qa-section"><div className="figma-section-title">Activity feed</div><label className="figma-users-search"><Search size={18} /><select aria-label="Filter by agent" value={qaAgentFilter} onChange={e => setQaAgentFilter(e.target.value)}><option value="all">All agents</option>{[...new Set((supportActivity ?? []).map(e => e.actorName))].map(name => <option key={name} value={name}>{name}</option>)}</select></label><div className="figma-deliveries-table-wrap"><table className="figma-deliveries-table"><thead><tr><th>Action</th><th>Detail</th><th>Agent</th><th>Date</th></tr></thead><tbody>{(supportActivity ?? []).filter(e => qaAgentFilter === "all" || e.actorName === qaAgentFilter).slice(0, 100).map(event => <tr key={event.id} className="figma-qa-clickable" onClick={() => { setSelectedChatId(event.chatId); setSupportTab("chats"); }}><td>{QA_ACTION_LABELS[event.action] ?? event.action}</td><td>{event.detail}</td><td>{event.actorName}</td><td>{fullDate(event.createdAt)}</td></tr>)}{!supportActivity?.length && <tr><td colSpan={4} className="figma-empty-row">No support activity yet</td></tr>}</tbody></table></div></div></div>}</> : (() => { const chat = supportChats.find(c => c.id === selectedChatId); const msgs = supportMessages.filter(m => m.chatId === selectedChatId); const submit = async () => { const text = composer.trim(); if (!text || !onSendMessage || !selectedChatId) return; try { await onSendMessage({ chatId: selectedChatId as Id<"supportChats">, body: text }); setComposer(""); } catch (err) { setToast(formatErrorMessage(err, "Failed to send message.")); } }; return <div className="figma-support-conv"><div className="figma-support-conv-header"><button className="figma-support-back" onClick={goBack} aria-label="Back to chats"><ChevronLeft size={24} /></button><span className="figma-support-conv-username">{chat?.userName ?? "Chat"}</span><div className="figma-support-conv-actions"><button className="figma-support-conv-info" aria-label="View user details" onClick={() => { if (chat) { setUserDetailsUserId(chat.userId as Id<"users">); } }}><Info size={20} /></button><button className="figma-support-handover" onClick={() => { if (chat) { setHandoverChatId(chat.id as Id<"supportChats">); setHandoverQuery(""); } }}>Hand over</button>{chat?.status === "unresolved" ? <button className="figma-support-mark-resolved" onClick={() => { if (chat) { setResolutionType("no_action_needed"); setResolutionNote(""); setResolvingChatId(chat.id as Id<"supportChats">); } }}>Mark as resolved</button> : <div className="figma-support-conv-resolve-actions"><button className="figma-support-qa-open" onClick={() => { if (chat) { setQaScore("approved"); setQaNote(""); setQaChatId(chat.id as Id<"supportChats">); } }}>QA review</button><button className="figma-support-reopen" onClick={async () => { if (!selectedChatId || !onReopenChat) return; try { await onReopenChat({ chatId: selectedChatId as Id<"supportChats"> }); setToast("Issue reopened."); } catch (err) { console.error("Failed to reopen chat", err); setToast(formatErrorMessage(err, "Failed to reopen issue.")); } }}>Reopen issue</button></div>}</div></div>{presenceBanner && <div className="figma-support-presence-banner"><Info size={14} /><span>{presenceBanner} is currently handling this issue</span></div>}{chat?.resolution && <div className="figma-support-conv-resolution"><strong>{chat.status === "closed" ? "Closed" : "Resolved"} · {humanize(chat.resolution)}</strong>{chat.resolutionNote ? <span>{chat.resolutionNote}</span> : null}{chat.resolvedByName ? <span>Resolved by {chat.resolvedByName}</span> : chat.assignedByName ? <span>Attended by {chat.assignedByName}</span> : null}{chat.qaReviewedByName ? <span>QA · {chat.qaScore === "approved" ? "Approved" : "Needs work"} by {chat.qaReviewedByName}{chat.qaNote ? ` — ${chat.qaNote}` : ""}</span> : null}</div>}<div className="figma-support-conv-messages">{msgs.map(msg => { const isAdmin = msg.authorId === snapshot.viewer?.id; return <div key={msg.id} className={`figma-support-conv-row ${isAdmin ? "admin" : "user"}`}>{!isAdmin && <div className="figma-support-conv-avatar" style={{ background: `hsl(${(chat?.userName ?? "U").charCodeAt(0) * 7 % 360}, 55%, 62%)` }} />}<div className={`figma-support-conv-bubble ${isAdmin ? "admin" : "user"}`}><span>{msg.body}</span></div>{isAdmin && <div className="figma-support-conv-avatar" style={{ background: "hsl(164, 55%, 62%)" }} />}</div>; })}{!msgs.length && <div className="figma-empty-row">No messages yet</div>}</div><div className="figma-support-conv-composer"><input placeholder="Send your message...." aria-label="Message" value={composer} onChange={e => setComposer(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} /><button className="figma-support-conv-send" aria-label="Send message" onClick={submit} disabled={!composer.trim() || !onSendMessage}><Send size={22} /></button></div></div>; })()}</section>)}
        {view === "settings" && <SystemSettings settings={snapshot.settings ?? []} feeConfig={snapshot.feeConfig} escrowPolicies={snapshot.escrowPolicies ?? []} cancellationPolicies={snapshot.cancellationPolicies ?? []} kycTiers={snapshot.kycTiers ?? []} serviceArea={snapshot.serviceArea} mobileConfig={snapshot.mobileConfig} onCreateSetting={onCreateSetting} onUpdateSetting={onUpdateSetting} onDeleteSetting={onDeleteSetting} onUpdateFeeConfig={onUpdateFeeConfig} onCreateEscrow={onCreateEscrow} onUpdateEscrow={onUpdateEscrow} onDeleteEscrow={onDeleteEscrow} onCreateCancellation={onCreateCancellation} onUpdateCancellation={onUpdateCancellation} onDeleteCancellation={onDeleteCancellation} onCreateKycTier={onCreateKycTier} onUpdateKycTier={onUpdateKycTier} onDeleteKycTier={onDeleteKycTier} onUpdateServiceArea={onUpdateServiceArea} />}
        {view === "security" && <SecurityCompliance adminRoles={snapshot.adminRoles ?? []} teamMembers={snapshot.teamMembers ?? []} permissions={snapshot.permissions ?? []} permissionGrants={snapshot.permissionGrants ?? []} suspiciousList={snapshot.suspiciousAccounts ?? []} loginsList={snapshot.adminLogins ?? []} actionsList={snapshot.adminActions ?? []} viewerPermissions={viewerPerms} onCreateRole={onCreateAdminRole} onUpdateRole={onUpdateAdminRole} onDeleteRole={onDeleteAdminRole} onCreateTeamMember={onCreateTeamMember} onInviteTeamMember={onInviteTeamMember} onUpdateTeamMember={onUpdateTeamMember} onDeleteTeamMember={onDeleteTeamMember} onCreatePermission={onCreatePermission} onUpdatePermission={onUpdatePermission} onDeletePermission={onDeletePermission} onSetPermissionGrant={onSetPermissionGrant} />}
        {view === "monitoring" && <RealTimeMonitoring snapshot={snapshot} />}
        {view !== "overview" && view !== "verifications" && view !== "compliance" && view !== "deliveries" && view !== "payments" && view !== "support" && view !== "settings" && view !== "security" && view !== "monitoring" && view !== "notifications" && <footer className="page-footer"><span><Waypoints size={13} /> Made for the journeys that connect us.</span><span>Server-owned records · No simulated transactions</span></footer>}
      </main>
    </div>
    {qaChatId && <div className="figma-resolve-modal-overlay" role="dialog" aria-modal="true" aria-label="Quality review" onClick={() => setQaChatId(null)}><div className="figma-resolve-modal" onClick={e => e.stopPropagation()}><button className="figma-resolve-modal-close" aria-label="Close" onClick={() => setQaChatId(null)}><X size={22} /></button><h2 className="figma-resolve-modal-title">Quality review</h2><form className="figma-resolve-modal-form" onSubmit={async e => { e.preventDefault(); if (!onQaReview) return; try { await onQaReview({ chatId: qaChatId, score: qaScore, note: qaNote.trim() }); setToast("QA review recorded."); setQaChatId(null); } catch (err) { console.error("Failed to save QA review", err); setToast(formatErrorMessage(err, "Failed to save QA review.")); } }}><div className="figma-resolve-modal-field"><span>Verdict</span><div className="figma-qa-score-row"><button type="button" className={`figma-qa-score ${qaScore === "approved" ? "approved" : ""}`} onClick={() => setQaScore("approved")}>Approved</button><button type="button" className={`figma-qa-score ${qaScore === "needs_work" ? "needs-work" : ""}`} onClick={() => setQaScore("needs_work")}>Needs work</button></div></div><label className="figma-resolve-modal-field"><span>QA note</span><textarea value={qaNote} onChange={e => setQaNote(e.target.value)} placeholder="What was handled well or needs improvement?" rows={3} /></label><div className="figma-resolve-modal-actions"><button type="submit" className="figma-resolve-modal-submit">Save review</button></div></form></div></div>}
    {handoverChatId && <div className="figma-resolve-modal-overlay" role="dialog" aria-modal="true" aria-label="Hand over issue" onClick={() => setHandoverChatId(null)}><div className="figma-resolve-modal" onClick={e => e.stopPropagation()}><button className="figma-resolve-modal-close" aria-label="Close" onClick={() => setHandoverChatId(null)}><X size={22} /></button><h2 className="figma-resolve-modal-title">Hand over to another agent</h2><div className="figma-resolve-modal-form"><label className="figma-resolve-modal-field"><span>Search for agent</span><input autoFocus value={handoverQuery} onChange={e => setHandoverQuery(e.target.value)} placeholder="Type a name…" /></label><div className="figma-handover-list">{people.filter(p => p.id !== snapshot.viewer?.id && matchingHandover(p.name)).map(person => <button key={person.id} className="figma-handover-item" onClick={async () => { if (!onHandover || !handoverChatId) return; try { await onHandover({ chatId: handoverChatId, newAgentId: person.id as Id<"users">, newAgentName: person.name }); setToast(`Handed over to ${person.name}`); setHandoverChatId(null); setSelectedChatId(null); } catch (err) { console.error("Handover failed", err); setToast(formatErrorMessage(err, "Failed to hand over.")); } }}><div className="figma-handover-avatar" style={{ background: `hsl(${person.name.charCodeAt(0) * 7 % 360}, 55%, 65%)` }} /><span>{person.name}</span></button>)}{!people.filter(p => p.id !== snapshot.viewer?.id && matchingHandover(p.name)).length && <div className="figma-empty-row">No agents found</div>}</div></div></div></div>}
    {resolvingChatId && <div className="figma-resolve-modal-overlay" role="dialog" aria-modal="true" aria-label="Resolve support issue" onClick={() => setResolvingChatId(null)}><div className="figma-resolve-modal" onClick={e => e.stopPropagation()}><button className="figma-resolve-modal-close" aria-label="Close" onClick={() => setResolvingChatId(null)}><X size={22} /></button><h2 className="figma-resolve-modal-title">Resolve issue</h2><form className="figma-resolve-modal-form" onSubmit={async e => { e.preventDefault(); if (!onMarkResolved) return; try { await onMarkResolved({ chatId: resolvingChatId, resolution: resolutionType, note: resolutionNote.trim() }); setToast("Issue resolved."); setResolvingChatId(null); setSelectedChatId(null); } catch (err) { console.error("Failed to resolve chat", err); setToast(formatErrorMessage(err, "Failed to resolve issue.")); } }}><label className="figma-resolve-modal-field"><span>Resolution type</span><select value={resolutionType} onChange={e => setResolutionType(e.target.value)}>{RESOLUTION_TYPES.map(t => <option key={t} value={t}>{humanize(t)}</option>)}</select></label><label className="figma-resolve-modal-field"><span>Resolution note</span><textarea value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="What was done to resolve this issue?" rows={3} /></label><div className="figma-resolve-modal-actions"><button type="submit" className="figma-resolve-modal-submit">Confirm resolution</button></div></form></div></div>}
    {showAddFaq && <div className="figma-faq-modal-overlay" role="dialog" aria-modal="true" aria-label={editingFaq ? "Edit FAQ" : "Add a new FAQ"} onClick={() => setShowAddFaq(false)}><div className="figma-faq-modal" onClick={e => e.stopPropagation()}><button className="figma-faq-modal-close" aria-label="Close" onClick={() => { setShowAddFaq(false); }}><X size={22} /></button><h2 className="figma-faq-modal-title">{editingFaq ? "Edit FAQ" : "Add a new FAQ"}</h2><form className="figma-faq-modal-form" onSubmit={async e => { e.preventDefault(); const q = faqQuestion.trim(); const a = faqAnswer.trim(); if (!q || !a) { setToast(editingFaq ? "Please fill in both fields." : "Please fill in both fields."); return; } try { if (editingFaq && onUpdateFaq) { await onUpdateFaq({ id: editingFaq, question: q, answer: a }); setToast("FAQ updated."); } else if (onCreateFaq) { await onCreateFaq({ question: q, answer: a }); setToast("FAQ added."); } else { console.error("FAQ mutation not wired"); setToast("Failed to save FAQ."); return; } setFaqQuestion(""); setFaqAnswer(""); setEditingFaq(null); setShowAddFaq(false); } catch (err) { console.error("FAQ save failed", err); setToast(formatErrorMessage(err, "Failed to save FAQ.")); } }}><label className="figma-faq-modal-field"><span>Enter a new question</span><input autoFocus value={faqQuestion} onChange={e => setFaqQuestion(e.target.value)} placeholder="Type the FAQ question" required /></label><label className="figma-faq-modal-field"><span>Enter an answer to the question</span><textarea value={faqAnswer} onChange={e => setFaqAnswer(e.target.value)} placeholder="Type the FAQ answer" rows={4} required /></label><div className="figma-faq-modal-actions"><button type="submit" className="figma-faq-modal-submit">{editingFaq ? "Save" : "Add FAQ"}</button></div></form></div></div>}
    {toast && <div className="toast" role="status"><CheckCheck size={18} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={15} /></button></div>}
    {userDetailsUserId && <SupportUserDrawer snapshot={snapshot} userId={userDetailsUserId} details={userDetails} onClose={() => setUserDetailsUserId(null)} />}
    {selection && selection.type !== "user" && <Drawer selection={selection} snapshot={snapshot} onClose={() => setSelection(null)} onSelect={setSelection} onAction={submit} renderOperations={renderOperations} viewerPermissions={viewerPerms} />}
  </div>;
}
function FigmaMetricCard({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return <section className={`figma-metric-card ${compact ? "compact" : ""}`}><div className="figma-metric-title">{title}</div><div className="figma-metric-value">{value}</div></section>;
}
function FigmaChartCard({ title, period, summary, kind, data }: { title: string; period: string; summary: string; kind: "area" | "bar"; data: { label: string; value: number }[] }) {
  const hasData = data.some(point => point.value > 0);
  return <section className="figma-chart-card"><div className="figma-chart-head"><div><div className="figma-chart-title">{title}</div><div className="figma-chart-period">{period}</div></div><button className="figma-chart-export">Export</button></div><div className="figma-chart-plot">{!hasData
    ? <div className="figma-chart-empty">No activity recorded in the last 7 days</div>
    : kind === "area"
    ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 0, left: -22, bottom: 0 }}><defs><linearGradient id="figmaUsersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34D186" stopOpacity={0.35} /><stop offset="100%" stopColor="#34D186" stopOpacity={0.04} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#F3F3F3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "Work Sans" }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "Work Sans" }} allowDecimals={false} width={28} /><Tooltip cursor={{ stroke: "#BCF0D7" }} contentStyle={{ borderRadius: 12, borderColor: "#F3F3F3", fontFamily: "Work Sans", fontSize: 12 }} formatter={value => [String(Number(value ?? 0)), title]} /><Area type="monotone" dataKey="value" stroke="#27AB6B" strokeWidth={3} fill="url(#figmaUsersFill)" /></AreaChart></ResponsiveContainer>
    : <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 0, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#F3F3F3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "Work Sans" }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "Work Sans" }} width={40} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} /><Tooltip cursor={{ fill: "rgba(188,240,215,0.25)" }} contentStyle={{ borderRadius: 12, borderColor: "#F3F3F3", fontFamily: "Work Sans", fontSize: 12 }} formatter={value => [money(Number(value ?? 0)), title]} /><Bar dataKey="value" fill="#34D186" radius={[8, 8, 0, 0]} maxBarSize={40} /></BarChart></ResponsiveContainer>}</div><div className="figma-chart-summary">{summary}</div></section>;
}
function TierControl({ user, onUpdate }: { user: Person; onUpdate: (args: { userId: Id<"users">; tier: "Tier 1" | "Tier 2" | "Tier 3" }) => Promise<unknown> }) {
  const current = (user.tier ?? (user.verification === "verified" ? "Tier 1" : "Tier 1")) as "Tier 1" | "Tier 2" | "Tier 3";
  const [tier, setTier] = useState<"Tier 1" | "Tier 2" | "Tier 3">(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setTier(current); setMessage(""); }, [current]);
  return <div className="figma-user-history-section"><div className="figma-section-title">Tier assignment</div><div className="action-form"><label>Tier<select value={tier} onChange={e => setTier(e.target.value as "Tier 1" | "Tier 2" | "Tier 3")} disabled={busy}><option value="Tier 1">Tier 1</option><option value="Tier 2">Tier 2</option><option value="Tier 3">Tier 3</option></select></label>{message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}<button className="button primary" disabled={busy || tier === current} onClick={async () => { setBusy(true); setMessage(""); setError(""); try { await onUpdate({ userId: user.id as Id<"users">, tier }); setMessage("Tier updated. New limits apply immediately."); } catch (e) { setError(formatErrorMessage(e, "Failed to update tier.")); } finally { setBusy(false); } }}>{busy ? "Updating…" : "Change tier"}</button></div></div>;
}

function FigmaUserDetailPage({ user, shipments, walletTransactions, reviews, onAction, onUpdateTier, viewerIsCompliance, onBack }: { user: Person | undefined; shipments: Shipment[]; walletTransactions: DashboardSnapshot["walletTransactions"]; reviews: DashboardSnapshot["reviews"]; onAction: ActionHandler; onUpdateTier?: (args: { userId: Id<"users">; tier: "Tier 1" | "Tier 2" | "Tier 3" }) => Promise<unknown>; viewerIsCompliance: boolean; onBack: () => void }) {
  if (!user) return <section className="figma-user-detail-page"><div className="figma-user-detail-header"><button className="figma-user-detail-back" onClick={onBack}><ChevronLeft size={20} /></button><div><h1>User details</h1></div></div><div className="figma-empty-row">User not found</div></section>;
  const deliveryHistory = shipments.filter(shipment => shipment.travellerId === user.id).slice(0, 3);
  const parcelSendingHistory = shipments.filter(shipment => shipment.senderId === user.id).slice(0, 3);
  const transactions = (walletTransactions ?? []).filter(transaction => transaction.userId === user.id).slice(0, 4);
  const userReviews = (reviews ?? []).filter(review => review.targetId === user.id);
  return <section className="figma-user-detail-page"><div className="figma-user-detail-header"><button className="figma-user-detail-back" onClick={onBack}><ChevronLeft size={20} /></button><div className="figma-user-detail-title-wrap"><h1>User details</h1></div></div><div className="figma-user-summary"><div className="figma-user-summary-left"><div className="figma-user-avatar">{user.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><div className="figma-user-summary-copy"><div className="figma-user-name-row"><h2>{user.name}</h2><span className="figma-user-tier">{user.tier ?? (user.verification === "verified" ? "Tier 2" : "Tier 1")}</span></div><div className="figma-user-field">{user.email ?? "No email"}</div><div className="figma-user-field">{user.phone}</div>{user.bvn ? <div className="figma-user-field">BVN: {user.bvn}</div> : null}{user.residenceState ? <div className="figma-user-field">State of residence: {user.residenceState}</div> : null}{user.residenceLga ? <div className="figma-user-field">Local govt of residence: {user.residenceLga}</div> : null}{user.residenceAddress ? <div className="figma-user-field">House address: {user.residenceAddress}</div> : null}{user.streetPhotoUrl ? <div className="figma-user-field">Street picture: {user.streetPhotoUrl.split("/").pop()}</div> : null}{user.housePhotoUrl ? <div className="figma-user-field">House picture: {user.housePhotoUrl.split("/").pop()}</div> : null}</div></div><button className="figma-user-menu-trigger figma-user-detail-menu" aria-label="User actions"><EllipsisVertical size={18} /></button></div>{user.verification === "verified" && viewerIsCompliance && onUpdateTier && <TierControl user={user} onUpdate={onUpdateTier} />}<div className="figma-user-history-section"><div className="figma-section-title">Delivery History</div><div className="figma-user-history-row">{deliveryHistory.length ? deliveryHistory.map(shipment => <FigmaHistoryCard key={shipment.id} shipment={shipment} />) : <div className="figma-history-empty">No delivery history</div>}</div></div><div className="figma-user-history-section"><div className="figma-section-title">Parcel Sending History</div><div className="figma-user-history-row">{parcelSendingHistory.length ? parcelSendingHistory.map(shipment => <FigmaHistoryCard key={shipment.id} shipment={shipment} senderless />) : <div className="figma-history-empty">No parcel sending history</div>}</div></div><div className="figma-user-history-section"><div className="figma-section-title">Transaction History</div><div className="figma-transaction-card">{transactions.length ? transactions.map(transaction => <div key={transaction.id} className="figma-transaction-row"><div className="figma-transaction-main"><div className="figma-transaction-icon"><CreditCard size={16} /></div><div className="figma-transaction-copy"><strong>{money(transaction.amountNaira)}</strong><span>{transaction.note}</span></div></div><div className="figma-transaction-date">{new Date(transaction.createdAt).toLocaleDateString("en-GB")}</div></div>) : <div className="figma-history-empty compact">No transaction history</div>}</div></div><div className="figma-user-history-section"><div className="figma-section-title">Reviews</div>{user.verification === "pending" && !viewerIsCompliance ? <div className="figma-review-note">Identity review is restricted to compliance officers. Contact a compliance admin to act on this submission.</div> : user.verification === "pending" ? <ReviewForm type="user" id={user.id} onAction={onAction} /> : user.verification === "required" ? <div className="figma-review-note">Identity evidence is required before review.</div> : user.verification === "rejected" ? <div className="figma-review-note">Waiting for the member to correct and resubmit their identity evidence.</div> : null}<div className="figma-review-card">{userReviews.length ? userReviews.map(review => <div key={review.id} className="figma-review-row"><strong>{review.rating}/5</strong><span>{review.comment}</span><small>{new Date(review.createdAt).toLocaleDateString("en-GB")}</small></div>) : <div className="figma-history-empty compact">No reviews yet</div>}</div>{user.identityNote ? <div className="figma-review-note">{user.identityNote}</div> : null}</div></section>;
}
function FigmaHistoryCard({ shipment, senderless = false }: { shipment: Shipment; senderless?: boolean }) {
  return <article className="figma-history-card"><div className="figma-history-status-row"><span className="figma-history-status-label">Status:</span><span className={`figma-history-status ${shipment.status === "delivered" ? "completed" : shipment.status}`}>{shipment.status === "delivered" ? "Completed" : humanize(shipment.status)}</span></div><div className="figma-history-sender">{senderless ? (shipment.travellerName ?? "Traveller") : shipment.senderName}</div><div className="figma-history-route">{shipment.origin}<ArrowRight size={18} />{shipment.destination}</div><div className="figma-history-size">Parcel size: {shipment.weightKg <= 1 ? "Small" : shipment.weightKg <= 5 ? "Medium" : "Large"}</div><div className="figma-history-footer"><span>Date: {new Date(shipment.createdAt).toLocaleDateString("en-GB")}</span><span>{new Date(shipment.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }).toLowerCase()}</span></div></article>;
}
function Kpi({ title, value, icon: Icon, detail, variant }: { title: string; value: string | number; icon: LucideIcon; detail: string; variant: string }) { return <section className={`kpi-card kpi-${variant}`}><div className="kpi-top"><span>{title}</span><span className="kpi-icon"><Icon size={18} /></span></div><div className="kpi-value">{value}<span className="kpi-watermark" aria-hidden="true"><Icon size={44} strokeWidth={1} /></span></div><div className="kpi-detail">{detail}</div></section>; }
function MiniStat({ label, value }: { label: string; value: string | number }) { return <div className="mini-stat"><p>{label}</p><strong>{value}</strong></div>; }
function QueueRow({ icon: Icon, title, count, onClick }: { icon: LucideIcon; title: string; count: number; onClick: () => void }) { return <button className="queue-row" onClick={onClick}><span className="queue-icon teal"><Icon size={18} /></span><span><strong>{title}</strong></span><span className="queue-count teal">{count}</span><ChevronRight size={16} /></button>; }
function OfferRow({ offer: o, snapshot, now, onSelect }: { offer: Offer; snapshot: DashboardSnapshot; now: number; onSelect: (s: Selection) => void }) { const parcel = snapshot.shipments.find(s => s.id === o.shipmentId); return <article className="offer-row"><div><strong>{o.travellerName}</strong><Status status={o.status} /><p>{o.note || "No note supplied"}</p><small>{o.status === "pending" && o.expiresAt <= now ? "Expiry passed — awaiting server expiry" : `Expires ${fullDate(o.expiresAt)}`}</small></div><dl className="detail-grid"><Detail label="Gross fee" value={money(o.quote.grossNaira)} /><Detail label={`Platform (${o.quote.platformFeePercent}%)`} value={money(o.quote.platformFeeKobo / 100)} /><Detail label="Traveller net" value={money(o.quote.travellerNetKobo / 100)} /><Detail label="Sender decision" value={o.status === "accepted" ? "Selected" : o.status === "pending" ? "Awaiting selection" : humanize(o.status)} /></dl><div className="button-row"><button className="text-button" onClick={() => onSelect({ type: "parcel", id: o.shipmentId })}>{parcel?.reference ?? "Related parcel"}<ArrowUpRight size={14} /></button><button className="text-button" onClick={() => onSelect({ type: "route", id: o.tripId })}>Travel route<ArrowUpRight size={14} /></button></div></article>; }

function Drawer({ selection, snapshot, onClose, onSelect, onAction, renderOperations, viewerPermissions = [] }: { selection: Selection; snapshot: DashboardSnapshot; onClose: () => void; onSelect: (s: Selection) => void; onAction: ActionHandler; renderOperations?: Props["renderOperations"]; viewerPermissions?: PermissionKey[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previousFocus = document.activeElement as HTMLElement; const dialog = ref.current; dialog?.show(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = overflow; previousFocus?.focus(); }; }, []);
  const key = selection.type + ("id" in selection ? selection.id : "");
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>(".drawer-header button")?.focus(); ref.current?.querySelector(".drawer-content")?.scrollTo(0, 0); }, [key]);
  const parcel = (selection.type === "parcel" || selection.type === "payout") ? snapshot.shipments.find(s => s.id === selection.id) : undefined;
  const user = selection.type === "user" ? snapshot.people.find(p => p.id === selection.id) : undefined;
  const trip = selection.type === "route" ? snapshot.trips.find(t => t.id === selection.id) : undefined;
  const dispute = selection.type === "dispute" ? snapshot.disputes.find(d => d.id === selection.id) : undefined;
  const event = selection.type === "audit" ? snapshot.events.find(e => e.id === selection.id) : undefined;
  const title = selection.type === "guide" ? "Your operations guide" : selection.type === "user" ? "Member review" : selection.type === "route" ? "Travel journey" : selection.type === "dispute" ? "Dispute review" : selection.type === "payout" ? "Financial case" : selection.type === "audit" ? "Activity details" : "Parcel details";
  return <><button className="drawer-scrim" aria-label="Close details" onClick={onClose} /><dialog className="drawer" ref={ref} aria-labelledby="drawer-heading" onCancel={e => { e.preventDefault(); onClose(); }}><div className="drawer-header"><div><p className="eyebrow">PASSENGER OPERATIONS</p><h2 id="drawer-heading">{title}</h2></div><button className="icon-button" autoFocus onClick={onClose} aria-label="Close details"><X size={20} /></button></div><div className="drawer-content" key={key}>
    {parcel && <ParcelDetail shipment={parcel} snapshot={snapshot} onSelect={onSelect} onAction={onAction} viewerPermissions={viewerPermissions} />}
    {trip && <TripDetail trip={trip} snapshot={snapshot} onSelect={onSelect} />}
    {dispute && <DisputeDetail dispute={dispute} snapshot={snapshot} onSelect={onSelect} />}
    {event && <><span className="audit-detail-icon"><Activity size={26} /></span><h3 className="audit-detail-title">{event.action}</h3><p className="audit-detail-text">{event.detail}</p><dl className="detail-grid"><Detail label="Recorded by" value={event.actorName} /><Detail label="Timestamp" value={fullDate(event.createdAt)} /><Detail label="Event ID" value={event.id} /></dl>{event.shipmentId && <button className="button" onClick={() => onSelect({ type: "parcel", id: event.shipmentId! })}>Open linked delivery<ArrowUpRight size={16} /></button>}</>}
    {selection.type === "guide" && <><div className="guide-hero"><ShieldCheck size={35} /><h3>Keep the human in every journey.</h3><p>Thoughtful decisions, backed by real evidence.</p></div>{[{ title: "Verify the person, not just the profile", text: "Open private evidence only when needed. Review pending submissions, explain rejection clearly, and let members resubmit. Never review your own identity." }, { title: "Give every parcel a second look", text: "Check contents, evidence, safety consent, exact meeting points and timing. Rejection requests changes, not cancellation. A resubmitted parcel requires another review. Physical inspection is still required at handover." }, { title: "Respect sender choice and receiver privacy", text: "Travellers offer; senders select. Capacity is reserved by acceptance, not browsing. Receiver proof is delivered by server SMS; never ask for, copy or expose a proof code in support notes." }, { title: "Listen before resolving", text: "Read participant messages, request specific information, and record reasons. Resume only eligible deliveries. An approved refund or release is not a completed money movement." }, { title: "Move money only through supported actions", text: "Provider actions must satisfy server eligibility. Wait for signed payment outcomes. Uncertain references need reconciliation, not a blind retry. Manual reconciliation records an already completed external transaction; it never sends money." }].map(item => <div className="guide-step" key={item.title}><div><h4>{item.title}</h4><p>{item.text}</p></div></div>)}<div className="notice"><CircleHelp size={18} />Press / to search, Tab to move between controls, and Escape to close a drawer.</div></>}
    {(parcel || user || trip || dispute) && renderOperations?.(selection)}
    {selection.type !== "guide" && !parcel && !user && !trip && !dispute && !event && <Empty title="This record is unavailable" description="It may have changed or your permissions may no longer allow access. Close this drawer and retry." />}
  </div><div className="drawer-footer"><ShieldCheck size={14} /><span>Operational actions are logged for accountability</span><kbd>esc</kbd></div></dialog></>;
}
export function RelatedParcel({ shipment, onClick }: { shipment: Shipment; onClick: () => void }) { return <button className="related-parcel" onClick={onClick}><Box size={18} /><span><strong>{shipment.reference}</strong><small>{shipment.origin} → {shipment.destination}</small></span><Status status={shipment.status} /><ChevronRight size={15} /></button>; }
function ParcelDetail({ shipment: s, snapshot, onSelect, onAction, viewerPermissions = [] }: { shipment: Shipment; snapshot: DashboardSnapshot; onSelect: (s: Selection) => void; onAction: ActionHandler; viewerPermissions?: PermissionKey[] }) {
  const disputes = snapshot.disputes.filter(d => d.shipmentId === s.id);
  return <><div className="parcel-detail-title"><span className="parcel-icon"><Box size={25} /></span><div><h3>{s.reference}</h3><span>Created {fullDate(s.createdAt)}</span></div><Status status={s.status} /></div><div className="detail-route"><div><MapPin size={18} /><span><small>PICKUP</small><strong>{s.origin}</strong></span></div><span className="route-connector" /><div><MapPin size={18} /><span><small>DESTINATION</small><strong>{s.destination}</strong></span></div></div><h3 className="detail-heading">Declared contents</h3><p className="description-box">{s.description}</p><dl className="detail-grid"><Detail label="Category" value={s.category} /><Detail label="Weight" value={`${s.weightKg} kg`} /><Detail label="Declared value" value={money(s.valueNaira)} /><Detail label="Gross fee" value={money(s.feeNaira)} /><Detail label="Payment status" value={humanize(s.paymentStatus)} /><Detail label="Safety consent" value={s.safetyConsent ? "Confirmed" : "Not recorded — review required"} /><Detail label="Ready for pickup" value={fullDate(s.readyAt)} /><Detail label="Delivery deadline" value={fullDate(s.deliveryDeadline)} /><Detail label="Pickup meeting point (private)" value={s.pickupInstructions} /><Detail label="Drop-off meeting point (private)" value={s.dropoffInstructions} /><Detail label="Receiver (private)" value={s.receiverName} /><Detail label="Receiver phone (private)" value={s.receiverPhone} /></dl>{s.quote && <dl className="detail-grid"><Detail label={`Platform fee (${s.quote.platformFeePercent}%)`} value={money(s.quote.platformFeeKobo / 100)} /><Detail label="Traveller net" value={money(s.quote.travellerNetKobo / 100)} /></dl>}
    <h3 className="detail-heading">People on this journey</h3><button className="person-detail-button" onClick={() => onSelect({ type: "user", id: s.senderId })}><Avatar name={s.senderName} /><span><small>SENDER</small><strong>{s.senderName}</strong></span><ArrowUpRight size={17} /></button>{s.travellerId && s.travellerName ? <button className="person-detail-button" onClick={() => onSelect({ type: "user", id: s.travellerId! })}><Avatar name={s.travellerName} /><span><small>TRAVELLER</small><strong>{s.travellerName}</strong></span><ArrowUpRight size={17} /></button> : <p className="detail-muted">No accepted traveller offer yet.</p>}{s.tripId && <button className="button wide" onClick={() => onSelect({ type: "route", id: s.tripId! })}>View linked journey<ArrowUpRight size={16} /></button>}
    {s.reviewNote && <><h3 className="detail-heading">Latest review explanation</h3><p className="description-box">{s.reviewNote}</p></>}{s.status === "rejected" && <div className="notice">Changes requested. The sender can edit evidence or details and resubmit; no cancellation has been invented. Review controls return after resubmission.</div>}{s.status === "pending_review" && viewerPermissions.includes(PERMISSIONS.DELIVERIES_MANAGE) && <ReviewForm type="review" id={s.id} onAction={onAction} />}{s.status === "pending_review" && !viewerPermissions.includes(PERMISSIONS.DELIVERIES_MANAGE) && <div className="notice">This delivery is awaiting review. Review controls require delivery manage permissions.</div>}
    <h3 className="detail-heading">Milestones, not GPS</h3><dl className="detail-grid"><Detail label="Pay-by deadline" value={fullDate(s.payByAt)} /><Detail label="Physical handover confirmed" value={fullDate(s.handoverAt)} /><Detail label="Receiver proof confirmed" value={fullDate(s.deliveredAt)} /><Detail label="Dispute hold until" value={fullDate(s.disputeUntil)} /><Detail label="Last update" value={fullDate(s.updatedAt)} /><Detail label="Exception" value={s.exception ? humanize(s.exception) : "None recorded"} /></dl>{s.cancellationReason && <p className="notice">Cancellation: {s.cancellationReason}</p>}{disputes.map(d => <button className="button wide" key={d.id} onClick={() => onSelect({ type: "dispute", id: d.id })}><Flag size={16} />{d.status === "open" ? "Open dispute — financial actions frozen" : "View resolved dispute"}</button>)}
  </>;
}
function TripDetail({ trip: t, snapshot, onSelect }: { trip: Trip; snapshot: DashboardSnapshot; onSelect: (s: Selection) => void }) { const route = tripRoute(t); const related = snapshot.shipments.filter(s => s.tripId === t.id); return <><Status status={t.status ?? "active"} /><h3 className="detail-heading">Ordered journey stops</h3><ol className="journey-stops">{route.map((stop, i) => <li key={`${stop}-${i}`}><MapPin size={17} /><strong>{stop}</strong><small>{i === 0 ? "Origin" : i === route.length - 1 ? "Destination" : `Stop ${i}`}</small>{i < route.length - 1 && <span>{t.legReservedKg?.[i] ?? t.reservedKg ?? 0} / {t.capacityKg} kg reserved on next leg</span>}</li>)}</ol><dl className="detail-grid"><Detail label="Departure" value={fullDate(t.departureAt)} /><Detail label="Estimated arrival" value={fullDate(t.arrivalAt)} /><Detail label="Total capacity" value={`${t.capacityKg} kg`} /><Detail label="Max parcel weight" value={`${t.maxParcelWeightKg ?? t.capacityKg} kg`} /><Detail label="Traveller verification" value={t.verified ? "Verified" : "Not verified"} /></dl><button className="person-detail-button" onClick={() => onSelect({ type: "user", id: t.travellerId })}><Avatar name={t.travellerName} /><strong>{t.travellerName}</strong><ArrowUpRight size={16} /></button><div className="notice">Capacity is reused on non-overlapping legs. Committed journey route and capacity cannot be edited. Cancellation must reconcile every linked booking on the server.</div><h3 className="detail-heading">Linked bookings</h3>{related.map(s => <RelatedParcel key={s.id} shipment={s} onClick={() => onSelect({ type: "parcel", id: s.id })} />)}{!related.length && <Empty title="No linked bookings" />}</>; }
function DisputeDetail({ dispute: d, snapshot, onSelect }: { dispute: Dispute; snapshot: DashboardSnapshot; onSelect: (s: Selection) => void }) { const shipment = snapshot.shipments.find(s => s.id === d.shipmentId); return <><div className="dispute-detail-heading"><Flag size={22} /><h3>{shipment?.reference ?? "Delivery dispute"}</h3><Status status={d.status} /></div><h3 className="detail-heading">Reported issue</h3><p className="description-box">{d.reason}</p><dl className="detail-grid"><Detail label="Opened" value={fullDate(d.createdAt)} /><Detail label="Previous delivery state" value={d.previousStatus ? STATUS_LABELS[d.previousStatus] : "Not recorded"} /><Detail label="Resolution" value={d.resolution ? humanize(d.resolution) : "Not resolved"} /><Detail label="Resolved at" value={fullDate(d.resolvedAt)} /></dl>{d.informationRequest && <><h3 className="detail-heading">Information requested</h3><p className="description-box">{d.informationRequest}</p></>}{d.note && <p className="description-box">{d.note}</p>}{shipment && <RelatedParcel shipment={shipment} onClick={() => onSelect({ type: "parcel", id: shipment.id })} />}<div className="notice">{d.status === "open" ? "The open dispute freezes payout/refund operations. Review participant messages, request information, and record an eligible resolution." : "Resolution is recorded separately from proof and money movement. Check the financial case for provider status."}</div></>; }
export function ReviewForm({ type, id, onAction }: { type: "user" | "review"; id: string; onAction: ActionHandler }) { const [decision, setDecision] = useState("approve"); const [tier, setTier] = useState<"Tier 1" | "Tier 2" | "Tier 3">("Tier 1"); const [note, setNote] = useState(""); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); return <form className="action-form form-stack" aria-busy={busy} onSubmit={async e => { e.preventDefault(); if (!confirmed || note.trim().length < 5 || busy) return; setBusy(true); setError(""); setSuccess(""); try { await onAction(type === "user" ? { type, id, decision: decision === "approve" ? "verified" : "rejected", tier: decision === "approve" ? tier : undefined, note: note.trim() } : { type, id, decision: decision === "approve" ? "approve" : "reject", note: note.trim() }); setSuccess("Review recorded by the server."); setConfirmed(false); } catch (e) { setError(formatErrorMessage(e, "Review failed. Nothing has been confirmed.")); } finally { setBusy(false); } }}><h3 className="detail-heading">Review submission</h3><label>Decision<select value={decision} onChange={e => { setDecision(e.target.value); setConfirmed(false); }} disabled={busy}><option value="approve">{type === "user" ? "Verify identity" : "Approve parcel"}</option><option value="reject">Request corrections / reject</option></select></label>{type === "user" && <label>Tier to assign<select value={tier} onChange={e => { setTier(e.target.value as "Tier 1" | "Tier 2" | "Tier 3"); setConfirmed(false); }} disabled={busy || decision !== "approve"}><option value="Tier 1">Tier 1</option><option value="Tier 2">Tier 2</option><option value="Tier 3">Tier 3</option></select></label>}<label>Review explanation<textarea required minLength={5} maxLength={1000} rows={4} disabled={busy} value={note} onChange={e => setNote(e.target.value)} placeholder="Explain evidence checked and any required corrections. Do not include private document numbers." /></label><label className="confirmation-check"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I checked the submission and evidence. I understand this decision is audited.</span></label>{error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="notice">{success}</p>}<button className={`button wide ${decision === "reject" ? "danger" : "primary"}`} disabled={busy || !confirmed || note.trim().length < 5}>{busy ? "Recording review…" : "Confirm review decision"}</button></form>; }

function ConSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="figma-user-context-section"><h3>{title}{count !== undefined ? <span>{count}</span> : null}</h3>{children}</section>;
}
function ConRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="figma-user-context-row"><span className="figma-user-context-label">{label}</span><span className="figma-user-context-value">{value ?? "Not provided"}</span></div>;
}
const WALLET_KIND_LABELS: Record<string, string> = { top_up: "Top Up", parcel_hold: "Parcel Hold", parcel_refund: "Parcel Refund", payout: "Payout" };
function snapshotUserDetails(snapshot: DashboardSnapshot, userId: string): SupportUserDetails | null {
  const user = snapshot.people.find(p => p.id === userId);
  if (!user) return null;
  const shipments = snapshot.shipments.filter(s => s.senderId === userId || s.travellerId === userId);
  const shipmentIds = new Set(shipments.map(s => s.id));
  const trips = snapshot.trips.filter(t => t.travellerId === userId);
  const walletTransactions = (snapshot.walletTransactions ?? []).filter(t => t.userId === userId);
  const reviewsRaw = snapshot.reviews ?? [];
  const reviewsReceived = reviewsRaw.filter(r => r.targetId === userId);
  const reviewsGiven = reviewsRaw.filter(r => r.authorId === userId);
  const disputes = snapshot.disputes.filter(d => shipmentIds.has(d.shipmentId));
  const events = snapshot.events.filter(e => e.shipmentId && shipmentIds.has(e.shipmentId));
  const activeStatuses = ["open", "matched", "funded", "in_transit"];
  return {
    user,
    stats: {
      shipmentsSent: shipments.filter(s => s.senderId === userId).length,
      shipmentsCarried: shipments.filter(s => s.travellerId === userId).length,
      activeShipments: shipments.filter(s => activeStatuses.includes(s.status)).length,
      trips: trips.length,
      activeTrips: trips.filter(t => t.status === "active").length,
      openDisputes: disputes.filter(d => d.status === "open").length,
      openChats: (snapshot.supportChats ?? []).filter(c => c.userId === userId && c.status === "unresolved").length,
      walletBalanceNaira: user.walletBalanceNaira ?? 0,
    },
    shipments,
    trips,
    walletTransactions,
    reviewsReceived,
    reviewsGiven,
    disputes,
    events,
    notifications: [],
  };
}
function SupportUserDrawer({ snapshot, userId, details, onClose }: { snapshot: DashboardSnapshot; userId: string; details: SupportUserDetails | null | undefined; onClose: () => void }) {
  const local = useMemo(() => snapshotUserDetails(snapshot, userId), [snapshot, userId]);
  const ctx = details ?? local;
  const user = ctx?.user;
  const shipmentRef = (id?: string) => ctx?.shipments.find(s => s.id === id)?.reference;
  return <div className="figma-user-context-backdrop" onClick={onClose}><aside className="figma-user-context" role="dialog" aria-modal="true" aria-label="User context" onClick={e => e.stopPropagation()}><header className="figma-user-context-header"><h2>User context</h2><button className="figma-user-context-close" aria-label="Close user context" onClick={onClose}><X size={20} /></button></header><div className="figma-user-context-body">
    {!ctx && <div className="figma-empty-row">User details are loading…</div>}
    {ctx && user && <>
      <div className="figma-user-context-profile"><div className="figma-user-context-avatar">{user.name.split(" ").map(p => p[0]).slice(0, 2).join("")}</div><div className="figma-user-context-copy"><div className="figma-user-context-name-row"><strong>{user.name}</strong>{user.suspended && <span className="figma-user-context-chip suspended">Suspended</span>}</div><div className="figma-user-context-meta"><span className={`figma-user-context-chip ${user.verification}`}>{humanize(user.verification)}</span><span>{user.tier ?? (user.verification === "verified" ? "Tier 2" : "Tier 1")}</span></div><div className="figma-user-context-meta muted">Member since {fullDate(user.joinedAt)}</div></div></div>
      <div className="figma-user-context-stats">{[["Sent", ctx.stats.shipmentsSent],["Carried", ctx.stats.shipmentsCarried],["Active now", ctx.stats.activeShipments],["Open disputes", ctx.stats.openDisputes],["Trips", ctx.stats.trips],["Active trips", ctx.stats.activeTrips],["Open chats", ctx.stats.openChats],["Wallet", money(ctx.stats.walletBalanceNaira)]].map(([label, value]) => <div className="figma-user-context-stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      <ConSection title="Contact & identity"><ConRow label="Phone" value={user.phone} /><ConRow label="Email" value={user.email ?? "Not provided"} /><ConRow label="ID document" value={user.documentType ? humanize(user.documentType) : "Not submitted"} /><ConRow label="Identity submitted" value={fullDate(user.identitySubmittedAt)} />{user.identityNote && <ConRow label="Identity note" value={user.identityNote} />}{user.suspensionReason && <ConRow label="Suspension reason" value={user.suspensionReason} />}<ConRow label="Residence" value={[user.residenceState, user.residenceLga, user.residenceAddress].filter(Boolean).join(" · ") || "Not provided"} /></ConSection>
      <ConSection title="Shipments" count={ctx.shipments.length}>{ctx.shipments.slice(0, 15).map(s => <div className="figma-user-context-item" key={s.id}><div className="figma-user-context-row-line"><strong>{s.reference}</strong><span className={`figma-user-context-chip ${s.status}`}>{STATUS_LABELS[s.status] ?? humanize(s.status)}</span></div><div className="figma-user-context-route">{s.origin} <ArrowRight size={12} /> {s.destination}</div><div className="figma-user-context-meta muted">{money(s.feeNaira)} · {s.category} · {fullDate(s.createdAt)}</div>{s.cancellationReason && <div className="figma-user-context-note">Cancelled: {s.cancellationReason}</div>}{s.exception && <div className="figma-user-context-note">Exception: {humanize(s.exception)}</div>}{s.latestLocationLabel && <div className="figma-user-context-note">Live: {s.latestLocationLabel}{s.latestLocationAt ? ` · ${fullDate(s.latestLocationAt)}` : ""}</div>}{s.missedLocationCheckIns ? <div className="figma-user-context-note">Missed location check-ins: {s.missedLocationCheckIns}</div> : null}</div>)}{!ctx.shipments.length && <div className="figma-user-context-empty">No shipments yet</div>}</ConSection>
      <ConSection title="Trips" count={ctx.trips.length}>{ctx.trips.slice(0, 10).map(t => <div className="figma-user-context-item" key={t.id}><div className="figma-user-context-row-line"><strong>{tripRoute(t).join(" → ")}</strong><span className={`figma-user-context-chip ${t.status ?? "active"}`}>{humanize(t.status ?? "active")}</span></div><div className="figma-user-context-meta muted">{fullDate(t.departureAt)} · capacity {t.capacityKg} kg</div></div>)}{!ctx.trips.length && <div className="figma-user-context-empty">No trips yet</div>}</ConSection>
      <ConSection title="Wallet activity" count={ctx.walletTransactions.length}>{ctx.walletTransactions.slice(0, 10).map(t => <div className="figma-user-context-item" key={t.id}><div className="figma-user-context-row-line"><strong>{WALLET_KIND_LABELS[t.kind] ?? humanize(t.kind)}</strong><span className="figma-user-context-meta">{money(t.amountNaira)}</span></div><div className="figma-user-context-meta muted">{t.note}{shipmentRef(t.shipmentId) ? ` · ${shipmentRef(t.shipmentId)}` : ""}</div><div className="figma-user-context-meta muted">{fullDate(t.createdAt)}</div></div>)}{!ctx.walletTransactions.length && <div className="figma-user-context-empty">No wallet activity</div>}</ConSection>
      <ConSection title="Reviews received" count={ctx.reviewsReceived.length}>{ctx.reviewsReceived.slice(0, 10).map(r => <div className="figma-user-context-item" key={r.id}><div className="figma-user-context-row-line"><strong aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: r.rating }, (_, index) => <Star key={index} size={14} fill="currentColor" />)}</strong><span className="figma-user-context-meta muted">{fullDate(r.createdAt)}</span></div>{r.comment && <div className="figma-user-context-note">{r.comment}</div>}{shipmentRef(r.shipmentId) && <div className="figma-user-context-meta muted">{shipmentRef(r.shipmentId)}</div>}</div>)}{!ctx.reviewsReceived.length && <div className="figma-user-context-empty">No reviews</div>}</ConSection>
      <ConSection title="Reviews given" count={ctx.reviewsGiven.length}>{ctx.reviewsGiven.slice(0, 10).map(r => <div className="figma-user-context-item" key={r.id}><div className="figma-user-context-row-line"><strong aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: r.rating }, (_, index) => <Star key={index} size={14} fill="currentColor" />)}</strong><span className="figma-user-context-meta muted">{fullDate(r.createdAt)}</span></div>{r.comment && <div className="figma-user-context-note">{r.comment}</div>}</div>)}{!ctx.reviewsGiven.length && <div className="figma-user-context-empty">No reviews</div>}</ConSection>
      <ConSection title="Disputes" count={ctx.disputes.length}>{ctx.disputes.slice(0, 10).map(d => <div className="figma-user-context-item" key={d.id}><div className="figma-user-context-row-line"><strong>{d.reason}</strong><span className={`figma-user-context-chip ${d.status}`}>{humanize(d.status)}</span></div><div className="figma-user-context-meta muted">{shipmentRef(d.shipmentId) ?? d.shipmentId} · {fullDate(d.createdAt)}</div>{d.resolution && <div className="figma-user-context-note">Resolved: {humanize(d.resolution)}</div>}</div>)}{!ctx.disputes.length && <div className="figma-user-context-empty">No disputes</div>}</ConSection>
      <ConSection title="Audit trail" count={ctx.events.length}>{ctx.events.slice(0, 12).map(e => <div className="figma-user-context-item" key={e.id}><div className="figma-user-context-row-line"><strong>{e.action}</strong><span className="figma-user-context-meta muted">{fullDate(e.createdAt)}</span></div><div className="figma-user-context-note">{e.detail}</div><div className="figma-user-context-meta muted">{e.actorName}{shipmentRef(e.shipmentId) ? ` · ${shipmentRef(e.shipmentId)}` : ""}</div></div>)}{!ctx.events.length && <div className="figma-user-context-empty">No audit events</div>}</ConSection>
      <ConSection title="Notifications" count={ctx.notifications.length}>{ctx.notifications.slice(0, 10).map(n => <div className="figma-user-context-item" key={n.id}><div className="figma-user-context-row-line"><strong>{n.title}</strong>{!n.readAt && <span className="figma-user-context-unread" aria-label="Unread" />}</div><div className="figma-user-context-note">{n.body}</div><div className="figma-user-context-meta muted">{fullDate(n.createdAt)}</div></div>)}{!ctx.notifications.length && <div className="figma-user-context-empty">No notifications</div>}</ConSection>
    </>}
  </div></aside></div>;
}
