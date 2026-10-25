#!/bin/sh
# Dump the production database, upload it to the private "db-backups" bucket, keep 30 days.
# Env (Railway variable references, never typed by hand): DATABASE_URL, BUCKET, ENDPOINT,
# ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION.
set -eu
: "${DATABASE_URL:?}" "${BUCKET:?}" "${ENDPOINT:?}" "${ACCESS_KEY_ID:?}" "${SECRET_ACCESS_KEY:?}"
export AWS_ACCESS_KEY_ID="$ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="${REGION:-auto}"
KEEP_DAYS="${KEEP_DAYS:-30}"
stamp=$(date -u +%Y-%m-%dT%H%MZ)
key="daily/kingzbet-$stamp.sql.gz"

# pg_dump writes to a file first, so a failed dump stops the job (set -e) instead of uploading junk.
pg_dump --no-owner --no-acl -f /tmp/dump.sql "$DATABASE_URL"
gzip -9 /tmp/dump.sql
aws s3 cp /tmp/dump.sql.gz "s3://$BUCKET/$key" --endpoint-url "$ENDPOINT" --only-show-errors
echo "backup ok: $key ($(du -h /tmp/dump.sql.gz | cut -f1))"

# Keys sort by timestamp, so everything below the cutoff key is older than KEEP_DAYS.
cutoff="daily/kingzbet-$(date -u -d "@$(( $(date +%s) - KEEP_DAYS * 86400 ))" +%Y-%m-%dT%H%MZ)"
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix daily/ --endpoint-url "$ENDPOINT" --query 'Contents[].Key' --output text \
  | tr '\t' '\n' | awk -v c="$cutoff" 'NF && $0 != "None" && $0 < c' \
  | while read -r old; do aws s3 rm "s3://$BUCKET/$old" --endpoint-url "$ENDPOINT" --only-show-errors && echo "pruned: $old"; done
