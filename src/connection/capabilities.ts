import type { CapabilityList } from "../parser";

/**
 * Minimal precursor to the full spec §3.5 `CapabilityRegistry` (the eventual
 * live `CapabilityView` + epoch counter is a later milestone). For now this
 * holds nothing more than "the most recently known capability list, or
 * `null` when unknown/invalidated" — enough for `Connection` and `Session`
 * to share ONE piece of capability state instead of each keeping an ad-hoc
 * field, and enough for STARTTLS to invalidate it on handshake success
 * (I-2) without `Session` needing to know STARTTLS ran at all.
 */
export class CapabilityRegistry {
	private current: CapabilityList | null = null;

	/** The last-known capability list, or `null` if unknown/invalidated. */
	public get value(): CapabilityList | null {
		return this.current;
	}

	/** `true` once a capability list has been set and not since invalidated. */
	public get isValid(): boolean {
		return this.current !== null;
	}

	/** Records a freshly-obtained capability list as current. */
	public set(capabilities: CapabilityList): void {
		this.current = capabilities;
	}

	/**
	 * Drops the cached capability list. Per I-2, this MUST be called on
	 * STARTTLS handshake success (before anything else can consult
	 * capabilities) so that any pre-TLS-only capability data — a greeting
	 * `[CAPABILITY ...]` code or a pre-TLS CAPABILITY response — is never
	 * observable after the upgrade.
	 */
	public invalidate(): void {
		this.current = null;
	}
}
