import { describe, expect, it } from "vitest";
import { decodeProviderText } from "../convex/providerText";

describe("decodeProviderText", () => {
  it("decodes provider account names without interpreting them as markup", () => {
    expect(decodeProviderText("ADA &amp; SONS LTD")).toBe("ADA & SONS LTD");
    expect(decodeProviderText("D&#39;ARA &amp; CO")).toBe("D'ARA & CO");
    expect(decodeProviderText("A&#x26;B")).toBe("A&B");
  });

  it("leaves unknown and invalid entities unchanged", () => {
    expect(decodeProviderText("A &unknown; B &#99999999;")).toBe("A &unknown; B &#99999999;");
  });
});
