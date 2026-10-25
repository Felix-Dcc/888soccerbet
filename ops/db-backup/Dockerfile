# Nightly database backup job (Railway cron service "db-backup"). Same major version as the server.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /backup.sh
ENTRYPOINT ["sh", "/backup.sh"]
