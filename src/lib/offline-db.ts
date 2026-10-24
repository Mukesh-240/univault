/**
 * OFFLINE DEMO STORE — a small stand-in for the Supabase database, used ONLY when no database key is
 * configured (NEXT_PUBLIC_SUPABASE_ANON_KEY missing or still the "<placeholder>").
 *
 * Plain-English picture:
 *   The real app keeps everything in a Postgres database that refuses edits and deletes of history and
 *   keeps a hash-chained ledger. When we can't reach that database (no key on this machine), the app
 *   would be useless. So this file keeps the same tables in the server's memory and copies the SAME
 *   rules the database enforces:
 *     - history tables are append-only (edit/delete is refused with the same kind of error);
 *     - only the document CONTENT table allows delete (that is how erasure works);
 *     - only the issuer on/off switch (issuer_config) allows an update (the fault panel uses it);
 *     - the ledger fills in its own previous-line fingerprint and its own fingerprint, and
 *       verify_ledger() re-checks the whole chain exactly like the SQL function does.
 *   It is filled at first use with the showcase dataset through the SAME seed function and the SAME
 *   ingestDocument() front door as the real database. Nothing here knows about any person or document.
 *
 *   It only understands the handful of query shapes this app uses (select / insert / upsert / update /
 *   delete, eq / in / order / limit / single, and one nested "table(columns)" join).
 *   Everything lives in memory: restarting the server starts again from the seed.
 *
 * ponytail: in-memory arrays with linear scans — fine for a few thousand rows; the real database
 * (with its key) is the upgrade path, not a smarter fake.
 */
import { randomUUID } from "node:crypto";
import { sha256 } from "./crypto";

type Row = Record<string, unknown>;
interface DbError { message: string; code: string }
interface Result { data: unknown; error: DbError | null; count?: number | null }

/** Tables whose rows get a counting number id (in the real schema: "generated always as identity"). */
const NUMBERED = new Set(["document_events", "issuer_registry", "share_events", "token_events", "access_log"]);
/** The only table rows may be deleted from (erasing a document's content), and the only one rows may be changed in. */
const DELETABLE = new Set(["document_payloads"]);
const UPDATABLE = new Set(["issuer_config"]);
/** "This column must point at an existing row in that table" (foreign keys), for the tables we use. */
const FOREIGN: Record<string, [string, string][]> = {
  document_payloads: [["document_id", "documents"]], document_events: [["document_id", "documents"]],
  assertions: [["document_id", "documents"]], entity_links: [["doc_a", "documents"], ["doc_b", "documents"]],
};

/** The whole in-memory database: one list of rows per table, plus counters. */
export interface Store { tables: Record<string, Row[]>; counter: number; lastTime: number }

const fail = (message: string, code = "P0001"): Result => ({ data: null, error: { message, code } });

/** Read a column, including the JSON path form "synthetic_origin->>dataset" used by the seed script. */
function get(row: Row, col: string): unknown {
  const [base, ...path] = col.split("->>");
  return path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Row)[k] : undefined), row[base]);
}

/** Split "a, b, rel(x, y)" at the top-level commas only. */
function splitCols(cols: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of cols) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Keep only the asked-for columns; "child(cols)" attaches the child rows whose document_id is this row's id. */
function project(store: Store, row: Row, cols: string): Row {
  if (cols.trim() === "*") return { ...row };
  const out: Row = {};
  for (const c of splitCols(cols)) {
    const nested = c.match(/^(\w+)\((.*)\)$/);
    if (nested) out[nested[1]] = (store.tables[nested[1]] ?? []).filter((r) => r.document_id === row.id).map((r) => project(store, r, nested[2]));
    else out[c] = row[c];
  }
  return out;
}

/** The ledger's own fingerprint rule, the same recipe as the SQL trigger: prev | kind | payload | time. */
const lineHash = (r: Row) => sha256(`${r.prev_hash}|${r.kind}|${JSON.stringify(r.payload)}|${r.created_at}`);

