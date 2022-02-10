import { type IMAPConnectionConfiguration } from "./connection/types";
import { type IdCommandValues } from "./commands";

export type IMAPLogMessage =
	| {
			level: "warn" | "info" | "verbose" | "debug" | "silly";
			message: string;
			detail?: any;
	  }
	| {
			level: "error" | "warn";
			message: string;
			error?: any;
	  };

export type IMAPConfiguration = IMAPConnectionConfiguration & {
	id?: IdCommandValues;
	logger?: (info: IMAPLogMessage) => void;
};
