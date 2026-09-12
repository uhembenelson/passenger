import { expect, test } from "bun:test";
import { parseDepositAmount, suggestedDeposit } from "../apps/mobile/src/wallet-top-up";

test("deposits accept whole naira within configured limits", () => {
  expect(parseDepositAmount("100", 100, 500000)).toBe(100);
  expect(parseDepositAmount(" 5000 ", 100, 500000)).toBe(5000);
  expect(parseDepositAmount("500000", 100, 500000)).toBe(500000);
  expect(parseDepositAmount("100", 500, 10000)).toBeNull();
});
test("deposits never truncate malformed or fractional amounts", () => {
  for (const value of ["", " ", "5000abc", "5000.50", "5,000", "1e4", "-5000", "99", "500001", "9007199254740993"]) {
    expect(parseDepositAmount(value, 100, 500000)).toBeNull();
  }
});
test("suggested deposit uses the loaded balance and stays within limits", () => {
  expect(suggestedDeposit(3000, 6500, 5000, 100, 500000)).toBe(4000);
  expect(suggestedDeposit(8000, 6500, 5000, 100, 500000)).toBe(5000);
  expect(suggestedDeposit(0, 600000, 5000, 100, 500000)).toBe(500000);
  expect(suggestedDeposit(0, undefined, 10, 100, 500000)).toBe(100);
});
