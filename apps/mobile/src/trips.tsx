import React, { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { tripRoute } from "@passenger/core";
import type { Trip } from "@passenger/core";
import { usePassenger } from "./data";
import { TripForm } from "./forms";
import { Badge, Button, Card, Empty, errorMessage, Field, Notice, s, SectionTitle, timeDate, Txt } from "./ui";

export function MyTrips({ onCreate }: { onCreate: () => void }) {
  const { snapshot, offline } = usePassenger();
  const viewer = snapshot!.viewer!;
  const cancel = useMutation(api.journeys.cancel);
  const trips = snapshot!.trips.filter(t => t.travellerId === viewer.id);
  const [editing, setEditing] = useState<Trip>();
  const [cancelling, setCancelling] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cancelTrip = async (currentTripId: string) => {
    setBusy(true);
    setError("");
    try {
      await cancel({ tripId: currentTripId as Id<"trips">, reason: reason.trim() });
      setCancelling("");
      setReason("");
      setNotice("Your trip was cancelled.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return <View style={{ gap: 14, marginBottom: 28 }}>
    <SectionTitle title="Your journeys" subtitle="Ordered stops, honest capacity and clear arrival estimates." action="Publish a trip" onAction={onCreate} />
    {error !== "" && <Notice tone="error">{error}</Notice>}
    {notice !== "" && <Notice tone="success">{notice}</Notice>}
    {!trips.length ? <Empty title="Make room for your first parcel." detail="Publish where you are already going, including intermediate stops and spare capacity." action="Publish a trip" onAction={onCreate} /> : trips.map(trip => {
      const route = tripRoute(trip);
      const ended = trip.status === "cancelled" || trip.status === "completed" || trip.departureAt <= Date.now();
      const committed = (trip.reservedKg || 0) > 0 || snapshot!.shipments.some(s => s.tripId === trip.id && !["cancelled", "rejected"].includes(s.status));
      return <Card key={trip.id}>
        <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
          <Txt style={s.h3}>{route.join(" → ")}</Txt>
          <Badge label={trip.status === "cancelled" ? "Cancelled" : trip.status === "completed" ? "Completed" : ended ? "Departed" : committed ? "Has bookings" : "Open for offers"} tone={ended ? "neutral" : "green"} />
        </View>
        <Txt style={[s.muted, { marginTop: 10 }]}>Departs {timeDate(trip.departureAt)}{trip.arrivalAt ? ` · arrives ${timeDate(trip.arrivalAt)}` : " · arrival estimate missing"}</Txt>
        <Txt style={[s.muted, { marginTop: 5 }]}>{trip.capacityKg} kg total capacity · up to {trip.maxParcelWeightKg ?? trip.capacityKg} kg per parcel</Txt>
        <View style={{ gap: 6, marginTop: 14 }}>{route.slice(0, -1).map((city, i) => <Txt key={`${trip.id}:${city}:${i}`} style={s.hint}>{city} → {route[i + 1]}: {Math.max(0, trip.capacityKg - (trip.legReservedKg?.[i] ?? trip.reservedKg ?? 0))} kg available</Txt>)}</View>
        {committed && <Txt style={[s.hint, { marginTop: 10 }]}>Route and capacity edits are locked after a booking. Space can be reused on non-overlapping legs.</Txt>}
        {!ended && <View style={[s.wrap, { marginTop: 16 }]}><Button title="Edit trip" small variant="secondary" disabled={offline || committed || viewer.suspended} onPress={() => setEditing(trip)} /><Button title="Cancel trip" small variant="ghost" disabled={offline || busy} onPress={() => { setCancelling(trip.id); setReason(""); setError(""); }} /></View>}
        {cancelling === trip.id && <View style={{ gap: 12, marginTop: 15 }}>
          <Notice tone="warning">Cancellation affects every linked booking. Unpaid reservations reopen; paid bookings require server-managed refund/reconciliation. In-transit parcels may prevent cancellation.</Notice>
          <Field label="Cancellation reason" value={reason} onChangeText={setReason} multiline maxLength={1000} />
          <View style={s.wrap}>
            <Button title="Keep trip" variant="secondary" disabled={busy} onPress={() => setCancelling("")} />
            <Button title="Confirm cancellation" variant="danger" busy={busy} disabled={offline || reason.trim().length < 5} onPress={() => void cancelTrip(trip.id)} />
          </View>
        </View>}
      </Card>;
    })}
    {editing && <TripForm trip={editing} onClose={() => setEditing(undefined)} onSuccess={() => { setEditing(undefined); setNotice("Your trip changes were saved."); }} />}
  </View>;
}
