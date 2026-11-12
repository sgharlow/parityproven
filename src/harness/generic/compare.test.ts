import { describe, it, expect } from "vitest";
import { canonicalTable, compareResults } from "./compare.js";
import type { RowSet } from "../types.js";

/** Build a result set: columns as [name, declaredType] pairs. */
const rs = (cols: Array<[string, string]>, rows: unknown[][]): RowSet => ({
  columns: cols.map(([name, declaredType]) => ({ name, declaredType })),
  rows,
});
const INT: [string, string] = ["k", "int"];
const VAL: [string, string] = ["v", "nvarchar"];

describe("compareResults: shape", () => {
  it("identical results are equivalent", () => {
    expect(compareResults(rs([INT, VAL], [[1, "a"], [2, "b"]]), rs([INT, VAL], [[1, "a"], [2, "b"]]), ["k"])).toBeNull();
  });
  it("column names must match exactly, including case and spaces", () => {
    expect(compareResults(rs([["WWI ID", "int"]], [[1]]), rs([["WWI Id", "int4"]], [[1]]), [])).toMatch(/column names differ/);
    expect(compareResults(rs([["a b", "int"]], [[1]]), rs([["a  b", "int4"]], [[1]]), [])).toMatch(/column names differ/);
  });
  it("row count must match", () => {
    expect(compareResults(rs([INT], [[1], [2]]), rs([INT], [[1]]), [])).toMatch(/row count differs: SQL Server 2, PostgreSQL 1/);
  });
  it("an orderKey column must be in the output", () => {
    expect(compareResults(rs([INT], [[1]]), rs([INT], [[1]]), ["missing"])).toMatch(/orderKey column not in output/);
  });
});

