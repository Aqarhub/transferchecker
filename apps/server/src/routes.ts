// Every endpoint, as functions of injected dependencies.
//
// The server's whole job is to be the two hats in the right order: auth
// operations wear `asAuthService` (the tc_auth policies of migration 0006),
// and anything reading tenant data verifies the access token first and wears
// `asTenant`, which is the same set_config plus SET ROLE that managed Supabase
// performs. No route touches a connection directly and no route reads a clock:
// `now` comes from the injected clock so tests can sit exactly on an expiry.
//
// REFUSALS ARE UNIFORM WHERE AN ATTACKER IS THE AUDIENCE. Login answers a
// wrong password and an unknown address identically (the layers below
// guarantee even the timing), sign-out never says whether it recognised the
// token, and the confirm endpoint folds "expired" and "never issued" into one
// answer because the difference only helps somebody probing stolen links.

import { randomBytes } from 'node:crypto';
import {
  ACCESS_LIFETIME_MS,
  accessClaims,
  checkSignup,
  issueAccessToken,
  verifyAccessToken,
} from '@transferchecker/account';
import {
  PushBatchSchema,
  accountEmail,
  asAuthService,
  asTenant,
  attemptLogin,
  beginConfirmation,
  confirmEmail,
  createAccount,
  endSession,
  profileOf,
  pullSync,
  pushSync,
  refreshSession,
  setPassword,
  startSession,
  uuidv7,
} from '@transferchecker/db';
import type { Database } from '@transferchecker/db';
import { sql } from 'drizzle-orm';
import type { BreachCheck } from './hibp';
import type { KeyRing } from './keys';
import type { Mailer } from './mailer';
import { confirmationMessage, mailLanguage } from './message';
import type { Handler, Reply, Request } from './http';

/** Thirty days, the lifetime the session tests already assume for a device. */
export const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export interface Dependencies {
  readonly db: Database;
  readonly keys: KeyRing;
  readonly clock: () => number;
  readonly mailer: Mailer;
  /**
   * Where a failed send is reported. Never with the address or the link: an
   * email address is PII and a confirmation link is a credential.
   */
  readonly log: (line: string) => void;
  readonly breached: BreachCheck;
  /** The live policy versions a signup must have agreed to. */
  readonly policy: { readonly privacy: string; readonly terms: string };
  /** The locales this build publishes, so a consent is readable. */
  readonly languages: readonly string[];
  /** Where confirmation links point, e.g. https://app.example.sa */
  readonly origin: string;
}

const token = (): string => randomBytes(32).toString('base64url');

/**
 * Whether an error, anywhere down its cause chain, is the email unique
 * violation. Drizzle wraps the driver's error, so the message worth reading is
 * rarely the outermost one; 23505 is PostgreSQL's unique-violation class and
 * the constraint name pins it to the one column this route expects to collide.
 */
/** Every message down the cause chain, for matching wrapped driver errors. */
function messageChain(error: unknown): string {
  const parts: string[] = [];
  for (let current: unknown = error; isRecord(current); current = current['cause']) {
    if (typeof current['message'] === 'string') parts.push(current['message']);
  }
  return parts.join(' | ');
}

