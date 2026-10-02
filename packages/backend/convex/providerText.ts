const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
};

export function decodeProviderText(value: string) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
    if (named) return namedEntities[named.toLowerCase()] ?? entity;
    const codePoint = Number.parseInt(decimal ?? hexadecimal ?? "", decimal ? 10 : 16);
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
    return String.fromCodePoint(codePoint);
  });
}
