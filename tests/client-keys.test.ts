/**
 * CLIENT WORDS — a browser component ("use client") only gets the word-list keys whose prefix is listed in
 * src/lib/client-prefixes.json. A key with any other prefix would show as raw text (e.g. "home.ready.n") on screen.
 * This scans every client file for t("prefix....") / t(`prefix....`) and fails if the prefix is not sent.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import prefixes from "../src/lib/client-prefixes.json";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const CLIENT = walk(join(__dirname, "..", "src")).filter((f) => f.endsWith(".tsx") && /^\s*"use client"/.test(readFileSync(f, "utf8")));

describe("browser components only use words the browser receives", () => {
  it("finds the client components", () => expect(CLIENT.length).toBeGreaterThan(20));
  it("every t(\"prefix.…\") in a client component has its prefix in client-prefixes.json", () => {
    const bad: string[] = [];
    for (const f of CLIENT) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*["`]([a-zA-Z0-9]+)\./g)) if (!(prefixes as string[]).includes(m[1])) bad.push(`${f.split("src")[1]}: ${m[1]}.`);
    }
    expect(bad).toEqual([]);
  });
});
