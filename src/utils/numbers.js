// Pass digits through unchanged (English only)
export function toBengaliDigits(input) {
  const text = String(input ?? '');
  return text.replace(/\d/g, (digit) => digit);
}
