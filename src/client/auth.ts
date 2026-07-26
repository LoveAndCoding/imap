// Mechanism selection + AUTHENTICATE/LOGIN orchestration (spec §9.3). Used by
// both `ImapClient.connect()`'s step-5 seam and the public `authenticate()`
// method (spec §3.2) — see `client/client.ts`'s `runAuthSelection()`. Kept
// free of any direct `ImapClient` dependency (only the small `AuthSelectionDeps`
// interface below) so it's testable against a fake host.

import { AuthenticateCommand, LoginCommand } from "../commands";
import type { Command } from "../commands/base";
import { AuthError, TlsError } from "../errors";
// Importing from "../sasl" (rather than "../sasl/mechanism" directly) is
// deliberate: that module's side effect registers the built-in mechanisms
// (PLAIN/OAUTHBEARER/XOAUTH2) into the registry `createMechanism()` below
// reads from — see sasl/index.ts's doc comment.
import { createMechanism } from "../sasl";
import type { SaslContext, SaslMechanism } from "../sasl/mechanism";
import type { CapabilityView } from "./capabilities";
import type { ImapAuthConfig } from "./config";

export interface AuthSelectionDeps {
	capabilities: CapabilityView;
	isSecure: boolean;
	allowInsecureAuth: boolean;
	host: string;
	port: number;
	run<T>(command: Command<T>): Promise<T>;
	/** Invoked once, only when the winning command's OWN tagged response
	 *  didn't already refresh the capability registry (spec §3.3 step 5:
	 *  "Refresh capabilities from tagged-OK [CAPABILITY] else round trip") —
	 *  detected by comparing `capabilities.epoch` immediately before/after
	 *  that one command runs, so an unrelated capability change during an
	 *  earlier, failed candidate can't be mistaken for "already refreshed". */
	refreshCapabilities(): Promise<void>;
}

/**
 * LOW finding (second-review round, verified intentional): this list omits
 * CRAM-MD5/EXTERNAL/ANONYMOUS on purpose, not by oversight -- it is a
 * byte-for-byte match of the spec's own §9.3 step 1: "Candidates = config
 * `mechanisms` order, else default order: `SCRAM-SHA-256, SCRAM-SHA-1,
 * PLAIN` (pass present) / `OAUTHBEARER, XOAUTH2` (token present)." CRAM-MD5
 * offers no mutual authentication and is superseded by SCRAM wherever both
 * are available; EXTERNAL/ANONYMOUS have no secret to try automatically
 * from `pass`/`accessToken`/`authzid` alone. All three remain fully usable
 * — just not auto-selected — via an explicit `auth.mechanisms` entry (e.g.
 * `mechanisms: ["CRAM-MD5"]`, or `["EXTERNAL"]` with `authzid` set, M35 fix)
 * naming them; they are registered in the mechanism registry
 * (`sasl/index.ts`) like every other built-in.
 */
function defaultCandidates(auth: ImapAuthConfig): Array<string | SaslMechanism> {
	const candidates: Array<string | SaslMechanism> = [];
	if (auth.pass !== undefined) {
		candidates.push("SCRAM-SHA-256", "SCRAM-SHA-1", "PLAIN");
	}
	if (auth.accessToken !== undefined) {
		candidates.push("OAUTHBEARER", "XOAUTH2");
	}
	return candidates;
}

function resolveMechanism(
	candidate: string | SaslMechanism,
): { name: string; mechanism: SaslMechanism | undefined } {
	if (typeof candidate === "string") {
		return { name: candidate.toUpperCase(), mechanism: createMechanism(candidate) };
	}
	return { name: candidate.name.toUpperCase(), mechanism: candidate };
}

/**
 * Runs spec §9.3's mechanism selection + AUTHENTICATE/LOGIN attempt sequence
 * to completion: resolves once one mechanism (or LOGIN) succeeds, rejects
 * with `AuthError` once nothing viable is left (or immediately, per §10.3,
 * if the transport is cleartext and insecure auth isn't opted into).
 */
