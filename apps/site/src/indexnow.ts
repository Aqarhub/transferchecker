// IndexNow, which is the other file a search engine comes and fetches.
//
// DISCOVERABILITY section 7 decides it in one line: Google does not support
// IndexNow, but Bing does, and Bing feeds Microsoft Copilot, and the cost is
// about twenty lines. So it is implemented.
//
// The protocol has two halves and only one of them is a file. Submitting a URL
// is an HTTP call made after a deploy, which does not belong in a static build.
// Proving the submission came from whoever controls the host is a KEY FILE at
// the root, named for the key and containing the key, which the engine fetches
// before it believes anything. That half is this.
//
// THE KEY IS NOT IN THE REPOSITORY. It arrives as `INDEXNOW_KEY` at build time,
// and when it is absent the build simply does not write the file. That is the
// correct failure: a key file whose key is public is a way for anyone to submit
// URLs as us, and a missing key file only means Bing ignores our pings and
// crawls us on its own schedule, which is what it does for most of the web.

export interface KeyFile {
  readonly path: string;
  readonly text: string;
}

/**
 * The key, as the protocol requires it.
 *
 * Between 8 and 128 characters from a narrow alphabet. Anything else is rejected
 * here rather than written out, because a key file the engine refuses to parse
 * fails silently and looks exactly like a key file that works.
 */
const VALID = /^[a-zA-Z0-9-]{8,128}$/;

export function indexNowFile(key: string | undefined): KeyFile | null {
  if (key === undefined || !VALID.test(key)) return null;
  // The file is named for the key and contains the key, and nothing else. A
  // trailing newline is not part of the spec and some validators compare the
  // body byte for byte, so there is not one.
  return { path: `${key}.txt`, text: key };
}
