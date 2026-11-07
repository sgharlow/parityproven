import { describe, it, expect } from "vitest";
import { classifyTier } from "./tier.js";

describe("classifyTier — complex patterns", () => {
  it("EXEC( → complex", () => {
    expect(classifyTier("BEGIN EXEC(@sql) END")).toBe("complex");
  });
  it("sp_executesql → complex", () => {
    expect(classifyTier("EXEC sp_executesql N'SELECT 1'")).toBe("complex");
  });
  it("CURSOR → complex", () => {
    expect(classifyTier("DECLARE cur CURSOR FOR SELECT id FROM t")).toBe("complex");
  });
  it("cross-database reference → complex", () => {
    expect(classifyTier("SELECT * FROM OtherDB..MyTable")).toBe("complex");
  });
  it("OPENQUERY → complex", () => {
    expect(classifyTier("SELECT * FROM OPENQUERY(srv, 'SELECT 1')")).toBe("complex");
  });
  it("OPENROWSET → complex", () => {
    expect(classifyTier("SELECT * FROM OPENROWSET('SQLNCLI', '', 'SELECT 1')")).toBe("complex");
  });
  it("xp_ extended proc → complex", () => {
    expect(classifyTier("EXEC xp_cmdshell 'dir'")).toBe("complex");
  });
});

describe("classifyTier — medium patterns", () => {
  it("temp table → medium", () => {
    expect(classifyTier("SELECT * INTO #tmp FROM t")).toBe("medium");
  });
  it("table variable → medium", () => {
    expect(classifyTier("DECLARE @t TABLE (id int)")).toBe("medium");
  });
  it("MERGE → medium", () => {
    expect(classifyTier("MERGE target AS t USING source AS s ON t.id = s.id")).toBe("medium");
  });
  it("TRY/CATCH → medium", () => {
    expect(classifyTier("BEGIN TRY SELECT 1 END TRY BEGIN CATCH ROLLBACK END CATCH")).toBe("medium");
  });
  it("window function OVER( → medium", () => {
    expect(classifyTier("SELECT ROW_NUMBER() OVER (ORDER BY id) FROM t")).toBe("medium");
  });
  it("OUTPUT clause → medium", () => {
    expect(classifyTier("DELETE FROM t OUTPUT deleted.id")).toBe("medium");
  });
});

describe("classifyTier — simple", () => {
  it("plain SELECT procedure → simple", () => {
    const def = `
      CREATE PROCEDURE dbo.GetItems
      AS
      BEGIN
        SET NOCOUNT ON;
        SELECT id, name FROM dbo.Items WHERE active = 1;
      END
    `;
    expect(classifyTier(def)).toBe("simple");
  });
  it("no patterns at all → simple", () => {
    expect(classifyTier("SELECT 1")).toBe("simple");
  });
});

describe("classifyTier — complex wins over medium", () => {
  it("definition with both CURSOR and temp table → complex (not medium)", () => {
    expect(classifyTier("DECLARE cur CURSOR FOR SELECT id FROM #tmp")).toBe("complex");
  });
});
