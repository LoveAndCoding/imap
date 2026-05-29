import Box from "../../src/box";

describe("Box", () => {
	test("Exposes the provided mailbox state", () => {
		const box = new Box({
			name: "INBOX",
			readOnly: false,
			exists: 42,
			recent: 3,
			unseen: 7,
			uidvalidity: 100,
			uidnext: 200,
			permanentFlags: ["\\Seen", "\\Deleted"],
		});

		expect(box.name).toBe("INBOX");
		expect(box.exists).toBe(42);
		expect(box.recent).toBe(3);
		expect(box.unseen).toBe(7);
		expect(box.uidvalidity).toBe(100);
		expect(box.uidnext).toBe(200);
		expect(box.permanentFlags).toEqual(["\\Seen", "\\Deleted"]);
	});

	test("writable is the inverse of readOnly", () => {
		expect(new Box({ name: "A", readOnly: false }).writable).toBe(true);
		expect(new Box({ name: "A", readOnly: true }).writable).toBe(false);
	});
});
