import { AuthError } from "../../../src/errors";
import {
	createScramSha1Mechanism,
	createScramSha256Mechanism,
	ScramMechanism,
} from "../../../src/sasl/scram";
import { SaslContext } from "../../../src/sasl/mechanism";

// RFC 5802 §5's own worked example (SCRAM-SHA-1, username="user"
// password="pencil"). RFC 7677 §3 restates the identical exchange shape
// with SHA-256 substituted for HMAC()/H() throughout (RFC7677-3-1) using its
// own worked-example vector. Both were independently cross-checked against
// a from-scratch PBKDF2/HMAC/XOR Node script before being pasted here (see
// the M5.1 task report for the verification transcript).
const SHA1_VECTOR = {
	username: "user",
	password: "pencil",
	clientNonce: "fyko+d2lbbFgONRv9qkxdawL",
	serverNonceSuffix: "3rfcNHYJY1ZVvWVs7j",
	salt: "QSXCR+Q6sek8bf92",
	iterations: 4096,
	expectedProof: "v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=",
	expectedServerSignature: "rmF9pqV8S7suAoZWja4dJRkFsKQ=",
};

const SHA256_VECTOR = {
	username: "user",
	password: "pencil",
	clientNonce: "rOprNGfwEbeRWgbNEkqO",
	serverNonceSuffix: "%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0",
	salt: "W22ZaJ0SNY7soEsUEjb6gQ==",
	iterations: 4096,
	expectedProof: "dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=",
	expectedServerSignature: "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=",
};

function ctx(overrides: Partial<SaslContext> = {}): SaslContext {
	return {
		user: SHA1_VECTOR.username,
		pass: SHA1_VECTOR.password,
		host: "imap.example.com",
		port: 993,
		...overrides,
	};
}

function serverFirstMessage(v: typeof SHA1_VECTOR): string {
	return `r=${v.clientNonce}${v.serverNonceSuffix},s=${v.salt},i=${v.iterations}`;
}

function combinedNonce(v: typeof SHA1_VECTOR): string {
	return `${v.clientNonce}${v.serverNonceSuffix}`;
}

