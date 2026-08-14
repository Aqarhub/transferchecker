// A template id travels as sixteen raw bytes rather than as its thirty six
// character text form. That saves twenty characters in a payload where every
// character costs printed area.

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export function bytesToUuid(bytes: Uint8Array, offset: number): string {
  const hex = Array.from(bytes.slice(offset, offset + 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
