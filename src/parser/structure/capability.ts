// Capability Objects
//
// From the spec:
// capability-data = "CAPABILITY" *(SP capability) SP "IMAP4rev1"
//                   *(SP capability)
//                   ; Servers MUST implement the STARTTLS, AUTH=PLAIN,
//                   ; and LOGINDISABLED capabilities
//                   ; Servers which offer RFC 1730 compatibility MUST
//                   ; list "IMAP4" as the first capability.
// capability      = ("AUTH=" auth-type) / atom
//                   ; New capabilities MUST begin with "X" or be
//                   ; registered with IANA as standard or
//                   ; standards-track
import { ParsingError } from "../../errors";
import { LexerTokenList, TokenTypes } from "../../lexer/types";
import { ciCanonicalize, ciEquals } from "../../lexer/case-insensitive";
import { getOriginalInput, splitSpaceSeparatedList } from "../utility";

/**
 * A single parsed `capability` atom from a CAPABILITY response
 * (RFC 3501/9051 §7.2.1: `capability = ("AUTH=" auth-type) / atom`). Every
 * concrete capability class below (`StandardCapability`, `KindValueCapability`,
 * `ExtensionCapability`, `UnknownCapability`) implements this shape; which one
 * is produced for a given wire string is decided by `CapabilityList#add`.
 */
export interface ICapability {
	/** The capability's name (for a `kind=value` pair such as `AUTH=PLAIN`,
	 *  just the `kind` part, e.g. `"AUTH"`; for a bare atom, the same as
	 *  `fullValue`). */
	readonly kind: string;
	/** The capability's value (for a `kind=value` pair such as `AUTH=PLAIN`,
	 *  just the `value` part, e.g. `"PLAIN"`; for a bare atom, the same as
	 *  `fullValue`). */
	readonly value: string;
	/** The complete, unsplit capability string exactly as reported by the
	 *  server (e.g. `"AUTH=PLAIN"` or `"IDLE"`). */
	readonly fullValue: string;
	/** `true` if this capability's name begins with `"X"`, marking it as a
	 *  non-standard/experimental extension per RFC3501/9051 §7.2.1 ("New
	 *  capabilities MUST begin with 'X' or be registered with IANA"). */
	readonly isExtension: boolean;
	/** `true` if this capability name is not one this library recognizes
	 *  (neither a standard IANA-registered name nor an `X`-prefixed
	 *  extension). Omitted/`undefined` on capability kinds that are always
	 *  known by construction (e.g. `StandardCapability`). */
	readonly isUnknown?: boolean;
}

const kindValueStandardCapabilityNames = [
	"AUTH",
	"CONTEXT",
	"I18NLEVEL",
	"IMAPSIEVE",
	"RIGHTS",
	"SEARCH",
	"SORT",
	"STATUS",
	"URLAUTH",
	"UTF8",
] as const;
type KindValueStandardCapabilityNames = typeof kindValueStandardCapabilityNames[number];

function isKindValueStandardCapability(
	capability: string,
): capability is KindValueStandardCapabilityNames {
	return kindValueStandardCapabilityNames.includes(
		capability as KindValueStandardCapabilityNames,
	);
}

