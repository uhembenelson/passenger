import { describe, expect, test } from "bun:test";
import { CATEGORIES } from "@passenger/core";
import { validateMeetingPoints, validateParcelContents, validatePickupWindow, validateReceiver, validateTripRoute, validateTravelWindow, validateCarryingCapacity, adjustWeightLimit } from "../apps/mobile/src/create-flow-validation";

const now = Date.UTC(2026, 8, 12);
const hour = 3600000;
describe("parcel screen validation", () => {
  test("route requires distinct cities and both meeting points", () => {
    expect(() => validateMeetingPoints("Jos", "Jos", "Main gate", "Bus station")).toThrow();
    expect(() => validateMeetingPoints("Jos", "Abuja", "", "Bus station")).toThrow();
    expect(() => validateMeetingPoints("Jos", "Abuja", "Main gate", "")).toThrow();
    expect(() => validateMeetingPoints("Jos", "Abuja", "Main gate", "Bus station")).not.toThrow();
  });
  test("contents reject missing category, invalid weight and fractional value", () => {
    expect(() => validateParcelContents("", "Two books", 2, 2000)).toThrow();
    expect(() => validateParcelContents(CATEGORIES[0], "Two books", NaN, 2000)).toThrow();
    expect(() => validateParcelContents(CATEGORIES[0], "Two books", 26, 2000)).toThrow();
    expect(() => validateParcelContents(CATEGORIES[0], "Two books", 2, 2000.5)).toThrow();
    expect(() => validateParcelContents(CATEGORIES[0], "Two books", 2, 2000)).not.toThrow();
  });
  test("pickup window rejects reversed dates and invalid flexibility", () => {
    expect(() => validatePickupWindow(now + hour, now, 12, 12, now)).toThrow();
    expect(() => validatePickupWindow(now + hour, now + 2 * hour, -1, 12, now)).toThrow();
    expect(() => validatePickupWindow(now + hour, now + 2 * hour, 12, 73, now)).toThrow();
    expect(() => validatePickupWindow(now + hour, now + 2 * hour, 0.5, 12, now)).not.toThrow();
  });
  test("receiver needs a name and valid phone", () => {
    expect(() => validateReceiver("", "+2348012345678")).toThrow();
    expect(() => validateReceiver("Test Receiver", "123")).toThrow();
    expect(() => validateReceiver("Test Receiver", "+2348012345678")).not.toThrow();
  });
});
describe("traveller screen validation", () => {
  test("stops cannot repeat endpoints or contain empty choices", () => {
    expect(() => validateTripRoute("Jos", "Abuja", ["jos"])).toThrow();
    expect(() => validateTripRoute("Jos", "Abuja", [""])).toThrow();
    expect(() => validateTripRoute("Jos", "Abuja", ["Kaduna"])).not.toThrow();
  });
  test("travel window must start in the future and arrive within seven days", () => {
    expect(() => validateTravelWindow(now, now + hour, now)).toThrow();
    expect(() => validateTravelWindow(now + hour, now, now)).toThrow();
    expect(() => validateTravelWindow(now + hour, now + 9 * 24 * hour, now)).toThrow();
    expect(() => validateTravelWindow(now + hour, now + 3 * hour, now)).not.toThrow();
  });
  test("individual parcel capacity cannot exceed total capacity", () => {
    expect(() => validateCarryingCapacity(5, 6, [CATEGORIES[0]])).toThrow();
    expect(() => validateCarryingCapacity(5, 2, [])).toThrow();
    expect(() => validateCarryingCapacity(5, 2, [CATEGORIES[0]])).not.toThrow();
  });
});

describe("weight limit controls", () => {
  test("adjusts by half a kilo and retains fractional existing limits", () => {
    expect(adjustWeightLimit(5, 1, 100)).toBe(5.5);
    expect(adjustWeightLimit(5, -1, 100)).toBe(4.5);
    expect(adjustWeightLimit(1.25, 1, 100)).toBe(1.75);
  });
  test("cannot drop to zero or exceed available capacity", () => {
    expect(adjustWeightLimit(0.5, -1, 100)).toBe(0.5);
    expect(adjustWeightLimit(100, 1, 100)).toBe(100);
    expect(adjustWeightLimit(4.75, 1, 5)).toBe(5);
    expect(adjustWeightLimit(0.25, -1, 0.25)).toBe(0.25);
  });
});
