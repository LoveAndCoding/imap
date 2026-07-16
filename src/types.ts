import type { IMAPConnectionConfiguration } from "./connection/types";
import type { IdCommandValues } from "./commands";

/**
 * Payload shape passed to the caller-supplied `logger` callback (spec
 * I-7/§10.6). A discriminated union on `level`: non-error notifications carry
 * an optional free-form `detail`, while error-level notifications instead
 * carry an optional `error` (typically the underlying `Error`/exception).
 */
export type IMAPLogMessage =
	| {
			/** Severity of this notification, for non-error messages. */
			level: "warn" | "info" | "verbose" | "debug" | "silly";
			/** Human-readable description of the event being logged. */
			message: string;
			/** Optional free-form supplementary data for this notification. */
			detail?: any;
	  }
	| {
			/** Severity of this notification, for error-carrying messages. */
			level: "error" | "warn";
			/** Human-readable description of the event being logged. */
			message: string;
			/** Optional underlying error/exception associated with this
			 *  notification. */
			error?: any;
	  };

export type IMAPConfiguration = IMAPConnectionConfiguration & {
	id?: IdCommandValues;
	logger?: (info: IMAPLogMessage) => void;
};