// From: https://www.iana.org/assignments/imap-capabilities/imap-capabilities.xhtml
const standardCapabilityNames = [
	"ACL",
	"ANNOTATE-EXPERIMENT-1",
	"APPENDLIMIT",
	"AUTH=",
	"BINARY",
	"CATENATE",
	"CHILDREN",
	"COMPRESS=DEFLATE",
	"CONDSTORE",
	"CONTEXT=SEARCH",
	"CONTEXT=SORT",
	"CONVERT",
	"CREATE-SPECIAL-USE",
	"ENABLE",
	"ESEARCH",
	"ESORT",
	"FILTERS",
	"I18NLEVEL=1",
	"I18NLEVEL=2",
	"ID",
	"IDLE",
	"IMAPSIEVE=",
	"LANGUAGE",
	"LIST-EXTENDED",
	"LIST-MYRIGHTS",
	"LIST-STATUS",
	"LITERAL+",
	"LITERAL-",
	"LOGIN-REFERRALS",
	"LOGINDISABLED",
	"MAILBOX-REFERRALS",
	"METADATA",
	"METADATA-SERVER",
	"MOVE",
	"MULTIAPPEND",
	"MULTISEARCH",
	"NAMESPACE",
	"NOTIFY",
	"OBJECTID",
	"PREVIEW",
	"QRESYNC",
	"QUOTA",
	"REPLACE",
	"RIGHTS=",
	"SASL-IR",
	"SAVEDATE",
	"SEARCH=FUZZY",
	"SEARCHRES",
	"SORT",
	"SORT=DISPLAY",
	"SPECIAL-USE",
	"STARTTLS",
	"STATUS=SIZE",
	"THREAD",
	"UIDPLUS",
	"UNAUTHENTICATE",
	"UNSELECT",
	"URL-PARTIAL",
	"URLAUTH",
	"URLAUTH=BINARY",
	"UTF8=ACCEPT",
	"UTF8=ALL",
	"UTF8=APPEND",
	"UTF8=ONLY",
	"UTF8=USER",
	"WITHIN",
] as const;
type StandardCapabilityNames = typeof standardCapabilityNames[number];

function isStandardCapability(
	capability: string,
): capability is StandardCapabilityNames {
	return standardCapabilityNames.includes(
		capability as StandardCapabilityNames,
	);
}

/**
 * A capability atom that carries no `kind=value` structure and is a
 * recognized IANA-registered/standard name (one of `standardCapabilityNames`
 * below, e.g. `"IDLE"`, `"STARTTLS"`, `"UIDPLUS"`). `kind`, `value`, and
 * `fullValue` are all identical here since there's nothing to split.
 */
export class StandardCapability implements ICapability {
	/** Same as {@link fullValue} — a bare standard capability has no
	 *  separate kind/value split. */
	public readonly kind: string;
	/** Same as {@link fullValue} — a bare standard capability has no
	 *  separate kind/value split. */
	public readonly value: string;
	/** Always `false`: a recognized standard capability is never treated as
	 *  an `X`-prefixed extension. */
	public readonly isExtension: boolean = false;

	constructor(
		/** The complete capability string exactly as reported by the
		 *  server. */
		public readonly fullValue: StandardCapabilityNames,
	) {
		// Kind === Value === Full Value here
		this.kind = fullValue;
		this.value = fullValue;
	}
}

/**
 * A capability atom of the recognized `"KIND=VALUE"` shape whose `KIND` is
 * one of `kindValueStandardCapabilityNames` (e.g. `AUTH=PLAIN`,
 * `SORT=DISPLAY`) — as opposed to `KindValueCapability` instances whose kind
 * isn't recognized, which are still represented by this same class but with
 * `isUnknown` set to `true` (unlike `StandardCapability`/`UnknownCapability`,
 * there's no separate "unknown kind/value" class).
 */
export class KindValueCapability implements ICapability {
	/** The part of the capability name before the `"="`, in the server's
	 *  original casing (e.g. `"AUTH"` for `AUTH=PLAIN`). */
	public readonly kind: string;
	/** The part of the capability name after the `"="` (e.g. `"PLAIN"` for
	 *  `AUTH=PLAIN`). */
	public readonly value: string;
	/** `true` if {@link kind}, case-insensitively, begins with `"X"`. */
	public readonly isExtension: boolean;
	/** `true` if this capability is not recognized as standard -- neither by
	 *  {@link kind} (case-insensitively) being one of the "many valid
	 *  values" kind=value families (`kindValueStandardCapabilityNames`, e.g.
	 *  `AUTH=`, `CONTEXT=`) NOR by the complete `"KIND=VALUE"` string
	 *  (case-insensitively) being one of the one-off, single-registered-value
	 *  standard capabilities in `standardCapabilityNames` (e.g.
	 *  `COMPRESS=DEFLATE`, which RFC 4978 registers as that exact pair, not
	 *  as a `COMPRESS=` family with many valid values). */
	public readonly isUnknown: boolean;

