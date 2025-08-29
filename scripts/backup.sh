#!/bin/bash

# Payment Security Enhancement API Backup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="payment-api-backup-$TIMESTAMP"

echo -e "${GREEN}Starting backup process...${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup archive
echo -e "${YELLOW}Creating backup archive...${NC}"
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
    --exclude='node_modules' \
    --exclude='logs/*.log' \
    --exclude='.git' \
    --exclude='backups' \
    --exclude='*.tmp' \
    .

# Backup Redis data (if running)
if docker ps | grep -q payment-redis; then
    echo -e "${YELLOW}Backing up Redis data...${NC}"
    docker exec payment-redis redis-cli BGSAVE
    sleep 5
    docker cp payment-redis:/data/dump.rdb "$BACKUP_DIR/redis-$TIMESTAMP.rdb"
fi

# Backup logs
if [ -d "logs" ]; then
    echo -e "${YELLOW}Backing up logs...${NC}"
    tar -czf "$BACKUP_DIR/logs-$TIMESTAMP.tar.gz" logs/
fi

# Create backup manifest
echo -e "${YELLOW}Creating backup manifest...${NC}"
cat > "$BACKUP_DIR/$BACKUP_NAME.manifest" << EOF
Backup Information
==================
Timestamp: $(date)
Backup Name: $BACKUP_NAME
Environment: ${NODE_ENV:-development}

Files Included:
- Application code and configuration
- Environment files
- Docker configuration
- Documentation
- SSL certificates (if present)

Files Excluded:
- node_modules/
- .git/
- logs/*.log
- backups/
- *.tmp

Additional Backups:
- Redis data: redis-$TIMESTAMP.rdb (if available)
- Logs: logs-$TIMESTAMP.tar.gz (if available)

Restore Instructions:
1. Extract backup: tar -xzf $BACKUP_NAME.tar.gz
2. Install dependencies: npm install
3. Configure environment: cp .env.example .env (and edit)
4. Restore Redis data: docker cp redis-$TIMESTAMP.rdb container:/data/dump.rdb
5. Start services: ./scripts/deploy.sh
EOF

# Cleanup old backups (keep last 10)
echo -e "${YELLOW}Cleaning up old backups...${NC}"
cd "$BACKUP_DIR"
ls -t payment-api-backup-*.tar.gz | tail -n +11 | xargs -r rm
ls -t redis-*.rdb | tail -n +11 | xargs -r rm
ls -t logs-*.tar.gz | tail -n +11 | xargs -r rm
ls -t payment-api-backup-*.manifest | tail -n +11 | xargs -r rm
cd ..

# Display backup information
echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "${YELLOW}Backup Details:${NC}"
echo "Archive: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "Size: $(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)"
echo "Manifest: $BACKUP_DIR/$BACKUP_NAME.manifest"

if [ -f "$BACKUP_DIR/redis-$TIMESTAMP.rdb" ]; then
    echo "Redis backup: $BACKUP_DIR/redis-$TIMESTAMP.rdb"
fi

if [ -f "$BACKUP_DIR/logs-$TIMESTAMP.tar.gz" ]; then
    echo "Logs backup: $BACKUP_DIR/logs-$TIMESTAMP.tar.gz"
fi

echo -e "${YELLOW}Available backups:${NC}"
ls -la "$BACKUP_DIR"/payment-api-backup-*.tar.gz | tail -5