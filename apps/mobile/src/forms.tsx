import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, MapPin, Package, Phone, User } from "lucide-react-native";
import { CATEGORIES, CITIES, money, validateShipment, validateTrip } from "@passenger/core";
import type { CreateShipmentInput, CreateTripInput, Shipment, Trip } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { EvidencePicker } from "./evidence";
import { Button, colors, errorMessage, Field, fontFamily, FullScreenSheet, Notice, PresentationSheet, s, Sheet, Txt } from "./ui";

const fallbackServiceArea = { baseLocation: "Jos", destinations: ["Abuja", "Kaduna", "Lagos"] };

const form = StyleSheet.create({
  intro: { marginBottom: primitives.space[4] },
  notice: { marginBottom: primitives.space[4] },
  sectionCard: { gap: primitives.space[3], marginBottom: primitives.space[4] },
  sectionLabel: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  sectionHint: { marginBottom: primitives.space[3] },
  footer: { textAlign: "center", marginTop: primitives.space[3] },
  row: { flexDirection: "row", gap: primitives.space[3] },
  column: { flex: 1 },
  // Mobile dropdown select
  select: { minHeight: 56, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  selectActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  selectText: { flex: 1, color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
  selectPlaceholder: { color: semantic.color.text.tertiary },
  selectOptions: { gap: primitives.space[2], marginTop: primitives.space[1] },
  selectOption: { paddingHorizontal: primitives.space[4], paddingVertical: primitives.space[3], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  selectOptionActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  selectOptionText: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  selectOptionSelected: { color: semantic.color.text.success, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  // Date/time picker buttons
  pickerRow: { flexDirection: "row", gap: primitives.space[3] },
  pickerCol: { flex: 1, gap: primitives.space[2] },
  pickerBtn: { minHeight: 56, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, paddingHorizontal: primitives.space[3], flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[2] },
  pickerBtnActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  pickerBtnText: { flex: 1, color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
  pickerBtnPlaceholder: { color: semantic.color.text.tertiary },
  // Category chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: primitives.space[2] },
  chip: { paddingHorizontal: primitives.space[3], paddingVertical: primitives.space[2] + 2, minHeight: 40, justifyContent: "center", borderRadius: primitives.radius.lg, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, backgroundColor: semantic.color.background.surface },
  chipSelected: { backgroundColor: semantic.color.brand.primary, borderColor: semantic.color.brand.primary },
  chipDisabled: { opacity: primitives.opacity.disabled },
  chipText: { fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: semantic.color.text.primary, fontFamily: fontFamily.medium },
  chipTextSelected: { color: semantic.color.text.onPrimary },
  // Calendar picker
  calCard: { borderRadius: primitives.radius.xl, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, padding: primitives.space[4], gap: primitives.space[3] },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: primitives.space[1] },
  calNav: { width: 36, height: 36, borderRadius: primitives.radius.md, backgroundColor: semantic.color.background.subtle, alignItems: "center", justifyContent: "center" },
  calNavDisabled: { opacity: 0.3 },
  calTitle: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, fontFamily: fontFamily.semibold },
  calWeekRow: { flexDirection: "row", justifyContent: "space-around", borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: semantic.color.border.subtle, paddingBottom: primitives.space[2] },
  calDayHeader: { width: 36, alignItems: "center" },
  calDayHeaderText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, fontFamily: fontFamily.medium },
  calGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", rowGap: primitives.space[1] },
  calCell: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  calCellSelected: { backgroundColor: semantic.color.brand.primary },
  calCellToday: { borderWidth: 1.5, borderColor: semantic.color.brand.primary },
  calDayText: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodySm, fontFamily: fontFamily.regular },
  calDayDisabled: { color: semantic.color.text.tertiary, opacity: 0.35 },
  calDaySelected: { color: semantic.color.text.onPrimary, fontFamily: fontFamily.semibold },
  calDayToday: { color: semantic.color.brand.primary, fontFamily: fontFamily.semibold },
  // Time picker
  timeCard: { borderRadius: primitives.radius.xl, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, padding: primitives.space[4], gap: primitives.space[2] },
  timeSectionTitle: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodyXs, fontFamily: fontFamily.semibold, textTransform: "uppercase", letterSpacing: 0.8 },
  timePresetsRow: { gap: primitives.space[2], paddingVertical: primitives.space[1] },
  timePreset: { paddingHorizontal: primitives.space[3], paddingVertical: primitives.space[2], borderRadius: primitives.radius.md, backgroundColor: semantic.color.background.subtle, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, alignItems: "center", gap: 2 },
  timePresetSelected: { backgroundColor: semantic.color.background.successSoft, borderColor: semantic.color.brand.primary },
  timePresetLabel: { color: semantic.color.text.tertiary, fontSize: 10, fontFamily: fontFamily.regular },
  timePresetLabelSelected: { color: semantic.color.brand.primary },
  timePresetTime: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodySm, fontFamily: fontFamily.medium },
  timePresetTimeSelected: { color: semantic.color.brand.primary, fontFamily: fontFamily.semibold },
  timePeriodRow: { flexDirection: "row", gap: primitives.space[2], marginTop: primitives.space[1] },
  timePeriodBtn: { flex: 1, paddingVertical: primitives.space[2], borderRadius: primitives.radius.md, backgroundColor: semantic.color.background.subtle, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, alignItems: "center" },
  timePeriodActive: { backgroundColor: semantic.color.brand.primary, borderColor: semantic.color.brand.primary },
  timePeriodText: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, fontFamily: fontFamily.medium },
  timePeriodTextActive: { color: semantic.color.text.onPrimary, fontFamily: fontFamily.semibold },
  timeSubLabel: { color: semantic.color.text.tertiary, fontSize: 11, fontFamily: fontFamily.medium, marginTop: 4 },
  timePillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  timePill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: primitives.radius.sm, backgroundColor: semantic.color.background.subtle, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, minWidth: 38, alignItems: "center" },
  timePillActive: { backgroundColor: semantic.color.brand.primary, borderColor: semantic.color.brand.primary },
  timePillText: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodySm, fontFamily: fontFamily.regular },
  timePillTextActive: { color: semantic.color.text.onPrimary, fontFamily: fontFamily.semibold },
  // Divider
  divider: { height: 1, backgroundColor: semantic.color.border.subtle, marginVertical: primitives.space[4] },
  // Stops
  stops: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 18, backgroundColor: "#FCFCF8" },
  stop: { borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 14, paddingBottom: 14 },
  stopTools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryLabel: { marginBottom: primitives.space[3] },
  categoryGroup: { marginBottom: primitives.space[5] },
  categorySelected: { backgroundColor: semantic.color.brand.primary },
  categoryUnselected: { backgroundColor: semantic.color.background.subtle },
  categoryDisabled: { opacity: primitives.opacity.disabled },
  categoryText: { fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, color: semantic.color.text.primary },
  category: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: "center", borderRadius: 8 },
});

