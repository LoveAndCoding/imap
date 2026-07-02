#!/usr/bin/env bash
# Regenerates the committed TLS fixtures. Requires OpenSSL 1.1.1+ (-addext support).
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

# Phase 3: expired fixture (RFC3501-11.1 / RFC9525 / RFC7817 cert-expiry duties).
#
# expired: self-signed CA:TRUE cert, SAN=localhost+127.0.0.1, CN=localhost — a
#   valid identity match, but its validity window is Jan 1–2 2020 (already past).
#   A conformant client trusting this cert as its own anchor MUST still reject the
#   connection because the certificate is expired (identity is fine; time is not).
#
# TOOLCHAIN NOTE: OpenSSL 1.1.1 has NO `req -x509 -not_before/-not_after` (that
#   arrived in OpenSSL 3.x). To backdate on 1.1.1 we drive `openssl ca -selfsign`
#   with explicit -startdate/-enddate, which 1.1.1 fully supports. `copy`/x509_exts
#   in the CA config carry the SAN through. `openssl ca` prepends a human-readable
#   text block to its output, so we re-emit the pure PEM via `openssl x509`.
#   This block writes its scratch files to a local ./expired-work/ dir (removed
#   at the end) to avoid MSYS temp-path mangling of the openssl config paths.
mkdir -p expired-work
MSYS_NO_PATHCONV=1 openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout expired-work/expired-key.pem -out expired-work/expired.csr \
  -subj "/CN=localhost"
cat > expired-work/expired-ca.cnf <<'EOF'
[ ca ]
default_ca = CA_default
[ CA_default ]
new_certs_dir = ./expired-work
database = ./expired-work/index.txt
serial = ./expired-work/serial.txt
default_md = sha256
policy = policy_any
x509_extensions = leaf_exts
[ policy_any ]
commonName = supplied
[ leaf_exts ]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = critical,CA:TRUE
EOF
: > expired-work/index.txt
echo 01 > expired-work/serial.txt
MSYS_NO_PATHCONV=1 openssl ca -batch -selfsign \
  -config expired-work/expired-ca.cnf -keyfile expired-work/expired-key.pem \
  -in expired-work/expired.csr -out expired-work/expired-cert.raw.pem \
  -startdate 20200101000000Z -enddate 20200102000000Z
openssl x509 -in expired-work/expired-cert.raw.pem -out expired-cert.pem
cp expired-work/expired-key.pem expired-key.pem
rm -rf expired-work

echo "Done. Commit the regenerated PEM files."
