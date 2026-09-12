import { CATEGORIES, normalizeCity, normalizePhone, validateRoute } from "@passenger/core";

export function validateMeetingPoints(origin: string, destination: string, pickup: string, dropoff: string) {
  validateRoute(origin, destination);
  if (pickup.trim().length < 5) throw new Error("Tell the traveller where to meet you for pickup.");
  if (dropoff.trim().length < 5) throw new Error("Add a meeting point for the person receiving your parcel.");
}
export function validateParcelContents(category: string, description: string, weight: number, value: number) {
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) throw new Error("Choose a parcel category.");
  if (description.trim().length < 5) throw new Error("Describe the items inside your parcel in a little more detail.");
  if (!Number.isFinite(weight) || weight <= 0 || weight > 25) throw new Error("Enter a parcel weight greater than 0 and up to 25 kg.");
  if (!Number.isInteger(value) || value <= 0 || value > 500000) throw new Error("Enter the parcel's value in whole naira, from ₦1 to ₦500,000.");
}
export function validatePickupWindow(pickup: number, deadline: number, before: number, after: number, now = Date.now()) {
  if (!Number.isFinite(pickup) || !Number.isFinite(deadline) || deadline <= Math.max(pickup, now) || deadline > now + 90 * 86400000) throw new Error("Choose a delivery deadline after pickup and within the next 90 days.");
  if ([before, after].some(hours => !Number.isFinite(hours) || !Number.isInteger(hours * 60) || hours < 0 || hours > 72)) throw new Error("Pickup flexibility must be between 0 and 72 hours.");
}
export function validateReceiver(name: string, phone: string) {
  if (!name.trim()) throw new Error("Enter the name of the person receiving your parcel.");
  normalizePhone(phone);
}
export function validateTripRoute(origin: string, destination: string, stops: string[]) {
  validateRoute(origin, destination);
  const route = [origin, ...stops, destination];
  if (stops.length > 8 || route.some(city => !city.trim() || city.length > 80) || new Set(route.map(normalizeCity)).size !== route.length) throw new Error("Choose a different city for each stop, or remove unused stops.");
}
export function validateTravelWindow(departure: number, arrival: number, now = Date.now()) {
  if (!Number.isFinite(departure) || departure <= now || departure > now + 90 * 86400000) throw new Error("Choose a departure time within the next 90 days.");
  if (!Number.isFinite(arrival) || arrival <= departure || arrival > departure + 7 * 86400000) throw new Error("Choose an arrival after departure and within seven days of it.");
}
export function validateCarryingCapacity(capacity: number, maximum: number, categories: string[]) {
  if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 100) throw new Error("Enter the space you have for parcels, greater than 0 and up to 100 kg.");
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > capacity) throw new Error("The heaviest parcel must fit within your total parcel capacity.");
  if (!categories.length) throw new Error("Choose at least one parcel category you can carry.");
}

/** Half-kilo adjustments retain existing fractional limits and never exceed the total. */
export function adjustWeightLimit(value: number, direction: -1 | 1, maximum: number) {
  return Math.min(maximum, Math.max(Math.min(0.5, maximum), Math.round((value + direction * 0.5) * 100) / 100));
}
