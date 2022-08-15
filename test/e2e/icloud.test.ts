import { describeAllServers } from "./all.servers";

const ICLOUD_HOST = "imap.mail.me.com";
const PORT = 993;

describe("iCloud", () => {
	describeAllServers(ICLOUD_HOST, PORT);
});
