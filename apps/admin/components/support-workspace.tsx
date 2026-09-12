"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { formatErrorMessage, money, PERMISSIONS, type DashboardSnapshot, type SupportContextKind } from "@passenger/core";
import type { Selection } from "./dashboard";

const date = (value: number) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const label = (value: string) => value.replaceAll("_", " ");

export function SupportWorkspace({ snapshot, selectedId, onSelect, onOpenRecord }: { snapshot: DashboardSnapshot; selectedId: string | null; onSelect: (id: string | null) => void; onOpenRecord: (selection: Selection) => void }) {
  const chats = useQuery(api.support.listChats, {});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("unresolved");
  const [kind, setKind] = useState("all");
  const [assignment, setAssignment] = useState("all");
  const [creating, setCreating] = useState(false);
  const canManage = snapshot.viewerPermissions?.includes(PERMISSIONS.SUPPORT_MANAGE) ?? false;
  if (selectedId) return <SupportRequest key={selectedId} id={selectedId as Id<"supportChats">} canManage={canManage} onBack={() => onSelect(null)} onOpenRecord={onOpenRecord} />;
  const shown = chats?.filter(chat => (status === "archived" ? !!chat.deletedAt : !chat.deletedAt && (status === "all" || chat.status === status)) && (kind === "all" || chat.contextKind === kind) && (assignment === "all" || assignment === "unassigned" && !chat.assignedTo || assignment === "mine" && chat.assignedTo === snapshot.viewer?.id) && `${chat.userName} ${chat.subject ?? ""} ${chat.contextLabel ?? ""} ${chat.contextReference ?? ""} ${chat.shipmentId ?? ""} ${chat.tripId ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="support-workspace">
    <header className="support-heading"><div><h1>Support requests</h1><p>Review the issue, its delivery or trip, and the conversation in one place.</p></div>{canManage && <button className="primary-button" onClick={() => setCreating(true)}>New request</button>}</header>
    <div className="support-filters">
      <label>Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer, subject or record ID" /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="unresolved">Open</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All active records</option><option value="archived">Archived</option></select></label>
      <label>Issue about<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">All issues</option><option value="delivery">Delivery</option><option value="trip">Trip</option><option value="other">Other</option></select></label>
      <label>Assigned to<select value={assignment} onChange={e => setAssignment(e.target.value)}><option value="all">Anyone</option><option value="mine">Me</option><option value="unassigned">Unassigned</option></select></label>
    </div>
    {!chats ? <p role="status">Loading support requests…</p> : <div className="support-request-list">{shown?.map(chat => <button className="support-request-row" key={chat.id} onClick={() => onSelect(chat.id)}><span><strong>{chat.subject || "Support request"}</strong><small>{chat.userName} · {chat.contextKind === "other" ? "Other issue" : label(chat.contextKind)}{chat.contextLabel ? ` · ${chat.contextLabel}` : ""}{chat.contextReference ? ` · ${chat.contextReference}` : ""}</small><span>{chat.lastMessage}</span></span><span><strong>{chat.deletedAt ? "Archived" : chat.status === "unresolved" ? "Open" : label(chat.status)}</strong><small>{chat.assignedByName ?? "Unassigned"}</small><small>{date(chat.lastMessageAt)}</small></span></button>)}{!shown?.length && <p className="notice">No requests match these filters.</p>}</div>}
    {creating && <RequestEditor people={snapshot.people} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); onSelect(id); }} />}
  </section>;
}

function SupportRequest({ id, canManage, onBack, onOpenRecord }: { id: Id<"supportChats">; canManage: boolean; onBack: () => void; onOpenRecord: (selection: Selection) => void }) {
  const request = useQuery(api.support.requestDetails, { chatId: id });
  const messages = useQuery(api.support.getMessages, { chatId: id });
  const events = useQuery(api.support.requestEvents, { chatId: id });
  const agents = useQuery(api.support.agents, {});
  const claimView = useMutation(api.support.claimView);
  const releaseView = useMutation(api.support.releaseView);
  const [presence, setPresence] = useState("");
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const claim = async () => {
      try {
        const result = await claimView({ chatId: id });
        if (active) setPresence(!result.claimed && "currentViewer" in result ? result.currentViewer ?? "" : "");
      } catch { /* Conversation and assignment remain usable if presence is unavailable. */ }
    };
    void claim();
    const timer = setInterval(() => void claim(), 60000);
    return () => { active = false; clearInterval(timer); void releaseView({ chatId: id }).catch(() => {}); };
  }, [id, canManage, claimView, releaseView]);
  const send = useMutation(api.support.sendMessage);
  const addNote = useMutation(api.support.addNote);
  const resolve = useMutation(api.support.markResolved);
  const reopen = useMutation(api.support.reopenChat);
  const archive = useMutation(api.support.setArchived);
  const handover = useMutation(api.support.handover);
  const qa = useMutation(api.support.qaReview);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qaNote, setQaNote] = useState("");
  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(formatErrorMessage(cause)); } finally { setBusy(false); }
  };
  if (!request) return <div className="support-workspace"><button onClick={onBack}>Back to requests</button><p role="status">Loading request…</p></div>;
  const context = request.context;
  const locked = busy || !canManage || !!request.deletedAt;
  return <section className="support-workspace">
    <button className="secondary-button" onClick={onBack} disabled={busy}>Back to requests</button>
    <header className="support-heading"><div><h1>{request.subject || "Support request"}</h1><p>{request.userName} · {request.deletedAt ? "Archived" : request.status === "unresolved" ? "Open" : label(request.status)} · Opened {date(request.createdAt)}</p></div><button className="secondary-button" onClick={() => onOpenRecord({ type: "user", id: request.userId })}>Customer details</button></header>
    {!!error && <p className="notice error" role="alert">{error}</p>}
    {!!presence && <p className="notice">{presence} is currently viewing this request.</p>}
    <div className="support-detail-grid"><div className="support-thread">
      <section className="support-context"><div className="support-heading"><h2>{request.contextKind === "other" ? "Other issue" : `Related ${request.contextKind}`}</h2>{canManage && <button disabled={locked} onClick={() => setEditing(true)}>Edit request</button>}</div>
        {context ? <><h3>{context.origin} → {context.destination}</h3><p>{context.reference} · {label(context.status)} · {date(context.date)}</p>
          {context.kind === "delivery" ? <dl><dt>Contents</dt><dd>{context.description}</dd><dt>Weight</dt><dd>{context.weightKg} kg</dd><dt>Pickup</dt><dd>{context.pickup}</dd><dt>Drop-off</dt><dd>{context.dropoff}</dd><dt>Delivery fee</dt><dd>{money(context.feeNaira)} · {label(context.paymentStatus)}</dd></dl> : <dl><dt>Arrival</dt><dd>{context.arrivalAt ? date(context.arrivalAt) : "Not provided"}</dd><dt>Stops</dt><dd>{context.stops?.join(" → ") || "Direct trip"}</dd><dt>Capacity</dt><dd>{context.capacityKg} kg</dd></dl>}
          <button onClick={() => onOpenRecord({ type: context.kind === "delivery" ? "parcel" : "route", id: context.id })}>Open {context.kind} record</button></> : <p>{request.contextKind === "other" ? "No delivery or trip is linked to this request." : "The linked record is no longer available. The conversation remains available."}</p>}
      </section>
      {request.resolutionNote && <section className="support-context"><h2>Resolution</h2><p>{request.resolutionNote}</p></section>}
      <section className="support-messages" aria-label="Conversation">{messages === undefined ? <p>Loading conversation…</p> : messages.map(message => <article key={message.id} className={message.authorId === request.userId ? "support-message customer" : "support-message agent"}><header><strong>{message.authorName}{message.authorId === request.userId ? "" : " · Support"}</strong><time>{date(message.createdAt)}</time></header><p>{message.body}</p>{message.attachments.map(file => file.url ? <a key={file.id} href={file.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 8 }}>View photo: {file.filename}</a> : <p key={file.id}>Photo unavailable</p>)}</article>)}</section>
      {canManage && !request.deletedAt && <form className="support-compose" onSubmit={e => { e.preventDefault(); void act(async () => { if (internal) await addNote({ chatId: id, body }); else await send({ chatId: id, body }); setBody(""); }); }}>
        <label><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} disabled={busy} /> Internal note, visible only to support</label>
        <label>{internal ? "Internal note" : "Reply to customer"}<textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={2000} disabled={busy} required /></label><button className="primary-button" disabled={busy || !body.trim()}>{busy ? "Saving…" : internal ? "Save note" : "Send reply"}</button>
      </form>}
    </div><aside className="support-handling">
      <section className="support-context"><h2>Handling</h2><label>Assigned agent<select value={request.assignedTo ?? ""} disabled={locked} onChange={e => { const agent = agents?.find(item => item.id === e.target.value); if (agent) void act(() => handover({ chatId: id, newAgentId: agent.id, newAgentName: agent.name })); }}><option value="">Unassigned</option>{agents?.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        {canManage && !request.deletedAt && (request.status === "unresolved" ? <form onSubmit={e => { e.preventDefault(); void act(async () => { await resolve({ chatId: id, resolution: "support_resolved", note: resolution }); setResolution(""); }); }}><label>Resolution shared with customer<textarea rows={3} maxLength={2000} required value={resolution} onChange={e => setResolution(e.target.value)} disabled={busy} /></label><button disabled={busy || !resolution.trim()}>Resolve request</button></form> : <><button disabled={busy} onClick={() => void act(() => reopen({ chatId: id }))}>Reopen request</button><button disabled={busy} onClick={() => void act(() => archive({ chatId: id, archived: true }))}>Archive request</button><label>Quality review note<textarea value={qaNote} onChange={e => setQaNote(e.target.value)} maxLength={2000} rows={2} disabled={busy} /></label><div className="support-actions"><button disabled={busy} onClick={() => void act(() => qa({ chatId: id, score: "approved", note: qaNote }))}>Approve handling</button><button disabled={busy || !qaNote.trim()} onClick={() => void act(() => qa({ chatId: id, score: "needs_work", note: qaNote }))}>Needs work</button></div></>)}
        {canManage && request.deletedAt && <button disabled={busy} onClick={() => void act(() => archive({ chatId: id, archived: false }))}>Restore request</button>}
      </section>
      <section className="support-context"><h2>Activity and internal notes</h2>{events === undefined ? <p>Loading activity…</p> : events.map(event => <article className="support-event" key={event._id}><strong>{event.action === "internal_note" ? "Internal note" : label(event.action)} · {event.actorName}</strong><p>{event.detail}</p><small>{date(event.createdAt)}</small></article>)}</section>
    </aside></div>
    {editing && <RequestEditor userId={request.userId} request={{ id, subject: request.subject ?? "", kind: request.contextKind, recordId: context?.id ?? "" }} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
  </section>;
}

function RequestEditor({ people, userId: fixedUserId, request, onClose, onSaved }: { people?: DashboardSnapshot["people"]; userId?: Id<"users">; request?: { id: Id<"supportChats">; subject: string; kind: SupportContextKind; recordId: string }; onClose: () => void; onSaved: (id: Id<"supportChats">) => void }) {
  const [userId, setUserId] = useState(fixedUserId ?? "");
  const [kind, setKind] = useState<SupportContextKind>(request?.kind ?? "other");
  const [recordId, setRecordId] = useState(request?.recordId ?? "");
  const [subject, setSubject] = useState(request?.subject ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = useQuery(api.support.contextOptions, userId ? { userId: userId as Id<"users"> } : "skip");
  const create = useMutation(api.support.createChat);
  const update = useMutation(api.support.updateRequest);
  const records = kind === "delivery" ? options?.deliveries : options?.trips;
  const ready = !!userId && (kind === "other" || !!records?.some(item => item.id === recordId));
  return <div className="figma-resolve-modal-overlay" role="dialog" aria-modal="true" aria-label={request ? "Edit support request" : "New support request"}><form className="figma-resolve-modal support-editor" onSubmit={async e => {
    e.preventDefault(); if (!ready || busy) return; setBusy(true); setError("");
    const context = { contextKind: kind, shipmentId: kind === "delivery" ? recordId as Id<"shipments"> : undefined, tripId: kind === "trip" ? recordId as Id<"trips"> : undefined };
    try { if (request) { await update({ chatId: request.id, subject, ...context }); onSaved(request.id); } else { const id = await create({ userId: userId as Id<"users">, subject, body, ...context }); onSaved(id); } } catch (cause) { setError(formatErrorMessage(cause)); } finally { setBusy(false); }
  }}><h2>{request ? "Edit request" : "New support request"}</h2>
    {!fixedUserId && <label>Customer<select required value={userId} disabled={busy} onChange={e => { setUserId(e.target.value); setRecordId(""); }}><option value="">Choose a customer</option>{people?.map(person => <option key={person.id} value={person.id}>{person.name} · {person.phone}</option>)}</select></label>}
    <label>Issue about<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value as SupportContextKind); setRecordId(""); }}><option value="delivery">A delivery</option><option value="trip">A trip</option><option value="other">Other issue</option></select></label>
    {kind !== "other" && <label>{kind === "delivery" ? "Delivery" : "Trip"}<select required value={recordId} disabled={busy || !options} onChange={e => setRecordId(e.target.value)}><option value="">Choose a record</option>{[false, true].map(past => <optgroup key={String(past)} label={past ? "Past" : "Ongoing"}>{records?.filter(item => item.past === past).map(item => <option key={item.id} value={item.id}>{item.origin} to {item.destination} · {item.reference} · {date(item.date)}</option>)}</optgroup>)}</select></label>}
    {ready && <><label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} required disabled={busy} /></label>{!request && <label>Message to customer<textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={2000} required disabled={busy} /></label>}</>}
    {!!error && <p role="alert">{error}</p>}<div className="support-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !ready || !subject.trim() || (!request && !body.trim())}>{busy ? "Saving…" : request ? "Save changes" : "Create request"}</button></div>
  </form></div>;
}
