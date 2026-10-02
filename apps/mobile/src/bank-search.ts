export type BankOption = { code: string; name: string };

export function normalizeAccountNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function searchable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function searchBanks(banks: BankOption[], query: string, limit = 50) {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  return banks
    .filter(bank => {
      const haystack = searchable(`${bank.name} ${bank.code}`);
      return terms.every(term => haystack.includes(term));
    })
    .slice(0, limit);
}
