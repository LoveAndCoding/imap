import Box from "./box";
import {
	AppendCommand,
	AppendOptions,
	AuthenticateCommand,
	CapabilityCommand,
	CheckCommand,
	CloseCommand,
	CopyCommand,
	CreateCommand,
	DeleteCommand,
	EnableCommand,
	ExamineCommand,
	ExpungeCommand,
	FetchCommand,
	FetchItems,
	IdCommand,
	IdResponseMap,
	IdleCommand,
	ListCommand,
	LoginCommand,
	LogoutCommand,
	MoveCommand,
	NamespaceCommand,
	NoopCommand,
	OAuthCredentials,
	PlainCredentials,
	RenameCommand,
	SearchCommand,
	SearchOptions,
	SelectCommand,
	SequenceSetInput,
	StatusCommand,
	StoreAction,
	StoreCommand,
	SubscribeCommand,
	UnselectCommand,
	UnsubscribeCommand,
} from "./commands";
import Connection from "./connection";
import Message from "./message";
import {
	CapabilityList,
	MailboxListing,
	MailboxStatus,
	NamespaceResponse,
} from "./parser";
import { IMAPLogMessage, IMAPConfiguration } from "./types";

export default class Session {
	protected authed: boolean;
	protected capabilityList: CapabilityList;
	protected connection: Connection;
	protected currentBox: Box;
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

	/** The currently selected/examined mailbox, if any. */
	public get box(): Box {
		return this.currentBox;
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

	// ---- Authentication ----

	/** Authenticate with a plaintext username and password (LOGIN). */
	public async login(username: string, password: string): Promise<boolean> {
		const authed = await this.connection.runCommand(
			new LoginCommand(username, password),
		);
		this.authed = authed;
		return authed;
	}

	/** Authenticate using a SASL mechanism (AUTHENTICATE). */
	public async authenticate(
		mechanism: "PLAIN",
		credentials: PlainCredentials,
	): Promise<boolean>;
	public async authenticate(
		mechanism: "XOAUTH2",
		credentials: OAuthCredentials,
	): Promise<boolean>;
	public async authenticate(
		mechanism: "PLAIN" | "XOAUTH2",
		credentials: PlainCredentials | OAuthCredentials,
	): Promise<boolean> {
		const cmd =
			mechanism === "PLAIN"
				? new AuthenticateCommand(
						mechanism,
						credentials as PlainCredentials,
				  )
				: new AuthenticateCommand(
						mechanism,
						credentials as OAuthCredentials,
				  );
		const authed = await this.connection.runCommand(cmd);
		this.authed = authed;
		return authed;
	}

	/** Tell the server which extensions to enable (ENABLE). */
	public enable(capabilities: string[]): Promise<boolean> {
		return this.connection.runCommand(new EnableCommand(capabilities));
	}

	// ---- Mailbox selection ----

	/** Open a mailbox for read/write access (SELECT). */
	public async select(mailbox: string): Promise<Box> {
		this.currentBox = await this.connection.runCommand(
			new SelectCommand(mailbox),
		);
		return this.currentBox;
	}

	/** Open a mailbox for read-only access (EXAMINE). */
	public async examine(mailbox: string): Promise<Box> {
		this.currentBox = await this.connection.runCommand(
			new ExamineCommand(mailbox),
		);
		return this.currentBox;
	}

	/** Close the currently selected mailbox (CLOSE). */
	public async close(): Promise<boolean> {
		const result = await this.connection.runCommand(new CloseCommand());
		this.currentBox = undefined;
		return result;
	}

	/** Close the mailbox without expunging deleted messages (UNSELECT). */
	public async unselect(): Promise<boolean> {
		const result = await this.connection.runCommand(new UnselectCommand());
		this.currentBox = undefined;
		return result;
	}

	// ---- Mailbox management ----

	public create(mailbox: string): Promise<boolean> {
		return this.connection.runCommand(new CreateCommand(mailbox));
	}

	public delete(mailbox: string): Promise<boolean> {
		return this.connection.runCommand(new DeleteCommand(mailbox));
	}

	public rename(from: string, to: string): Promise<boolean> {
		return this.connection.runCommand(new RenameCommand(from, to));
	}

	public subscribe(mailbox: string): Promise<boolean> {
		return this.connection.runCommand(new SubscribeCommand(mailbox));
	}

	public unsubscribe(mailbox: string): Promise<boolean> {
		return this.connection.runCommand(new UnsubscribeCommand(mailbox));
	}

	public list(
		reference = "",
		mailbox = "*",
	): Promise<MailboxListing[]> {
		return this.connection.runCommand(
			new ListCommand(reference, mailbox),
		);
	}

	public status(
		mailbox: string,
		items?: string[],
	): Promise<MailboxStatus> {
		return this.connection.runCommand(new StatusCommand(mailbox, items));
	}

	public namespace(): Promise<NamespaceResponse> {
		return this.connection.runCommand(new NamespaceCommand());
	}

	// ---- Message operations ----

	public search(
		criteria: string | string[],
		options?: SearchOptions,
	): Promise<number[]> {
		return this.connection.runCommand(
			new SearchCommand(criteria, options),
		);
	}

	public fetch(
		sequenceSet: SequenceSetInput,
		items?: FetchItems,
		useUid = false,
	): Promise<Message[]> {
		return this.connection.runCommand(
			new FetchCommand(sequenceSet, items, useUid),
		);
	}

	public store(
		sequenceSet: SequenceSetInput,
		action: StoreAction,
		flags: string[],
		useUid = false,
	): Promise<Message[]> {
		return this.connection.runCommand(
			new StoreCommand(sequenceSet, action, flags, useUid),
		);
	}

	public copy(
		sequenceSet: SequenceSetInput,
		mailbox: string,
		useUid = false,
	): Promise<boolean> {
		return this.connection.runCommand(
			new CopyCommand(sequenceSet, mailbox, useUid),
		);
	}

	public move(
		sequenceSet: SequenceSetInput,
		mailbox: string,
		useUid = false,
	): Promise<boolean> {
		return this.connection.runCommand(
			new MoveCommand(sequenceSet, mailbox, useUid),
		);
	}

	public expunge(
		useUid = false,
		sequenceSet?: SequenceSetInput,
	): Promise<number[]> {
		return this.connection.runCommand(
			new ExpungeCommand(useUid, sequenceSet),
		);
	}

	public append(
		mailbox: string,
		message: string,
		options?: AppendOptions,
	): Promise<boolean> {
		return this.connection.runCommand(
			new AppendCommand(mailbox, message, options),
		);
	}

	public check(): Promise<boolean> {
		return this.connection.runCommand(new CheckCommand());
	}

	public noop(): Promise<null> {
		return this.connection.runCommand(new NoopCommand());
	}

	/**
	 * Begin an IDLE session. The returned command exposes `done()` to end
	 * idling; listen on the connection for untagged updates in the meantime.
	 */
	public idle(): IdleCommand {
		const cmd = new IdleCommand();
		// Fire and forget; the caller drives completion via cmd.done().
		this.connection.runCommand(cmd).catch(() => undefined);
		return cmd;
	}

	public async logout(): Promise<boolean> {
		const result = await this.connection.runCommand(new LogoutCommand());
		this.authed = false;
		return result;
	}

	public async end() {
		if (!this.started) {
			return;
		}
		this.started = false;
		this.authed = false;
		this.capabilityList = null;
		this.currentBox = null;
		this.serverInfo = null;
		this.connection.disconnect();
	}
}
