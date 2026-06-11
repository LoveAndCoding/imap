#!/usr/bin/env bash
# Regenerates the committed TLS fixtures. Requires OpenSSL 1.1.1+ (-addext support).
# The expired-cert fixture is added in Phase 3 (needs openssl req -not_before/-not_after, OpenSSL >= 3.4).
# On Git for Windows, MSYS_NO_PATHCONV=1 prevents MSYS2 from mangling the -subj value.
set -euo pipefail
cd "$(dirname "$0")"

MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout localhost-key.pem -out localhost-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout wrong-host-key.pem -out wrong-host-cert.pem \
  -subj "/CN=wrong.example.test" \
  -addext "subjectAltName=DNS:wrong.example.test"

echo "Done. Commit the regenerated PEM files."
