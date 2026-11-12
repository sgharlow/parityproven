/**
 * Website.ActivateWebsiteLogon and Website.ChangePassword (WideWorldImporters): procedures that UPDATE Application.People
 * and THROW 51000 when no row qualifies. Verified with the state form of step 3 (StateCheck): after the same call on both
 * engines, the outcome (completed / raised) and every row of Application.People must match.
 *
 * Column types are from INFORMATION_SCHEMA.COLUMNS on the restored database. Only referenced columns are declared.
 * UserPreferences is nvarchar(max) in the source; generated values are short, so nvarchar(400) is declared.
 */

import { createHash } from "crypto";
import type { ColSpec, FixedCase, Mutant, ObjectSpec, Row, TableSpec } from "../harness/generic/spec.js";

const int = { kind: "int" } as const;
const bit = { kind: "bit" } as const;
const vbin = { kind: "varbinary" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;

const NAMES = ["Amy Trefl", "amy trefl", "Café", "a", "", " ", "x'y", "Ab ", "Zed"];
const PASSWORDS = ["pw", "Pw", "pw ", "", "secret", "Café", "a'b", "longer password 1234"];

/** HASHBYTES('SHA2_256', <nvarchar>) hashes the UTF-16LE bytes. Used only to plant matching hashes in generated data. */
export const nvarcharSha256 = (s: string): Buffer => createHash("sha256").update(Buffer.from(s, "utf16le")).digest();

const people = (extra: ColSpec[] = []): TableSpec => ({
  schema: "Application", name: "People",
  // Person 1 is the preferences template; the procedures refuse it. 3..6 rows so that people 2..4 usually exist.
  rows: [3, 6],
  columns: [
    { name: "PersonID", type: int, role: "pk" },
    { name: "FullName", type: nv(50), strings: NAMES },
    { name: "IsPermittedToLogon", type: bit, trueFraction: 0.3 },
    { name: "LogonName", type: nv(50), nullable: true, strings: ["amy@example.com", "", "x"] },
    { name: "HashedPassword", type: vbin, nullable: true },
    { name: "UserPreferences", type: nv(400), nullable: true, strings: ['{"theme":"blue"}', "", "{}"] },
    ...extra,
  ],
});

// Mostly people who exist and are not person 1, so the update path is exercised; person 1 still occurs, and unknown
// people (0, 9) are covered by fixed cases.
const personId: ColSpec = { name: "PersonID", type: int, range: [1, 4], special: [2, 3, 4] };

const STATE = { tables: ["Application.People"], sqlServerErrors: [51000], postgresErrors: ["P0001"] };

const NOTES = [
  "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.",
  "Converted to a PostgreSQL PROCEDURE. THROW 51000 becomes RAISE EXCEPTION (SQLSTATE P0001); the harness compares whether each engine raised, not the message text. The PRINT lines before THROW are informational messages and are not compared.",
  "HASHBYTES('SHA2_256', nvarchar) hashes UTF-16LE bytes. PostgreSQL has no UTF-16 client encoding, so tsql_compat.utf16le() builds those bytes; sha256() hashes them. Verified for the generated text, which includes non-ASCII (é); characters outside the Basic Multilingual Plane are encoded as surrogate pairs but are not generated.",
  "Step 3 is the state form: the outcome and every row of Application.People are compared after the same call on both engines.",
  "Step 4 is not run: the call changes the data it reads, so repeated timed runs on the same data are not the same work.",
];

const HELPERS_NOTE = "Shared helper tsql_compat.utf16le is created by the conversion file.";

export const LOGON_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Website", name: "ActivateWebsiteLogon", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.activate_website_logon",
    params: [personId, { name: "LogonName", type: nv(50), strings: ["new@example.com", "", "Amy"] }, { name: "InitialPassword", type: nv(40), strings: PASSWORDS }],
    ssCall: "EXEC Website.ActivateWebsiteLogon @PersonID = ?, @LogonName = ?, @InitialPassword = ?",
    pgCall: "CALL {fn}($1::integer, $2::text, $3::text)",
    stateCheck: STATE,
    tables: [people()],
    fixedCases: activateCases(),
    mutants: [
      { name: "person 1 (the template) can be activated", from: `AND p."PersonID" <> 1`, to: `` },
      { name: "already-enabled people are re-activated", from: `AND p."IsPermittedToLogon" = false`, to: `` },
      { name: "password hashed as UTF-8 instead of UTF-16LE", from: `sha256(tsql_compat.utf16le(initial_password || p."FullName"))`, to: `sha256(convert_to(initial_password || p."FullName", 'UTF8'))` },
      { name: "preferences copied from the person being activated", from: `WHERE t."PersonID" = 1`, to: `WHERE t."PersonID" = p."PersonID"` },
      { name: "no error when nothing was updated", from: `RAISE EXCEPTION 'Invalid PersonID'`, to: `RAISE NOTICE 'Invalid PersonID'` },
    ],
    notes: [...NOTES, HELPERS_NOTE],
  },
  {
    database: "WideWorldImporters", schema: "Website", name: "ChangePassword", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.change_password",
    params: [personId, { name: "OldPassword", type: nv(40), strings: PASSWORDS }, { name: "NewPassword", type: nv(40), strings: PASSWORDS, nullable: true }],
    ssCall: "EXEC Website.ChangePassword @PersonID = ?, @OldPassword = ?, @NewPassword = ?",
    pgCall: "CALL {fn}($1::integer, $2::text, $3::text)",
    stateCheck: STATE,
    tables: [people()],
    // Random hashes never match a password, so the update would never happen. For even PersonIDs the stored hash is set
    // to HASHBYTES of (the generated old password + FullName), the way the source computes it; odd ones keep random bytes.
    prepare: (d) => {
      const old = d.args?.[1];
      for (const r of d.tables["Application.People"] ?? []) {
        if (typeof old === "string" && typeof r.FullName === "string" && Number(r.PersonID) % 2 === 0) {
          r.HashedPassword = nvarcharSha256(old + r.FullName);
        }
      }
    },
    fixedCases: changeCases(),
    mutants: [
      { name: "person 1 (the template) can change password", from: `AND p."PersonID" <> 1`, to: `` },
      { name: "old password not checked", from: `AND p."HashedPassword" = sha256(tsql_compat.utf16le(old_password || p."FullName"))`, to: `` },
      { name: "new password hashed without the full name", from: `sha256(tsql_compat.utf16le(new_password || p."FullName"))`, to: `sha256(tsql_compat.utf16le(new_password))` },
      { name: "logon permission not re-enabled", from: `SET "IsPermittedToLogon" = true,`, to: `SET ` },
      { name: "no error when nothing was updated", from: `RAISE EXCEPTION 'Invalid Password Change'`, to: `RAISE NOTICE 'Invalid Password Change'` },
    ],
    notes: [...NOTES, HELPERS_NOTE, "Generated data: for even PersonIDs the stored hash matches the generated old password (prepare hook), so both the success and the error path are exercised."],
  },
];

