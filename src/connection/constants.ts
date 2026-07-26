export const MAX_INT = Number.MAX_SAFE_INTEGER;
export const KEEPALIVE_INTERVAL = 10000;
export const MAX_IDLE_WAIT = 300000; // 5 minute
export const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
export const FETCH_ATTR_MAP = {
	BODY: "struct",
	BODYSTRUCTURE: "struct",
	ENVELOPE: "envelope",
	INTERNALDATE: "date",
	"RFC822.SIZE": "size",
};
export const SPECIAL_USE_ATTRIBUTES = [
	"\\All",
	"\\Archive",
	"\\Drafts",
	"\\Flagged",
	"\\Important",
	"\\Junk",
	"\\Sent",
	"\\Trash",
];
export const CRLF = "\r\n";
export const RE_CMD = /^([^ ]+)(?: |$)/;
export const RE_UIDCMD_HASRESULTS = /^UID (?:FETCH|SEARCH|SORT)/;
export const RE_IDLENOOPRES = /^(IDLE|NOOP) /;
export const RE_OPENBOX = /^EXAMINE|SELECT$/;
export const RE_BODYPART = /^BODY\[/;
// eslint-disable-next-line no-control-regex -- \x00-\x20 control range is intentional (IMAP keyword char validation)
export const RE_INVALID_KW_CHARS = /[(){\\"\]%*\x00-\x20\x7F]/;
export const RE_NUM_RANGE = /^(?:[\d]+|\*):(?:[\d]+|\*)$/;
export const RE_BACKSLASH = /\\/g;
export const RE_DBLQUOTE = /"/g;
export const RE_ESCAPE = /\\\\/g;
export const RE_INTEGER = /^\d+$/;
