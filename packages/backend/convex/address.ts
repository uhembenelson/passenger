export type NormalizedAddress = {
  houseNumberOrName?: string;
  street: string;
  area?: string;
  city: string;
  lga?: string;
  state: string;
  postalCode?: string;
  country?: "NG";
};

const ABBREVIATIONS: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ct: "court",
  ln: "lane",
  ter: "terrace",
  cres: "crescent",
  sq: "square",
  pkwy: "parkway",
};

// Normalize a single address fragment: trim, lowercase, collapse whitespace,
// strip punctuation, expand safe abbreviations, normalize "No." markers.
export function normalizeComponent(value: string | undefined): string {
  let s = String(value ?? "").toLowerCase();
  s = s.replace(/\bno\.?\s+/g, "");
  s = s.replace(/^(number|num)\s+/g, "");
  s = s.replace(/[.,/#!$%^&*;:=_~(){}[\]'"|]/g, " ").replace(/\s+/g, " ").trim();
  return s
    .split(" ")
    .filter(Boolean)
    .map(token => ABBREVIATIONS[token] ?? token)
    .join(" ");
}

export function normalizeAddress(address: Partial<NormalizedAddress> | undefined): NormalizedAddress {
  return {
    houseNumberOrName: address?.houseNumberOrName ? normalizeComponent(address.houseNumberOrName) : undefined,
    street: normalizeComponent(address?.street),
    area: address?.area ? normalizeComponent(address.area) : undefined,
    city: normalizeComponent(address?.city),
    lga: address?.lga ? normalizeComponent(address.lga) : undefined,
    state: normalizeComponent(address?.state),
    postalCode: address?.postalCode ? normalizeComponent(address.postalCode) : undefined,
    country: "NG",
  };
}

// Normalize a free-form address line (proof text, identity document address)
// into a token set for matching against structured claimed components.
export function textTokens(text: string | undefined): Set<string> {
  return new Set(
    normalizeComponent(text)
      .split(" ")
      .filter(Boolean),
  );
}

type MatchStatus = "strong" | "partial" | "mismatch";

export type AddressMatchResult = {
  status: MatchStatus;
  matchedComponents: string[];
  mismatchedComponents: string[];
};

// Severity weights (plan §15): state/city severe, street/house significant,
// area/postal moderate; each adds its weight to the total when present.
const WEIGHTS: Record<string, number> = {
  state: 35,
  city: 25,
  street: 20,
  house: 10,
  lga: 5,
  area: 5,
  postal: 5,
};

// Compare a structured claimed address against free text (proof of address or
// an identity-document address). Returns a strong/partial/mismatch plus the
// matched and mismatched component names.
export function compareClaimedToText(claimed: NormalizedAddress, text: string | undefined): AddressMatchResult {
  const tokens = textTokens(text);
  const has = (value: string | undefined) => {
    const component = normalizeComponent(value);
    if (!component) return true;
    return component.split(" ").every(token => tokens.has(token));
  };

  const components: Record<string, string | undefined> = {
    house: claimed.houseNumberOrName,
    street: claimed.street,
    area: claimed.area,
    city: claimed.city,
    lga: claimed.lga,
    state: claimed.state,
    postal: claimed.postalCode,
  };

  const present = Object.entries(components).filter(([, value]) => !!normalizeComponent(value));
  const matched: string[] = [];
  const mismatched: string[] = [];
  for (const [label, value] of present) {
    if (has(value)) matched.push(label);
    else mismatched.push(label);
  }

  if (!present.length) {
    return { status: "partial", matchedComponents: matched, mismatchedComponents: mismatched };
  }

  // Severity (plan §15): state is severe, street/house are significant.
  // A severe mismatch drives the result to mismatch; a significant mismatch
  // caps the result at partial. Remaining components fall back to a ratio.
  if (mismatched.includes("state")) {
    return { status: "mismatch", matchedComponents: matched, mismatchedComponents: mismatched };
  }

  const significantMismatch = mismatched.some(label => label === "street" || label === "house");
  if (significantMismatch) {
    return { status: "partial", matchedComponents: matched, mismatchedComponents: mismatched };
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const [label, value] of present) {
    totalWeight += WEIGHTS[label] ?? 0;
    if (matched.includes(label)) matchedWeight += WEIGHTS[label] ?? 0;
  }

  const ratio = matchedWeight / totalWeight;
  const status: MatchStatus = ratio >= 0.8 ? "strong" : ratio >= 0.5 ? "partial" : "mismatch";
  return { status, matchedComponents: matched, mismatchedComponents: mismatched };
}

export function addressQuery(address: NormalizedAddress): string {
  return [address.houseNumberOrName, address.street, address.area, address.city, address.lga, address.state, address.country === "NG" ? "Nigeria" : ""]
    .filter(Boolean)
    .join(", ");
}