#!/bin/sh
# Nightly logical backup of the compose Postgres database to S3.
# Requires the AWS CLI and permission to write the backup bucket.
set -eu
cd "$(dirname "$0")/.."
BUCKET="${BACKUP_BUCKET:?set BACKUP_BUCKET}"
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U voiceops voiceops | gzip | aws s3 cp - "s3://${BUCKET}/voiceops-${STAMP}.sql.gz"
# Keep the bucket lifecycle (configured in Terraform) as the retention policy.
echo "uploaded voiceops-${STAMP}.sql.gz"
