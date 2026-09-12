import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const sourceRoots = [join(root, "apps")];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const forbidden = /[☀★☆✓✔✕✖✳♧↗]|\p{Emoji_Presentation}/u;
const ignoredDirectories = new Set([".next", "dist", "node_modules"]);
const violations: string[] = [];

for (const sourceRoot of sourceRoots) scan(sourceRoot);

if (violations.length) {
  console.error("Emoji and decorative text glyphs are not allowed in application source. Use the shared icon components instead.");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("No emoji or blocked decorative glyphs found in application source.");

function scan(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) scan(join(directory, entry.name));
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name))) continue;
    const file = join(directory, entry.name);
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      if (forbidden.test(line)) violations.push(`${relative(root, file)}:${index + 1}`);
    });
  }
}
