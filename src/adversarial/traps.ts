/**
 * Deterministic checks of what an adversarial case actually sends. A case that claims a trap the input does not contain
 * fails the gate, whatever the auditor says.
 */
import type { ColType, FixedCase, ObjectSpec } from "../harness/generic/spec.js";
import type { TrapCheck, TrapId } from "./schema.js";

interface Value {
  table?: string;
  column: string;
  type: ColType;
  value: unknown;
  /** Row index within its table (undefined for arguments). */
  row?: number;
  /** Column is a key (pk role or identity). */
  key?: boolean;
}

const isText = (t: ColType): boolean => t.kind === "nvarchar" || t.kind === "char";
const isTemporal = (t: ColType): boolean => t.kind === "date" || t.kind === "datetime" || t.kind === "datetime2";
const isFixedPoint = (t: ColType): boolean => t.kind === "decimal" || t.kind === "money";

/** Every input value of a case with its declared column or parameter type. Unknown tables or columns are skipped (load.ts rejects them). */
export function inputValues(spec: ObjectSpec, fc: FixedCase): Value[] {
  const out: Value[] = [];
  for (const [key, rows] of Object.entries(fc.tables ?? {})) {
    const ts = spec.tables.find((t) => `${t.schema}.${t.name}` === key);
    if (!ts) continue;
    rows.forEach((row, i) => {
      for (const [column, value] of Object.entries(row)) {
        const cs = ts.columns.find((c) => c.name === column);
        if (cs) out.push({ table: key, column, type: cs.type, value, row: i, key: cs.role === "pk" || cs.identity === true });
      }
    });
  }
  (fc.args ?? []).forEach((value, i) => {
    const p = spec.params?.[i];
    if (p) out.push({ column: p.name, type: p.type, value });
  });
  return out;
}

const ok = (present: boolean, detail: string): TrapCheck => ({ present, detail });

