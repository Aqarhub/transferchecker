// The three lines of encoding a signed token needs, and the one that is a check.
//
// Kept apart from `token.ts` because they are the part with no policy in them,
// and because `decodeSegment` is doing something the obvious version does not.

/** base64url, unpadded, which is the only encoding a JWS segment uses. */
export const encodeSegment = (value: string): string =>
  Buffer.from(value, 'utf8').toString('base64url');

/**
 * The bytes of one segment, or nothing if the segment was not canonical.
 *
 * THE RE-ENCODE IS THE POINT AND IT IS NOT DECORATION. `Buffer.from(x,
 * 'base64url')` is forgiving: it ignores characters that cannot appear in the
 * alphabet, accepts padding that should not be there, and accepts standard
 * base64 punctuation. So a token and the same token with junk appended to its
 * signature both decode to the same bytes and both verify, which means one
 * session can be presented under any number of distinct strings. Anything that
 * later counts tokens, denies a stolen one by its text, or deduplicates a
 * request would be looking at a value the holder can change at will.
 *
 * Encoding the decoded bytes back and demanding the same string admits exactly
 * one spelling of every token.
 */
export function decodeSegment(segment: string): Buffer | undefined {
  const bytes = Buffer.from(segment, 'base64url');
  return bytes.toString('base64url') === segment ? bytes : undefined;
}

/**
 * JSON, or `undefined` for anything that is not.
 *
 * A thrown parse error inside a verifier is a rejection wearing a stack trace,
 * and the caller has to turn it back into a rejection anyway.
 */
export function readJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return undefined;
  }
}
