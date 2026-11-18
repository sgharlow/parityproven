import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { validateAccessMap, type AccessMap } from "./access-map.js";
import { buildQuery, describeMap, queryText, runTool, type ToolQuery } from "./tools.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const map = JSON.parse(readFileSync(resolve(ROOT, "web", "data", "agent-access-map.json"), "utf-8")) as AccessMap;
const customers = map.exposed.find((e) => e.tool === "list_customers")!;

describe("agent access map", () => {
  it("the committed map is valid and covers the five items", () => {
    expect(validateAccessMap(map)).toEqual([]);
    expect(map.exposed.every((e) => e.actions.length && e.view && e.risk.sensitivity)).toBe(true);   // items 1, 2, 4
    expect(map.controls.authentication && map.controls.rowLimits && map.controls.audit).toBeTruthy();   // item 3
    expect(map.firstUseCase.effortHours.p90).toBeGreaterThanOrEqual(map.firstUseCase.effortHours.p50); // item 5
  });

  it("rejects a view or column that is not a plain identifier (the map cannot inject SQL)", () => {
    const bad = structuredClone(map);
    bad.exposed[0].view = "Website.Customers; DROP TABLE x";
    bad.exposed[0].columns = [...bad.exposed[0].columns, "CustomerName]; --"];
    const p = validateAccessMap(bad);
    expect(p.some((x) => x.includes("is not Schema.View"))).toBe(true);
    expect(p.some((x) => x.includes("is not an identifier"))).toBe(true);
  });

  it("requires risk and effort to be labelled as judgments", () => {
    const bad = structuredClone(map);
    bad.judgmentNote = "Ratings.";
    expect(validateAccessMap(bad).some((x) => x.includes("labelled as judgments"))).toBe(true);
  });
});

describe("tool layer", () => {
  it("each tool has one fixed query over its view: only parameter values change", () => {
    expect(queryText(customers)).toBe(
      `SELECT TOP (@limit) ${customers.columns.map((c) => `[${c}]`).join(", ")} FROM [Website].[Customers] WHERE (@f_city IS NULL OR [CityName] = @f_city) ORDER BY [CustomerID]`
    );
    expect(buildQuery(customers, {}).text).toBe(buildQuery(customers, { city: "Seattle", limit: 3 }).text);
  });

  it("binds arguments as parameters, never into the text", () => {
    const evil = "x'; DELETE FROM Sales.Customers; --";
    const q = buildQuery(customers, { city: evil, limit: 2 });
    expect(q.text).not.toContain(evil);
    expect(q.params).toEqual({ limit: 2, f_city: evil });
  });

  it("defaults the limit to maxRows and enforces 1..maxRows", () => {
    expect(buildQuery(customers, {}).params.limit).toBe(customers.maxRows);
    for (const limit of [0, customers.maxRows + 1, 1.5, "5"]) expect(() => buildQuery(customers, { limit })).toThrow(/limit must be/);
  });

  it("accepts no undeclared argument, including any attempt to pass SQL", () => {
    expect(() => buildQuery(customers, { sql: "SELECT 1" })).toThrow(/unknown argument "sql"/);
    expect(() => buildQuery(customers, { city: 5 })).toThrow(/must be text/);
  });

  it("runTool returns rows to the caller but audits only the tool, arguments and row count", async () => {
    let seen: ToolQuery | undefined;
    const r = await runTool(map, "list_customers", { city: "Seattle" }, async (q) => { seen = q; return [{ CustomerID: 1 }, { CustomerID: 2 }]; });
    expect(seen?.text).toBe(queryText(customers));
    expect(r.rows).toHaveLength(2);
    expect(r.audit).toEqual({ tool: "list_customers", args: { city: "Seattle" }, rowCount: 2 });
    await expect(runTool(map, "drop_everything", {}, async () => [])).rejects.toThrow(/unknown tool/);
  });

  it("describe_access_map returns the map, never data rows", () => {
    const d = JSON.parse(describeMap(map));
    expect(d.tools.map((t: { tool: string }) => t.tool)).toEqual(map.exposed.map((e) => e.tool));
    expect(JSON.stringify(d)).not.toContain('"rows"');
  });
});