function FormRow({ children }: React.PropsWithChildren) {
  return <View style={form.row}>{React.Children.map(children, child => child && <View style={form.column}>{child}</View>)}</View>;
}

// ─── Mobile Route Dropdown ──────────────────────────────────────────────────
function ShipmentLocationDropdown({ label, value, placeholder, isOpen, onToggle, disabled }: {
  label: string; value: string; placeholder: string; isOpen: boolean; onToggle: () => void; disabled: boolean;
}) {
  return (
    <View style={form.sectionCard}>
      <Txt style={form.sectionLabel}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        disabled={disabled}
        onPress={onToggle}
        style={[form.select, isOpen && form.selectActive, disabled && { opacity: primitives.opacity.disabled }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <MapPin size={20} color={value ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
          <Txt style={[form.selectText, !value && form.selectPlaceholder]}>{value || placeholder}</Txt>
        </View>
        <ChevronDown size={20} color={colors.text} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

// ─── Calendar Picker ────────────────────────────────────────────────────────
function ShipmentCalendarPicker({ selectedValue, onSelect }: { selectedValue: string; onSelect: (date: string) => void }) {
  const initialDate = useMemo(() => {
    if (selectedValue && /^\d{4}-\d{2}-\d{2}$/.test(selectedValue)) {
      const [y, m] = selectedValue.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  }, [selectedValue]);

  const [currentMonth, setCurrentMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);
  const maxDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()), [today]);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthLabel = currentMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const canGoPrev = new Date(year, month, 0) >= today;
  const canGoNext = new Date(year, month + 1, 1) <= maxDate;

  return (
    <View style={form.calCard}>
      <View style={form.calHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canGoPrev} onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={[form.calNav, !canGoPrev && form.calNavDisabled]}>
          <ChevronLeft size={18} color={canGoPrev ? colors.text : colors.muted} strokeWidth={2.2} />
        </Pressable>
        <Txt style={form.calTitle}>{monthLabel}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={!canGoNext} onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={[form.calNav, !canGoNext && form.calNavDisabled]}>
          <ChevronRight size={18} color={canGoNext ? colors.text : colors.muted} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={form.calWeekRow}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(name => <View key={name} style={form.calDayHeader}><Txt style={form.calDayHeaderText}>{name}</Txt></View>)}
      </View>
      <View style={form.calGrid}>
        {days.map((day, idx) => {
          if (day === null) return <View key={`e-${idx}`} style={form.calCell} />;
          const dayDate = new Date(year, month, day, 0, 0, 0, 0);
          const isPast = dayDate.getTime() < today.getTime();
          const isTooFar = dayDate.getTime() > maxDate.getTime();
          const off = isPast || isTooFar;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = selectedValue === dateStr;
          const isToday = dayDate.getTime() === today.getTime();
          return (
            <Pressable key={`d-${day}`} accessibilityRole="button" accessibilityLabel={`${day} ${monthLabel}`} disabled={off} onPress={() => onSelect(dateStr)}
              style={[form.calCell, isSelected && form.calCellSelected, isToday && !isSelected && form.calCellToday]}
            >
              <Txt style={[form.calDayText, off && form.calDayDisabled, isSelected && form.calDaySelected, isToday && !isSelected && form.calDayToday]}>{day}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Time Picker ────────────────────────────────────────────────────────────
const TIME_PRESETS = [
  { label: "Morning", time: "08:00", display: "08:00 AM" },
  { label: "Midday", time: "11:30", display: "11:30 AM" },
  { label: "Afternoon", time: "14:00", display: "02:00 PM" },
  { label: "Evening", time: "17:30", display: "05:30 PM" },
  { label: "Night", time: "20:00", display: "08:00 PM" },
];

function ShipmentTimePicker({ selectedValue, onSelect }: { selectedValue: string; onSelect: (time: string) => void }) {
  const initialTime = useMemo(() => {
    if (selectedValue && /^([01]\d|2[0-3]):[0-5]\d$/.test(selectedValue)) {
      const [h, m] = selectedValue.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return { hour: h12, minute: m, period: period as "AM" | "PM" };
    }
    const nextHour = (new Date().getHours() + 2) % 24;
    const p = nextHour >= 12 ? "PM" : "AM";
    const h12 = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour;
    return { hour: h12, minute: 0, period: p as "AM" | "PM" };
  }, [selectedValue]);

  const [hour, setHour] = useState(initialTime.hour);
  const [minute, setMinute] = useState(initialTime.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(initialTime.period);

  const handleApply = () => {
    let h = hour;
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    onSelect(`${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  };

  return (
    <View style={form.timeCard}>
      <Txt style={form.timeSectionTitle}>Quick Select</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={form.timePresetsRow}>
        {TIME_PRESETS.map(preset => {
          const isSelected = selectedValue === preset.time;
          return (
            <Pressable key={preset.time} accessibilityRole="button" accessibilityLabel={`${preset.label}: ${preset.display}`} onPress={() => onSelect(preset.time)} style={[form.timePreset, isSelected && form.timePresetSelected]}>
              <Txt style={[form.timePresetLabel, isSelected && form.timePresetLabelSelected]}>{preset.label}</Txt>
              <Txt style={[form.timePresetTime, isSelected && form.timePresetTimeSelected]}>{preset.display}</Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      <Txt style={[form.timeSectionTitle, { marginTop: 10 }]}>Custom Time</Txt>
      <View style={form.timePeriodRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="AM" onPress={() => setPeriod("AM")} style={[form.timePeriodBtn, period === "AM" && form.timePeriodActive]}><Txt style={[form.timePeriodText, period === "AM" && form.timePeriodTextActive]}>AM</Txt></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="PM" onPress={() => setPeriod("PM")} style={[form.timePeriodBtn, period === "PM" && form.timePeriodActive]}><Txt style={[form.timePeriodText, period === "PM" && form.timePeriodTextActive]}>PM</Txt></Pressable>
      </View>
      <Txt style={form.timeSubLabel}>Hour</Txt>
      <View style={form.timePillsRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
          <Pressable key={`h-${h}`} accessibilityRole="button" accessibilityLabel={`${h} o'clock`} onPress={() => setHour(h)} style={[form.timePill, hour === h && form.timePillActive]}>
            <Txt style={[form.timePillText, hour === h && form.timePillTextActive]}>{String(h).padStart(2, "0")}</Txt>
          </Pressable>
        ))}
      </View>
      <Txt style={form.timeSubLabel}>Minute</Txt>
      <View style={form.timePillsRow}>
        {[0, 15, 30, 45].map(m => (
          <Pressable key={`m-${m}`} accessibilityRole="button" accessibilityLabel={`${m} minutes`} onPress={() => setMinute(m)} style={[form.timePill, minute === m && form.timePillActive]}>
            <Txt style={[form.timePillText, minute === m && form.timePillTextActive]}>:{String(m).padStart(2, "0")}</Txt>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 12 }}>
        <Button title={`Set Time · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`} variant="lime" onPress={handleApply} />
      </View>
    </View>
  );
}

// ─── Display format helpers ─────────────────────────────────────────────────
function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  if (!Number.isFinite(dateObj.getTime())) return dateStr;
  return dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDisplayTime(timeStr: string) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  if (!hStr || !mStr) return timeStr;
  let h = Number(hStr);
  const m = mStr.padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${String(h).padStart(2, "0")}:${m} ${period}`;
}

// ─── Existing helpers (preserved) ───────────────────────────────────────────
export function CityField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  const suggestions = CITIES.filter(city => !value.trim() || city.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 4);
  return <View style={{ flex: 1, minWidth: 115 }}>
    <Field label={label} value={value} onChangeText={onChange} placeholder="Enter a city" maxLength={80} editable={!disabled} autoCapitalize="words" onFocus={() => setShow(true)} onBlur={() => setShow(false)} />
    {show && !disabled && suggestions.length > 0 && <View style={[s.wrap, { marginTop: -9, marginBottom: 14 }]}>{suggestions.map(city => <Pressable key={city} accessibilityRole="button" accessibilityLabel={`Use ${city} for ${label}`} onPressIn={() => { onChange(city); setShow(false); }} style={{ paddingHorizontal: 11, paddingVertical: 12, minHeight: 44, borderRadius: 7, backgroundColor: colors.soft }}><Txt style={{ fontSize: 11 }}>{city}</Txt></Pressable>)}</View>}
  </View>;
}

type LocalDateTime = { date: string; time: string };
function localDateTime(timestamp?: number): LocalDateTime {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return { date: "", time: "" };
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

function parseLocalDateTime(value: LocalDateTime, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
    throw new Error(`${label}: enter a date as YYYY-MM-DD and a local 24-hour time as HH:MM.`);
  }
  const [year, month, day] = value.date.split("-").map(Number);
  const [hour, minute] = value.time.split(":").map(Number);
  const date = new Date(`${value.date}T${value.time}:00`);
  // Compare every local part: Date otherwise silently rolls invalid calendar dates
  // and daylight-saving gaps forward. Do not interpret the user's entry as UTC.
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error(`${label}: enter a real calendar date and a time that exists in your device's timezone.`);
  }
  return date.getTime();
}

function DateTimeFields({ label, value, onChange, hint, disabled }: { label: string; value: LocalDateTime; onChange: (value: LocalDateTime) => void; hint: string; disabled: boolean }) {
  return <View>
    <FormRow>
      <Field label={`${label} date`} value={value.date} onChangeText={date => onChange({ ...value, date })} placeholder="YYYY-MM-DD" maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!disabled} hint={hint} />
      <Field label={`${label} time`} value={value.time} onChangeText={time => onChange({ ...value, time })} placeholder="HH:MM" maxLength={5} autoCapitalize="none" autoCorrect={false} editable={!disabled} hint="24-hour · your device's local time" />
    </FormRow>
  </View>;
}

function Consent({ checked, onChange, disabled, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)} style={[s.checkRow, disabled && { opacity: 0.6 }]}>
    <View style={[s.checkbox, checked && { backgroundColor: colors.forest, borderColor: colors.forest }]}>{checked && <Txt style={{ color: "white", fontSize: 13 }}>✓</Txt>}</View>
    <Txt style={{ flex: 1, fontSize: 12, lineHeight: 20 }}>{children}</Txt>
  </Pressable>;
}

function accessMessage(data: ReturnType<typeof usePassenger>) {
  if (data.offline) return "You're offline. Reconnect before uploading evidence or submitting changes. Nothing will be queued or published offline.";
  if (data.authError) return data.authError;
  if (data.authLoading || !data.snapshot) return "Loading your account permissions. Please wait before submitting.";
  const viewer = data.snapshot.viewer;
  if (!viewer) return "Sign in and complete your profile before publishing or editing.";
  if (viewer.suspended) return `Your account is suspended. New parcels and trips, including edits, are unavailable. You can still access active deliveries and support.${viewer.suspensionReason ? ` Reason: ${viewer.suspensionReason}` : ""}`;
  if (viewer.verification !== "verified") {
    if (viewer.verification === "pending") return "Your identity is being reviewed. You can publish or edit once operations verifies your account.";
    if (viewer.verification === "rejected") return "Your identity needs changes. Open My profile to read the review note and resubmit your evidence before publishing or editing.";
    return "Verify your identity in My profile before publishing or editing a parcel or trip.";
  }
  return "";
}

export function ShipmentForm({ onClose, onSuccess, trip, shipment, draft }: { onClose: () => void; onSuccess: () => void; trip?: Trip; shipment?: Shipment; draft?: Partial<CreateShipmentInput> }) {
  const data = usePassenger();
  const serviceArea = data.snapshot?.serviceArea ?? fallbackServiceArea;
  const allLocations = useMemo(() => [serviceArea.baseLocation, ...serviceArea.destinations], [serviceArea]);
  const [origin, setOrigin] = useState(shipment?.origin ?? draft?.origin ?? trip?.origin ?? "");
  const [destination, setDestination] = useState(shipment?.destination ?? draft?.destination ?? trip?.destination ?? "");
  const [originOpen, setOriginOpen] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [category, setCategory] = useState<string>(shipment?.category ?? draft?.category ?? "");
  const [description, setDescription] = useState(shipment?.description ?? draft?.description ?? "");
  const [weight, setWeight] = useState(shipment ? String(shipment.weightKg) : draft?.weightKg ? String(draft.weightKg) : "");
  const [value, setValue] = useState(shipment ? String(shipment.valueNaira) : draft?.valueNaira ? String(draft.valueNaira) : "");
  const [receiverName, setReceiverName] = useState(shipment?.receiverName ?? "");
  const [receiverPhone, setReceiverPhone] = useState(shipment?.receiverPhone ?? "");
  const [pickupInstructions, setPickupInstructions] = useState(shipment?.pickupInstructions ?? draft?.pickupInstructions ?? "");
  const [dropoffInstructions, setDropoffInstructions] = useState(shipment?.dropoffInstructions ?? draft?.dropoffInstructions ?? "");
  const [ready, setReady] = useState(() => localDateTime(shipment?.preferredPickupAt ?? shipment?.readyAt ?? draft?.preferredPickupAt ?? draft?.readyAt ?? trip?.departureAt));
  const [flexBefore, setFlexBefore] = useState(String(((shipment?.pickupFlexBeforeMinutes ?? draft?.pickupFlexBeforeMinutes) ?? 720) / 60));
  const [flexAfter, setFlexAfter] = useState(String(((shipment?.pickupFlexAfterMinutes ?? draft?.pickupFlexAfterMinutes) ?? 720) / 60));
  const [deadline, setDeadline] = useState(() => localDateTime(shipment?.deliveryDeadline ?? draft?.deliveryDeadline ?? trip?.arrivalAt));
  const [evidenceIds, setEvidenceIds] = useState<string[]>(() => [...(shipment?.evidenceIds ?? [])]);
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // Picker state for interactive date/time selection
  const [readyPicker, setReadyPicker] = useState<"date" | "time" | null>(null);
  const [deadlinePicker, setDeadlinePicker] = useState<"date" | "time" | null>(null);
  const current = shipment ? data.snapshot?.shipments.find(item => item.id === shipment.id) ?? shipment : undefined;
  const permission = accessMessage(data);
  const editLock = current && current.senderId !== data.snapshot?.viewer?.id ? "Only the sender can edit this parcel." : current && !["pending_review", "rejected", "open"].includes(current.status) ? "This parcel can no longer be edited here because its delivery state has changed. Open its delivery record for available actions." : "";
  const blocked = permission || editLock;
  const disabled = busy || saved || !!blocked;
  const rejected = current?.status === "rejected";
  const closeAllPickers = () => { setOriginOpen(false); setDestinationOpen(false); setReadyPicker(null); setDeadlinePicker(null); };
  const handleSelectOrigin = (city: string) => { setOrigin(city); setOriginOpen(false); };
  const handleSelectDestination = (city: string) => { setDestination(city); setDestinationOpen(false); };

  const submit = async () => {
    if (submitting.current || saved) return;
    setError("");
    if (blocked) { setError(blocked); return; }
    submitting.current = true;
    setBusy(true);
    try {
      const preferredPickupAt = parseLocalDateTime(ready, "Preferred pickup");
      const pickupFlexBeforeMinutes = Number(flexBefore) * 60;
      const pickupFlexAfterMinutes = Number(flexAfter) * 60;
        const input: CreateShipmentInput = {
          origin: origin.trim(), destination: destination.trim(), category, description: description.trim(),
          weightKg: Number(weight), valueNaira: Number(value), receiverName: receiverName.trim(), receiverPhone: receiverPhone.trim(),
          pickupInstructions: pickupInstructions.trim(), dropoffInstructions: dropoffInstructions.trim(),
          readyAt: preferredPickupAt - pickupFlexBeforeMinutes * 60000, preferredPickupAt, pickupFlexBeforeMinutes, pickupFlexAfterMinutes, deliveryDeadline: parseLocalDateTime(deadline, "Delivery deadline"),
        evidenceIds: [...evidenceIds], safetyConsent: declared,
      };
      validateShipment(input);
      if (shipment) await data.updateShipment(shipment.id, input);
      else await data.createShipment(input);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
      return;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
    onSuccess();
  };

  return <FullScreenSheet title={rejected ? "Resubmit Parcel" : shipment ? "Edit Parcel" : "Send a Parcel"} onClose={() => !submitting.current && onClose()}>
    <Txt style={[s.muted, form.intro]}>{shipment ? "Update the details below. Saving resubmits for review." : "Tell us what you're sending and where. Passenger will calculate the delivery fee from the route and parcel type."}</Txt>
    {!!blocked && <View style={form.notice}><Notice tone="warning">{blocked}</Notice></View>}
    {rejected && <View style={form.notice}><Notice tone="warning">{current?.reviewNote ? `Feedback: ${current.reviewNote}` : "Operations requested changes. Correct the details, then resubmit."}</Notice></View>}
    {trip && !shipment && <View style={form.notice}><Notice>Route pre-filled from a trip. Adjust as needed.</Notice></View>}

    {/* ── Route ─────────────────────────────────────────────── */}
    <Txt style={form.sectionLabel}>Route</Txt>
    <ShipmentLocationDropdown
      label="From"
      value={origin}
      placeholder="Select pickup city"
      isOpen={originOpen}
      onToggle={() => { setDestinationOpen(false); setReadyPicker(null); setDeadlinePicker(null); if (originOpen) { setOriginOpen(false); } else { setOriginOpen(true); } }}
      disabled={disabled}
    />
    {originOpen && !disabled ? (
      <View style={[form.selectOptions, { marginTop: -primitives.space[3] }]}>
        {allLocations.map(city => (
          <Pressable key={city} accessibilityRole="radio" accessibilityState={{ checked: city === origin }} onPress={() => handleSelectOrigin(city)} style={[form.selectOption, city === origin && form.selectOptionActive]}>
            <Txt style={form.selectOptionText}>{city}</Txt>
            {city === origin ? <Txt style={form.selectOptionSelected}>Selected</Txt> : null}
          </Pressable>
        ))}
      </View>
    ) : null}
    <ShipmentLocationDropdown
      label="To"
      value={destination}
      placeholder="Select drop-off city"
      isOpen={destinationOpen}
      onToggle={() => { setOriginOpen(false); setReadyPicker(null); setDeadlinePicker(null); if (destinationOpen) { setDestinationOpen(false); } else { setDestinationOpen(true); } }}
      disabled={disabled}
    />
    {destinationOpen && !disabled ? (
      <View style={[form.selectOptions, { marginTop: -primitives.space[3] }]}>
        {allLocations.map(city => (
          <Pressable key={city} accessibilityRole="radio" accessibilityState={{ checked: city === destination }} onPress={() => handleSelectDestination(city)} style={[form.selectOption, city === destination && form.selectOptionActive]}>
            <Txt style={form.selectOptionText}>{city}</Txt>
            {city === destination ? <Txt style={form.selectOptionSelected}>Selected</Txt> : null}
          </Pressable>
        ))}
      </View>
    ) : null}
    <Field label="Pickup instructions" value={pickupInstructions} onChangeText={setPickupInstructions} editable={!disabled} placeholder="Meeting point and how to find you" multiline maxLength={1000} />
    <Field label="Drop-off instructions" value={dropoffInstructions} onChangeText={setDropoffInstructions} editable={!disabled} placeholder="Receiving point and access details" multiline maxLength={1000} />

    {/* ── Schedule ──────────────────────────────────────────── */}
    <View style={form.divider} />
    <Txt style={form.sectionLabel}>Schedule</Txt>
    <Txt style={[s.hint, form.sectionHint]}>When should the parcel be picked up?</Txt>
    <View style={form.pickerRow}>
      <View style={form.pickerCol}>
        <Txt style={s.label}>Pickup date</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pickup date: ${ready.date ? formatDisplayDate(ready.date) : "Select date"}`}
          disabled={disabled}
          onPress={() => { closeAllPickers(); setReadyPicker(readyPicker === "date" ? null : "date"); }}
          style={[form.pickerBtn, readyPicker === "date" && form.pickerBtnActive]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Calendar size={18} color={ready.date ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
            <Txt numberOfLines={1} ellipsizeMode="tail" style={[form.pickerBtnText, !ready.date && form.pickerBtnPlaceholder, Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any)]}>
              {ready.date ? formatDisplayDate(ready.date) : "Select date"}
            </Txt>
          </View>
          <ChevronDown size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={form.pickerCol}>
        <Txt style={s.label}>Pickup time</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pickup time: ${ready.time ? formatDisplayTime(ready.time) : "Select time"}`}
          disabled={disabled}
          onPress={() => { closeAllPickers(); setReadyPicker(readyPicker === "time" ? null : "time"); }}
          style={[form.pickerBtn, readyPicker === "time" && form.pickerBtnActive]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Clock size={18} color={ready.time ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
            <Txt numberOfLines={1} ellipsizeMode="tail" style={[form.pickerBtnText, !ready.time && form.pickerBtnPlaceholder, Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any)]}>
              {ready.time ? formatDisplayTime(ready.time) : "Select time"}
            </Txt>
          </View>
          <ChevronDown size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
    {readyPicker === "date" ? <ShipmentCalendarPicker selectedValue={ready.date} onSelect={date => { setReady(prev => ({ ...prev, date })); setReadyPicker(null); }} /> : null}
    {readyPicker === "time" ? <ShipmentTimePicker selectedValue={ready.time} onSelect={time => { setReady(prev => ({ ...prev, time })); setReadyPicker(null); }} /> : null}

    <View style={form.row}>
      <View style={form.column}><Field label="Flex before (hrs)" value={flexBefore} onChangeText={setFlexBefore} editable={!disabled} keyboardType="number-pad" placeholder="12" hint="0–72 hours" /></View>
      <View style={form.column}><Field label="Flex after (hrs)" value={flexAfter} onChangeText={setFlexAfter} editable={!disabled} keyboardType="number-pad" placeholder="12" hint="0–72 hours" /></View>
    </View>

    <Txt style={[s.hint, form.sectionHint]}>When must it arrive by?</Txt>
    <View style={form.pickerRow}>
      <View style={form.pickerCol}>
        <Txt style={s.label}>Deadline date</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Deadline date: ${deadline.date ? formatDisplayDate(deadline.date) : "Select date"}`}
          disabled={disabled}
          onPress={() => { closeAllPickers(); setDeadlinePicker(deadlinePicker === "date" ? null : "date"); }}
          style={[form.pickerBtn, deadlinePicker === "date" && form.pickerBtnActive]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Calendar size={18} color={deadline.date ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
            <Txt numberOfLines={1} ellipsizeMode="tail" style={[form.pickerBtnText, !deadline.date && form.pickerBtnPlaceholder, Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any)]}>
              {deadline.date ? formatDisplayDate(deadline.date) : "Select date"}
            </Txt>
          </View>
          <ChevronDown size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={form.pickerCol}>
        <Txt style={s.label}>Deadline time</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Deadline time: ${deadline.time ? formatDisplayTime(deadline.time) : "Select time"}`}
          disabled={disabled}
          onPress={() => { closeAllPickers(); setDeadlinePicker(deadlinePicker === "time" ? null : "time"); }}
          style={[form.pickerBtn, deadlinePicker === "time" && form.pickerBtnActive]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Clock size={18} color={deadline.time ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
            <Txt numberOfLines={1} ellipsizeMode="tail" style={[form.pickerBtnText, !deadline.time && form.pickerBtnPlaceholder, Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any)]}>
              {deadline.time ? formatDisplayTime(deadline.time) : "Select time"}
            </Txt>
          </View>
          <ChevronDown size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
    {deadlinePicker === "date" ? <ShipmentCalendarPicker selectedValue={deadline.date} onSelect={date => { setDeadline(prev => ({ ...prev, date })); setDeadlinePicker(null); }} /> : null}
    {deadlinePicker === "time" ? <ShipmentTimePicker selectedValue={deadline.time} onSelect={time => { setDeadline(prev => ({ ...prev, time })); setDeadlinePicker(null); }} /> : null}

    {/* ── Package Details ───────────────────────────────────── */}
    <View style={form.divider} />
    <Txt style={form.sectionLabel}>Package Details</Txt>
    <Txt style={[s.label, { marginBottom: primitives.space[2] }]}>Category</Txt>
    <View style={[form.chipRow, { marginBottom: primitives.space[4] }]}>
      {CATEGORIES.map(item => (
        <Pressable
          key={item}
          accessibilityRole="radio"
          accessibilityState={{ checked: item === category, disabled }}
          disabled={disabled}
          onPress={() => setCategory(item)}
          style={[form.chip, item === category && form.chipSelected, disabled && form.chipDisabled]}
        >
          <Txt style={[form.chipText, item === category && form.chipTextSelected]}>{item}</Txt>
        </Pressable>
      ))}
    </View>
    <Field label="Declared contents" value={description} onChangeText={setDescription} editable={!disabled} placeholder="List every item, quantity and condition" multiline maxLength={1000} hint="Be specific so the traveller can inspect each item." />
    <View style={form.row}>
      <View style={form.column}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} editable={!disabled} keyboardType="decimal-pad" placeholder="0" hint="Up to 25 kg" /></View>
      <View style={form.column}><Field label="Value (₦)" value={value} onChangeText={setValue} editable={!disabled} keyboardType="number-pad" placeholder="0" hint="Up to ₦500,000" /></View>
    </View>
    <Notice>The backend calculates the delivery fee from the route and parcel type when you submit. That amount is then held from your wallet for the trip.</Notice>
    <Txt style={[s.label, { marginBottom: primitives.space[2] }]}>Photos</Txt>
    <Txt style={[s.hint, form.sectionHint]}>Upload 1–5 clear photos of the contents and packaging.</Txt>
    <EvidencePicker purpose="parcel" value={evidenceIds} onChange={setEvidenceIds} disabled={disabled} resumeKey="shipment-form" />

    {/* ── Receiver ──────────────────────────────────────────── */}
    <View style={form.divider} />
    <Txt style={form.sectionLabel}>Receiver</Txt>
    <Field label="Full name" value={receiverName} onChangeText={setReceiverName} editable={!disabled} placeholder="Receiver's full name" maxLength={120} autoCapitalize="words" />
    <Field label="Phone number" value={receiverPhone} onChangeText={setReceiverPhone} editable={!disabled} keyboardType="phone-pad" placeholder="+234..." maxLength={20} hint="Delivery confirmation is sent by SMS." />
    <Notice>No weapons, drugs, cash, hazardous materials, stolen goods, or live animals. Declared value is not insurance.</Notice>
    <Consent checked={declared} onChange={setDeclared} disabled={disabled}>I have accurately declared every item and confirm this parcel contains no prohibited goods. I agree to a physical inspection at handover.</Consent>
    {!!error && <View style={form.notice}><Notice tone="error">{error}</Notice></View>}
    {saved && <View style={form.notice}><Notice tone="success">Your parcel was {shipment ? "updated and resubmitted" : "submitted"} for review.</Notice></View>}
    <Button title={saved ? "Submitted for review" : rejected ? "Resubmit parcel  →" : shipment ? "Save and resubmit  →" : "Submit for review  →"} variant="lime" onPress={submit} busy={busy} disabled={disabled || !declared || evidenceIds.length === 0} />
    <Txt style={[s.hint, form.footer]}>The calculated delivery fee stays held until delivery is confirmed or the booking is safely cancelled.</Txt>
  </FullScreenSheet>;
}

export function TripForm({ onClose, onSuccess, trip }: { onClose: () => void; onSuccess: () => void; trip?: Trip }) {
  const data = usePassenger();
  const [origin, setOrigin] = useState(trip?.origin ?? "");
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [stops, setStops] = useState<string[]>(() => [...(trip?.stops ?? [])]);
  const [departure, setDeparture] = useState(() => localDateTime(trip?.departureAt));
  const [arrival, setArrival] = useState(() => localDateTime(trip?.arrivalAt));
  const [capacity, setCapacity] = useState(trip ? String(trip.capacityKg) : "");
  const [maxParcelWeight, setMaxParcelWeight] = useState(trip ? String(trip.maxParcelWeightKg ?? trip.capacityKg) : "");
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>(() => [...(trip?.acceptedCategories?.length ? trip.acceptedCategories : CATEGORIES)]);
  const [handlingNotes, setHandlingNotes] = useState(trip?.handlingNotes ?? "");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [saved, setSaved] = useState(false);
  const current = trip ? data.snapshot?.trips.find(item => item.id === trip.id) ?? trip : undefined;
  // These live records can prove a commitment, not prove its absence. The server
  // rechecks all bookings atomically on update; never synthesize a canEdit flag.
  const observedCommitment = !!current && (
    (current.reservedKg ?? 0) > 0 || (current.legReservedKg ?? []).some(kg => kg > 0) ||
    !!data.snapshot?.offers?.some(offer => offer.tripId === current.id && offer.status === "accepted") ||
    !!data.snapshot?.shipments.some(parcel => parcel.tripId === current.id && ["matched", "funded", "in_transit", "delivered", "disputed"].includes(parcel.status))
  );
  const permission = accessMessage(data);
  const editLock = current && current.travellerId !== data.snapshot?.viewer?.id ? "Only the traveller who published this trip can edit it." : current && ["cancelled", "completed"].includes(current.status ?? "") ? "This trip is no longer active and cannot be edited." : observedCommitment ? "This trip has existing delivery commitments. Route, timing, and capacity edits are locked here. Open the trip to manage its bookings or request cancellation; the server owns those changes." : "";
  const blocked = permission || editLock;
  const disabled = busy || saved || !!blocked;

  const moveStop = (index: number, direction: -1 | 1) => {
    if (disabled) return;
    setStops(previous => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      const next = [...previous];
      const moving = next.splice(index, 1)[0]!;
      next.splice(nextIndex, 0, moving);
      return next;
    });
  };
  const submit = async () => {
    if (submitting.current || saved) return;
    setError("");
    if (blocked) { setError(blocked); return; }
    submitting.current = true;
    setBusy(true);
    try {
      if (!agree) throw new Error("Please accept the traveller safety declaration.");
      const input: CreateTripInput = {
        origin: origin.trim(), destination: destination.trim(), stops: stops.map(stop => stop.trim()),
        departureAt: parseLocalDateTime(departure, "Departure"), arrivalAt: parseLocalDateTime(arrival, "Estimated arrival"),
        capacityKg: Number(capacity), maxParcelWeightKg: Number(maxParcelWeight), acceptedCategories, handlingNotes: handlingNotes.trim(),
      };
      validateTrip(input);
      if (trip) await data.updateTrip(trip.id, input);
      else await data.createTrip(input);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
      return;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
    onSuccess();
  };

  return <Sheet title={trip ? "Keep your journey in order." : "Make room for good things."} eyebrow={trip ? "EDIT A TRIP" : "PUBLISH A TRIP"} onClose={() => !submitting.current && onClose()}>
    <Txt style={[s.muted, form.intro]}>Already heading somewhere? Share your route and spare capacity. Passenger calculates parcel fees in the backend; travellers only decide whether to carry a compatible parcel.</Txt>
    {!!blocked && <View style={form.notice}><Notice tone="warning">{blocked}</Notice></View>}
    {trip && !observedCommitment && <View style={form.notice}><Notice>The server checks existing commitments again when you save. If a booking has been accepted, these edits may be refused. Editing never changes a booking or frees reserved space locally.</Notice></View>}

    <Txt style={s.eyebrow}>01  /  YOUR ROUTE, IN ORDER</Txt>
    <FormRow><CityField label="Origin" value={origin} onChange={setOrigin} disabled={disabled} /><CityField label="Final destination" value={destination} onChange={setDestination} disabled={disabled} /></FormRow>
    <View style={form.stops}>
      <Txt style={[s.label, { marginBottom: 7 }]}>Intermediate stops · optional</Txt>
      <Txt style={[s.hint, form.sectionHint]}>List only the cities between your origin and final destination, in travel order. Use up to eight distinct stops; do not repeat either endpoint.</Txt>
      {stops.length === 0 && <Txt style={[s.muted, form.sectionHint]}>Direct journey. Add a stop if you can meet senders or receivers along the way.</Txt>}
      {stops.map((stop, index) => <View key={index} style={form.stop}>
        <CityField label={`Stop ${index + 1}`} value={stop} onChange={city => setStops(previous => previous.map((value, position) => position === index ? city : value))} disabled={disabled} />
        <View style={form.stopTools}>
          <Button title="↑ Up" accessibilityLabel={`Move stop ${index + 1} up`} variant="secondary" small style={{ minHeight: 44 }} disabled={disabled || index === 0} onPress={() => moveStop(index, -1)} />
          <Button title="↓ Down" accessibilityLabel={`Move stop ${index + 1} down`} variant="secondary" small style={{ minHeight: 44 }} disabled={disabled || index === stops.length - 1} onPress={() => moveStop(index, 1)} />
          <Button title="Remove" accessibilityLabel={`Remove stop ${index + 1}`} variant="ghost" small style={{ minHeight: 44 }} disabled={disabled} onPress={() => setStops(previous => previous.filter((_, position) => position !== index))} />
        </View>
      </View>)}
      <Button title={stops.length >= 8 ? "Eight-stop limit reached" : "+ Add intermediate stop"} variant="secondary" small disabled={disabled || stops.length >= 8} onPress={() => setStops(previous => [...previous, ""])} />
    </View>
    {!!origin.trim() && !!destination.trim() && <View style={form.notice}><Notice>{[origin.trim(), ...stops.map((stop, index) => stop.trim() || `Stop ${index + 1}`), destination.trim()].join(" → ")}</Notice></View>}

    <View style={s.divider} /><Txt style={s.eyebrow}>02  /  YOUR TRAVEL WINDOW</Txt>
    <DateTimeFields label="Departure" value={departure} onChange={setDeparture} disabled={disabled} hint="Within the next 90 days" />
    <DateTimeFields label="Estimated arrival" value={arrival} onChange={setArrival} disabled={disabled} hint="After departure; within seven days" />
    <Txt style={[s.hint, form.sectionHint]}>Use your device's local timezone for both entries. These are travel estimates, not live tracking or guaranteed arrival times.</Txt>

    <View style={s.divider} /><Txt style={s.eyebrow}>03  /  WHAT YOU CAN CARRY</Txt>
    <FormRow><Field label="Total parcel capacity (kg)" value={capacity} onChangeText={setCapacity} editable={!disabled} keyboardType="decimal-pad" placeholder="Spare carrying capacity" hint="More than 0; up to 100 kg" /><Field label="Maximum weight per parcel (kg)" value={maxParcelWeight} onChangeText={setMaxParcelWeight} editable={!disabled} keyboardType="decimal-pad" placeholder="Largest parcel you will accept" hint="Cannot exceed total capacity" /></FormRow>
    <Txt style={[s.label, form.categoryLabel]}>Parcel categories you will carry</Txt>
    <View style={[s.wrap, form.categoryGroup]}>{CATEGORIES.map(item => {
      const selected = acceptedCategories.includes(item);
      return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} key={item} disabled={disabled} onPress={() => setAcceptedCategories(current => selected ? current.filter(category => category !== item) : [...current, item])} style={[form.category, selected ? form.categorySelected : form.categoryUnselected, disabled && form.categoryDisabled]}><Txt style={form.categoryText}>{item}</Txt></Pressable>;
    })}</View>
    <Field label="Handling preferences (optional)" value={handlingNotes} onChangeText={setHandlingNotes} editable={!disabled} multiline maxLength={500} placeholder="For example: documents and soft bags only" hint="Up to 500 characters" />
    <Notice>Capacity is reserved only when a sender accepts an offer. Overlapping route legs share your total capacity; space can be reused on separate legs. The server calculates availability and the parcel fee.</Notice>
    <Consent checked={agree} onChange={setAgree} disabled={disabled}>I will inspect all declared contents with the sender, refuse prohibited goods, only collect payment-confirmed parcels, and use the required one-time codes at handover and delivery.</Consent>
    {!!error && <View style={form.notice}><Notice tone="error">{error}</Notice></View>}
    {saved && <View style={form.notice}><Notice tone="success">Your trip was {trip ? "updated" : "published"} successfully.</Notice></View>}
    <Button title={saved ? "Trip saved" : trip ? "Save trip changes  →" : "Publish my trip  →"} variant="lime" onPress={submit} busy={busy} disabled={disabled || !agree || acceptedCategories.length === 0} />
    <Txt style={[s.hint, form.footer]}>This is a delivery marketplace, not a passenger booking service.</Txt>
  </Sheet>;
}
