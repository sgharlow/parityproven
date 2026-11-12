/**
 * Observation helpers for state queries over columns written with SYSDATETIME().
 * Each engine checks its own values against its own clock. Two output columns per value:
 *   <alias>_now : 'now' (or 'today') when the value is the call's time, else NULL
 *   <alias>     : NULL when it is the call's time, else the raw value (compared like any other datetime)
 * So a call-time value is compared as "the call's time", and any other value is compared exactly.
 */

const WINDOW_MINUTES = 5;

export const ssNow = (expr: string, alias: string): string =>
  `CASE WHEN ${expr} BETWEEN DATEADD(minute, -${WINDOW_MINUTES}, SYSDATETIME()) AND SYSDATETIME() THEN N'now' END AS [${alias}_now], ` +
  `CASE WHEN ${expr} BETWEEN DATEADD(minute, -${WINDOW_MINUTES}, SYSDATETIME()) AND SYSDATETIME() THEN NULL ELSE ${expr} END AS [${alias}]`;

export const pgNow = (expr: string, alias: string): string =>
  `CASE WHEN ${expr} BETWEEN localtimestamp - interval '${WINDOW_MINUTES} minutes' AND localtimestamp THEN 'now' END AS "${alias}_now", ` +
  `CASE WHEN ${expr} BETWEEN localtimestamp - interval '${WINDOW_MINUTES} minutes' AND localtimestamp THEN NULL ELSE ${expr} END AS "${alias}"`;

export const ssToday = (expr: string, alias: string): string =>
  `CASE WHEN ${expr} = CAST(SYSDATETIME() AS date) THEN N'today' END AS [${alias}_now], ` +
  `CASE WHEN ${expr} = CAST(SYSDATETIME() AS date) THEN NULL ELSE ${expr} END AS [${alias}]`;

export const pgToday = (expr: string, alias: string): string =>
  `CASE WHEN ${expr} = localtimestamp::date THEN 'today' END AS "${alias}_now", ` +
  `CASE WHEN ${expr} = localtimestamp::date THEN NULL ELSE ${expr} END AS "${alias}"`;

export const WINDOW = WINDOW_MINUTES;
