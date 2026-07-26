import { NamespaceResponse } from "../parser";
import type {
	NamespaceDescriptor,
	NamespaceExtension,
	NamespaceSet,
} from "../protocol/mailbox";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * NAMESPACE (RFC 2342 §5; rev2 core per RFC 9051 §6.3.10) — M2.10, the
 * thinnest verb in the milestone: the structure parser
 * (src/parser/structure/namespace.ts) already parses the `* NAMESPACE`
 * response in full (including NIL classes — the pre-M2 real-signal
 * compliance pass RFC2342-5-4); this class is command plumbing plus the
 * mapping from the parser's internal shape to the public `NamespaceSet`.
 *
 * Capability gate: `NAMESPACE` (RFC 2342 §4: "IMAP4 servers that support
 * this extension MUST list the keyword NAMESPACE in their CAPABILITY
 * response") OR `IMAP4rev2` — RFC 9051 folds NAMESPACE into the rev2 core
 * command set (§6.3.10), so a rev2 server supports it without a separate
 * token. `Command.capability`'s array form is exactly this OR semantics;
 * enforcement (CapabilityError, zero bytes — I-9) happens in
 * `ImapClient.run()`/`ImapClient.namespaces()`.
 *
 * Mailbox-name codec duty (M2 shared design note): namespace PREFIXES are
 * mailbox-name-shaped and subject to the mUTF-7 rule. The decode is already
 * applied by the time this command sees the data — the parser's
 * `QuotedStringToken.getTrueValue()` runs every quoted string through the
 * mUTF-7 decoder (src/lexer/tokens/string.ts), and RFC 2342 §6's grammar
 * makes every prefix a string — so re-decoding here would DOUBLE-decode (a
 * decoded Unicode prefix containing a literal `&…-` run would be corrupted).
 * This is the same "decode once, at the layer that owns the raw bytes"
 * reasoning documented on `ImapClient.selectOrExamine()`.
 */
export class NamespaceCommand extends Command<NamespaceSet> {
	readonly verb = "NAMESPACE";
	// Ordinary data flow: no state change, and its single untagged response
	// type ("NAMESPACE") is unambiguous — "pipeline" per spec §6.1.
	readonly queueMode = "pipeline" as const;
	// RFC 2342 §4: "valid in the Authenticated and Selected states".
	readonly states = ["authenticated", "selected"] as const;
	readonly capability = ["NAMESPACE", "IMAP4rev2"];

	protected write(_w: CommandWriter): void {
		// No arguments (RFC 2342 §5: "Arguments: none").
	}

	// Default claims() suffices: verb "NAMESPACE" claims untagged type
	// "NAMESPACE" (the canonicalized first atom of the response line).

	protected accept(c: ResponseCollector): NamespaceSet {
		// Exactly one NAMESPACE line is conformant; last-wins is the same
		// defensive posture as SELECT/STATUS take for their own singletons.
		let resp: NamespaceResponse | undefined;
		for (const line of c.untagged("NAMESPACE")) {
			if (line.content instanceof NamespaceResponse) {
				resp = line.content;
			}
		}
		if (!resp) {
			// Tolerant fallback (spec §11.2 posture, same as EnableCommand):
			// a tagged OK without the untagged NAMESPACE line is
			// nonconformant, but "no namespaces reported" is a well-defined,
			// non-throwing answer.
			return { personal: [], other: [], shared: [] };
		}
		return {
			personal: toDescriptors(resp.personal),
			other: toDescriptors(resp.others),
			shared: toDescriptors(resp.shared),
		};
	}
}

/** Maps one parsed namespace class (or `null`, the wire NIL) onto the
 *  public descriptor array. NIL and "empty class" collapse to `[]` — see
 *  `NamespaceSet`'s doc comment for why that's deliberate. */
function toDescriptors(
	ns: NamespaceResponse["personal"],
): NamespaceDescriptor[] {
	if (!ns) {
		return [];
	}
	return ns.configurations.map((config): NamespaceDescriptor => {
		const extensions: NamespaceExtension[] = config.extensions.map(
			(ext): NamespaceExtension => ({
				name: ext.name,
				values: [...ext.values],
			}),
		);
		return {
			// Already mUTF-7-decoded by the token layer — see the class doc
			// comment; do NOT decode again.
			prefix: config.prefix,
			delimiter: config.delimeter,
			...(extensions.length ? { extensions } : {}),
		};
	});
}