describe("compareResults: order", () => {
  it("with no orderKey, the whole result is a multiset", () => {
    expect(compareResults(rs([INT, VAL], [[1, "a"], [2, "b"]]), rs([INT, VAL], [[2, "b"], [1, "a"]]), [])).toBeNull();
  });
  it("multiset comparison still counts duplicates", () => {
    expect(compareResults(rs([INT], [[1], [1], [2]]), rs([INT], [[1], [2], [2]]), [])).toMatch(/value differs/);
  });
  it("rows tied on the order key compare as a multiset", () => {
    expect(compareResults(rs([INT, VAL], [[1, "a"], [1, "b"], [2, "c"]]), rs([INT, VAL], [[1, "b"], [1, "a"], [2, "c"]]), ["k"])).toBeNull();
  });
  it("a tie group must contain the same rows", () => {
    expect(compareResults(rs([INT, VAL], [[1, "a"], [1, "b"]]), rs([INT, VAL], [[1, "a"], [1, "c"]]), ["k"])).toMatch(/value differs/);
  });
  it("rows out of order on SQL Server are reported", () => {
    expect(compareResults(rs([INT], [[2], [1]]), rs([INT], [[1], [2]]), ["k"])).toMatch(/SQL Server rows 0\/1 are out of order on "k"/);
  });
  it("rows out of order on PostgreSQL are reported", () => {
    expect(compareResults(rs([INT], [[1], [2]]), rs([INT], [[2], [1]]), ["k"])).toMatch(/PostgreSQL rows 0\/1 are out of order on "k"/);
  });
  it("a multi-column order key breaks ties on the next column", () => {
    const cols: Array<[string, string]> = [["a", "int"], ["b", "int"]];
    expect(compareResults(rs(cols, [[1, 1], [1, 2], [2, 0]]), rs(cols, [[1, 1], [1, 2], [2, 0]]), ["a", "b"])).toBeNull();
    expect(compareResults(rs(cols, [[1, 2], [1, 1]]), rs(cols, [[1, 1], [1, 2]]), ["a", "b"])).toMatch(/out of order on "b"/);
  });
  it("NULL sorts before values in the order check", () => {
    expect(compareResults(rs([INT], [[null], [1]]), rs([INT], [[null], [1]]), ["k"])).toBeNull();
  });
  // D1 (kiro-request-harness-unit-tests.md): two Date objects with the same instant are a tie, not out of order
  it("D1: a tie on a Date order key is not out of order", () => {
    const t = "2020-01-01T00:00:00.000Z";
    const ss = rs([["k", "datetime2"], VAL], [[new Date(t), "a"], [new Date(t), "b"]]);
    const pg = rs([["k", "timestamp"], VAL], [["2020-01-01 00:00:00", "b"], ["2020-01-01 00:00:00", "a"]]);
    expect(compareResults(ss, pg, ["k"])).toBeNull();
  });
  it("D1 control: Dates really out of order are reported", () => {
    const ss = rs([["k", "datetime2"]], [[new Date("2020-01-02T00:00:00Z")], [new Date("2020-01-01T00:00:00Z")]]);
    const pg = rs([["k", "timestamp"]], [["2020-01-01 00:00:00"], ["2020-01-02 00:00:00"]]);
    expect(compareResults(ss, pg, ["k"])).toMatch(/SQL Server rows 0\/1 are out of order/);
  });
  it("Dates are ordered by their sub-millisecond ticks too", () => {
    const at = (delta: number) => Object.assign(new Date("2020-01-01T00:00:00.123Z"), { nanosecondsDelta: delta });
    const ss = rs([["k", "datetime2"]], [[at(0.0009)], [at(0.0001)]]);
    const pg = rs([["k", "timestamp"]], [["2020-01-01 00:00:00.123100"], ["2020-01-01 00:00:00.123900"]]);
    expect(compareResults(ss, pg, ["k"])).toMatch(/SQL Server rows 0\/1 are out of order/);
  });
  // D2: the SQL Server driver returns bigint as a string; '9' < '10' numerically
  it("D2: bigint keys returned as strings are ordered numerically", () => {
    const ss = rs([["k", "bigint"]], [["9"], ["10"]]);
    const pg = rs([["k", "int8"]], [[9], [10]]);
    expect(compareResults(ss, pg, ["k"])).toBeNull();
  });
  it("D2 (false pass): string bigint keys '10' then '9' are out of order", () => {
    const ss = rs([["k", "bigint"]], [["10"], ["9"]]);
    const pg = rs([["k", "int8"]], [[9], [10]]);
    expect(compareResults(ss, pg, ["k"])).toMatch(/SQL Server rows 0\/1 are out of order/);
  });
  it("timestamp strings in the PostgreSQL order key are ordered by time", () => {
    const ss = rs([["k", "datetime2"]], [[new Date("2020-01-01T09:00:00Z")], [new Date("2020-01-01T10:00:00Z")]]);
    const pg = rs([["k", "timestamp"]], [["2020-01-01 09:00:00"], ["2020-01-01 10:00:00"]]);
    expect(compareResults(ss, pg, ["k"])).toBeNull();
  });
});

