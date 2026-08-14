// Formatting helpers for emitted Typst source.
//
// Everything this module emits is a Typst *value*, never markup. That matters
// for safety: exam titles and field labels are user supplied, and Typst markup
// treats `#` as the start of code. Emitting user text only ever as a quoted
// string literal removes the injection surface entirely.

/** A length in millimetres, the unit the layout engine works in. */
export function mm(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${String(rounded)}mm`;
}

/** A length in points, used for type sizes and hairlines. */
export function pt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded)}pt`;
}

/**
 * Wraps a value as a Typst double quoted string literal. Only a backslash, a
 * double quote and control characters can end a literal early, so escaping
 * those is sufficient and no user text can escape into code position.
 */
export function str(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    // Remaining control characters have no place in a printed label, and
    // matching them is the whole point of this rule being disabled here.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '');
  return `"${escaped}"`;
}

/** A Typst array of string literals, for font stacks. */
export function strArray(values: readonly string[]): string {
  return `(${values.map(str).join(', ')})`;
}

/** A colour literal. Accepts the six digit hex form used by the design tokens. */
export function color(hex: string): string {
  return `rgb(${str(hex)})`;
}
