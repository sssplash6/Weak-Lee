// How a settlement is spread across someone's open fines. Pure and
// client-safe on purpose: the settle dialog previews a payment with exactly the
// function the server action then applies, so what an admin is shown before
// confirming is what actually lands.

/** The bit of a fine that settlement arithmetic needs. */
export type SettleableFine = {
  id: string;
  amount: number;
  /** Already settled against this fine (0 for an untouched one). */
  paidAmount: number;
};

/** What one fine gets out of a settlement. */
export type FineAllocation = {
  id: string;
  /** Owed before this payment. */
  owedBefore: number;
  /** How much of the payment lands here. */
  pay: number;
  /** Owed after this payment. */
  owedAfter: number;
  /** True when this payment closes the fine out. */
  clears: boolean;
};

export type Settlement = {
  /** One entry per fine passed in, same order, including untouched ones. */
  allocations: FineAllocation[];
  /** How much of the requested amount was actually placed. */
  applied: number;
  /** Requested amount with nowhere left to go (an overpayment). */
  unallocated: number;
  /** Fines this payment closes out. */
  cleared: number;
  owedBefore: number;
  owedAfter: number;
};

/** What's still owed on a single fine. */
export function fineOwed(fine: SettleableFine): number {
  return Math.max(0, fine.amount - fine.paidAmount);
}

/** What's still owed across a set of fines. */
export function totalOwed(fines: SettleableFine[]): number {
  return fines.reduce((sum, f) => sum + fineOwed(f), 0);
}

/**
 * Spread `amount` across `fines` **in the order given** — call sites pass them
 * oldest first, so the longest-standing debt is always cleared first and a
 * part-payment never leaves a trail of half-paid fines. Each fine takes as much
 * as it still owes; whatever's left flows to the next one. A payment larger
 * than the total owed stops at the total and reports the rest as `unallocated`
 * rather than overpaying — fines can't go negative.
 */
export function allocateSettlement(
  fines: SettleableFine[],
  amount: number,
): Settlement {
  // Fractions of a dollar have no meaning here (every fine is a whole number),
  // and a negative payment is a bug upstream — treat it as nothing to place.
  let left = Math.max(0, Math.floor(amount));
  const owedBefore = totalOwed(fines);

  const allocations = fines.map((f) => {
    const owed = fineOwed(f);
    const pay = Math.min(owed, left);
    left -= pay;
    return {
      id: f.id,
      owedBefore: owed,
      pay,
      owedAfter: owed - pay,
      clears: pay > 0 && pay === owed,
    };
  });

  const applied = allocations.reduce((sum, a) => sum + a.pay, 0);

  return {
    allocations,
    applied,
    unallocated: left,
    cleared: allocations.filter((a) => a.clears).length,
    owedBefore,
    owedAfter: owedBefore - applied,
  };
}