/** One query being built up, like Supabase's: db.from("t").select("...").eq(...).order(...) — then awaited. */
class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private cols = "*";
  private returning = false;
  private head = false;
  private filters: ((r: Row) => boolean)[] = [];
  private sort?: { col: string; asc: boolean };
  private max?: number;
  private one = false;
  private values: Row[] = [];
  private conflict: string[] = [];
  private patch: Row = {};

  constructor(private store: Store, private table: string, private ready: () => Promise<unknown>) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.cols = cols;
    if (this.op !== "select") this.returning = true;
    this.head = Boolean(opts?.head);
    return this;
  }
  insert(v: Row | Row[]) { this.op = "insert"; this.values = Array.isArray(v) ? v : [v]; return this; }
  upsert(v: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert"; this.values = Array.isArray(v) ? v : [v];
    this.conflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    return this;
  }
  update(p: Row) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: unknown) { this.filters.push((r) => get(r, col) === v); return this; }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(get(r, col))); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.sort = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }

  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.ready().then(() => this.run()).then(ok, ko);
  }

  private rows() { return (this.store.tables[this.table] ??= []); }

  /** A timestamp that always moves forward, so "order by created_at" keeps insertion order. */
  private now() {
    this.store.lastTime = Math.max(Date.now(), this.store.lastTime + 1);
    return new Date(this.store.lastTime).toISOString();
  }

  /** Fill in what the database would: ids, times, and for the ledger its chain fingerprints. Returns an error message on a broken link. */
  private fill(v: Row): Row | string {
    for (const [col, parent] of FOREIGN[this.table] ?? [])
      if (!(this.store.tables[parent] ?? []).some((p) => p.id === v[col])) return `insert on ${this.table} violates foreign key ${col}`;
    const created_at = (v.created_at as string) ?? this.now();
    if (this.table === "ledger") {
      const prev = this.rows().at(-1);
      const line: Row = { seq: this.rows().length + 1, kind: v.kind, payload: v.payload, prev_hash: prev ? prev.hash : "0".repeat(64), created_at };
      return { ...line, hash: lineHash(line) };
    }
    const id = v.id ?? (NUMBERED.has(this.table) ? ++this.store.counter : this.table === "document_payloads" ? undefined : randomUUID());
    return { ...(id === undefined ? {} : { id }), ...v, created_at };
  }

  private finish(rows: Row[]): Result {
    if (this.head) return { data: null, error: null, count: rows.length };
    const data = rows.map((r) => project(this.store, r, this.cols));
    if (!this.one) return { data, error: null, count: rows.length };
    return data.length === 1 ? { data: data[0], error: null } : fail(`expected one row, got ${data.length}`, "PGRST116");
  }

  private run(): Result {
    const matches = () => this.rows().filter((r) => this.filters.every((f) => f(r)));
    switch (this.op) {
      case "insert":
      case "upsert": {
        const added: Row[] = [];
        for (const v of this.values) {
          if (this.op === "upsert" && this.rows().some((r) => this.conflict.every((c) => r[c] === v[c]))) continue; // ignoreDuplicates
          const row = this.fill(v);
          if (typeof row === "string") return fail(row, "23503");
          this.rows().push(row);
          added.push(row);
        }
        return this.returning ? this.finish(added) : { data: null, error: null };
      }
      case "update":
        if (!UPDATABLE.has(this.table)) return fail(`Table ${this.table} is append-only: UPDATE is not allowed`);
        for (const r of matches()) Object.assign(r, this.patch);
        return this.returning ? this.finish(matches()) : { data: null, error: null };
      case "delete": {
        if (!DELETABLE.has(this.table)) return fail(`Table ${this.table} is append-only: DELETE is not allowed`);
        const gone = new Set(matches());
        this.store.tables[this.table] = this.rows().filter((r) => !gone.has(r));
        return { data: null, error: null };
      }
      default: {
        let rows = matches();
        if (this.sort) {
          const { col, asc } = this.sort;
          rows = [...rows].sort((a, b) => { const x = get(a, col) as string | number, y = get(b, col) as string | number; return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
        }
        if (this.max !== undefined) rows = rows.slice(0, this.max);
        return this.finish(rows);
      }
    }
  }
}

/** Re-check the whole ledger chain, line by line (same logic as the SQL function verify_ledger()). */
function verifyLedger(store: Store) {
  let expectedPrev = "0".repeat(64);
  const lines = store.tables.ledger ?? [];
  for (const r of lines) {
    if (r.prev_hash !== expectedPrev || r.hash !== lineHash(r)) return [{ ok: false, total: lines.length, broken_at: r.seq }];
    expectedPrev = r.hash as string;
  }
  return [{ ok: true, total: lines.length, broken_at: null }];
}

/** A fresh, empty store with the issuer switched on (like the real schema's one issuer_config row). */
export function newStore(): Store {
  return { tables: { issuer_config: [{ id: 1, is_down: false, updated_at: new Date().toISOString() }] }, counter: 0, lastTime: 0 };
}

/**
 * A client object with the two abilities the app uses: from(table) and rpc("verify_ledger").
 * `ready` is called before every query: the public client uses it to seed the store on FIRST use
 * (not when the file is merely imported) and to wait until that seeding has finished.
 */
export function offlineClient(store: Store, ready: () => Promise<unknown> = () => Promise.resolve()) {
  return {
    from: (table: string) => new Query(store, table, ready),
    rpc: async (fn: string) => { await ready(); return fn === "verify_ledger" ? { data: verifyLedger(store), error: null } : fail(`unknown function ${fn}`); },
  };
}

/** How many rows a table holds (for the tests and the fault panel's "nothing was stored" counts). */
export const rowCount = (store: Store, table: string) => (store.tables[table] ?? []).length;
