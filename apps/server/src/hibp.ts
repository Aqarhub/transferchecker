// Asking Have I Been Pwned about a password, without ever sending it.
//
// The two halves that make this safe are pure and live in packages/account:
// `hibpQuery` splits the SHA-1 so only five hex characters leave this process,
// and `isBreached` reads the range response locally. This file owns the one
// impure part, the HTTP request, and the availability decision that comes with
// it: THE SERVICE BEING DOWN MUST NOT STOP SIGNUPS. A timeout or a non-200
// answers "unknown" rather than throwing, the length rule still stands either
// way, and the account layer treats unknown as not breached by design.

import { hibpQuery, isBreached } from '@transferchecker/account';

export type BreachCheck = (password: string) => Promise<boolean | undefined>;

const RANGE = 'https://api.pwnedpasswords.com/range/';

/**
 * The real check. `fetcher` is injected so tests never touch the network and
 * the padding header is sent so responses do not leak prefix popularity by
 * size, per the service's own recommendation.
 */
export function hibpCheck(fetcher: typeof fetch = fetch): BreachCheck {
  return async (password) => {
    const query = hibpQuery(password);
    try {
      const response = await fetcher(`${RANGE}${query.prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(2_500),
      });
      if (!response.ok) return undefined;
      return isBreached(await response.text(), query);
    } catch {
      return undefined;
    }
  };
}

/** For deployments that cannot reach the service at all. Says so, once. */
export function noBreachCheck(): BreachCheck {
  return () => Promise.resolve(undefined);
}
