// The money-unit edge of the accounting register (/payroll/panel?view=sheet),
// deliberately kept in one small module.
//
// This is the only place in the app where the stored integer is NOT the number
// a human types. The rest of payroll is whole-dollar USD, so a field and its
// input agree; here `amountSgdCents` and `wiseFeeCents` are CENTS (the schema
// comment explains why: the accounting sheet writes $50.00, and a bare
// `amountSgd` would be read as dollars by the next person and be wrong by
// 100x), while `amountUzs` is whole som because UZS has no subunit in practice.
//
// So every value crossing the cell boundary is multiplied or divided by 100,
// and getting it wrong is a 100x error in real money. Concentrating that
// arithmetic here — rather than sprinkling `/ 100` through the table — means
// there is exactly one pair of functions to check.

/**
 * The result of reading a cell. `value` is what the server action wants: a
 * string holding the integer in the STORED unit ("5000" for $50.00), or the
 * empty string to clear the figure back to null. The action re-parses and
 * re-validates it — this parse exists so a typo is caught before a round trip
 * and so the typed decimal becomes cents exactly once, on the way in.
 */
export type ParsedFigure =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Finance pastes figures straight out of a spreadsheet, so grouping commas,
 * ordinary spaces and non-breaking spaces come along for the ride. Strip them
 * before looking at the number; the server action strips the same set, so what
 * is validated here is exactly what it will store.
 */
function normalize(text: string): string {
  // `\s` already covers the non-breaking space a spreadsheet paste can carry.
  return text.trim().replace(/[\s,]/g, "");
}

/**
 * Read a whole-unit figure (UZS). No decimal point is accepted at all — som
 * are whole, and silently dropping a typed ".50" would hide the fact that the
 * person thought this column had cents like the two next to it.
 */
export function parseWholeFigure(text: string): ParsedFigure {
  const t = normalize(text);
  if (t === "") return { ok: true, value: "" }; // clears back to "not recorded"
  if (!/^\d+$/.test(t)) {
    return { ok: false, error: "UZS is whole som — digits only, no decimals." };
  }
  // "007" → "7", so the value echoed back into the cell looks like the number
  // that actually got stored.
  return { ok: true, value: t.replace(/^0+(?=\d)/, "") };
}

/**
 * Read a two-decimal figure (SGD, Wise fee) and return it in CENTS.
 *
 * Deliberately NOT `Math.round(Number(text) * 100)`. A binary double cannot
 * hold 8.29, so that multiply lands on 828.999… and only survives because of
 * the rounding step — the sort of "usually fine" arithmetic that is fine right
 * up until it isn't, in a column where being off by one step of ten is real
 * money. Splitting the text on the decimal point, padding the fraction to two
 * digits and gluing the digits together is exact for every value accepted
 * here, and it lets a third decimal be refused outright rather than quietly
 * rounded away from what someone typed.
 */
export function parseCentsFigure(text: string): ParsedFigure {
  const t = normalize(text);
  if (t === "") return { ok: true, value: "" }; // clears back to "not recorded"
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t);
  const whole = m?.[1] ?? "";
  const frac = m?.[2] ?? "";
  // The pattern also matches a bare "." and an empty fraction ("50."); the
  // first has no digits at all and is a typo, the second is just "50".
  if (!m || (whole === "" && frac === "")) {
    return {
      ok: false,
      error: "Use a number like 50 or 50.25 — two decimals at most.",
    };
  }
  const cents = Number(`${whole === "" ? "0" : whole}${frac.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: "That amount is too large." };
  }
  return { ok: true, value: String(cents) };
}

/**
 * Cents → "1,234.56". Integer arithmetic the whole way: `cents / 100` becomes
 * a double the instant it is written and 829 / 100 is not 8.29 in binary, so
 * the digits after the point are derived from the remainder instead. Pass
 * `grouped: false` for the value seeded into an input or a CSV field, where a
 * thousands separator is noise the reader would have to delete.
 */
export function formatCents(cents: number, grouped = true): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${grouped ? whole.toLocaleString("en-US") : String(whole)}.${frac}`;
}

/** Whole units → "12,000,000". The UZS counterpart of `formatCents`. */
export function formatWhole(n: number, grouped = true): string {
  return grouped ? n.toLocaleString("en-US") : String(n);
}

/**
 * Sum a nullable column. Null means "finance hasn't recorded this yet", which
 * is not zero — so a column where nothing has been recorded sums to null (the
 * total renders as the same em dash the cells do) rather than to a confident
 * 0 that looks like a settled figure.
 */
export function sumRecorded(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}
