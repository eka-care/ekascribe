#!/usr/bin/env bash
# Load an eMudhra delivery into the varta-tls-external secret.
kubectl --context openweb -n eka-care create secret tls varta-tls-external \
  --cert=fullchain-trimmed.pem --key=wildcard-bharatai.key \
  --dry-run=client -o yaml | kubectl --context openweb apply -f -

# verify
#curl -sv https://vaarta.bharatai.gov.in/healthz 2>&1 | grep -E "SSL certificate verify|HTTP/"
