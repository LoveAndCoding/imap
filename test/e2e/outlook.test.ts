import { describeAllServers } from "./all.servers";

const OUTLOOK_HOST = "outlook.office365.com";
const PORT = 993;

describe("Outlook", () => {
	describeAllServers(OUTLOOK_HOST, PORT);
});
