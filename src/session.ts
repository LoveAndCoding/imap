import {
	CapabilityCommand,
	IdCommand,
	IdResponseMap,
	sanitizeIdValues,
} from "./commands";
import Connection from "./connection";
import { CapabilityList } from "./parser";
import { IMAPLogMessage, IMAPConfiguration } from "./types";

export default class Session {
	protected authed: boolean;
	protected capabilityList: CapabilityList | null;
	protected connection: Connection;
	protected logger: (info: IMAPLogMessage) => void;
	protected options: IMAPConfiguration;
	protected serverInfo: IdResponseMap;
	protected started: boolean;

	constructor(options: IMAPConfiguration) {
		this.connection = new Connection(options);
		this.logger = options.logger || (() => {});
		this.options = options;

		this.authed = false;
		this.started = false;
		this.capabilityList = null;
		this.serverInfo = null;
	}

	public get active() {
		return this.started;
	}

	public get authenticated() {
		return this.authed;
	}

	public get capabilities() {
		return this.capabilityList;
	}

	public get server(): IdResponseMap {
		return !this.serverInfo ? null : new Map(this.serverInfo);
	}

	public async start() {
		if (this.started) {
			return this.connection.isActive;
		}
		this.started = true;

		try {
			await this.connection.connect();

			// A PREAUTH greeting (spec §10.5) means the connection is already
			// authenticated by external means — no LOGIN/AUTHENTICATE is
			// needed. `Connection` is the only thing that observes the
			// greeting, so it's the source of truth here.
			this.authed = this.connection.authenticated;

			// Get server information and capabilities to start with since
			// that information will really always be helpful. Surround in
			// a try/catch because if the server doesn't support this, it
			// is unlikely to have support for other things we need.
			//
			// connect() may already have populated the connection's
			// capability registry — a STARTTLS upgrade invalidates whatever
			// was cached pre-TLS (I-2) and re-issues CAPABILITY over the
			// protected channel before it resolves (spec §10.4). Reuse that
			// value instead of issuing a second, redundant CAPABILITY round
			// trip; only fetch it ourselves when the registry is still
			// unpopulated (plain/implicit connects, where connect() never
			// touches capabilities at all).
			const registry = this.connection.capabilityRegistry;
			let capabilityList: CapabilityList;
			if (registry.isValid) {
				capabilityList = registry.value as CapabilityList;
			} else {
				const capsCmd = new CapabilityCommand();
				capabilityList = await this.connection.runCommand(capsCmd);
				registry.set(capabilityList);
			}
			this.capabilityList = capabilityList;

			if (capabilityList.has("ID")) {
				// Consumer-supplied ID values are sanitized to RFC 2971 §3.3's
				// syntax limits (I-12) rather than rejected: over-long values
				// are truncated and over-long field names dropped, so the ID
				// exchange still happens with a compliant command.
				const idCmd = new IdCommand(
					this.options.id
						? sanitizeIdValues(this.options.id)
						: undefined,
				);
				this.serverInfo = await this.connection.runCommand(idCmd);
			} else {
				this.serverInfo = new Map();
			}
		} catch (error) {
			// Try and destroy the connection
			try {
				await this.connection.disconnect();
			} catch (_) {
				// Intentionally ignored: we're already handling a connection error
			}
			// Log the error
			this.logger({
				level: "error",
				message: "Unable to connect to the server",
				error,
			});
			// Reset ALL state back to not-started, mirroring end() — a failed
			// start() must not leave `authed`/`capabilityList`/`serverInfo`
			// stale from a partial attempt (e.g. PREAUTH observed before a
			// later step in start() threw), which would let later reads
			// self-contradict `active`/`authenticated`.
			this.started = false;
			this.authed = false;
			this.capabilityList = null;
			this.serverInfo = null;
			return false;
		}

		return true;
	}

	public async end() {
		if (!this.started) {
			return;
		}
		this.started = false;
		this.authed = false;
		this.capabilityList = null;
		this.serverInfo = null;
		this.connection.disconnect();
	}
}
