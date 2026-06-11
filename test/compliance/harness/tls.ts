import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface CertFixture {
	key: Buffer;
	cert: Buffer;
}

const CERT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs");

/** name: 'localhost' | 'wrong-host' (expired lands in Phase 3) */
export function loadCertFixture(name: "localhost" | "wrong-host"): CertFixture {
	return {
		key: fs.readFileSync(path.join(CERT_DIR, `${name}-key.pem`)),
		cert: fs.readFileSync(path.join(CERT_DIR, `${name}-cert.pem`)),
	};
}
