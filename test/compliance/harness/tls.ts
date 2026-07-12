import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface CertFixture {
	key: Buffer;
	cert: Buffer;
}

const CERT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs");

/**
 * name:
 *   'localhost'       — SAN=localhost+127.0.0.1, CN=localhost (happy-path)
 *   'wrong-host'      — SAN=wrong.example.test, CN=wrong.example.test (identity mismatch)
 *   'san-only-match'  — SAN=localhost+127.0.0.1, CN=wrong.example.test (SAN matches, CN mismatches)
 *   'san-mismatch'    — SAN=wrong.example.test, CN=localhost (SAN mismatches, CN matches)
 *   'multi-san'       — SAN=other.example.test+localhost+127.0.0.1, CN=unrelated.example.test
 *                       (multiple names; only some match 127.0.0.1 — any-of-multiple rule)
 *   'expired'         — self-signed CA:TRUE, SAN=localhost+127.0.0.1, CN=localhost, but its
 *                       validity window is Jan 1–2 2020 (already expired). Identity matches;
 *                       a conformant client MUST still reject on expiry even when trusting it.
 *   'uri-id'          — SAN contains ONLY a uniformResourceIdentifier entry
 *                       (URI:imap://localhost/); CN=uri-id.example.test. There is NO dNSName
 *                       or iPAddress SAN. Per RFC 7817 §3 rule 3 (RFC7817-3-7), a URI-ID MUST
 *                       NOT be used by clients for server verification, so a conformant client
 *                       finds no usable presented identifier matching the connection target and
 *                       MUST reject (the URI-ID is not consulted for identity).
 */
export function loadCertFixture(name: "localhost" | "wrong-host" | "san-only-match" | "san-mismatch" | "multi-san" | "expired" | "uri-id" | "cn-only"): CertFixture {
	return {
		key: fs.readFileSync(path.join(CERT_DIR, `${name}-key.pem`)),
		cert: fs.readFileSync(path.join(CERT_DIR, `${name}-cert.pem`)),
	};
}