	constructor(
		/** The complete `"KIND=VALUE"` capability string exactly as reported
		 *  by the server; split into {@link kind}/{@link value} below.
		 *  Throws a `ParsingError` if the string doesn't actually contain a
		 *  `"="` with a non-empty value on both sides. */
		public readonly fullValue: string,
	) {
		const [kind, ...rest] = fullValue.split("=");
		const value = rest.join("=");

		if (kind === fullValue || value === "") {
			// We don't have a value in this, so we aren't a kind/value pair
			throw new ParsingError(
				"Capability could not be split into kind/value pair",
				fullValue,
			);
		}

		// Classification (isExtension/isUnknown) must be case-insensitive
		// per RFC3501-9-2/RFC9051-9-2 (capability atoms are keywords), so we
		// canonicalize before comparing/looking up -- while `kind` itself
		// keeps the server's original casing for display.
		const canonicalKind = ciCanonicalize(kind);

		// M26 fix: a KIND=VALUE capability is standard if EITHER its kind is
		// one of the recognized "many valid values" families
		// (`kindValueStandardCapabilityNames`, e.g. any `AUTH=<mechanism>`)
		// OR its complete "KIND=VALUE" string is itself one of the
		// registered one-off standard capabilities in `standardCapabilityNames`
		// (e.g. `COMPRESS=DEFLATE` -- RFC 4978 registers that exact pair, not
		// a `COMPRESS=` family, so it was never going to match on kind
		// alone). Without the second check, `CapabilityList.add()`'s
		// `includes("=")` branch sends every kind=value capability straight
		// here, so those `standardCapabilityNames` entries were dead code
		// and a widely-deployed extension like COMPRESS=DEFLATE reported
		// `isUnknown: true`.
		this.isExtension = canonicalKind.startsWith("X");
		this.isUnknown = !(
			isKindValueStandardCapability(canonicalKind) ||
			isStandardCapability(ciCanonicalize(fullValue))
		);

		this.kind = kind;
		this.value = value;
	}
}

/**
 * A capability atom with no `kind=value` structure whose name begins with
 * `"X"` (case-insensitively) — a non-standard/experimental extension per
 * RFC3501/9051 §7.2.1. `kind`, `value`, and `fullValue` are all identical
 * here since there's nothing to split.
 */
export class ExtensionCapability implements ICapability {
	/** Same as {@link fullValue} — an extension atom has no separate
	 *  kind/value split. */
	public readonly kind: string;
	/** Same as {@link fullValue} — an extension atom has no separate
	 *  kind/value split. */
	public readonly value: string;
	/** Always `true`: this class only ever represents `X`-prefixed
	 *  extension capabilities. */
	public readonly isExtension: boolean = true;

	constructor(
		/** The complete capability string exactly as reported by the
		 *  server. */
		public readonly fullValue: string,
	) {
		this.kind = fullValue;
		this.value = fullValue;
	}
}

// From the spec:
//   Client implementations SHOULD NOT require any capability name
//   other than "IMAP4rev1", and MUST ignore any unknown capability
//   names.
//
// To be spec compliant we shouldn't really implement this. But to be
// an actual library that exists in the real world, we kind need to.
// So we have a type for capabilities we get that we don't understand.
//
// This will likely be mostly for debugging or understanding servers
// that are not IMAP4rev1 compliant. So we are kind-of ignoring them.
/**
 * A capability atom with no `kind=value` structure that is neither a
 * recognized standard name nor `X`-prefixed — a capability this library
 * doesn't understand, tolerated per RFC3501/9051 §7.2.1's "MUST ignore any
 * unknown capability names" but still surfaced here (mainly useful for
 * debugging/inspecting non-compliant servers; see the comment above this
 * class). `kind`, `value`, and `fullValue` are all identical since there's
 * nothing to split.
 */
export class UnknownCapability implements ICapability {
	/** Same as {@link fullValue} — an unrecognized bare atom has no separate
	 *  kind/value split. */
	public readonly kind: string;
	/** Same as {@link fullValue} — an unrecognized bare atom has no separate
	 *  kind/value split. */
	public readonly value: string;
	/** Always `false`: an unrecognized bare atom is never treated as an
	 *  `X`-prefixed extension. */
	public readonly isExtension: boolean = false;
	/** Always `true`: this class only ever represents capability names this
	 *  library doesn't recognize. */
	public readonly isUnknown: boolean = true;

