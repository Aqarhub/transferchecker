// A ZIP container, stored rather than compressed, in one file and no dependency.
//
// It exists because an .xlsx IS a zip, and because acceptance criterion 19
// cannot be met by CSV alone: a spreadsheet decides for itself what `00713` is
// when it reads a text file, and it decides wrong. A workbook does not decide,
// it is told, so the identifiers survive.
//
// Stored and not deflated, deliberately. A results file is tens of kilobytes of
// text that a teacher opens once, and `deflate` would either be a dependency or
// another few hundred lines of ours to be wrong in. Every reader that opens
// .xlsx supports method 0, because it is in the original specification.

const encoder = new TextEncoder();

/** CRC-32, which a stored entry still has to carry correctly. */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let at = 0; at < 256; at += 1) {
    let value = at;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[at] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = ((value >>> 8) ^ (TABLE[(value ^ byte) & 0xff] ?? 0)) >>> 0;
  }
  return (value ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly path: string;
  readonly text: string;
}

/** Little endian writer, because that is the byte order the format is defined in. */
class Bytes {
  private readonly parts: Uint8Array[] = [];
  public length = 0;

  public push(part: Uint8Array): void {
    this.parts.push(part);
    this.length += part.byteLength;
  }

  public u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  public u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  public done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.byteLength;
    }
    return out;
  }
}

/**
 * The archive.
 *
 * Every timestamp is a fixed 1980-01-01, which is the epoch of the format's own
 * date field. A real clock here would make two exports of one class differ byte
 * for byte, and byte for byte is exactly what criterion 19 compares.
 */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const out = new Bytes();
  const central: { path: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const path = encoder.encode(entry.path);
    const body = encoder.encode(entry.text);
    const crc = crc32(body);
    central.push({ path, crc, size: body.byteLength, offset: out.length });

    out.u32(0x04034b50);
    out.u16(20); // version needed
    out.u16(0x0800); // UTF-8 names
    out.u16(0); // stored
    out.u16(0); // time
    out.u16(33); // date: 1980-01-01
    out.u32(crc);
    out.u32(body.byteLength);
    out.u32(body.byteLength);
    out.u16(path.byteLength);
    out.u16(0);
    out.push(path);
    out.push(body);
  }

  const directoryAt = out.length;
  for (const entry of central) {
    out.u32(0x02014b50);
    out.u16(20); // version made by
    out.u16(20); // version needed
    out.u16(0x0800);
    out.u16(0);
    out.u16(0);
    out.u16(33);
    out.u32(entry.crc);
    out.u32(entry.size);
    out.u32(entry.size);
    out.u16(entry.path.byteLength);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u32(0);
    out.u32(entry.offset);
    out.push(entry.path);
  }

  const directorySize = out.length - directoryAt;
  out.u32(0x06054b50);
  out.u16(0);
  out.u16(0);
  out.u16(central.length);
  out.u16(central.length);
  out.u32(directorySize);
  out.u32(directoryAt);
  out.u16(0);
  return out.done();
}
