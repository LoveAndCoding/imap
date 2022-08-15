import { describeAllServers } from "./all.servers";

const MAIL_HOST = "imap.mail.com";
const PORT = 993;

describe("Mail.com", () => {
	describeAllServers(MAIL_HOST, PORT);
});
