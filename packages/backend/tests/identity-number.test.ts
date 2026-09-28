import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });

beforeEach(() => {
  vi.stubEnv("V4_VERIFICATION_API_KEY", "test-key");
  vi.stubEnv("V4_VERIFICATION_API_SECRET", "test-secret");
  vi.stubEnv("V4_VERIFICATION_API_URL", "http://127.0.0.1:5000/api/v4/verifications");
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.otp) {
      return new Response(JSON.stringify({
        success: true,
        message: `${body.type} verified successfully.`,
        data: {
          identityId: body.identityId,
          identityType: body.type,
          verified: true,
          identity: {
            firstName: "Ada",
            middleName: "Ngozi",
            lastName: "Okafor",
            dateOfBirth: "1990-01-02",
            gender: "Female",
            phoneNumber: "08012345678",
            nationality: "Nigerian",
            maritalStatus: "Single",
            residentialAddress: "1 Test Street",
            stateOfResidence: "Lagos",
            lgaOfResidence: "Ikeja",
            imageBase64: "data:image/jpeg;base64,verified-photo",
            bvn: "12345678901",
            nin: "10987654321",
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, message: "OTP sent.", data: { identityId: `provider-${body.type}`, identityType: body.type } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["BVN", "NIN"] as const)("verifies %s without storing the complete identity number", async type => {
  const t = convexTest(schema, modules);
  const member = t.withIdentity(identity(`identity-${type.toLowerCase()}`));
  const profile = await member.mutation(api.accounts.bootstrapProfile, {});
  const initiated = await member.action(api.accounts.initiateIdentityNumberVerification, { type, identityNumber: "12345678901" });
  expect(initiated).toMatchObject({ type, identityId: `provider-${type}` });
  const result = await member.action(api.accounts.verifyIdentityNumberOtp, { type, identityId: initiated.identityId, otp: "123456" });
  expect(result).toMatchObject({ type, fullName: "Ada Ngozi Okafor" });

  const stored = await t.run(ctx => ctx.db.get(profile.id as Id<"users">));
  expect(stored?.identityNumberVerificationType).toBe(type);
  expect(stored?.identityNumberVerifiedAt).toBeTypeOf("number");
  expect(stored?.identityNumberLast4).toBeUndefined();
  expect(stored?.kycTier).toBe(0);
  expect(stored?.phone).toBe("+2348012345678");
  expect(stored?.name).toBe("Ada Ngozi Okafor");
  expect(stored?.image).toBeUndefined();
  expect(stored?.identityFaceVerificationStatus).toBe("required");
  expect(stored?.identityBioData).toEqual({
    firstName: "Ada",
    middleName: "Ngozi",
    lastName: "Okafor",
    dateOfBirth: "1990-01-02",
    gender: "Female",
    phoneNumber: "08012345678",
    nationality: "Nigerian",
    maritalStatus: "Single",
    residentialAddress: "1 Test Street",
    stateOfResidence: "Lagos",
    lgaOfResidence: "Ikeja",
    imageBase64: "data:image/jpeg;base64,verified-photo",
  });
  expect(JSON.stringify(stored)).not.toContain("12345678901");
  expect(JSON.stringify(stored)).not.toContain("10987654321");
});

it("rejects malformed identity numbers", async () => {
  const t = convexTest(schema, modules);
  const member = t.withIdentity(identity("identity-invalid"));
  await member.mutation(api.accounts.bootstrapProfile, {});
  await expect(member.action(api.accounts.initiateIdentityNumberVerification, { type: "BVN", identityNumber: "1234" })).rejects.toThrow("11-digit BVN");
});
