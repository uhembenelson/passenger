import { expect, it } from "vitest";
import { compareClaimedToText, normalizeAddress, normalizeComponent, type NormalizedAddress } from "../convex/address";

const claimed: NormalizedAddress = {
  houseNumberOrName: "No. 14",
  street: "Yakubu Gowon Way",
  area: "Anglo Jos",
  city: "Jos",
  lga: "Jos North",
  state: "Plateau",
  postalCode: "930283",
  country: "NG",
};

it("normalizes formatting differences", () => {
  expect(normalizeComponent("No. 14")).toBe("14");
  expect(normalizeComponent("No 14")).toBe("14");
  expect(normalizeComponent("NUMBER 14")).toBe("14");
  expect(normalizeComponent("14, Test CRESCENT, Ikeja")).toBe("14 test crescent ikeja");
  expect(normalizeComponent("  No.  14  test  street  ")).toBe("14 test street");
});

it("normalizes an address into the schema shape", () => {
  expect(normalizeAddress(claimed)).toEqual({
    houseNumberOrName: "14",
    street: "yakubu gowon way",
    area: "anglo jos",
    city: "jos",
    lga: "jos north",
    state: "plateau",
    postalCode: "930283",
    country: "NG",
  });
});

it("matches an exact textual address as strong", () => {
  const result = compareClaimedToText(claimed, "No. 14 Yakubu Gowon Way, Anglo Jos, Jos, Plateau");
  expect(result.status).toBe("strong");
});

it("matches formatting-only differences as strong", () => {
  const result = compareClaimedToText(claimed, "14, Yakubu Gowon Way, Anglo-Jos, Jos North, Plateau 930283");
  expect(result.status).toBe("strong");
});

it("reports same street with a different house number as partial", () => {
  const result = compareClaimedToText(claimed, "16 Yakubu Gowon Way, Anglo Jos, Jos, Plateau");
  expect(result.status).toBe("partial");
  expect(result.mismatchedComponents).toContain("house");
});

it("reports same city with a different street as partial", () => {
  const result = compareClaimedToText(claimed, "No. 14 Ahmadu Bello Way, Jos, Plateau");
  expect(result.status).toBe("partial");
  expect(result.mismatchedComponents).toContain("street");
});

it("reports a different state as mismatch", () => {
  const result = compareClaimedToText(claimed, "No. 14 Yakubu Gowon Way, Ikeja, Lagos");
  expect(result.status).toBe("mismatch");
  expect(result.mismatchedComponents).toContain("state");
});

it("ignores missing optional components", () => {
  const minimal: NormalizedAddress = { houseNumberOrName: "14", street: "Yakubu Gowon Way", city: "Jos", state: "Plateau", country: "NG" };
  const result = compareClaimedToText(minimal, "No. 14 Yakubu Gowon Way, Jos, Plateau");
  expect(result.status).toBe("strong");
});

it("matches an abbreviated street as strong", () => {
  const abbreviated: NormalizedAddress = { street: "Mission Rd", city: "Jos", state: "Plateau", country: "NG" };
  const result = compareClaimedToText(abbreviated, "12 Mission Road, Jos, Plateau");
  expect(result.status).toBe("strong");
});

it("reports an empty transcript as mismatch", () => {
  const result = compareClaimedToText(claimed, "   ");
  expect(result.status).toBe("mismatch");
});