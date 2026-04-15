import { describeAllServers } from "./all.servers";

const YAHOO_HOST = "imap.mail.yahoo.com";
const PORT = 993;

describe("Yahoo", () => {
	describeAllServers(YAHOO_HOST, PORT);
});