/** "2020-01-01 10:00:00.5" -> "2020-01-01T10:00:00.500000"; a date alone gets midnight. */
function normTs(v: string): string {
  const m = v.trim().replace(" ", "T").match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?)?$/);
  if (!m) return v;
  return `${m[1]}T${m[2] ?? "00:00:00"}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
}

export function checkTrap(trap: TrapId, spec: ObjectSpec, fc: FixedCase): TrapCheck {
  const vals = inputValues(spec, fc);
  const text = vals.filter((v) => isText(v.type));
  const strings = text.filter((v) => typeof v.value === "string").map((v) => v.value as string);
  switch (trap) {
    case "null-vs-empty": {
      const empty = strings.includes("");
      const nul = text.some((v) => v.value === null || v.value === undefined);
      return ok(empty && nul, `empty string: ${empty ? "yes" : "no"}; NULL in a text input: ${nul ? "yes" : "no"}`);
    }
    case "collation-case": {
      for (let i = 0; i < strings.length; i++)
        for (let j = i + 1; j < strings.length; j++)
          if (strings[i] !== strings[j] && strings[i].toLowerCase() === strings[j].toLowerCase())
            return ok(true, `${JSON.stringify(strings[i])} and ${JSON.stringify(strings[j])} differ only in case`);
      return ok(false, "no two text values differ only in case");
    }
    case "trailing-spaces": {
      const s = strings.find((x) => x.endsWith(" "));
      return ok(s !== undefined, s !== undefined ? `${JSON.stringify(s)} ends in a space` : "no text value ends in a space");
    }
    case "dates-datetime": {
      const temporal = vals.filter((v) => isTemporal(v.type) && typeof v.value === "string");
      for (const v of temporal) {
        const s = v.value as string;
        if (s.startsWith("1753-01-01") || s.startsWith("9999-12-31")) return ok(true, `boundary date ${JSON.stringify(s)} in ${v.column}`);
      }
      for (const v of temporal.filter((x) => x.type.kind === "datetime")) {
        const frac = normTs(v.value as string).split(".")[1] ?? "000000";
        const ms = Number(frac.slice(0, 3));
        if (!frac.endsWith("000") || ![0, 3, 7].includes(ms % 10)) return ok(true, `datetime value ${JSON.stringify(v.value)} is off the .000/.003/.007 grid`);
      }
      if (fc.cutoffs) {
        const cut = [fc.cutoffs.last, fc.cutoffs.new].map(normTs);
        const hit = temporal.find((v) => cut.includes(normTs(v.value as string)));
        if (hit) return ok(true, `a cutoff equals ${JSON.stringify(hit.value)} in ${hit.column}`);
      }
      return ok(false, "no boundary date, off-grid datetime value or cutoff equal to a row date");
    }
    case "numeric-rounding": {
      const hit = vals.find((v) => {
        if (!isFixedPoint(v.type) || v.value === null || v.value === undefined) return false;
        const frac = String(v.value).split(".")[1];
        return frac !== undefined && frac.endsWith("5");
      });
      return ok(hit !== undefined, hit ? `${String(hit.value)} in ${hit.column} ends in a 5` : "no decimal or money value whose last fractional digit is 5");
    }
    case "top-ties": {
      for (const [key, rows] of Object.entries(fc.tables ?? {})) {
        const ts = spec.tables.find((t) => `${t.schema}.${t.name}` === key);
        if (!ts || rows.length < 2) continue;
        for (const c of ts.columns) {
          if (c.role === "pk" || c.identity || c.type.kind === "bit") continue;
          const seen = new Set<string>();
          for (const r of rows) {
            const v = r[c.name];
            if (v === null || v === undefined) continue;
            const k = JSON.stringify(v);
            if (seen.has(k)) return ok(true, `two rows of ${key} share ${c.name} = ${k}`);
            seen.add(k);
          }
        }
      }
      return ok(false, "no two rows of one table share a non-key value");
    }
    case "identity-gaps": {
      const byTable = new Map<string, number[]>();
      for (const v of vals) {
        if (!v.key || v.table === undefined || typeof v.value !== "number") continue;
        const k = `${v.table}.${v.column}`;
        byTable.set(k, [...(byTable.get(k) ?? []), v.value]);
      }
      for (const [k, nums] of byTable) {
        const s = [...nums].sort((a, b) => a - b);
        for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 1) return ok(true, `${k} jumps from ${s[i - 1]} to ${s[i]}`);
      }
      return ok(false, "no key column with a non-contiguous run of numbers");
    }
  }
}

/** Which traps apply to an object, from the column kinds, parameters and key columns of its spec. */
export function applicableTraps(spec: ObjectSpec): Record<TrapId, { applicable: boolean; why: string }> {
  const cols = [...spec.tables.flatMap((t) => t.columns), ...(spec.params ?? [])];
  const has = (f: (t: ColType) => boolean): boolean => cols.some((c) => f(c.type));
  const hasText = has(isText);
  const hasTemporal = has(isTemporal) || spec.windowParams;
  const rowObject = spec.objectClass !== "function" && spec.tables.length > 0;
  const keyed = spec.tables.some((t) => t.columns.some((c) => c.role === "pk" || c.identity)) || (spec.setup?.sqlServer.length ?? 0) > 0;
  return {
    "null-vs-empty": { applicable: hasText, why: hasText ? "text column or parameter" : "no text column or parameter" },
    "collation-case": { applicable: hasText, why: hasText ? "text column or parameter" : "no text column or parameter" },
    "trailing-spaces": { applicable: hasText, why: hasText ? "text column or parameter" : "no text column or parameter" },
    "dates-datetime": { applicable: hasTemporal, why: hasTemporal ? "date column, parameter or cutoff window" : "no date input" },
    "numeric-rounding": { applicable: has(isFixedPoint), why: has(isFixedPoint) ? "decimal or money input" : "no decimal or money input" },
    "top-ties": { applicable: rowObject, why: rowObject ? "returns rows from tables" : "scalar function or no tables" },
    "identity-gaps": { applicable: keyed, why: keyed ? "key, identity or sequence input" : "no key, identity or sequence input" },
  };
}
