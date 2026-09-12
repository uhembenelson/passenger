"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Doc, Id } from "@passenger/backend/convex/_generated/dataModel";
import { formatErrorMessage } from "@passenger/core";

type Draft = Omit<Doc<"promotions">, "_id" | "_creationTime">;
const empty: Draft = { title: "", body: "", backgroundColor: "#DCEBCB", textColor: "#183B2B", imageUrl: "", imageOnly: false, destination: "send", externalUrl: "", position: 0, published: false };
const destinations = { send: "Send a parcel", travel: "Schedule a trip", find: "Find a traveller", safety: "Trust, safety and help", activity: "Activity", external: "Website link" };

export function PromotionsManagement() {
  const promotions = useQuery(api.promotions.list);
  const create = useMutation(api.promotions.create);
  const update = useMutation(api.promotions.update);
  const remove = useMutation(api.promotions.remove);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Id<"promotions">>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<Id<"promotions">>();
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); setDraft(null); setDeleting(undefined); }
    catch (error) { setMessage(formatErrorMessage(error, "Could not save promotion.")); }
    finally { setBusy(false); }
  }
  return <section className="promotions-manager">
    <div className="promotions-heading"><div><h2>Home promotions</h2><p>Cards appear in display order. Use a colour, an image with copy, or an image-only card.</p></div><button className="button" disabled={busy} onClick={() => { setEditing(undefined); setDraft({ ...empty, position: (promotions?.at(-1)?.position ?? -1) + 1 }); }}>Add promotion</button></div>
    {message && <p role="status">{message}</p>}
    {promotions === undefined ? <p role="status">Loading promotions…</p> : !promotions.length ? <p>No promotions yet. Add a card and publish it to show it on the home screen.</p> : <div className="promotions-list">{promotions.map(p => <article key={p._id} className="promotion-item">
      <PromotionPreview value={p} />
      <p><strong>{p.title}</strong> · {p.published ? "Published" : "Draft"}</p><p>{destinations[p.destination]} · Display order {p.position}</p>
      <div className="promotions-actions"><button className="button secondary" disabled={busy} onClick={() => { const { _id, _creationTime, ...value } = p; setEditing(_id); setDraft(value); }}>Edit</button><button className="button secondary" disabled={busy} onClick={() => setDeleting(p._id)}>Delete</button></div>
      {deleting === p._id && <div><p>Delete "{p.title}"? This removes it from the home screen.</p><button className="button" disabled={busy} onClick={() => void run(() => remove({ id: p._id }), "Promotion deleted.")}>Delete promotion</button> <button disabled={busy} onClick={() => setDeleting(undefined)}>Cancel</button></div>}
    </article>)}</div>}
    {draft && <form className="promotion-editor form-stack" onSubmit={e => { e.preventDefault(); void run(() => editing ? update({ id: editing, ...draft }) : create(draft), "Promotion saved."); }}>
      <h2>{editing ? "Edit promotion" : "New promotion"}</h2>
      <fieldset disabled={busy} className="form-stack">
        <label>Title and accessibility label<input required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>Copy<textarea maxLength={250} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
        <div className="promotions-actions"><label>Background colour<input type="color" value={draft.backgroundColor} onChange={e => setDraft({ ...draft, backgroundColor: e.target.value })} /></label><label>Text colour<input type="color" value={draft.textColor} onChange={e => setDraft({ ...draft, textColor: e.target.value })} /></label></div>
        <label>Image URL<input type="url" placeholder="https://…" required={draft.imageOnly} value={draft.imageUrl} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} /><small>Use a hosted HTTPS image. Images fill the card and may be cropped.</small></label>
        <label><input type="checkbox" checked={draft.imageOnly} onChange={e => setDraft({ ...draft, imageOnly: e.target.checked })} /> Image only, with no visible text</label>
        <label>Opens<select value={draft.destination} onChange={e => setDraft({ ...draft, destination: e.target.value as Draft["destination"] })}>{Object.entries(destinations).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {draft.destination === "external" && <label>Destination URL<input type="url" required value={draft.externalUrl} onChange={e => setDraft({ ...draft, externalUrl: e.target.value })} placeholder="https://…" /></label>}
        <label>Display order<input type="number" required min={0} step={1} value={draft.position} onChange={e => setDraft({ ...draft, position: e.target.valueAsNumber })} /></label>
        <label><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} /> Published</label>
        <h3>Preview</h3><PromotionPreview value={draft} />
        <div className="promotions-actions"><button className="button" type="submit">{busy ? "Saving…" : "Save promotion"}</button><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button></div>
      </fieldset>
    </form>}
  </section>;
}
function PromotionPreview({ value }: { value: Draft }) {
  return <div className="promotion-preview" style={{ backgroundColor: value.backgroundColor, color: value.textColor }}>
    {value.imageUrl && <img src={value.imageUrl} alt={value.imageOnly ? value.title : ""} />}
    {!value.imageOnly && <div style={{ backgroundColor: value.imageUrl ? value.backgroundColor : undefined }}><strong>{value.title || "Promotion title"}</strong>{value.body && <p>{value.body}</p>}<span>Explore →</span></div>}
  </div>;
}