describe("ScramMechanism", () => {
	describe("name and transport requirement", () => {
		test("SCRAM-SHA-1", () => {
			const mech = new ScramMechanism("sha1");
			expect(mech.name).toBe("SCRAM-SHA-1");
			expect(mech.requiresSecureTransport).toBe(false);
		});

		test("SCRAM-SHA-256", () => {
			const mech = new ScramMechanism("sha256");
			expect(mech.name).toBe("SCRAM-SHA-256");
			expect(mech.requiresSecureTransport).toBe(false);
		});

		test("factory functions produce correctly-named instances", () => {
			expect(createScramSha1Mechanism().name).toBe("SCRAM-SHA-1");
			expect(createScramSha256Mechanism().name).toBe("SCRAM-SHA-256");
		});
	});

	describe("client-first-message", () => {
		test("SCRAM-SHA-1: gs2-header 'n,,' + 'n=<user>,r=<nonce>'", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });

			//Act
			const first = await mech.start(ctx());

			//Assert
			expect(first.toString("utf8")).toBe(`n,,n=user,r=${SHA1_VECTOR.clientNonce}`);
		});

		test("escapes ',' and '=' in the username as '=2C'/'=3D'", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });

			//Act
			const first = await mech.start(ctx({ user: "a=b,c" }));

			//Assert
			expect(first.toString("utf8")).toBe(`n,,n=a=3Db=2Cc,r=${SHA1_VECTOR.clientNonce}`);
		});

		test("escapes ',' and '=' in a non-empty authzid ('a=' gs2-header segment)", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });

			//Act
			const first = await mech.start(ctx({ authzid: "admin=x,y" }));

			//Assert
			expect(first.toString("utf8")).toBe(
				`n,a=admin=3Dx=2Cy,n=user,r=${SHA1_VECTOR.clientNonce}`,
			);
		});

		test("nonce differs across two fresh instances (production nonce factory)", async () => {
			//Arrange
			const first = await new ScramMechanism("sha1").start(ctx());
			const second = await new ScramMechanism("sha1").start(ctx());

			//Assert
			expect(first.toString("utf8")).not.toBe(second.toString("utf8"));
		});

		test("missing pass throws AuthError before any bytes are computed", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1");

			//Act & Assert
			await expect(mech.start(ctx({ pass: undefined }))).rejects.toThrow(AuthError);
		});

		test("non-ASCII username is NOT forwarded raw (NFKC-normalized instead)", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });

			//Act
			const first = await mech.start(ctx({ user: "½" }));
			const text = first.toString("utf8");

			//Assert: NFKC turns U+00BD into the three-character "1⁄2" sequence.
			expect(text).not.toContain("½");
			expect(text).toContain("n=1⁄2,");
		});
	});

	describe("RFC 5802 §5 / RFC 7677 §3 worked examples", () => {
		test.each([
			["SCRAM-SHA-1" as const, "sha1" as const, SHA1_VECTOR],
			["SCRAM-SHA-256" as const, "sha256" as const, SHA256_VECTOR],
		])("%s: client-final-message matches byte-for-byte", async (_name, algo, vector) => {
			//Arrange
			const mech = new ScramMechanism(algo, { nonce: () => vector.clientNonce });
			await mech.start(ctx({ user: vector.username, pass: vector.password }));

			//Act
			const final = await mech.step(
				Buffer.from(serverFirstMessage(vector), "utf8"),
				ctx({ user: vector.username, pass: vector.password }),
			);

			//Assert
			expect(final.toString("utf8")).toBe(
				`c=biws,r=${combinedNonce(vector)},p=${vector.expectedProof}`,
			);
		});

		test.each([
			["SCRAM-SHA-1" as const, "sha1" as const, SHA1_VECTOR],
			["SCRAM-SHA-256" as const, "sha256" as const, SHA256_VECTOR],
		])("%s: accepts the genuine ServerSignature and resolves finish()", async (_name, algo, vector) => {
			//Arrange
			const mech = new ScramMechanism(algo, { nonce: () => vector.clientNonce });
			const c = ctx({ user: vector.username, pass: vector.password });
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(vector), "utf8"), c);

			//Act
			await mech.step(Buffer.from(`v=${vector.expectedServerSignature}`, "utf8"), c);

			//Assert
			await expect(mech.finish(null, c)).resolves.toBeUndefined();
		});
	});

	describe("server signature verification (RFC5802-5-3) — the security-critical duty", () => {
		test("REVERT-VERIFY: a forged/mismatched ServerSignature is rejected by finish()", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);
			const forged = Buffer.alloc(20, 0x42).toString("base64");
			expect(forged).not.toBe(SHA1_VECTOR.expectedServerSignature);

			//Act
			await mech.step(Buffer.from(`v=${forged}`, "utf8"), c);

			//Assert: finish() MUST reject even though nothing about the wire
			// exchange itself failed — this is the one place a broken
			// implementation could silently accept an unverified/forged
			// "mutual authentication" and look secure without being secure.
			await expect(mech.finish(null, c)).rejects.toThrow(AuthError);
		});

		test("finish() resolves when no server-final-message was ever presented", async () => {
			//Arrange: some servers signal success via the tagged OK alone,
			// without ever sending a 'v=' continuation (RFC5802-5.1-14's
			// permissive shape, exercised here on the success side).
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);

			//Act & Assert
			await expect(mech.finish(null, c)).resolves.toBeUndefined();
		});

		test("finish() resolves when the server-final-message is an EMPTY continuation ('+' with no bytes)", async () => {
			//Arrange: distinct from "never presented" above -- here `step()` IS
			// called again for the server-final phase, but with a zero-length
			// challenge. Same documented tolerance (RFC5802-5.1-14's shape),
			// exercised on the actual empty-string path through
			// `handleServerFinal()` rather than never reaching it at all.
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);

			//Act
			await mech.step(Buffer.alloc(0), c);

			//Assert
			await expect(mech.finish(null, c)).resolves.toBeUndefined();
		});

		test("M5.16 Finding 4: finish() REJECTS when the server-final-message is NON-EMPTY but garbled (no 'e='/'v='/'m=')", async () => {
			//Arrange: something arrived over the wire, but it isn't a
			// recognizable SCRAM server-final-message at all -- must fail
			// closed (no verified ServerSignature was ever produced), never
			// collapse into the "nothing was sent" tolerance above.
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);

			//Act
			await mech.step(Buffer.from("this is not a scram attribute list", "utf8"), c);

			//Assert
			await expect(mech.finish(null, c)).rejects.toThrow(AuthError);
		});

		test("an 'e=' server-final-message is rejected by finish()", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);

			//Act
			await mech.step(Buffer.from("e=other-error", "utf8"), c);

			//Assert
			await expect(mech.finish(null, c)).rejects.toThrow(AuthError);
		});
	});

	describe("nonce mismatch (RFC5802-5.1-8)", () => {
		test("aborts (step() throws) when the server's combined nonce does not echo the client's nonce as a prefix", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			const wrongFirst = `r=DIFFERENT-NONCE-NOT-A-PREFIX,s=${SHA1_VECTOR.salt},i=4096`;

			//Act & Assert
			await expect(mech.step(Buffer.from(wrongFirst, "utf8"), c)).rejects.toThrow(AuthError);
		});
	});

	describe("unsupported mandatory 'm=' extension (RFC5802-5.1-5/-15)", () => {
		test("aborts (step() throws) when the server-first-message carries 'm='", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			const withMandatoryExt = `m=unsupported,r=${combinedNonce(SHA1_VECTOR)},s=${SHA1_VECTOR.salt},i=4096`;

			//Act & Assert
			await expect(mech.step(Buffer.from(withMandatoryExt, "utf8"), c)).rejects.toThrow(AuthError);
		});
	});

	describe("unknown optional extension attributes (RFC5802-5.1-16)", () => {
		test("ignores an unrecognized 'x=' attribute and proceeds normally", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			const withUnknownExt = `${serverFirstMessage(SHA1_VECTOR)},x=foo`;

			//Act
			const final = await mech.step(Buffer.from(withUnknownExt, "utf8"), c);

			//Assert: the client still proceeds and produces a well-formed
			// client-final-message rather than failing on the unknown
			// attribute (note the recomputed proof legitimately differs from
			// the extension-free vector, since AuthMessage includes the
			// server-first-message VERBATIM, extension bytes included).
			const text = final.toString("utf8");
			expect(text.startsWith(`c=biws,r=${combinedNonce(SHA1_VECTOR)},p=`)).toBe(true);
			const proof = text.slice(text.indexOf(",p=") + 3);
			expect(/^[A-Za-z0-9+/=]+$/.test(proof)).toBe(true);
		});
	});

	describe("protocol-shape guards", () => {
		test("a challenge received before start() throws", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1");
			const c = ctx();

			//Act & Assert
			await expect(mech.step(Buffer.from("bogus", "utf8"), c)).rejects.toThrow(AuthError);
		});

		test("a third step() call (after the exchange already concluded) throws", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);
			await mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), c);
			await mech.step(Buffer.from(`v=${SHA1_VECTOR.expectedServerSignature}`, "utf8"), c);

			//Act & Assert
			await expect(mech.step(Buffer.from("anything", "utf8"), c)).rejects.toThrow(AuthError);
		});

		test("missing pass in step() throws AuthError", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);

			//Act & Assert
			await expect(
				mech.step(Buffer.from(serverFirstMessage(SHA1_VECTOR), "utf8"), ctx({ pass: undefined })),
			).rejects.toThrow(AuthError);
		});

		test("a malformed server-first-message missing required attributes throws", async () => {
			//Arrange
			const mech = new ScramMechanism("sha1", { nonce: () => SHA1_VECTOR.clientNonce });
			const c = ctx();
			await mech.start(c);

			//Act & Assert
			await expect(mech.step(Buffer.from("r=onlynonce", "utf8"), c)).rejects.toThrow(AuthError);
		});
	});
});
