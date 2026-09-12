/** Reject partial numbers instead of silently changing the amount charged. */
export function parseDepositAmount(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value.trim());
  return Number.isSafeInteger(amount) && amount >= minimum && amount <= maximum ? amount : null;
}

export function suggestedDeposit(balance: number, required: number | undefined, fallback: number, minimum: number, maximum: number) {
  const shortfall = required !== undefined && required > balance ? Math.ceil((required - balance) / 1000) * 1000 : fallback;
  return Math.min(maximum, Math.max(minimum, shortfall));
}
