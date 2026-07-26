import { ProtocolError } from "../errors";
import { CapabilityList, CapabilityTextCode } from "../parser";
import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/**
 * CAPABILITY (RFC 3501/9051 §6.1.1). No arguments; claims the untagged
 * CAPABILITY response (default `claims()` — verb "CAPABILITY" claims type
 * "CAPABILITY") as well as a `[CAPABILITY ...]` code the server may instead
 * (or additionally) attach to its own tagged OK.
 */
export class CapabilityCommand extends Command<CapabilityList> {
	readonly verb = "CAPABILITY";
	readonly queueMode = "pipeline" as const;

	protected write(_w: CommandWriter): void {
		// No arguments.
	}

	protected accept(c: ResponseCollector): CapabilityList {
		const untagged = c.first("CAPABILITY");
		if (untagged && untagged.content instanceof CapabilityList) {
			return untagged.content;
		}

		// A server MAY instead (or additionally) report capabilities via a
		// `[CAPABILITY ...]` code on the tagged OK — technically valid, so
		// check it before giving up.
		const code = c.tagged().status.text?.code;
		if (code instanceof CapabilityTextCode) {
			return code.capabilities;
		}

		throw new ProtocolError(
			"CAPABILITY completed OK without any capability data",
			{ context: "CapabilityCommand" },
		);
	}
}
