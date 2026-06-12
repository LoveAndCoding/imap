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

# §11.1-7 fixtures: SAN-precedence tests (RFC3501-11.1-7).
#
# san-only-match: SAN dNSName=localhost + IP=127.0.0.1 matches 127.0.0.1/localhost;
#   CN=wrong.example.test mismatches. A conformant client should connect because SAN wins.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout san-only-match-key.pem -out san-only-match-cert.pem \
  -subj "/CN=wrong.example.test" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# san-mismatch: SAN dNSName=wrong.example.test mismatches 127.0.0.1/localhost;
#   CN=localhost matches. A conformant client should REJECT because SAN is present
#   but mismatches (SAN takes precedence over CN per §11.1).
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout san-mismatch-key.pem -out san-mismatch-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:wrong.example.test"

# §11.1-9 fixture: multi-SAN test (RFC3501-11.1-9 multiple-names sub-clause).
#
# multi-san: CN=unrelated.example.test; SAN: DNS:other.example.test,
#   DNS:localhost, IP:127.0.0.1 — multiple names where only some match
#   the connection target (127.0.0.1). A conformant client MUST accept because
#   one of the SAN names (IP:127.0.0.1) matches the connection target.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 36500 \
  -keyout multi-san-key.pem -out multi-san-cert.pem \
  -subj "/CN=unrelated.example.test" \
  -addext "subjectAltName=DNS:other.example.test,DNS:localhost,IP:127.0.0.1"

echo "Done. Commit the regenerated PEM files."
