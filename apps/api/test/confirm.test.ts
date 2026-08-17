// Confirming a mailbox, starting from the link that was actually put in a mail.
//
// The first test is the one worth having. It signs up, takes the URL out of the
// recorded message, requests it exactly as a browser would, submits the form on
// the page, and then checks that the account is confirmed and that a refreshed
// token says so. Nothing in it is constructed by the test: if the link builder
// and the route ever disagree about a path or a query parameter, this fails and
// nothing else in the repository would.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAccessToken } from '@transferchecker/account';
import { SIGNUP, T0, TOKENS, form, get, post, serve } from './harness';
import type { Harness } from './harness';

let api: Harness;

beforeEach(async () => {
  api = await serve();
});

afterEach(async () => {
  await api.close();
});

/** The link out of the message, as a path this server can be asked for. */
function linkFromMail(): string {
  const text = api.sent[0]?.text ?? '';
  const found = /https?:\/\/[^\s]+/.exec(text);
  if (found === null) throw new Error('no link in the message');
  const url = new URL(found[0]);
  return `${url.pathname}${url.search}`;
}

describe('the whole confirmation, from the mail outwards', () => {
  it('lands on a page, and the button on it proves the mailbox', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const path = linkFromMail();

    // The link is in the person's language, because the mail was.
    expect(path.startsWith('/ar/confirm?token=')).toBe(true);

    const page = await get(api.base, path);
    expect(page.status).toBe(200);
    expect(page.text).toContain('<form method="post"');
    // No script anywhere on a page whose URL carries a secret.
    expect(page.text).not.toContain('<script');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');

    const token = new URL(`http://x${path}`).searchParams.get('token') ?? '';
    const submitted = await form(api.base, '/ar/confirm', { token });
    expect(submitted.status).toBe(200);
    expect(submitted.text).toContain('تم تأكيد بريدك');

    // And the claim in a fresh token now says so, which is what gates syncing.
    const signedIn = await post(api.base, '/v1/auth/signin', {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    expect(signedIn.body['emailConfirmed']).toBe(true);
    const check = checkAccessToken({
      token: String(signedIn.body['accessToken']),
      keys: TOKENS.keyring.verifying,
      now: T0,
      names: TOKENS.names,
    });
    expect(check).toMatchObject({ ok: true, claims: { emailConfirmed: true } });
  });

  // A mail gateway opening the link must change nothing, which is the entire
  // reason the page exists instead of the link confirming on arrival.
  it('is not spent by fetching the link', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    await get(api.base, linkFromMail());

    const before = await post(api.base, '/v1/auth/signin', {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    expect(before.body['emailConfirmed']).toBe(false);
  });

  it('tells the second person to press it that it worked', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const token = new URL(`http://x${linkFromMail()}`).searchParams.get('token') ?? '';
    await form(api.base, '/ar/confirm', { token });
    const again = await form(api.base, '/ar/confirm', { token });
    expect(again.status).toBe(200);
    expect(again.text).toContain('تم تأكيد بريدك');
  });

  it('serves the page in English for a language whose words are not written', async () => {
    const page = await get(api.base, '/fr/confirm?token=x');
    expect(page.text).toContain('Confirm your email');
    expect(page.text).toContain('lang="fr"');
  });

  it('has no page for a language the product does not publish', async () => {
    const page = await get(api.base, '/xx/confirm?token=x');
    expect(page.status).toBe(404);
  });
});

describe('the JSON route the app uses', () => {
  it('confirms, and says the same thing the second time', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const token = new URL(`http://x${linkFromMail()}`).searchParams.get('token') ?? '';

    const first = await post(api.base, '/v1/auth/confirm', { token });
    const second = await post(api.base, '/v1/auth/confirm', { token });
    expect(first.body).toEqual({ state: 'confirmed' });
    expect(second.body).toEqual(first.body);
  });

  it('refuses a link nobody issued', async () => {
    const answer = await post(api.base, '/v1/auth/confirm', { token: 'invented' });
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({ error: 'unknown-link' });
  });

  it('refuses a link that has expired', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const token = new URL(`http://x${linkFromMail()}`).searchParams.get('token') ?? '';
    api.setNow(T0 + 25 * 60 * 60 * 1000);
    const answer = await post(api.base, '/v1/auth/confirm', { token });
    expect(answer.body).toEqual({ error: 'expired' });
  });
});

describe('asking for the mail again', () => {
  it('answers an unknown address exactly as a known one', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    api.setNow(T0 + 120_000);

    const known = await post(api.base, '/v1/auth/confirm/resend', { email: SIGNUP.email });
    const unknown = await post(api.base, '/v1/auth/confirm/resend', { email: 'nobody@example.sa' });
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);

    // One mail for the signup and one for the resend, and none for the stranger.
    expect(api.sent).toHaveLength(2);
  });

  it('sends nothing inside the cooldown, and still answers the same', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const answer = await post(api.base, '/v1/auth/confirm/resend', { email: SIGNUP.email });
    expect(answer.status).toBe(202);
    expect(api.sent).toHaveLength(1);
  });

  it('sends nothing to a mailbox already proved', async () => {
    await post(api.base, '/v1/auth/signup', SIGNUP);
    const token = new URL(`http://x${linkFromMail()}`).searchParams.get('token') ?? '';
    await post(api.base, '/v1/auth/confirm', { token });

    api.setNow(T0 + 120_000);
    const answer = await post(api.base, '/v1/auth/confirm/resend', { email: SIGNUP.email });
    expect(answer.status).toBe(202);
    expect(api.sent).toHaveLength(1);
  });
});

describe('with no mail service configured, which is today', () => {
  it('still creates the account, and says so rather than pretending', async () => {
    await api.close();
    api = await serve({ withoutMail: true });

    const answer = await post(api.base, '/v1/auth/signup', SIGNUP);
    expect(answer.status).toBe(202);
    expect(api.lines).toContain('mail: no service is configured, the confirmation was not sent');

    // The account exists and can sign in. Confirmation gates cloud sync and
    // never the sign in, so a teacher can grade a stack of papers today.
    const signedIn = await post(api.base, '/v1/auth/signin', {
      email: SIGNUP.email,
      password: SIGNUP.password,
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body['emailConfirmed']).toBe(false);

    const health = await get(api.base, '/healthz');
    expect(health.body).toEqual({ ok: true, mail: 'none' });
  });
});
