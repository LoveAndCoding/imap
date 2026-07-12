import { Command } from "./base";
import type { ResponseCollector } from "./collector";
import type { CommandWriter } from "./writer";

/** NOOP (RFC 3501/9051 §6.1.2). No arguments, no meaningful result — mostly
 *  useful as a keepalive/"flush pending untagged data" no-op. */
export class NoopCommand extends Command<null> {
	readonly verb = "NOOP";
	readonly queueMode = "pipeline" as const;

	protected write(_w: CommandWriter): void {
		// No arguments.
	}

	protected accept(_c: ResponseCollector): null {
		return null;
	}
}
