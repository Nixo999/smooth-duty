import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radice = new URL("../src/", import.meta.url);

export function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);

  const base = new URL(specifier.slice(2), radice);

  // TypeScript lascia scrivere l'import senza estensione: qui va rimessa,
  // perche' Node non prova le varianti da solo.
  for (const url of [base, new URL(base.href + ".ts"), new URL(base.href + "/index.ts")]) {
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
}
