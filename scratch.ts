import { isPlaceholderPhone, isValidPhone, normalizePhone } from "./packages/core/src/index.ts";

function placeholderPhone(subjectValue: string) {
  const seed = subjectValue || "passenger";
  let digits = "";
  for (let index = 0; digits.length < 10; index += 1) {
    const code = seed.charCodeAt(index % seed.length) || 0;
    digits += String(code % 10);
  }
  return `+234${digits}`;
}

const ph = placeholderPhone("user_2abc123xyz");
console.log("Placeholder phone:", ph);
console.log("Is placeholder (by core func)?", isPlaceholderPhone(ph));
console.log("Is valid?", isValidPhone(ph));
try {
    console.log("Normalized:", normalizePhone(ph));
} catch (e) {
    console.log("Error normalizing:", e.message);
}
