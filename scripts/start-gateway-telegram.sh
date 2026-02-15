#!/bin/bash
# Start a Telegram bot for a specific gateway
# Usage: start-gateway-telegram.sh <gateway-id> <gateway-slug>

GATEWAY_ID=$1
GATEWAY_SLUG=$2

if [ -z "$GATEWAY_ID" ] || [ -z "$GATEWAY_SLUG" ]; then
  echo "Usage: start-gateway-telegram.sh <gateway-id> <gateway-slug>"
  exit 1
fi

cd /root/clawd/projects/chimera-gateway/synapse

GATEWAY_ID="$GATEWAY_ID" pm2 start "npx tsx scripts/telegram-bot.ts" \
  --name "${GATEWAY_SLUG}-telegram" \
  --cwd /root/clawd/projects/chimera-gateway/synapse

echo "Started ${GATEWAY_SLUG}-telegram with GATEWAY_ID=${GATEWAY_ID}"
