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
 */
export function loadCertFixture(name: "localhost" | "wrong-host" | "san-only-match" | "san-mismatch" | "multi-san" | "expired"): CertFixture {
	return {
		key: fs.readFileSync(path.join(CERT_DIR, `${name}-key.pem`)),
		cert: fs.readFileSync(path.join(CERT_DIR, `${name}-cert.pem`)),
	};
}
