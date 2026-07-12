/** The client's public API offers no way to perform this operation. */
export class NotImplementedError extends Error {
	constructor(operation: string) {
		super(`Client public API has no support for: ${operation}`);
		this.name = "NotImplementedError";
	}
}
