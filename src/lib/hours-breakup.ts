// Turning a monthly fee into hours and a rate per hour that reconcile.
//
// Three things are fixed and not ours to move:
//   the monthly fee   — what the parent agreed to pay, a round number
//   26 day care days  — the school's month, a fact and not a convention
//   whole hours a day — no child attends for 6.1 hours
//
// So the only free number is the rate per hour, and it is fee ÷ (26 × hours).
// For 12,000 at 5 hours that is 92.307692…, which at two decimals is 92.31,
// and 130 × 92.31 = 12,000.30. Not 12,000. This is exactly the defect in
// INV-000059, where 130 × 92.40 is printed beside a total of 12,000 — the
// numbers on the page do not multiply, and an employer's finance team
// multiplies.
//
// The fix is not to move the fee or invent days. It is to print the rate at
// the precision at which it reconciles: 92.3077 × 130 = 12,000.001, which to
// the paisa is 12,000.00. So we find the fewest decimal places at which the
// line multiplies back to the agreed fee, and show the rate like that — two
// wherever the division is clean, more only where it has to be.

export type Breakup = {
  hoursPerDay: number;
  daysPerMonth: number;
  monthlyHours: number;
  ratePerHour: number;       // rounded to rateDecimals
  rateDecimals: number;      // how many places to print
  rateText: string;          // the rate exactly as it should appear
  amount: number;            // the agreed fee
  reconciles: boolean;       // hours x rate = fee, to the paisa
  computed: number;          // what hours x rate actually comes to
  description: string;       // '5 hours daily | 26 daycare days in a month.'
};

export const DAYCARE_DAYS = 26;
const MAX_DECIMALS = 6;

const round = (n: number, d: number) => {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function describe(hoursPerDay: number, daysPerMonth: number) {
  const h = hoursPerDay === 1 ? "1 hour daily" : `${hoursPerDay} hours daily`;
  return `${h} | ${daysPerMonth} daycare days in a month.`;
}

export function breakup(
  amount: number,
  hoursPerDay: number,
  daysPerMonth: number = DAYCARE_DAYS,
): Breakup {
  const hours = Math.max(1, Math.round(hoursPerDay));
  const days = Math.max(1, Math.round(daysPerMonth));
  const monthlyHours = hours * days;

  let decimals = 2, rate = round(amount / monthlyHours, 2);
  for (let d = 2; d <= MAX_DECIMALS; d++) {
    const r = round(amount / monthlyHours, d);
    decimals = d; rate = r;
    if (round(r * monthlyHours, 2) === round(amount, 2)) break;
  }
  const computed = round(rate * monthlyHours, 2);

  return {
    hoursPerDay: hours,
    daysPerMonth: days,
    monthlyHours,
    ratePerHour: rate,
    rateDecimals: decimals,
    rateText: rate.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    amount: round(amount, 2),
    reconciles: computed === round(amount, 2),
    computed,
    description: describe(hours, days),
  };
}

// The breakup, plus the whole hour counts whose rate lands on two clean
// decimals — for anyone who would rather move the hours than print 92.3077.
export function solveBreakup(
  amount: number,
  hoursPerDay: number,
  opts: { daysPerMonth?: number | null } = {},
): { best: Breakup; alternatives: Breakup[] } {
  const days = opts.daysPerMonth || DAYCARE_DAYS;
  const best = breakup(amount, hoursPerDay, days);
  if (best.rateDecimals === 2) return { best, alternatives: [] };

  const tidy: Breakup[] = [];
  for (let d = 1; d <= 6 && tidy.length < 3; d++) {
    for (const h of [best.hoursPerDay - d, best.hoursPerDay + d]) {
      if (h < 1 || h > 14) continue;
      const b = breakup(amount, h, days);
      if (b.rateDecimals === 2) tidy.push(b);
    }
  }
  return { best, alternatives: tidy };
}
