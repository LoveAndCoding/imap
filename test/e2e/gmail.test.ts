import { describeAllServers } from "./all.servers";

const GMAIL_HOST = "imap.gmail.com";
const PORT = 993;

describe("Gmail", () => {
	describeAllServers(GMAIL_HOST, PORT);
});
