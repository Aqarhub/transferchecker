// The extra line worth printing when a particular input fails to decode.
//
// Its own file because `import-shot.ts` is a top level script: importing it to
// reach one function runs the whole command, so anything that wants a test has
// to live beside it rather than in it.

/**
 * An iPhone photographs in HEIC by default, and a decoder built without libheif
 * answers with a generic failure that reads like a corrupt file. The fix is on
 * the phone, not on this machine, so it is worth saying.
 *
 * A hint added to a real failure rather than a refusal, because a build that
 * does carry libheif decodes these perfectly well and must not be told it
 * cannot.
 */
export function decodeHint(input: string): string {
  return /\.(heic|heif)$/i.test(input)
    ? 'this is an iPhone HEIC. Most decoder builds carry no libheif: export it as JPEG from the phone first.\n'
    : '';
}
