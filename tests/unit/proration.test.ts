import test from "node:test";
import assert from "node:assert/strict";
import { calculateUpgradeProration } from "../../src/lib/proration.ts";

test("Upgrade Proration Calculation (PRD A4, Rule 8)", async (t) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  const monthlyPriceMinorUnits = 900; // $9.00 in minor units
  const yearlyPriceMinorUnits = 9000; // $90.00 in minor units
  const priceDifference = yearlyPriceMinorUnits - monthlyPriceMinorUnits; // 8100

  await t.test("half cycle remaining (15/30 days): charges exactly half difference", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * msPerDay);
    const now = new Date(start.getTime() + 15 * msPerDay);

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    // 15 / 30 * 8100 = 4050 minor units ($40.50)
    assert.equal(charge, 4050);
    assert.equal(Number.isInteger(charge), true);
  });

  await t.test("one-third cycle remaining (10/30 days): charges 2700 minor units", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * msPerDay);
    const now = new Date(start.getTime() + 20 * msPerDay); // 10 days remaining

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    // 10 / 30 * 8100 = 2700 minor units ($27.00)
    assert.equal(charge, 2700);
    assert.equal(Number.isInteger(charge), true);
  });

  await t.test("full cycle remaining (30/30 days): charges full difference", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * msPerDay);
    const now = start;

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    assert.equal(charge, priceDifference);
    assert.equal(Number.isInteger(charge), true);
  });

  await t.test("zero days remaining (at boundary): charges 0", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * msPerDay);
    const now = end;

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    assert.equal(charge, 0);
  });

  await t.test("past renewal period: returns 0", () => {
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * msPerDay);
    const now = new Date(end.getTime() + 5 * msPerDay);

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    assert.equal(charge, 0);
  });

  await t.test("never returns float or decimal: always whole integer (Rule 8)", () => {
    // 7 days out of 30 on 8100 = 7/30 * 8100 = 1890 (integer)
    // 13 days out of 31 on 8100 = 13/31 * 8100 = 3396.77 -> rounded to 3397 (integer)
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-02-01T00:00:00Z"); // 31 days
    const now = new Date(start.getTime() + 18 * msPerDay); // 13 days remaining

    const charge = calculateUpgradeProration({
      currentPeriodStart: start,
      currentPeriodEnd: end,
      now,
      monthlyPriceMinorUnits,
      yearlyPriceMinorUnits,
    });

    assert.equal(Number.isInteger(charge), true);
    assert.equal(charge, 3397);
  });
});
