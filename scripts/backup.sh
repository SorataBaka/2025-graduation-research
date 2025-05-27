#!/bin/bash
set -e

# Define directories
TEMP_DIR="/Users/$USER/Documents/temp"
BACKUP_DIR="/Users/$USER/Documents/drive-sync"

# Make sure directories exist
mkdir -p "$TEMP_DIR"
mkdir -p "$BACKUP_DIR"

# Timestamp format
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Backup path inside temp
BACKUP_PATH="$TEMP_DIR/mongo_backup_$TIMESTAMP"

# Dump MongoDB backup
mongodump --uri="mongodb://$MONGODB_USERNAME:$MONGODB_PASSWORD@localhost:27017" --out="$BACKUP_PATH"

# Compress the backup folder
tar -czvf "$TEMP_DIR/mongo_backup_$TIMESTAMP.tar.gz" -C "$TEMP_DIR" "mongo_backup_$TIMESTAMP"

# Remove the uncompressed backup folder to save space
rm -rf "$BACKUP_PATH"

# Move the compressed backup archive to the drive-sync folder
mv "$TEMP_DIR/mongo_backup_$TIMESTAMP.tar.gz" "$BACKUP_DIR/"

rm -rf $TEMP_DIR

echo "Backup complete: $BACKUP_DIR/mongo_backup_$TIMESTAMP.tar.gz"