function person(id: number, over: Partial<Row> = {}): Row {
  return { PersonID: id, FullName: `Person ${id}`, IsPermittedToLogon: false, LogonName: null, HashedPassword: null, UserPreferences: null, ...over };
}

function activateCases(): FixedCase[] {
  return [
    {
      label: "activates person 2: copies person 1's preferences; hash of 'pw' + 'Café' (non-ASCII, UTF-16LE)",
      args: [2, "new@example.com", "pw"],
      tables: { "Application.People": [person(1, { UserPreferences: '{"theme":"blue"}', IsPermittedToLogon: true }), person(2, { FullName: "Café" })] },
    },
    { label: "person 1 is refused", args: [1, "x", "pw"], tables: { "Application.People": [person(1), person(2)] } },
    { label: "an already-enabled person is refused", args: [2, "x", "pw"], tables: { "Application.People": [person(1), person(2, { IsPermittedToLogon: true })] } },
    { label: "an unknown person is refused", args: [9, "x", "pw"], tables: { "Application.People": [person(1), person(2)] } },
    { label: "person 0 is refused", args: [0, "x", "pw"], tables: { "Application.People": [person(1), person(2)] } },
    {
      label: "no person 1: preferences become NULL",
      args: [2, "x", ""],
      tables: { "Application.People": [person(2, { UserPreferences: "old" })] },
    },
  ];
}

function changeCases(): FixedCase[] {
  const h = (s: string): Buffer => nvarcharSha256(s);
  return [
    {
      label: "correct old password ('pw' + 'Café'): new hash stored and logon re-enabled",
      args: [2, "pw", "secret"],
      tables: { "Application.People": [person(1), person(2, { FullName: "Café", HashedPassword: h("pwCafé") })] },
    },
    {
      label: "old password differs only in case: refused (hash comparison is binary)",
      args: [2, "PW", "secret"],
      tables: { "Application.People": [person(1), person(2, { FullName: "Café", HashedPassword: h("pwCafé") })] },
    },
    {
      label: "old password with a trailing space: refused (hashing does not trim)",
      args: [2, "pw ", "secret"],
      tables: { "Application.People": [person(1), person(2, { FullName: "Café", HashedPassword: h("pwCafé") })] },
    },
    {
      label: "NULL new password: the stored hash becomes NULL",
      args: [2, "pw", null],
      tables: { "Application.People": [person(1), person(2, { FullName: "Café", HashedPassword: h("pwCafé") })] },
    },
    {
      label: "person 1 with a correct password is refused",
      args: [1, "pw", "x"],
      tables: { "Application.People": [person(1, { FullName: "Café", HashedPassword: h("pwCafé") }), person(2)] },
    },
  ];
}

export type { Mutant };
