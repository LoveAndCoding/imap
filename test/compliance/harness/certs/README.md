# Test-only TLS fixtures

The PEM keys and certificates in this directory are **self-signed throwaway
fixtures** used exclusively by the compliance suite's fake IMAP server on
loopback. They are not secrets and protect nothing.

Regenerate with `./generate.sh` (requires OpenSSL 1.1.1+). The expired-cert
fixture is intentionally absent until Phase 3 (cert-expiry compliance tests).
