/**
 * Money helpers. Amounts move through the app as integers in minor units; a float never
 * touches a refund amount.
 */

/** Formats minor units for display, e.g. (125000, 'GBP') -> "£1,250.00". */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / 100);
}

/**
 * Parses an operator-entered major-unit amount ("12.34") into minor units.
 * Returns null when the input is not a well-formed amount with at most two decimals.
 */
export function parseAmountToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}
