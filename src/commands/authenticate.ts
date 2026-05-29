import Connection from "../connection";
import { IMAPError } from "../errors";
import { ContinueResponse } from "../parser";
import { Command } from "./base";

export interface PlainCredentials {
	username: string;
	password: string;
}

export interface OAuthCredentials {
	username: string;
	accessToken: string;
}

export type AuthMechanism = "PLAIN" | "XOAUTH2";

/**
 * AUTHENTICATE performs a SASL exchange. The mechanism name is sent first,
 * the server replies with a continuation request, and we answer with the
 * base64 encoded initial client response.
 *
 * PLAIN and XOAUTH2 are supported as they cover the overwhelming majority
 * of real-world usage (password and OAuth2 bearer-token logins).
 */
export class AuthenticateCommand extends Command<boolean> {
	private readonly initialResponse: string;

	constructor(
		mechanism: "PLAIN",
		credentials: PlainCredentials,
	);
	constructor(
		mechanism: "XOAUTH2",
		credentials: OAuthCredentials,
	);
	constructor(
		protected readonly mechanism: AuthMechanism,
		credentials: PlainCredentials | OAuthCredentials,
	) {
		// AUTHENTICATE changes connection state, so isolate it.
		super("AUTHENTICATE", true);
		this.initialResponse = this.buildInitialResponse(
			mechanism,
			credentials,
		);
	}

	protected getCommand(): string {
		return `${this.type} ${this.mechanism}`;
	}

	protected onContinue(
		_response: ContinueResponse,
		connection: Connection,
	): void {
		// Reply to the server's challenge with our base64 client response.
		connection.send(this.initialResponse);
	}

	protected parseResponse(): boolean {
		return true;
	}

	private buildInitialResponse(
		mechanism: AuthMechanism,
		credentials: PlainCredentials | OAuthCredentials,
	): string {
		switch (mechanism) {
			case "PLAIN": {
				const { username, password } = credentials as PlainCredentials;
				// SASL PLAIN: authzid NUL authcid NUL passwd
				return Buffer.from(
					`\0${username}\0${password}`,
					"utf8",
				).toString("base64");
			}
			case "XOAUTH2": {
				const {
					username,
					accessToken,
				} = credentials as OAuthCredentials;
				return Buffer.from(
					`user=${username}\x01auth=Bearer ${accessToken}\x01\x01`,
					"utf8",
				).toString("base64");
			}
			default:
				throw new IMAPError(
					`Unsupported authentication mechanism: ${mechanism}`,
				);
		}
	}
}