	constructor(
		/** The complete capability string exactly as reported by the
		 *  server. */
		public readonly fullValue: string,
	) {
		this.kind = fullValue;
		this.value = fullValue;
	}
}

/**
 * The CAPABILITY response (RFC3501/9051 §7.2.1: the untagged
 * `"* CAPABILITY" *(SP capability)` reply to the CAPABILITY command, also
 * reused — via the `false`/unparenthesized constructor form — for the
 * bracketed `[CAPABILITY ...]` resp-text-code payload, see
 * `CapabilityTextCode` in `text.code.ts`). Deduplicates capability atoms
 * (case-insensitively) and classifies each one into a `StandardCapability`,
 * `KindValueCapability`, `ExtensionCapability`, or `UnknownCapability`.
 */
export class CapabilityList {
	/** Deduplicated capabilities, keyed by their case-insensitively
	 *  canonicalized string form; insertion order follows the order the
	 *  server reported them in. */
	protected capabilityMap: Map<string, ICapability>;

	/** Matches an untagged `"CAPABILITY" *(SP capability)"` line and, on
	 *  success, parses and returns a {@link CapabilityList}; `null` if
	 *  `tokens` doesn't start with the `CAPABILITY` keyword. */
	public static match(tokens: LexerTokenList) {
		const firstToken = tokens[0];
		if (
			firstToken &&
			firstToken.isType(TokenTypes.atom) &&
			ciEquals(firstToken.getTrueValue(), "CAPABILITY")
		) {
			return new CapabilityList(tokens.slice(1), false);
		}

		return null;
	}

	constructor(tokens: LexerTokenList, isWrappedInParens = true) {
		this.capabilityMap = new Map();

		const blocks = splitSpaceSeparatedList(
			tokens,
			isWrappedInParens ? "(" : null,
			isWrappedInParens ? ")" : null,
		);
		blocks.map((block) => {
			this.add(getOriginalInput(block));
		});
	}

	/** All capabilities the server reported, deduplicated (case-insensitively)
	 *  and in the order the server sent them. */
	public get capabilities(): ICapability[] {
		return Array.from(this.capabilityMap.values());
	}

	/** The `AUTH=` mechanism names the server advertised (e.g. `["PLAIN",
	 *  "XOAUTH2"]`), derived from every `KindValueCapability` whose `kind` is
	 *  `AUTH` (case-insensitively). */
	public get supportedAuthSchemes(): string[] {
		const authCaps: KindValueCapability[] = this.capabilities.filter(
			(cap): cap is KindValueCapability =>
				cap instanceof KindValueCapability && ciEquals(cap.kind, "AUTH"),
		);
		return authCaps.map((cap) => cap.value);
	}

	protected add(capabilityStr: string) {
		// Normalize the string for storage purposes
		const normalCapStr = ciCanonicalize(capabilityStr);

		if (!this.capabilityMap.has(normalCapStr)) {
			let cap;
			// Classification below must be based on the canonicalized form
			// (normalCapStr): capability atoms are case-insensitive keywords
			// per RFC3501-9-2/RFC9051-9-2, so e.g. "starttls", "auth=plain",
			// and "x-mycap" must classify the same as their uppercase
			// spellings. The original-case `capabilityStr` is still what
			// gets stored/displayed on the resulting capability object.
			if (normalCapStr.includes("=")) {
				cap = new KindValueCapability(capabilityStr);
			} else if (normalCapStr.startsWith("X")) {
				cap = new ExtensionCapability(capabilityStr);
			} else if (isStandardCapability(normalCapStr)) {
				cap = new StandardCapability(capabilityStr as StandardCapabilityNames);
			} else {
				cap = new UnknownCapability(capabilityStr);
			}
			this.capabilityMap.set(normalCapStr, cap);
		}

		return this.capabilityMap.get(normalCapStr);
	}

	/** Whether the server reported `capability` (matched case-insensitively
	 *  against the full capability string, e.g. `"IDLE"` or `"AUTH=PLAIN"`). */
	public has(capability: string) {
		return this.capabilityMap.has(ciCanonicalize(capability));
	}

	// Some sugar
	/** The negation of {@link has} — whether the server did NOT report
	 *  `capability`. */
	public doesntHave(capability: string) {
		return !this.has(capability);
	}
}
