import type { CatalogModule } from "../types";

const rfc4314: CatalogModule = {
	source: "RFC4314",
	extractionNote:
		"RFC 4314 (IMAP ACL extension; revises RFC 2086) reviewed in full: §1 " +
		"Introduction/Overview, §1.1 Conventions, §2 Access Control, §2.1 Standard Rights, " +
		"§2.1.1 Obsolete Rights (virtual 'd'/'c'), §2.2 Rights Defined in RFC 2086, §3 Access " +
		"control management commands and responses (§3.1 SETACL, §3.2 DELETEACL, §3.3 GETACL, " +
		"§3.4 LISTRIGHTS, §3.5 MYRIGHTS, §3.6 ACL response, §3.7 LISTRIGHTS response, §3.8 " +
		"MYRIGHTS response), §4 Rights Required to Perform Different IMAP4rev1 Commands, §5 " +
		"Extended examples, §6 Security Considerations, §7 Formal Syntax, §8 IANA " +
		"Considerations, §9 References, §10 Acknowledgments/Change history. " +
		"CLIENT/SERVER SPLIT (the crux for ACL — RFC 4314 is overwhelmingly server-directed): " +
		"7 client-binding entries extracted. RFC 4314 defines five client commands (SETACL, " +
		"DELETEACL, GETACL, LISTRIGHTS, MYRIGHTS) and three untagged responses (ACL, LISTRIGHTS, " +
		"MYRIGHTS), but nearly every normative MUST/SHOULD in the document binds the SERVER's " +
		"rights-enforcement, ACL-storage, and response-generation behavior, not the client. The " +
		"client-binding surface reduces to: (a) the rights-string composition the client must " +
		"emit — the virtual/compound 'd' and 'c' rights the client must understand it is " +
		"requesting the union of member rights when it sends them (§2.1.1); (b) the SETACL third-" +
		"argument syntax the client must form correctly — optional +/- prefix then rights chars " +
		"(§3.1); (c) the ONE explicit client-directed MUST in the whole document: clients MUST " +
		"ignore the virtual 'd'/'c' rights in MYRIGHTS/ACL/LISTRIGHTS responses (§2.1.1 footnote " +
		"'(*)'); (d) the client-directed SHOULD to warn before granting broad rights to 'anyone' " +
		"(§6). SKIPPED AS SERVER-ONLY (flagged per extractor rule 6 — all are rights-enforcement, " +
		"storage, or response-generation duties bound to the server, observable by a client only " +
		"through the server's own behavior, not a duty the client discharges): §2 'a server " +
		"implementation conformant to this document MUST also return rights ... in the RIGHTS= " +
		"capability' (server capability advertisement); §2 'If rights are tied ... the " +
		"implementation must be conservative in granting rights in response to SETACL commands' " +
		"(server ACL-storage policy); §2.1.1 'the server MUST also include the d right when " +
		"returning the list in a MYRIGHTS or ACL response' and the parallel 'c' MUST, and both " +
		"'the server MUST include the d/c right in the corresponding LISTRIGHTS response' MUSTs " +
		"(server response-generation, the mirror image of the client's §2.1.1-3 ignore duty); §2.2 " +
		"'The RIGHTS= capability MUST NOT include any of the rights defined in RFC 2086' (server " +
		"capability construction); §3 'the server SHOULD first prepare the received identifier " +
		"using SASLprep' and 'the server MUST refuse to perform the command with a BAD response' " +
		"on prep failure (server identifier-canonicalization + command processing); §3.1 'an " +
		"unrecognized right MUST cause the command to return the BAD response' / 'the server MUST " +
		"NOT silently ignore unrecognized rights' (server SETACL validation); §3.3/§3.4 'An ACL/" +
		"LISTRIGHTS response ... MAY include a canonicalized form of the identifier' (server " +
		"response-generation option); §3.4 'A LISTRIGHTS response ... MUST always return the same " +
		"form of an identifier as specified by the client' (server response-generation); §3.7 'The " +
		"server MUST either grant all tied rights to the identifier in the mailbox or grant none' " +
		"and 'The same right MUST NOT be listed more than once in the LISTRIGHTS command' (this " +
		"latter reads 'command' but describes the server-generated LISTRIGHTS RESPONSE's tied-" +
		"rights strings per the surrounding §3.7 prose — server response-generation either way; no " +
		"client emits a LISTRIGHTS with a rights list); all of §4 (the entire rights-required-per-" +
		"command table and its ~30 per-command 'MUST'/'SHOULD'/'MUST NOT' enforcement rules, e.g. " +
		"'an ACL-compliant server MUST check which rights are required', 'the server MUST NOT " +
		"return a NO response if it can't list a mailbox', 'the server MUST NOT reveal ... " +
		"existence', CREATE-inherits-ACL SHOULD) — this is pure server-side authorization " +
		"enforcement, the bulk of the RFC; §5 examples (illustrative, no norms); §6 'An " +
		"implementation MUST make sure the ACL commands themselves do not give information about " +
		"mailboxes with appropriately restricted ACLs' and 'an ACL server MAY reject identifiers " +
		"containing [PR29] sequences' (server security duties); §7 'Implementations MUST accept " +
		"[uppercase/lowercase] ... case insensitive' ABNF meta-note (binds all parsers per RFC " +
		"5234 convention, shared boilerplate, no distinct client duty beyond case-insensitive atom " +
		"matching already required by RFC 3501/9051). Server non-requirement notes ('Server " +
		"implementations are not required to support negative right identifiers'; servers 'not " +
		"required to check presence of the r right once a mailbox is selected') impose no client " +
		"duty. The negative-right ('-identifier') mechanics (§2) describe ACL semantics the SERVER " +
		"computes; a client emitting '-fred' as a SETACL identifier is just the identifier-argument " +
		"syntax, carried implicitly by the SETACL command form, and the removal semantics are " +
		"server-side — no separate client entry. " +
		"REV2-CORE ADJUDICATION: ACL is NOT folded into IMAP4rev2 core — it remains a standalone " +
		"extension in RFC 9051 (confirmed by scanning catalog/rfc9051/*: no SETACL/DELETEACL/" +
		"GETACL/LISTRIGHTS/MYRIGHTS/ACL-response entries exist there). Therefore no RFC 9051 core " +
		"entry is identical to any entry here, and every entry keeps the standalone-extension " +
		"default profiles ['rev1','rev2'] — a rev2 client that uses ACL is bound by these duties " +
		"solely through RFC 4314. No rev1-only tag applies. " +
		"Total: 7 client-binding entries (RFC4314-2.1.1-1..3, RFC4314-3.1-1..2, RFC4314-2-1, " +
		"RFC4314-6-1). Untestable: 4 (RFC4314-2.1.1-1, RFC4314-2.1.1-2 — internal-decision, the " +
		"client's intent in composing a rights string is wire-indistinguishable from an equivalent " +
		"expanded string; RFC4314-2-1 — internal-decision, a well-formed lowercase rights string " +
		"is indistinguishable from one produced by a client that reasons about the reserved-letter " +
		"rules; RFC4314-6-1 — ui-presentation, the warning is a user-facing dialog with no wire " +
		"footprint). All entries applicability 'conditional' (bind only when the client uses ACL).",
	requirements: [
		// ── §2 Access Control (rights-string composition the client emits) ───────

		{
			id: "RFC4314-2-1",
			source: "RFC4314",
			section: "2",
			title: "Client rights strings use only lowercase standard / digit rights (no uppercase)",
			text:
				"Rights is a string listing a (possibly empty) set of alphanumeric characters, each " +
				"character listing a set of operations that is being controlled. Lowercase letters " +
				"are reserved for \"standard\" rights, listed in Section 2.1. (Note that for " +
				"compatibility with deployed clients and servers uppercase rights are not allowed.)",
			level: "MUST NOT",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"The document forbids uppercase rights letters ('uppercase rights are not allowed') " +
				"and reserves lowercase for standard rights and digits for implementation-defined " +
				"rights. Whether a client 'understands' this reservation scheme is an internal fact " +
				"about how it constructs a rights string; on the wire, a compliant client simply " +
				"emits a lowercase/digit rights atom, which is byte-for-byte identical to what any " +
				"other conformant client would emit. There is no black-box stimulus that " +
				"distinguishes a client reasoning about the reserved-letter rules from one that " +
				"hard-codes a valid string — a client that emitted an uppercase right would be " +
				"rejected by the SERVER (§3.1 'Uppercase rights are not allowed'), and that rejection " +
				"tests the server, not the client's internal composition logic. Judgment call: the " +
				"'uppercase rights are not allowed' clause is parenthetical prose, not an RFC 2119 " +
				"keyword sentence, but it states an absolute prohibition on the rights-string form a " +
				"client may emit, so it is recorded at MUST NOT level with this note.",
			notes:
				"Judgment level (no RFC 2119 keyword in the source sentence; 'are not allowed' is an " +
				"absolute prohibition read as MUST NOT). Client-binding only insofar as it constrains " +
				"the rights string the client emits in SETACL; the enforcement of the prohibition is " +
				"the SERVER's (§3.1 returns BAD for uppercase). ACL is standalone in rev2 (not folded " +
				"into RFC 9051 core), so profiles ['rev1','rev2']; see extractionNote rev2-core " +
				"adjudication. Conditional on the client using ACL at all.",
		},

		// ── §2.1.1 Obsolete Rights — virtual 'd' and 'c' the client must understand ─

		{
			id: "RFC4314-2.1.1-1",
			source: "RFC4314",
			section: "2.1.1",
			title: "Client 'd' virtual right means the union of all 'delete' member rights",
			text:
				"If a client includes the \"d\" right in a rights list, then it MUST be treated as if " +
				"the client had included every member of the \"delete\" right. (It is not an error for " +
				"a client to specify both the \"d\" right and one or more members of the \"delete\" " +
				"right, but the effect is no different than if just the \"d\" right or all members of " +
				"the \"delete\" right had been specified.)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"This defines the meaning a client attaches to the compound/virtual 'd' right when " +
				"it composes a rights list: 'd' is shorthand for the union of the 'delete' member " +
				"rights (a legacy RFC 2086 compatibility right; the exact membership — 'e','t' or " +
				"'e','t','x' — is server-defined per §2.1.1). Whether a client 'treats d as' the " +
				"member union is a fact about its internal rights model, not something observable on " +
				"the wire: the client either emits the literal string 'd' (equivalent to the union) " +
				"or emits the expanded member letters — both are legal SETACL rights arguments, and " +
				"the RFC explicitly says specifying both 'd' and members together 'is no different' " +
				"in effect. No black-box test can distinguish a client that models 'd' as the union " +
				"from one that treats it opaquely, because the two produce indistinguishable (indeed " +
				"the RFC declares equivalent) wire forms, and any divergence surfaces only in the " +
				"SERVER's resulting ACL, not in the client's request.",
			notes:
				"Client-binding rights-string composition semantics (the 'd'/'c' virtual rights are " +
				"the compound rights the client must understand it is requesting). The 'delete' " +
				"member set is server-defined (union of 'e','t' or 'e','t','x' per the RFC 2086 " +
				"implementation split described earlier in §2.1.1). Distinct from the paired SERVER " +
				"duty ('the server MUST also include the d right when returning the list in a MYRIGHTS " +
				"or ACL response'), which is skipped as server-only — see extractionNote. ACL is " +
				"standalone in rev2, so profiles ['rev1','rev2']. Conditional on the client using ACL.",
		},
		{
			id: "RFC4314-2.1.1-2",
			source: "RFC4314",
			section: "2.1.1",
			title: "Client 'c' virtual right means the union of all 'create' member rights",
			text:
				"If a client includes the \"c\" right in a rights list, then it MUST be treated as if " +
				"the client had included every member of the \"create\" right. (It is not an error for " +
				"a client to specify both the \"c\" right and one or more members of the \"create\" " +
				"right, but the effect is no different than if just the \"c\" right or all members of " +
				"the \"create\" right had been specified.)",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "internal-decision",
			untestableRationale:
				"Parallel to the 'd' virtual right (RFC4314-2.1.1-1): 'c' is the client-side " +
				"shorthand for the union of the 'create' member rights (server-defined as either the " +
				"'k' right alone, or the union of 'k' and 'x', per the RFC 2086 implementation split " +
				"in §2.1.1). As with 'd', whether a client treats 'c' as the member union is internal " +
				"to its rights model and produces no distinguishing wire form: emitting 'c' or the " +
				"expanded members, or both together, are declared equivalent by the RFC. No black-box " +
				"stimulus separates a client that expands 'c' from one that passes it through opaque, " +
				"since the resulting SETACL rights argument is legal in every case and the effect " +
				"materializes only in the server's stored ACL.",
			notes:
				"Second half of the client-facing 'd'/'c' virtual-right pair (the parenthetical " +
				"quote here is the 'c'-specific one; the closing paragraph is verbatim-parallel to " +
				"the 'd' text). 'create' member set is server-defined (either 'k', or 'k'+'x'). The " +
				"paired SERVER MUST ('the server MUST also include the c right when returning the " +
				"list in a MYRIGHTS or ACL response') is skipped as server-only. ACL is standalone in " +
				"rev2, so profiles ['rev1','rev2']. Conditional on the client using ACL.",
		},
		{
			id: "RFC4314-2.1.1-3",
			source: "RFC4314",
			section: "2.1.1",
			title: "Client MUST ignore virtual 'd'/'c' rights in MYRIGHTS/ACL/LISTRIGHTS responses",
			text:
				"Clients conforming to this document MUST ignore the virtual \"d\" and \"c\" rights in " +
				"MYRIGHTS, ACL, and LISTRIGHTS responses.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The single explicit client-directed MUST in RFC 4314 (the '(*)' footnote at the end " +
				"of §2.1.1, referenced by the four server-side 'd'/'c' response-inclusion MUSTs). A " +
				"conformant server returns 'd'/'c' alongside their member rights purely for RFC 2086 " +
				"backward compatibility; a modern client must NOT double-count them — it must ignore " +
				"'d'/'c' in received MYRIGHTS, ACL, and LISTRIGHTS responses and rely on the member " +
				"rights ('e','t','x','k') instead. Testable black-box: script a MYRIGHTS/ACL/" +
				"LISTRIGHTS response containing 'd'/'c' plus their members and assert the client's " +
				"parsed rights model does not treat 'd'/'c' as additional distinct rights. Currently " +
				"self-actualizing: the driver's myrights()/getacl()/listrights() verbs throw " +
				"NotImplementedError, so the client has no ACL-response-parsing surface at all — the " +
				"compliance suite records this as a failure for this entry (the client cannot " +
				"demonstrate the required ignore behavior). ACL is standalone in rev2, so profiles " +
				"['rev1','rev2']. Conditional on the client using ACL.",
		},

		// ── §3.1 SETACL Command (client command form / rights-modification syntax) ─

		{
			id: "RFC4314-3.1-1",
			source: "RFC4314",
			section: "3.1",
			title: "Client SETACL rights argument: optional +/- prefix then rights characters",
			text:
				"The third argument is a string containing an optional plus (\"+\") or minus (\"-\") " +
				"prefix, followed by zero or more rights characters. If the string starts with a " +
				"plus, the following rights are added to any existing rights for the identifier. If " +
				"the string starts with a minus, the following rights are removed from any existing " +
				"rights for the identifier. If the string does not start with a plus or minus, the " +
				"rights replace any existing rights for the identifier.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"Judgment level (descriptive prose defining the SETACL third-argument grammar, no RFC " +
				"2119 keyword; recorded as MUST because it fixes the command form the client must emit " +
				"to achieve add/remove/replace semantics — a client that emits the wrong prefix " +
				"changes the operation). Client-binding: this is the rights-modification syntax the " +
				"client constructs. Testable black-box: assert the client's setacl() emits '+rights' " +
				"for add, '-rights' for remove, and bare 'rights' for replace. Currently self-" +
				"actualizing: driver.setacl() throws NotImplementedError, so the client has no SETACL " +
				"surface — recorded as a failure for this entry. ACL is standalone in rev2, so " +
				"profiles ['rev1','rev2']. Conditional on the client using ACL.",
		},
		{
			id: "RFC4314-3.1-2",
			source: "RFC4314",
			section: "3.1",
			title: "Client MUST NOT emit uppercase or unsupported rights in SETACL",
			text:
				"Note that an unrecognized right MUST cause the command to return the BAD response. In " +
				"particular, the server MUST NOT silently ignore unrecognized rights.",
			level: "MUST",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "testable",
			notes:
				"The quoted sentence is literally a SERVER duty (the server MUST return BAD / MUST NOT " +
				"silently ignore an unrecognized right), and as such the server-enforcement half is " +
				"skipped. The CLIENT-binding corollary recorded here (judgment/implicit MUST, derived " +
				"from this rule together with §3.1's examples A035/A036 where 'lrQswicda' and " +
				"'lrqswicda' each draw a BAD): a conformant client must only emit rights it has reason " +
				"to believe the server supports — in particular the lowercase standard rights " +
				"(RFC 2119-echoed by §2's 'uppercase rights are not allowed', RFC4314-2-1) and any " +
				"rights the server advertised via RIGHTS= — because any unrecognized right will fail " +
				"the whole SETACL with BAD. Testable black-box: assert setacl() does not upcase or " +
				"inject non-advertised rights into the emitted rights argument. Currently self-" +
				"actualizing: driver.setacl() throws NotImplementedError, so recorded as a failure " +
				"for this entry. ACL is standalone in rev2, so profiles ['rev1','rev2']. Conditional " +
				"on the client using ACL. NOTE: this entry is retained deliberately as the client-" +
				"side reflection of the server BAD rule; the server's own MUST/MUST NOT enforcement " +
				"is the skipped half (see extractionNote).",
		},

		// ── §6 Security Considerations (client-directed SHOULD) ──────────────────

		{
			id: "RFC4314-6-1",
			source: "RFC4314",
			section: "6",
			title: "Client SHOULD warn before granting broad rights to identifier 'anyone'",
			text:
				"IMAP clients implementing ACL that are able to modify ACLs SHOULD warn a user that " +
				"wants to give full access (or even just the \"a\" right) to the special identifier " +
				"\"anyone\".",
			level: "SHOULD",
			applicability: "conditional",
			profiles: ["rev1", "rev2"],
			testability: "untestable",
			untestableTheme: "ui-presentation",
			untestableRationale:
				"The warning is a user-facing presentation act — the client SHOULD surface a caution " +
				"to the user before it emits a SETACL granting full access (or the administer 'a' " +
				"right) to the universal 'anyone' identity. Whether such a warning is shown is a " +
				"property of the client's user interface, not of any IMAP wire exchange: the SETACL " +
				"command that eventually goes out (if the user proceeds) is byte-identical whether or " +
				"not a warning was displayed first. A black-box IMAP-protocol harness observes only " +
				"the wire and cannot detect the presence, absence, or content of a UI warning dialog.",
			notes:
				"One of only two client-directed normative keywords in RFC 4314 (this SHOULD and the " +
				"§2.1.1 ignore-d/c MUST). Explicitly scoped to 'IMAP clients implementing ACL that " +
				"are able to modify ACLs' — i.e. conditional on the client offering ACL-editing. ACL " +
				"is standalone in rev2, so profiles ['rev1','rev2'].",
		},
	],
};

export default rfc4314;
