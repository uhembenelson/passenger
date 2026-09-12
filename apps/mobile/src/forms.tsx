import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDown, ArrowRight, ArrowUp, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MapPin, Minus, Package, Phone, Plus, User } from "lucide-react-native";
import { CATEGORIES, CITIES, calculateDeliveryFee, money, validateShipment, validateTrip } from "@passenger/core";
import type { CreateShipmentInput, CreateTripInput, Shipment, Trip } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { IdentityVerificationCard } from "./identity-verification-card";
import { EvidenceGallery, EvidencePicker, getPendingEvidenceResumeKey } from "./evidence";
import { CityIllustration } from "./illustrations";
import { Button, colors, errorMessage, Field, fontFamily, FullScreenState, Notice, PresentationSheet, s, Txt } from "./ui";

import { CreateFlowFrame, CreateFlowLoading, CreateIntro, ReviewSection, useCreateIntro } from "./create-flow";
import { validateMeetingPoints, validateParcelContents, validatePickupWindow, validateReceiver, validateTripRoute, validateTravelWindow, validateCarryingCapacity, adjustWeightLimit } from "./create-flow-validation";

const parcelScreens = ["route", "schedule", "contents", "photos", "receiver", "review"] as const;
type ParcelScreen = typeof parcelScreens[number];
const parcelCopy: Record<ParcelScreen, [string, string]> = {
  route: ["Where is it going?", ""],
  schedule: ["When should it travel?", "Choose your preferred pickup time and when the parcel needs to arrive."],
  contents: ["What's inside?", "Describe everything you're sending so travellers know what to expect."],
  photos: ["Show your parcel", "Add clear photos of the contents and packaging. Travellers will check these at handover."],
  receiver: ["Who's receiving it?", "We'll use these details to help confirm delivery."],
  review: ["Check your parcel details", ""],
};
const tripScreens = ["route", "schedule", "categories", "capacity", "review"] as const;
type TripScreen = typeof tripScreens[number];
const tripCopy: Record<TripScreen, [string, string]> = {
  route: ["Where are you travelling?", ""],
  schedule: ["When are you travelling?", "Add your departure and expected arrival in your local time."],
  categories: ["What parcels will you carry?", "Choose all the types you’re comfortable carrying."],
  capacity: ["How much can you carry?", "Set your total space and the most each parcel can weigh."],
  review: ["Ready to share your trip?", ""],
};

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
  timeSectionTitle: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodyXs, fontFamily: fontFamily.semibold },
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
  footerStack: { gap: primitives.space[2] },
});

