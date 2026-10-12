/**
 * Laat `node --test` TypeScript-bestanden uit dit project importeren.
 *
 * Node strip zelf de types (`--experimental-strip-types`), maar zoekt geen
 * extensie bij een import als `./neighbors` en kent de `@/`-alias niet. Deze
 * hook vult beide aan, zodat de broncode zelf niet anders hoeft te importeren
 * dan Next.js verwacht.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    if (target.startsWith("@/")) target = new URL(target.slice(2), root).href;

    const local = target.startsWith("./") || target.startsWith("../") || target.startsWith("file:");
    if (local && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of EXTENSIONS) {
        const candidate = new URL(target + extension, context.parentURL);
        if (existsSync(candidate)) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(target, context);
  },
});
