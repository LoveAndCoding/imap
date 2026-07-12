# Test-only TLS fixtures

The PEM keys and certificates in this directory are **self-signed throwaway
fixtures** used exclusively by the compliance suite's fake IMAP server on
loopback. They are not secrets and protect nothing.

Regenerate with `sh generate.sh` (requires OpenSSL 1.1.1+). This includes the
expired-cert fixture (`expired-cert.pem`/`expired-key.pem`), which is
generated with a validity window in the past for the cert-expiry compliance
tests.
