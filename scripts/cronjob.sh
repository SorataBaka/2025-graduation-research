#!/bin/bash
set -e

CRON_SCHEDULE="0 2 * * *"
SCRIPT_PATH="/path/to/backup.sh"
CRON_COMMENT="# MongoDB Backup Cron Job"

# Safely get existing crontab or empty string if none
EXISTING_CRON=$(crontab -l 2>/dev/null || true)

# Avoid adding duplicate
if echo "$EXISTING_CRON" | grep -Fq "$CRON_COMMENT"; then
  echo "Cron job already exists. Skipping."
  exit 0
fi

# Add new cron job
(
  echo "$EXISTING_CRON"
  echo "$CRON_SCHEDULE $SCRIPT_PATH $CRON_COMMENT"
) | crontab -

echo "Cron job added successfully:"
crontab -l | grep "$CRON_COMMENT"