// ─── Mobile Route Dropdown ──────────────────────────────────────────────────
function LocationDropdown({ label, value, placeholder, isOpen, onToggle, disabled }: {
  label: string; value: string; placeholder: string; isOpen: boolean; onToggle: () => void; disabled: boolean;
}) {
  return (
    <View style={{ gap: primitives.space[3] }}>
      <Txt style={form.sectionLabel}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        accessibilityState={{ expanded: isOpen, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={[form.select, isOpen && form.selectActive, disabled && { opacity: primitives.opacity.disabled }]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          {value ? <CityIllustration city={value} size={32} /> : <MapPin size={20} color={colors.muted} strokeWidth={2} />}
          <Txt style={[form.selectText, !value && form.selectPlaceholder]}>{value || placeholder}</Txt>
        </View>
        <ChevronDown size={20} color={colors.text} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function RouteCityField({ label, value, onChange, options = CITIES, allowCustom = false, disabled }: {
  label: string; value: string; onChange: (value: string) => void; options?: readonly string[]; allowCustom?: boolean; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <View style={form.sectionCard}>
    <LocationDropdown label={label} value={value} placeholder="Select a city" isOpen={open} onToggle={() => setOpen(!open)} disabled={disabled} />
    {open && !disabled && <View style={form.selectOptions}>
      {options.map(city => <Pressable key={city} accessibilityRole="radio" accessibilityLabel={`${label}: ${city}`} accessibilityState={{ checked: city === value }} onPress={() => { onChange(city); setOpen(false); }} style={[form.selectOption, city === value && form.selectOptionActive]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><CityIllustration city={city} size={34} /><Txt style={form.selectOptionText}>{city}</Txt></View>
        {city === value && <Txt style={form.selectOptionSelected}>Selected</Txt>}
      </Pressable>)}
      {allowCustom && <>
        <Field label="Another city" value={value} onChangeText={onChange} placeholder="Enter a city" maxLength={80} autoCapitalize="words" />
        <Button title="Use this city" variant="secondary" disabled={!value.trim()} onPress={() => setOpen(false)} />
      </>}
    </View>}
  </View>;
}

function CategoryChoices({ selected, onSelect, multiple = false, disabled }: {
  selected: readonly string[]; onSelect: (category: string) => void; multiple?: boolean; disabled: boolean;
}) {
  return <View style={[form.chipRow, { marginBottom: primitives.space[4] }]}>
    {CATEGORIES.map(category => <Pressable key={category} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: selected.includes(category), disabled }} disabled={disabled} onPress={() => onSelect(category)} style={[form.chip, selected.includes(category) && form.chipSelected, disabled && form.chipDisabled]}>
      <Txt style={[form.chipText, selected.includes(category) && form.chipTextSelected]}>{category}</Txt>
    </Pressable>)}
  </View>;
}

// ─── Calendar Picker ────────────────────────────────────────────────────────
function CalendarPicker({ selectedValue, onSelect }: { selectedValue: string; onSelect: (date: string) => void }) {
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

function TimePicker({ selectedValue, onSelect }: { selectedValue: string; onSelect: (time: string) => void }) {
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
      <Txt style={form.timeSectionTitle}>Quick select</Txt>
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
      <Txt style={[form.timeSectionTitle, { marginTop: 10 }]}>Custom time</Txt>
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

function WeightLimit({ label, value, maximum, disabled, onChange }: { label: string; value: number; maximum: number; disabled: boolean; onChange: (value: number) => void }) {
  return <View style={[form.sectionCard, { paddingVertical: 20 }]}>
    <Txt style={form.sectionLabel}>{label}</Txt>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
      <Button title="" accessibilityLabel={`Decrease ${label.toLowerCase()}`} icon={<Minus size={22} color={colors.text} />} variant="secondary" disabled={disabled || value <= Math.min(0.5, maximum)} onPress={() => onChange(adjustWeightLimit(value, -1, maximum))} style={{ width: 52, minHeight: 52 }} />
      <Txt accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: "center", fontSize: 30, fontFamily: fontFamily.semibold }}>{value} kg</Txt>
      <Button title="" accessibilityLabel={`Increase ${label.toLowerCase()}`} icon={<Plus size={22} color={colors.text} />} variant="secondary" disabled={disabled || value >= maximum} onPress={() => onChange(adjustWeightLimit(value, 1, maximum))} style={{ width: 52, minHeight: 52 }} />
    </View>
  </View>;
}

function DateTimeFields({ label, value, onChange, hint, disabled }: { label: string; value: LocalDateTime; onChange: (value: LocalDateTime) => void; hint: string; disabled: boolean }) {
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  return <View style={form.sectionCard}>
    <Txt style={form.sectionLabel}>{label}</Txt>
    <View style={form.pickerRow}>
      {(["date", "time"] as const).map(kind => {
        const Icon = kind === "date" ? Calendar : Clock;
        const display = value[kind] ? (kind === "date" ? formatDisplayDate(value.date) : formatDisplayTime(value.time)) : `Select ${kind}`;
        return <View key={kind} style={form.pickerCol}>
          <Txt style={s.label}>{kind === "date" ? "Date" : "Time"}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${kind}: ${display}`} accessibilityState={{ expanded: picker === kind, disabled }} disabled={disabled} onPress={() => setPicker(picker === kind ? null : kind)} style={[form.pickerBtn, picker === kind && form.pickerBtnActive, disabled && form.chipDisabled]}>
            <Icon size={18} color={value[kind] ? semantic.color.brand.primary : colors.muted} />
            <Txt numberOfLines={1} ellipsizeMode="tail" style={[form.pickerBtnText, { minWidth: 0 }, !value[kind] && form.pickerBtnPlaceholder]}>{display}</Txt>
            <ChevronDown size={18} color={colors.text} />
          </Pressable>
        </View>;
      })}
    </View>
    <Txt style={s.hint}>{hint}</Txt>
    {!disabled && picker === "date" && <CalendarPicker selectedValue={value.date} onSelect={date => { onChange({ ...value, date }); setPicker(null); }} />}
    {!disabled && picker === "time" && <TimePicker selectedValue={value.time} onSelect={time => { onChange({ ...value, time }); setPicker(null); }} />}
  </View>;
}

function Consent({ checked, onChange, disabled, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)} style={[s.checkRow, disabled && { opacity: 0.6 }]}>
    <View style={[s.checkbox, checked && { backgroundColor: colors.forest, borderColor: colors.forest }]}>{checked && <Check size={13} color="white" strokeWidth={3} />}</View>
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
  const intro = useCreateIntro("sender", data.snapshot?.viewer?.id, !!shipment);
  const [screen, setScreen] = useState<ParcelScreen>("route");
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [flexOpen, setFlexOpen] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  useEffect(() => {
    let active = true;
    void getPendingEvidenceResumeKey().then(key => { if (active && key === "shipment-form") setScreen("photos"); });
    return () => { active = false; };
  }, []);
  const serviceArea = data.snapshot?.serviceArea ?? fallbackServiceArea;
  const allLocations = useMemo(() => [serviceArea.baseLocation, ...serviceArea.destinations], [serviceArea]);
  const [origin, setOrigin] = useState(shipment?.origin ?? draft?.origin ?? trip?.origin ?? "");
  const [destination, setDestination] = useState(shipment?.destination ?? draft?.destination ?? trip?.destination ?? "");
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
  const current = shipment ? data.snapshot?.shipments.find(item => item.id === shipment.id) ?? shipment : undefined;
  const permission = accessMessage(data);
  const editLock = current && current.senderId !== data.snapshot?.viewer?.id ? "Only the sender can edit this parcel." : current && !["pending_review", "rejected", "open"].includes(current.status) ? "This parcel can no longer be edited here because its delivery state has changed. Open its delivery record for available actions." : "";
  const blocked = permission || editLock;
  const disabled = busy || saved || !!blocked;
  const rejected = current?.status === "rejected";
  const estimatedFee = useMemo(() => {
    try { return calculateDeliveryFee({ origin, destination, category, weightKg: Number(weight) }, data.snapshot?.feeConfig); }
    catch { return null; }
  }, [origin, destination, category, weight, data.snapshot?.feeConfig]);
  const submissionBlocker = evidenceIds.length === 0 ? "Add at least one parcel photo to submit." : !declared ? "Confirm the safety declaration to submit." : "";

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
      setFailed(true);
      return;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const go = (next: ParcelScreen) => { setError(""); setScreen(next); };
  const edit = (next: ParcelScreen) => { setReturnToReview(true); go(next); };
  const advance = () => {
    try {
      if (screen === "route") validateMeetingPoints(origin, destination, pickupInstructions, dropoffInstructions);
      if (screen === "schedule") validatePickupWindow(parseLocalDateTime(ready, "Pickup"), parseLocalDateTime(deadline, "Delivery deadline"), Number(flexBefore), Number(flexAfter));
      if (screen === "contents") validateParcelContents(category, description, Number(weight), Number(value));
      if (screen === "photos" && !evidenceIds.length) throw new Error("Add at least one photo of your parcel.");
      if (screen === "receiver") validateReceiver(receiverName, receiverPhone);
      go(returnToReview ? "review" : parcelScreens[parcelScreens.indexOf(screen) + 1]);
      setReturnToReview(false);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  if (saved) return <FullScreenState title="Parcel submitted for review" subtitle="We'll review your parcel before travellers can make offers. You can follow its status in your deliveries." primaryAction={{ label: "View my deliveries", onPress: onSuccess }} />;
  if (failed) return <FullScreenState title="Your parcel wasn't submitted" subtitle={error} primaryAction={{ label: "Review parcel", onPress: () => { setFailed(false); go("review"); } }} secondaryAction={{ label: "Close", onPress: onClose }} />;
  if (intro.show === null) return <CreateFlowLoading onClose={onClose} />;
  if (intro.show) return <CreateIntro mode="sender" onContinue={intro.dismiss} replaying={intro.replaying} onClose={intro.replaying ? intro.dismiss : onClose} />;
  return <CreateFlowFrame title={parcelCopy[screen][0]} description={parcelCopy[screen][1]} screenKey={screen}
    onClose={() => !submitting.current && !uploading && onClose()} onBack={screen !== "route" ? () => { setReturnToReview(false); go(parcelScreens[parcelScreens.indexOf(screen) - 1]); } : undefined}
    locked={busy || uploading} footer={<View style={form.footerStack}>
      {!!error && <Notice tone="error">{error}</Notice>}
      <Button title={screen === "review" ? rejected ? "Resubmit parcel" : shipment ? "Save and resubmit" : "Submit for review" : uploading ? "Uploading photos" : returnToReview ? "Save changes" : "Continue"} variant="lime" onPress={screen === "review" ? submit : advance} busy={busy} disabled={disabled || uploading || (screen === "review" && !!submissionBlocker)} />
      {screen === "review" && !declared && <Txt style={[s.hint, { textAlign: "center" }]}>Confirm the declaration below your parcel details to submit.</Txt>}
    </View>}>
    {!!blocked && (data.snapshot?.viewer && !data.offline && !data.authError && !data.authLoading && !data.snapshot.viewer.suspended && data.snapshot.viewer.verification !== "verified"
      ? <IdentityVerificationCard viewer={data.snapshot.viewer} />
      : <View style={form.notice}><Notice tone="warning">{blocked}</Notice></View>)}
    {rejected && <View style={form.notice}><Notice tone="warning">{current?.reviewNote ? `Review note: ${current.reviewNote}` : "Update your parcel details, then send them for another review."}</Notice></View>}
    {screen === "route" && <>
    {trip && !shipment && <View style={form.notice}><Notice>We've filled in the route from the trip you chose.</Notice></View>}
    <RouteCityField label="From" value={origin} onChange={setOrigin} options={allLocations} disabled={disabled} />
    <RouteCityField label="To" value={destination} onChange={setDestination} options={allLocations} disabled={disabled} />
    <Field label="Pickup instructions" value={pickupInstructions} onChangeText={setPickupInstructions} editable={!disabled} placeholder="Meeting point and how to find you" multiline maxLength={1000} />
    <Field label="Drop-off instructions" value={dropoffInstructions} onChangeText={setDropoffInstructions} editable={!disabled} placeholder="Receiving point and access details" multiline maxLength={1000} />

    </>}
    {screen === "schedule" && <>
    <DateTimeFields label="Pickup" value={ready} onChange={setReady} disabled={disabled} hint="When should the parcel be picked up?" />

    <Button title={flexOpen ? "Hide pickup flexibility" : `Pickup flexibility: ${flexBefore} hours earlier, ${flexAfter} hours later`} variant="ghost" disabled={disabled} onPress={() => setFlexOpen(!flexOpen)} />
    {flexOpen && <View style={form.row}>
      <View style={form.column}><Field label="Hours earlier" value={flexBefore} onChangeText={setFlexBefore} editable={!disabled} keyboardType="number-pad" placeholder="12" hint="0–72 hours" /></View>
      <View style={form.column}><Field label="Hours later" value={flexAfter} onChangeText={setFlexAfter} editable={!disabled} keyboardType="number-pad" placeholder="12" hint="0–72 hours" /></View>
    </View>}

    <DateTimeFields label="Deadline" value={deadline} onChange={setDeadline} disabled={disabled} hint="When must it arrive by?" />

    </>}
    {screen === "contents" && <>
    {/* ── Package Details ───────────────────────────────────── */}
    <Txt style={[s.label, { marginBottom: primitives.space[2] }]}>Category</Txt>
    <CategoryChoices selected={[category]} onSelect={setCategory} disabled={disabled} />
    <Field label="Declared contents" value={description} onChangeText={setDescription} editable={!disabled} placeholder="List every item, quantity and condition" multiline maxLength={1000} hint="Be specific so the traveller can inspect each item." />
    <View style={form.row}>
      <View style={form.column}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} editable={!disabled} keyboardType="decimal-pad" placeholder="0" hint="Up to 25 kg" /></View>
      <View style={form.column}><Field label="Value (₦)" value={value} onChangeText={setValue} editable={!disabled} keyboardType="number-pad" placeholder="0" hint="Up to ₦500,000" /></View>
    </View>
    </>}
    {screen === "photos" && <>
    <EvidencePicker purpose="parcel" value={evidenceIds} onChange={setEvidenceIds} disabled={disabled} onBusyChange={setUploading} compact resumeKey="shipment-form" />

    </>}
    {screen === "receiver" && <>
    {/* ── Receiver ──────────────────────────────────────────── */}
    <Field label="Full name" value={receiverName} onChangeText={setReceiverName} editable={!disabled} placeholder="Receiver's full name" maxLength={120} autoCapitalize="words" />
    <Field label="Phone number" value={receiverPhone} onChangeText={setReceiverPhone} editable={!disabled} keyboardType="phone-pad" placeholder="+234..." maxLength={20} hint="Delivery confirmation is sent by SMS." />
    </>}
    {screen === "review" && <>
      <ReviewSection title="Route" onEdit={() => edit("route")} disabled={disabled}>
        <Txt>{origin} → {destination}</Txt><Txt style={s.hint}>Pickup: {pickupInstructions}</Txt><Txt style={s.hint}>Drop-off: {dropoffInstructions}</Txt>
      </ReviewSection>
      <ReviewSection title="Timing" onEdit={() => edit("schedule")} disabled={disabled}>
        <Txt>Pickup: {formatDisplayDate(ready.date)} at {formatDisplayTime(ready.time)}</Txt>
        <Txt style={s.hint}>Up to {flexBefore} hours earlier or {flexAfter} hours later</Txt>
        <Txt>Arrive by: {formatDisplayDate(deadline.date)} at {formatDisplayTime(deadline.time)}</Txt>
      </ReviewSection>
      <ReviewSection title="Contents" onEdit={() => edit("contents")} disabled={disabled}>
        <Txt>{category} · {weight} kg · {money(Number(value))}</Txt><Txt>{description}</Txt>
      </ReviewSection>
      <ReviewSection title="Photos" onEdit={() => edit("photos")} disabled={disabled}><EvidenceGallery ids={evidenceIds} /></ReviewSection>
      <ReviewSection title="Receiver" onEdit={() => edit("receiver")} disabled={disabled}><Txt>{receiverName}</Txt><Txt>{receiverPhone}</Txt></ReviewSection>
      <View style={form.notice}><Notice>{estimatedFee !== null ? `Estimated delivery fee: ${money(estimatedFee)}. ` : ""}{shipment ? "Saving recalculates the fee and adjusts the amount held in your wallet." : "Submitting holds the delivery fee from your wallet."} The final fee is confirmed when you submit. Payment stays held until delivery is confirmed or the parcel is cancelled under the cancellation policy.</Notice></View>
      <View style={form.notice}><Notice>No weapons, drugs, cash, hazardous materials, stolen goods or live animals. Declared value is not insurance.</Notice></View>
      <Consent checked={declared} onChange={setDeclared} disabled={disabled}>I have listed every item, confirm there are no prohibited goods, and agree to a physical inspection at handover.</Consent>
    </>}
  </CreateFlowFrame>;
}

export function TripForm({ onClose, onSuccess, trip }: { onClose: () => void; onSuccess: () => void; trip?: Trip }) {
  const data = usePassenger();
  const intro = useCreateIntro("traveller", data.snapshot?.viewer?.id, !!trip);
  const [screen, setScreen] = useState<TripScreen>("route");
  const [failed, setFailed] = useState(false);
  const [returnToReview, setReturnToReview] = useState(false);
  const [origin, setOrigin] = useState(trip?.origin ?? "");
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [stops, setStops] = useState<string[]>(() => [...(trip?.stops ?? [])]);
  const [departure, setDeparture] = useState(() => localDateTime(trip?.departureAt));
  const [arrival, setArrival] = useState(() => localDateTime(trip?.arrivalAt));
  const [capacity, setCapacity] = useState(trip ? String(trip.capacityKg) : "5");
  const [maxParcelWeight, setMaxParcelWeight] = useState(trip ? String(trip.maxParcelWeightKg ?? trip.capacityKg) : "5");
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>(() => [...(trip ? trip.acceptedCategories?.length ? trip.acceptedCategories : CATEGORIES : [])]);
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
      setFailed(true);
      return;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const go = (next: TripScreen) => { setError(""); setScreen(next); };
  const edit = (next: TripScreen) => { setReturnToReview(true); go(next); };
  const advance = () => {
    try {
      if (screen === "route") validateTripRoute(origin, destination, stops);
      if (screen === "schedule") validateTravelWindow(parseLocalDateTime(departure, "Departure"), parseLocalDateTime(arrival, "Arrival"));
      if (screen === "categories" && !acceptedCategories.length) throw new Error("Choose at least one parcel type.");
      if (screen === "capacity") validateCarryingCapacity(Number(capacity), Number(maxParcelWeight), acceptedCategories);
      go(returnToReview ? "review" : tripScreens[tripScreens.indexOf(screen) + 1]);
      setReturnToReview(false);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  if (saved) return <FullScreenState title={trip ? "Trip updated" : "Your trip is live"} subtitle="Senders can now find your route." primaryAction={{ label: "Done", onPress: onSuccess }} />;
  if (failed) return <FullScreenState title="We couldn't save your trip" subtitle={error} primaryAction={{ label: "Review trip", onPress: () => { setFailed(false); go("review"); } }} secondaryAction={{ label: "Close", onPress: onClose }} />;
  if (intro.show === null) return <CreateFlowLoading onClose={onClose} />;
  if (intro.show) return <CreateIntro mode="traveller" onContinue={intro.dismiss} replaying={intro.replaying} onClose={intro.replaying ? intro.dismiss : onClose} />;
  return <CreateFlowFrame title={tripCopy[screen][0]} description={tripCopy[screen][1]} screenKey={screen}
    onClose={() => !submitting.current && onClose()} onBack={screen !== "route" ? () => { setReturnToReview(false); go(tripScreens[tripScreens.indexOf(screen) - 1]); } : undefined}
    locked={busy} footer={<View style={form.footerStack}>
      {!!error && <Notice tone="error">{error}</Notice>}
      <Button title={screen === "review" ? trip ? "Save trip changes" : "Publish my trip" : returnToReview ? "Save changes" : "Continue"} variant="lime" onPress={screen === "review" ? submit : advance} busy={busy} disabled={disabled || (screen === "review" && (!agree || !acceptedCategories.length))} />
    </View>}>
    {!!blocked && (data.snapshot?.viewer && !data.offline && !data.authError && !data.authLoading && !data.snapshot.viewer.suspended && data.snapshot.viewer.verification !== "verified"
      ? <IdentityVerificationCard viewer={data.snapshot.viewer} />
      : <View style={form.notice}><Notice tone="warning">{blocked}</Notice></View>)}
    {trip && !observedCommitment && <View style={form.notice}><Notice>You can change your plans until a delivery is accepted. Existing bookings may prevent these changes.</Notice></View>}
    {screen === "route" && <>
    <RouteCityField label="From" value={origin} onChange={setOrigin} allowCustom disabled={disabled} />
    <RouteCityField label="To" value={destination} onChange={setDestination} allowCustom disabled={disabled} />
    <View style={form.stops}>
      <Txt style={[s.label, { marginBottom: 7 }]}>Stops along the way · optional</Txt>
      <Txt style={[s.hint, form.sectionHint]}>Add cities where you can collect or drop off parcels, in travel order. Up to eight stops.</Txt>
      {stops.map((stop, index) => <View key={index} style={form.stop}>
        <RouteCityField allowCustom label={`Stop ${index + 1}`} value={stop} onChange={city => setStops(previous => previous.map((value, position) => position === index ? city : value))} disabled={disabled} />
        <View style={form.stopTools}>
          <Button title="Up" icon={<ArrowUp size={15} color={colors.text} />} accessibilityLabel={`Move stop ${index + 1} up`} variant="secondary" small style={{ minHeight: 44 }} disabled={disabled || index === 0} onPress={() => moveStop(index, -1)} />
          <Button title="Down" icon={<ArrowDown size={15} color={colors.text} />} accessibilityLabel={`Move stop ${index + 1} down`} variant="secondary" small style={{ minHeight: 44 }} disabled={disabled || index === stops.length - 1} onPress={() => moveStop(index, 1)} />
          <Button title="Remove" accessibilityLabel={`Remove stop ${index + 1}`} variant="ghost" small style={{ minHeight: 44 }} disabled={disabled} onPress={() => setStops(previous => previous.filter((_, position) => position !== index))} />
        </View>
      </View>)}
      <Button title={stops.length >= 8 ? "Eight-stop limit reached" : "Add a stop"} variant="secondary" small disabled={disabled || stops.length >= 8} onPress={() => setStops(previous => [...previous, ""])} />
    </View>
    {!!origin.trim() && !!destination.trim() && <View style={form.notice}><Notice>{[origin.trim(), ...stops.map((stop, index) => stop.trim() || `Stop ${index + 1}`), destination.trim()].join(" → ")}</Notice></View>}

    </>}
    {screen === "schedule" && <>
    <DateTimeFields label="Departure" value={departure} onChange={setDeparture} disabled={disabled} hint="Within the next 90 days" />
    <DateTimeFields label="Estimated arrival" value={arrival} onChange={setArrival} disabled={disabled} hint="After departure; within seven days" />


    </>}
    {screen === "categories" && <>
    <CategoryChoices selected={acceptedCategories} multiple disabled={disabled} onSelect={item => setAcceptedCategories(current => current.includes(item) ? current.filter(category => category !== item) : [...current, item])} />
    <Field label="Handling preferences (optional)" value={handlingNotes} onChangeText={setHandlingNotes} editable={!disabled} multiline maxLength={500} placeholder="For example: soft bags only" />
    </>}
    {screen === "capacity" && <>
      <WeightLimit label="Total parcel space" value={Number(capacity)} maximum={100} disabled={disabled} onChange={next => {
        setCapacity(String(next));
        setMaxParcelWeight(current => String(Math.min(Number(current), next)));
      }} />
      <WeightLimit label="Maximum per parcel" value={Number(maxParcelWeight)} maximum={Number(capacity)} disabled={disabled} onChange={next => setMaxParcelWeight(String(next))} />
    </>}
    {screen === "review" && <>
      <ReviewSection title="Route" onEdit={() => edit("route")} disabled={disabled}><Txt>{[origin, ...stops, destination].join(" → ")}</Txt></ReviewSection>
      <ReviewSection title="Travel times" onEdit={() => edit("schedule")} disabled={disabled}>
        <Txt>Leave: {formatDisplayDate(departure.date)} at {formatDisplayTime(departure.time)}</Txt>
        <Txt>Arrive: {formatDisplayDate(arrival.date)} at {formatDisplayTime(arrival.time)}</Txt>
      </ReviewSection>
      <ReviewSection title="Parcel types" onEdit={() => edit("categories")} disabled={disabled}>
        <Txt>{acceptedCategories.join(", ")}</Txt>{!!handlingNotes && <Txt style={s.hint}>{handlingNotes}</Txt>}
      </ReviewSection>
      <ReviewSection title="Weight limits" onEdit={() => edit("capacity")} disabled={disabled}>
        <Txt>{capacity} kg in total · up to {maxParcelWeight} kg per parcel</Txt>
      </ReviewSection>
      <View style={form.notice}><Notice>You'll see your earnings before making an offer. Space is reserved when a sender accepts. Payment is released after delivery is confirmed.</Notice></View>
      <Consent checked={agree} onChange={setAgree} disabled={disabled}>I will inspect the contents with the sender, refuse prohibited goods, collect only parcels with confirmed payment, and use the handover and delivery codes.</Consent>
    </>}
  </CreateFlowFrame>;
}
