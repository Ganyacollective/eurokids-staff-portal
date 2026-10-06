// Turning a monthly fee into hours and a rate per hour that actually multiply.
//
// The fee is the agreed thing: 12,000 a month. The hours are what the
// employer's finance team checks. If the invoice says 130 hours at 92.40 they
// will multiply it, get 12,012, and call the school — the original Zoho
// invoice has exactly that defect and nobody had noticed.
//
// So we do not round a rate and hope. We choose the breakup. The number of
// day care days in a month is a convention, not a measurement — 26 is the
// usual one, but 25 is just as true and very often makes the division exact.
// Given the fee and the hours a day, this finds the combination closest to
// the convention whose rate per hour comes out to whole paise.
//
//   12,000 at 5 hours a day → 25 days, 125 hours, 96.00 an hour. Exactly.
//   12,000 at 12 hours a day → 25 days, 300 hours, 40.00 an hour. Exactly.
//
// When nothing is exact it says so rather than printing an invoice that
// cannot be checked.

export type Breakup = {
  hoursPerDay: number;
  daysPerMonth: number;
  monthlyHours: number;
  ratePerHour: number;      // 2dp
  amount: number;           // ratePerHour * monthlyHours, exactly
  exact: boolean;           // does it come to the fee that was asked for?
  shortBy: number;          // amount - requested, 0 when exact
  description: string;      // '5 hours daily | 25 daycare days in a month.'
};

const DEFAULT_DAYS = 26;
// Hours a day are always whole. Nobody leaves a child for 6.1 hours, and an
// invoice that says so is one an employer queries. The lever we move is the
// number of day care days in the month, which is a convention anyway.
const DAY_RANGE = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

const money2 = (n: number) => Math.round(n * 100) / 100;

export function describe(hoursPerDay: number, daysPerMonth: number) {
  const h = hoursPerDay === 1 ? "1 hour daily" : `${trim(hoursPerDay)} hours daily`;
  return `${h} | ${trim(daysPerMonth)} daycare days in a month.`;
}
const trim = (n: number) => String(Number(n).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"));

function build(amount: number, hoursPerDay: number, daysPerMonth: number): Breakup {
  const monthlyHours = money2(hoursPerDay * daysPerMonth);
  const paise = Math.round(amount * 100);
  // Exact when the fee in paise divides by the hours with nothing left over.
  const exact = monthlyHours > 0 && Number.isInteger(paise / monthlyHours);
  const ratePerHour = monthlyHours > 0 ? money2(amount / monthlyHours) : 0;
  const total = money2(ratePerHour * monthlyHours);
  return {
    hoursPerDay, daysPerMonth, monthlyHours, ratePerHour,
    amount: exact ? amount : total,
    exact,
    shortBy: exact ? 0 : money2(total - amount),
    description: describe(hoursPerDay, daysPerMonth),
  };
}

// The breakup to use, and the ones worth offering instead.
export function solveBreakup(
  amount: number,
  hoursPerDay: number,
  opts: { daysPerMonth?: number | null; preferDays?: number } = {},
): { best: Breakup; alternatives: Breakup[] } {
  const prefer = opts.preferDays ?? DEFAULT_DAYS;
  hoursPerDay = Math.max(1, Math.round(hoursPerDay));

  // If the days were set deliberately, honour them — but still say whether
  // the result can be checked.
  if (opts.daysPerMonth) {
    const chosen = build(amount, hoursPerDay, opts.daysPerMonth);
    return { best: chosen, alternatives: chosen.exact ? [] : exactOptions(amount, hoursPerDay, prefer).slice(0, 4) };
  }

  const exacts = exactOptions(amount, hoursPerDay, prefer);
  if (exacts.length) return { best: exacts[0], alternatives: exacts.slice(1, 4) };

  // Nothing divides cleanly at these hours. Offer the nearest hour counts
  // that do — "make it 4 hours and the rate comes out round" is exactly the
  // adjustment that gets made in practice.
  const byHours: Breakup[] = [];
  for (let dh = 1; dh <= 4 && byHours.length < 4; dh++) {
    for (const h of [hoursPerDay - dh, hoursPerDay + dh]) {
      if (h <= 0 || !Number.isInteger(h)) continue;
      const e = exactOptions(amount, h, prefer);
      if (e.length) byHours.push(e[0]);
    }
  }
  // Keep the hours that were asked for, but take the number of days that
  // lands closest to the fee rather than the convention — being 4 paise out
  // is arguable, being 40 is a phone call.
  const nearest = DAY_RANGE.map((d) => build(amount, hoursPerDay, d))
    .sort((a, b) => Math.abs(a.shortBy) - Math.abs(b.shortBy)
                 || Math.abs(a.daysPerMonth - prefer) - Math.abs(b.daysPerMonth - prefer))[0];
  return { best: nearest, alternatives: byHours.slice(0, 4) };
}

function exactOptions(amount: number, hoursPerDay: number, prefer: number): Breakup[] {
  return DAY_RANGE
    .map((d) => build(amount, hoursPerDay, d))
    .filter((b) => b.exact)
    // Closest to the convention first; on a tie, the larger month.
    .sort((a, b) => Math.abs(a.daysPerMonth - prefer) - Math.abs(b.daysPerMonth - prefer)
                 || b.daysPerMonth - a.daysPerMonth);
}
