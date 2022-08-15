import {CapabilityCommand, IdCommand, IdResponseMap} from "./commands";
import Connection from "./connection";
import { CapabilityList } from "./parser";
import { IMAPLogMessage, IMAPConfiguration } from "./types";

export default class Session {
	protected authed: boolean;
	protected capabilityList: CapabilityList;
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

			// Get server information and capabilities to start with since
			// that information will really always be helpful. Surround in
			// a try/catch because if the server doesn't support this, it
			// is unlikely to have support for other things we need.
			const capsCmd = new CapabilityCommand();
			this.capabilityList = await this.connection.runCommand(capsCmd);

			if (this.capabilityList.has("ID")) {
				const idCmd = new IdCommand(this.options.id);
				this.serverInfo = await this.connection.runCommand(idCmd);
			} else {
				this.serverInfo = new Map();
			}
		} catch (error) {
			// Try and destroy the connection
			try {
				this.connection.disconnect();
			} catch (_) {}
			// Log the error
			this.logger({
				level: "error",
				message: "Unable to connect to the server",
				error,
			});
			// And set us back to not started
			this.started = false;
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
