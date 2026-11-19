// Display helpers only. Parsing, validation and fee math stay in react-native-xo.

const MAX_WHOLE_DIGITS = 8;
const MAX_DECIMALS = 8;

/**
 * Splits a decimal string into the digits that carry value and the trailing
 * zeros that do not, so the latter can be drawn fainter: "1.50000000" becomes
 * ["1.5", "0000000"] and "2.00000000" becomes ["2", ".00000000"].
 */
export function splitAmount(value?: string): [string, string] {
  if (typeof value !== 'string' || value === '') return ['—', ''];
  if (!value.includes('.')) return [value, ''];
  const trimmed = value.replace(/0+$/, '');
  const strong = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return [strong, value.slice(strong.length)];
}

/** "bchtest:qz4h…k3f9" style addresses lose their prefix and middle. */
export function shortAddress(address: string) {
  if (typeof address !== 'string') return '';
  const body = address.slice(address.indexOf(':') + 1);
  return body.length > 10 ? `${body.slice(0, 4)}…${body.slice(-4)}` : body;
}

/** Applies one keypad press ("0"–"9", "." or "delete") to an amount string. */
export function pressKey(amount: string, key: string) {
  if (key === 'delete') return amount.slice(0, -1);
  if (key === '.') return amount.includes('.') ? amount : `${amount || '0'}.`;
  if (!/^[0-9]$/.test(key)) return amount;
  const [whole, fraction] = amount.split('.');
  if (fraction !== undefined) return fraction.length < MAX_DECIMALS ? amount + key : amount;
  if (whole === '0') return key;
  return whole.length < MAX_WHOLE_DIGITS ? amount + key : amount;
}

/** Groups a whole number of satoshis with commas: 1234567n becomes "1,234,567". */
export const groupSats = (amount: bigint) => amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Small tBCH fee amounts, always written the same way: "1,234 sats". */
export const formatSats = (amount: bigint) => `${groupSats(amount)} sats`;
