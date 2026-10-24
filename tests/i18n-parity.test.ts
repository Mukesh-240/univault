/**
 * LANGUAGE PARITY tests (src/locales/en.json, te.json). In plain words, these fail if:
 *   - any key exists in English but not in Telugu, or the other way round;
 *   - any string is empty;
 *   - a Telugu string uses different {placeholders} from its English twin (so a name or number could go missing);
 *   - a screen's "Need help?" panel lacks its title or any of its 3 steps in either language;
 *   - the code asks for a screen string (t("some.key")) that is not in the locale files;
 *   - the strings people read first (sign-in, help, menus, status words) are still English in the Telugu file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/locales/en.json";
import te from "../src/locales/te.json";
import { HELP_SCREENS } from "../src/lib/help";

const E = en as Record<string, string>;
const T = te as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const TELUGU = /[ఀ-౿]/;

describe("English and Telugu have the same keys", () => {
  it("no key is missing in either language", () => {
    const missingTe = Object.keys(E).filter((k) => !(k in T));
    const missingEn = Object.keys(T).filter((k) => !(k in E));
    expect({ missingTe, missingEn }).toEqual({ missingTe: [], missingEn: [] });
  });

  it("no string is empty", () => {
    expect(Object.entries(E).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    expect(Object.entries(T).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it("Telugu keeps the same {placeholders} as English", () => {
    const bad = Object.keys(E).filter((k) => k in T && placeholders(E[k]).join() !== placeholders(T[k]).join());
    expect(bad).toEqual([]);
  });
});

describe("every screen has its 3-step help in both languages", () => {
  for (const screen of HELP_SCREENS) {
    it(`help for "${screen}"`, () => {
      for (const key of [`help.${screen}.title`, `help.${screen}.1`, `help.${screen}.2`, `help.${screen}.3`]) {
        expect(E[key], `en ${key}`).toBeTruthy();
        expect(T[key], `te ${key}`).toBeTruthy();
      }
    });
  }
});

describe("the strings the code asks for exist", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(__dirname, "..", "src"));

  it("every t(\"literal.key\") in the code is in the locale files", () => {
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\bt\(\s*"([A-Za-z0-9_.:\-/]+)"/g)) {
        if (!(m[1] in E)) missing.push(`${f.split("src")[1]}: ${m[1]}`);
        else if (!(m[1] in T)) missing.push(`${f.split("src")[1]}: ${m[1]} (Telugu)`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("the first things people read are really in Telugu", () => {
  it("sign-in, help, menus and status words contain Telugu letters", () => {
    const prefixes = ["signin.", "help.", "ui.", "nav.tab.", "nav.side.", "status.", "tri.", "bell."];
    const stillEnglish = Object.keys(T).filter((k) => prefixes.some((p) => k.startsWith(p)) && !TELUGU.test(T[k]));
    expect(stillEnglish).toEqual([]);
  });
});

describe("the client word list", () => {
  it("covers every key group that an interactive component uses", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const prefixes: string[] = JSON.parse(readFileSync(join(__dirname, "..", "src", "lib", "client-prefixes.json"), "utf8"));
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const missing = new Set<string>();
    for (const f of walk(join(__dirname, "..", "src")).filter((x) => x.endsWith(".tsx"))) {
      const text = readFileSync(f, "utf8");
      if (!text.trimStart().startsWith('"use client"')) continue;
      for (const m of text.matchAll(/t\(\s*["`']([a-zA-Z0-9_.]+)/g)) if (!prefixes.includes(m[1].split(".")[0])) missing.add(`${f}: ${m[1]}`);
    }
    expect([...missing]).toEqual([]);
  });
});