describe("compareResults: values", () => {
  it("-0 equals 0", () => {
    expect(compareResults(rs([["n", "decimal"]], [[-0]]), rs([["n", "numeric"]], [[0]]), [])).toBeNull();
  });
  it("NULL is not the empty string", () => {
    expect(compareResults(rs([VAL], [[null]]), rs([VAL], [[""]]), [])).toMatch(/value differs/);
  });
  it("trailing spaces are significant", () => {
    expect(compareResults(rs([VAL], [["a "]]), rs([VAL], [["a"]]), [])).toMatch(/value differs/);
  });
  it("numbers and strings are not confused", () => {
    expect(compareResults(rs([VAL], [["1"]]), rs([["v", "int4"]], [[1]]), [])).toMatch(/value differs/);
  });
  it("booleans compare as booleans", () => {
    expect(compareResults(rs([["b", "bit"]], [[true]]), rs([["b", "boolean"]], [[true]]), [])).toBeNull();
    expect(compareResults(rs([["b", "bit"]], [[true]]), rs([["b", "boolean"]], [[false]]), [])).toMatch(/value differs/);
  });
  it("geography WKT 'POINT (x y)' equals 'POINT(x y)'", () => {
    expect(compareResults(rs([["g", "nvarchar"]], [["POINT (-89.5 50)"]]), rs([["g", "text"]], [["POINT(-89.5 50)"]]), [])).toBeNull();
    expect(compareResults(rs([["g", "nvarchar"]], [["POINT (-89.5 50)"]]), rs([["g", "text"]], [["POINT(-89.5 51)"]]), [])).toMatch(/value differs/);
  });
  it("a Date with sub-millisecond ticks equals the same microsecond timestamp string", () => {
    const d = Object.assign(new Date("2020-01-01T07:00:00.123Z"), { nanosecondsDelta: 0.000456 });
    expect(compareResults(rs([["t", "datetime2"]], [[d]]), rs([["t", "timestamp"]], [["2020-01-01 07:00:00.123456"]]), [])).toBeNull();
    expect(compareResults(rs([["t", "datetime2"]], [[d]]), rs([["t", "timestamp"]], [["2020-01-01 07:00:00.123457"]]), [])).toMatch(/value differs/);
  });
  it("dates compare by calendar day", () => {
    expect(compareResults(rs([["d", "date"]], [[new Date("2020-01-03T00:00:00Z")]]), rs([["d", "date"]], [["2020-01-03"]]), [])).toBeNull();
  });
  it("a bigint string equals the same number", () => {
    expect(compareResults(rs([["n", "bigint"]], [["42"]]), rs([["n", "int8"]], [[42]]), [])).toBeNull();
  });
  it("byte buffers compare byte for byte", () => {
    expect(compareResults(rs([["x", "varbinary"]], [[Buffer.from([1, 2])]]), rs([["x", "bytea"]], [[Buffer.from([1, 2])]]), [])).toBeNull();
    expect(compareResults(rs([["x", "varbinary"]], [[Buffer.from([1, 2])]]), rs([["x", "bytea"]], [[Buffer.from([1, 3])]]), [])).toMatch(/value differs/);
  });
  it("excludeColumns removes a column from the comparison", () => {
    const cols: Array<[string, string]> = [INT, ["geo", "nvarchar"]];
    expect(compareResults(rs(cols, [[1, "x"]]), rs(cols, [[1, "y"]]), [], ["geo"])).toBeNull();
    expect(compareResults(rs(cols, [[1, "x"]]), rs(cols, [[2, "x"]]), [], ["geo"])).toMatch(/value differs/);
  });
});

describe("compareResults: JSON columns", () => {
  it("JSON is compared as a value: whitespace does not matter", () => {
    expect(compareResults(rs([["j", "nvarchar"]], [['{"a": [1, 2]}']]), rs([["j", "text"]], [['{"a":[1,2]}']]), [], [], ["j"])).toBeNull();
  });
  it("key order, array order and nulls do matter", () => {
    const j = (s: string) => rs([["j", "text"]], [[s]]);
    expect(compareResults(j('{"a":1,"b":2}'), j('{"b":2,"a":1}'), [], [], ["j"])).toMatch(/value differs/);
    expect(compareResults(j("[1,2]"), j("[2,1]"), [], [], ["j"])).toMatch(/value differs/);
    expect(compareResults(j('{"a":null}'), j("{}"), [], [], ["j"])).toMatch(/value differs/);
  });
  it("an empty string is not an empty document", () => {
    expect(compareResults(rs([["j", "text"]], [[""]]), rs([["j", "text"]], [['{"R":[]}']]), [], [], ["j"])).toMatch(/value differs/);
  });
  it("without jsonColumns, JSON text is compared as a string", () => {
    expect(compareResults(rs([["j", "text"]], [['{"a": 1}']]), rs([["j", "text"]], [['{"a":1}']]), [])).toMatch(/value differs/);
  });
});

describe("canonicalTable", () => {
  it("is order-sensitive by default and a multiset when unordered", () => {
    const a = rs([INT], [[1], [2]]);
    const b = rs([INT], [[2], [1]]);
    expect(canonicalTable(a)).not.toBe(canonicalTable(b));
    expect(canonicalTable(a, true)).toBe(canonicalTable(b, true));
  });
  it("includes the column names", () => {
    expect(canonicalTable(rs([["x", "int"]], [[1]]))).not.toBe(canonicalTable(rs([["y", "int"]], [[1]])));
  });
});
