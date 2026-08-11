#!/usr/bin/env bash
# Generate the self-signed cert + key for vaarta/varta.bharatai.gov.in.
# 365 days: this is a stopgap until the trusted (eMudhra) cert arrives —
# swap the secret contents then, nothing else changes.
#
# Deliberately does NOT touch the cluster. Run the printed kubectl command
# yourself after checking the SAN/enddate output.
set -euo pipefail
cd "$(dirname "$0")"

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout varta-tls.key -out varta-tls.crt \
  -config varta-tls.cnf

echo
openssl x509 -in varta-tls.crt -noout -subject -enddate -ext subjectAltName

echo
echo "Now create the secret on openweb (the .key never leaves this machine otherwise):"
echo "  kubectl --context openweb -n eka-care create secret tls varta-tls --cert=varta-tls.crt --key=varta-tls.key"
