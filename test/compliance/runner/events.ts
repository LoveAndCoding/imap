import type { ComplianceDriver, ObservedEvent } from "../driver/driver";

export interface WaitForUntaggedOptions {
	/** How long to keep polling before rejecting. Default 1000ms. */
	timeoutMs?: number;
	/** Poll interval. Default 10ms. */
	intervalMs?: number;
}

/**
 * Polls `driver.events` until an "untaggedResponse" event whose parsed
 * `detail.type` matches `type` appears, and resolves with that event so
 * content assertions can chain on the parsed detail. Rejects after
 * `timeoutMs` with a message listing every event the driver DID surface.
 *
 * This replaces fixed post-close sleeps in specs: the client's event
 * pipeline flushes asynchronously after the server closes the socket, so
 * specs poll for the parsed event instead of guessing a delay.
 */
export async function waitForUntagged(
	driver: ComplianceDriver,
	type: string,
	opts: WaitForUntaggedOptions = {},
): Promise<ObservedEvent> {
	const timeoutMs = opts.timeoutMs ?? 1000;
	const intervalMs = opts.intervalMs ?? 10;
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = driver.events.find(
			(e) =>
				e.type === "untaggedResponse" &&
				(e.detail as { type?: string } | undefined)?.type === type,
		);
		if (found) return found;
		if (Date.now() >= deadline) {
			const seen = driver.events
				.map((e) =>
					e.type === "untaggedResponse"
						? `untaggedResponse(${
								(e.detail as { type?: string } | undefined)?.type ?? "?"
						  })`
						: e.type,
				)
				.join(", ");
			throw new Error(
				`Timed out after ${timeoutMs}ms waiting for an untaggedResponse ` +
					`event of type "${type}" — the client never surfaced the parsed ` +
					`response. Observed events: [${seen || "none"}]`,
			);
		}
		await new Promise<void>((r) => setTimeout(r, intervalMs));
	}
}
