FROM alpine:latest

# Install Postfres client & cron
RUN apk add --no-cache postgresql-client bash curl tzdata

# Copy scripts
COPY backup.sh /backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /backup.sh

# Create directories for env + backup
RUN mkdir -p /env /backups /var/log

# Start cron in foreground
CMD ["crond", "-f", "-L", "8"]