export async function performAuthSelection(
	auth: ImapAuthConfig,
	deps: AuthSelectionDeps,
): Promise<void> {
	// §10.3 credential policy: reject BEFORE any bytes, for the attempt as a
	// whole (not a per-mechanism filter) — cleartext + no opt-in is a hard
	// stop regardless of which mechanisms might otherwise be viable.
	if (!deps.isSecure && !deps.allowInsecureAuth) {
		throw new TlsError(
			"authenticate()/LOGIN refused: the transport is cleartext and " +
				"allowInsecureAuth is not set (spec §10.3, RFC 8314 §5)",
			{ phase: "steady", reason: "policy" },
		);
	}

	// Every mechanism NAME considered, whether actually attempted or excluded
	// before ever reaching the wire — matches `AuthError.mechanismsTried`'s
	// documented meaning ("every mechanism attempted (or considered and
	// excluded)", errors.ts).
	const mechanismsTried: string[] = [];
	const exclusions: string[] = [];
	const saslIrAllowed = deps.capabilities.has("SASL-IR");
	const advertised = new Set(
		deps.capabilities.authMechanisms().map((m) => m.toUpperCase()),
	);

	const candidates = auth.mechanisms ?? defaultCandidates(auth);

	// PR #18 review fix (Medium, LOGIN-fallback exclusion): a NON-EMPTY
	// explicit `mechanisms` list is authoritative for whether LOGIN may EVER
	// be attempted. LOGIN isn't a SASL mechanism — it has no AUTH=
	// advertisement, no AUTHENTICATE exchange — so a caller passing an
	// explicit list of real SASL candidates intending "SASL-only" (e.g.
	// `mechanisms: ["SCRAM-SHA-256"]`) had no way to actually exclude it
	// before this fix: step 4 below unconditionally attempted LOGIN whenever
	// every listed SASL candidate was excluded or failed, silently sending
	// the real password over a fallback the caller never opted into. Two
	// shapes keep the PRE-EXISTING fallback-allowed behavior on purpose: the
	// default candidate list (`auth.mechanisms` unset), and an explicit but
	// EMPTY array (`mechanisms: []`) — the latter names no SASL preference at
	// all (a long-standing, widely-used idiom throughout this codebase's own
	// test suite for "skip SASL, go straight to LOGIN"), so it carries no
	// "SASL-only" signal to exclude LOGIN from. Only a NON-EMPTY explicit
	// list that omits the literal string `"LOGIN"` excludes it.
	const loginExplicitlyRequested = candidates.some(
		(c) => typeof c === "string" && c.toUpperCase() === "LOGIN",
	);
	const nonEmptyExplicitMechanisms = auth.mechanisms !== undefined && auth.mechanisms.length > 0;
	const loginAllowed = !nonEmptyExplicitMechanisms || loginExplicitlyRequested;

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.toUpperCase() === "LOGIN") {
			// Handled entirely by step 4 below (`loginAllowed`) — LOGIN has no
			// SASL registry entry, so looking it up here would always miss and
			// misreport it as "unknown mechanism (not registered)". Listing it
			// in an explicit `mechanisms` array is purely how a caller opts
			// back into the LOGIN fallback (see `loginExplicitlyRequested`
			// above); it is never itself attempted as a SASL candidate.
			continue;
		}
		const { name, mechanism } = resolveMechanism(candidate);
		mechanismsTried.push(name);

		if (!mechanism) {
			exclusions.push(`${name}: unknown mechanism (not registered)`);
			continue;
		}
		if (!advertised.has(name)) {
			exclusions.push(`${name}: not advertised by the server (no AUTH=${name})`);
			continue;
		}
		if (mechanism.requiresSecureTransport && !deps.isSecure && !deps.allowInsecureAuth) {
			exclusions.push(`${name}: requires a secure transport (allowInsecureAuth not set)`);
			continue;
		}

		const ctx: SaslContext = {
			user: auth.user,
			pass: auth.pass,
			accessToken: auth.accessToken,
			// M35 fix (second-review round): `SaslContext.authzid` already
			// existed (`sasl/mechanism.ts`) and `ExternalMechanism`/
			// `AnonymousMechanism` already read it (`sasl/external.ts`/
			// `sasl/anonymous.ts`) — but nothing here ever populated it from
			// `ImapAuthConfig`, so a caller had no way to actually supply a
			// non-empty authzid/trace-information value through the
			// config-driven `connect()` path (only reachable, if at all,
			// via a hand-built `SaslContext` bypassing this module
			// entirely). `config.ts`'s `validateAuth()` now accepts and
			// type-checks `auth.authzid`; this is the other half, threading
			// it through to every mechanism uniformly.
			authzid: auth.authzid,
			host: deps.host,
			port: deps.port,
		};

		let initialResponse: Buffer | null;
		try {
			initialResponse = await mechanism.start(ctx);
		} catch (err) {
			// Failed before a single byte hit the wire — a mechanism-negotiation
			// failure (spec §9.3 step 3), try the next candidate.
			exclusions.push(
				`${name}: start() failed (${err instanceof Error ? err.message : String(err)})`,
			);
			continue;
		}

		const cmd = new AuthenticateCommand({ mechanism, ctx, initialResponse, saslIrAllowed });
		const epochBefore = deps.capabilities.epoch;
		try {
			await deps.run(cmd);
		} catch (err) {
			if (err instanceof AuthError && err.terminal) {
				// TERMINAL (M5.1 security fix): the MECHANISM itself rejected the
				// exchange after the server already claimed success (a `finish()`
				// integrity failure — e.g. a SCRAM ServerSignature that does not
				// verify, RFC 5802 §5). The server failed MUTUAL authentication:
				// the peer may be a man-in-the-middle who couldn't forge the
				// final proof. Stop dead — trying the next candidate (or worse,
				// falling through to LOGIN below) would hand that suspect peer
				// the password in a weaker, directly-reusable form. See
				// `AuthError.terminal`'s doc comment.
				throw err;
			}
			if (err instanceof AuthError && err.code?.name === "AUTHENTICATIONFAILED") {
				// Credentials are wrong, not the mechanism (spec §9.3 step 3) — do
				// NOT fall through to the next candidate.
				throw err;
			}
			if (err instanceof AuthError) {
				// Mechanism-negotiation failure (tagged BAD, or any rejection that
				// isn't specifically AUTHENTICATIONFAILED) — try the next one.
				exclusions.push(`${name}: ${err.message}`);
				continue;
			}
			// Anything else (ConnectionError, StateError, a programming bug) is
			// not something this algorithm knows how to route around.
			throw err;
		}

		if (deps.capabilities.epoch === epochBefore) {
			await deps.refreshCapabilities();
		}
		return;
	}

	// Step 4: LOGIN fallback. LOGINDISABLED forecloses it outright; it's also
	// not viable without a real password (LOGIN has no SASL-style bearer-
	// token/mechanism concept) or, per §10.3, over cleartext without opt-in.
	const loginDisabled = deps.capabilities.has("LOGINDISABLED");
	mechanismsTried.push("LOGIN");
	if (!loginAllowed) {
		// PR #18 review fix (Medium, LOGIN-fallback exclusion): see
		// `loginAllowed`'s own comment above — an explicit `mechanisms` list
		// that didn't include "LOGIN" excludes it outright, before even
		// checking LOGINDISABLED/password/transport, so a caller relying on
		// this to keep the password entirely out of an explicit-list attempt
		// gets a typed `AuthError`, never a LOGIN command on the wire.
		exclusions.push(
			'LOGIN: excluded by an explicit `mechanisms` list that does not include "LOGIN"',
		);
	} else if (loginDisabled) {
		exclusions.push("LOGIN: server advertised LOGINDISABLED");
	} else if (auth.pass === undefined) {
		exclusions.push("LOGIN: no password configured");
	} else if (!deps.isSecure && !deps.allowInsecureAuth) {
		// Unreachable today (the top-of-function gate already threw in this
		// case) — kept as a documented invariant rather than silently assuming
		// it forever, in case that gate's scope ever narrows.
		exclusions.push("LOGIN: requires a secure transport (allowInsecureAuth not set)");
	} else {
		const cmd = new LoginCommand(auth.user, auth.pass);
		const epochBefore = deps.capabilities.epoch;
		await deps.run(cmd);
		if (deps.capabilities.epoch === epochBefore) {
			await deps.refreshCapabilities();
		}
		return;
	}

	throw new AuthError(
		`No viable authentication mechanism (tried: ${mechanismsTried.join(", ")}); ` +
			`excluded: ${exclusions.join("; ")}`,
		{ mechanismsTried, code: null },
	);
}
