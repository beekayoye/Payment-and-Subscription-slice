// Daily proration calculation for the Monthly → Yearly upgrade (PRD A4):
// remaining days ÷ total days × price difference, on whole-integer minor
// units. This is the only place the formula may live — see
// .agents/rules/skills/implement-upgrade-flow.md.
// Rounding: Math.round() ensures the result is a whole integer in minor units (cents/kobo)
// without floating-point representation, strictly satisfying Rule 8.

export interface ProrationInput {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  now: Date;
  monthlyPriceMinorUnits: number;
  yearlyPriceMinorUnits: number;
}

export function calculateUpgradeProration(input: ProrationInput): number {
  const {
    currentPeriodStart,
    currentPeriodEnd,
    now,
    monthlyPriceMinorUnits,
    yearlyPriceMinorUnits,
  } = input;

  const msPerDay = 1000 * 60 * 60 * 24;

  const totalTimeMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime();
  if (totalTimeMs <= 0) {
    return 0;
  }

  const remainingTimeMs = Math.max(0, currentPeriodEnd.getTime() - now.getTime());
  if (remainingTimeMs <= 0) {
    return 0;
  }

  // Calculate day counts
  const totalDays = Math.max(1, Math.ceil(totalTimeMs / msPerDay));
  const remainingDays = Math.max(0, Math.min(totalDays, Math.ceil(remainingTimeMs / msPerDay)));

  const priceDifference = yearlyPriceMinorUnits - monthlyPriceMinorUnits;
  if (priceDifference <= 0) {
    return 0;
  }

  // Daily proration formula: (remaining days ÷ total days) * price difference
  // Always returns an integer in minor units
  const proratedMinorUnits = Math.round((remainingDays / totalDays) * priceDifference);

  return Math.max(0, Math.round(proratedMinorUnits));
}