function isEmailTaken(error: unknown): boolean {
  for (let current = error; isRecord(current); current = current['cause']) {
    const message = typeof current['message'] === 'string' ? current['message'] : '';
    if (message.includes('users_email_unique')) return true;
    if (current['code'] === '23505' && message.includes('email')) return true;
  }
  return false;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The refresh token out of a body, or null. One shape, both endpoints. */
const presentedToken = (body: unknown): string | null => {
  if (!isRecord(body)) return null;
  const value = body['refreshToken'];
  return typeof value === 'string' && value !== '' ? value : null;
};

export function routes(deps: Dependencies): Readonly<Record<string, Handler>> {
  /**
   * Login and refresh both end the same way: a session becomes two tokens.
   * `confirmed` is only stated when the caller just proved a password; a
   * refresh does not re-answer it and does not pretend to.
   */
  const sessionReply = async (
    userId: string,
    orgId: string,
    email: string,
    familyId: string,
    refreshToken: string,
    now: number,
    confirmed?: boolean,
  ): Promise<Reply> => {
    const accessToken = await issueAccessToken(
      deps.keys.privateKey,
      deps.keys.kid,
      accessClaims({ userId, orgId, familyId, email, now }),
    );
    return {
      status: 200,
      body: {
        accessToken,
        refreshToken,
        expiresInMs: ACCESS_LIFETIME_MS,
        ...(confirmed === undefined ? {} : { confirmed }),
      },
    };
  };

  const signup: Handler = async (request) => {
    const body = isRecord(request.body) ? request.body : {};
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const checked = checkSignup(body, {
      languages: deps.languages,
      currentPolicyVersion: () => deps.policy.privacy,
      ...(await deps
        .breached(password)
        .then((seen) => (seen === undefined ? {} : { breached: seen }))),
    });
    if (!checked.ok) return { status: 400, body: { error: 'invalid', problems: checked.problems } };

    const now = deps.clock();
    const ids = {
      userId: uuidv7({ now }),
      orgId: uuidv7({ now }),
      consentIds: [uuidv7({ now }), uuidv7({ now })] as [string, string],
    };
    const confirmation = token();

    try {
      const plan = await asAuthService(deps.db, async (tx) => {
        const created = await createAccount(tx, checked.account, ids, deps.policy, now);
        if (!created.ok) return created;
        await setPassword(tx, { userId: ids.userId, orgId: ids.orgId }, password, now);
        await beginConfirmation(tx, { userId: ids.userId, token: confirmation, now });
        return created;
      });
      if (!plan.ok) return { status: 409, body: { error: 'stale-consent' } };
    } catch (error) {
      // The one expected collision: the address already has an account. Saying
      // so is a deliberate trade (every mainstream signup does), and the login
      // path stays the hardened one.
      if (isEmailTaken(error)) return { status: 409, body: { error: 'email-taken' } };
      throw error;
    }

    // THE ACCOUNT IS ALREADY COMMITTED, SO THE SEND MUST NOT BE ABLE TO UNDO
    // IT. Letting a rejection out here returns 500 to somebody whose account,
    // password and confirmation token were all written a line earlier, and
    // whose retry then answers 409 email-taken: an address stranded by a mail
    // queue, unrecoverable from the outside. The null mailer never rejects, so
    // this only ever bites once a real provider is plugged in, which is exactly
    // the kind of defect that arrives already in production.
    //
    // The failure is logged rather than swallowed, and the person is not stuck:
    // login works unconfirmed and reports `confirmed: false`, so only cloud
    // sync waits. A resend endpoint is the follow-up round, named in SERVER.md.
    try {
      await deps.mailer.send(
        confirmationMessage(
          checked.account.email,
          mailLanguage(checked.account.language),
          `${deps.origin}/auth/confirm#${confirmation}`,
        ),
      );
    } catch {
      deps.log('mailer: confirmation send failed, the account was still created');
    }
    return { status: 201, body: { userId: ids.userId } };
  };

  const login: Handler = async (request) => {
    const body = isRecord(request.body) ? request.body : {};
    const email = typeof body['email'] === 'string' ? body['email'] : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const now = deps.clock();

    const result = await asAuthService(deps.db, (tx) => attemptLogin(tx, { email, password, now }));
    if (!result.outcome.ok) {
      // One body for "wrong password" and "no such account"; the throttle gets
      // its own status because the client must show a wait, not a retry.
      return result.outcome.reason === 'too-soon'
        ? { status: 429, body: { error: 'too-soon', retryInMs: result.outcome.retryInMs } }
        : { status: 401, body: { error: 'wrong-credentials' } };
    }

    const familyId = uuidv7({ now });
    const refreshToken = token();
    await asAuthService(deps.db, (tx) =>
      startSession(tx, {
        familyId,
        orgId: result.orgId ?? '',
        userId: result.userId ?? '',
        token: refreshToken,
        now,
        lifetimeMs: REFRESH_LIFETIME_MS,
      }),
    );
    return sessionReply(
      result.userId ?? '',
      result.orgId ?? '',
      email.trim().toLowerCase(),
      familyId,
      refreshToken,
      now,
      result.outcome.confirmed,
    );
  };

  const refresh: Handler = async (request) => {
    const presented = presentedToken(request.body);
    if (presented === null) return { status: 400, body: { error: 'missing-token' } };
    const now = deps.clock();
    const successor = token();

    const { result, email } = await asAuthService(deps.db, async (tx) => {
      const outcome = await refreshSession(tx, {
        presented,
        successor,
        now,
        lifetimeMs: REFRESH_LIFETIME_MS,
      });
      const address =
        outcome.outcome.ok && outcome.userId !== undefined
          ? await accountEmail(tx, outcome.userId)
          : null;
      return { result: outcome, email: address };
    });

    if (!result.outcome.ok || result.userId === undefined || result.orgId === undefined) {
      return {
        status: 401,
        body: { error: result.outcome.ok ? 'unknown-token' : result.outcome.reason },
      };
    }
    return sessionReply(
      result.userId,
      result.orgId,
      email ?? '',
      result.outcome.issue.family,
      successor,
      now,
    );
  };

  const signout: Handler = async (request) => {
    const presented = presentedToken(request.body);
    if (presented !== null) {
      await asAuthService(deps.db, (tx) => endSession(tx, presented, deps.clock()));
    }
    // 204 whatever happened: an endpoint that says "that token was real" is a
    // free oracle for testing stolen tokens.
    return { status: 204, body: {} };
  };

  const confirm: Handler = async (request) => {
    const body = isRecord(request.body) ? request.body : {};
    const presented = typeof body['token'] === 'string' ? body['token'] : '';
    if (presented === '') return { status: 400, body: { error: 'missing-token' } };
    const outcome = await asAuthService(deps.db, (tx) =>
      confirmEmail(tx, { token: presented, now: deps.clock() }),
    );
    // Confirmed and already-confirmed are both success to the person clicking.
    // Expired and unknown are one refusal on purpose: telling a caller a token
    // USED to be real only helps somebody sorting stolen links.
    return outcome === 'confirmed' || outcome === 'already'
      ? { status: 200, body: { confirmed: true } }
      : { status: 400, body: { error: 'invalid-token' } };
  };

  /**
   * The one gate every tenant endpoint passes: a Bearer token, verified
   * against the ring with the injected clock. Data, never an exception, so a
   * route's refusal is one line.
   */
  const bearer = async (
    request: Request,
  ): Promise<
    Awaited<ReturnType<typeof verifyAccessToken>> | { ok: false; reason: 'missing-token' }
  > => {
    const header = request.authorization ?? '';
    if (!header.startsWith('Bearer ')) return { ok: false, reason: 'missing-token' };
    return verifyAccessToken(header.slice('Bearer '.length), deps.keys.verifyKeys, deps.clock());
  };

  const me: Handler = async (request) => {
    const verified = await bearer(request);
    if (!verified.ok) return { status: 401, body: { error: verified.reason } };

    // The whole point of this endpoint: the SAME claims the token carried go
    // into the transaction, and row level security answers from there.
    const profile = await asTenant(
      deps.db,
      { userId: verified.userId, orgId: verified.orgId },
      (tx) => profileOf(tx, verified.orgId, verified.userId),
    );
    if (profile === null) return { status: 401, body: { error: 'unknown-account' } };
    return { status: 200, body: { ...profile, orgId: verified.orgId } };
  };

  const push: Handler = async (request) => {
    const verified = await bearer(request);
    if (!verified.ok) return { status: 401, body: { error: verified.reason } };

    const parsed = PushBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: 'invalid', problems: parsed.error.issues.map((issue) => issue.message) },
      };
    }

    try {
      const report = await asTenant(
        deps.db,
        { userId: verified.userId, orgId: verified.orgId },
        (tx) => pushSync(tx, verified.orgId, parsed.data, deps.clock()),
      );
      return { status: 200, body: { ...report } };
    } catch (error) {
      // The one refusal row level security raises through a push: an id that
      // collides with a row this organisation may not touch. The batch is
      // refused whole so the device retries it unchanged after fixing itself.
      if (error instanceof Error && /row-level security|violates row/i.test(messageChain(error))) {
        return { status: 409, body: { error: 'conflict' } };
      }
      throw error;
    }
  };

  const pull: Handler = async (request) => {
    const verified = await bearer(request);
    if (!verified.ok) return { status: 401, body: { error: verified.reason } };

    const raw = request.query.get('after') ?? '';
    const after = Number(raw);
    if (raw === '' || !Number.isFinite(after) || after < 0) {
      return { status: 400, body: { error: 'missing-cursor' } };
    }

    const page = await asTenant(deps.db, { userId: verified.userId, orgId: verified.orgId }, (tx) =>
      pullSync(tx, verified.orgId, after, deps.clock()),
    );
    return { status: 200, body: { ...page } };
  };

  const health: Handler = async () => {
    await deps.db.execute(sql`select 1`);
    return { status: 200, body: { ok: true } };
  };

  return {
    'POST /auth/signup': signup,
    'POST /auth/login': login,
    'POST /auth/refresh': refresh,
    'POST /auth/signout': signout,
    'POST /auth/confirm': confirm,
    'POST /sync/push': push,
    'GET /sync/pull': pull,
    'GET /me': me,
    'GET /health': health,
  };
}
