#!/bin/bash
# Nightly logical backup of the compose Postgres database to S3.
# Requires the AWS CLI and permission to write the backup bucket.
set -euo pipefail
cd "$(dirname "$0")/.."
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET}"
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
TMP=$(mktemp)
trap 'rm -f "$TMP" "$TMP.gz"' EXIT
# -T and a closed stdin keep docker compose from consuming the caller's stdin.
# pipefail is on so a failed command in a pipeline cannot hide a bad dump.
# A failed pg_dump or an empty file exits before gzip or upload.
docker compose exec -T postgres pg_dump -U voiceops voiceops < /dev/null > "$TMP"
if [ ! -s "$TMP" ]; then
  echo "pg_dump produced an empty file; not uploading" >&2
  exit 1
fi
gzip -c "$TMP" > "$TMP.gz"
aws s3 cp "$TMP.gz" "s3://${BUCKET}/voiceops-${STAMP}.sql.gz"
# Keep the bucket lifecycle (configured in Terraform) as the retention policy.
echo "uploaded voiceops-${STAMP}.sql.gz"
