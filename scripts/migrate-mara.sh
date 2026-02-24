#!/bin/bash
# Mara Migration Script - uses convex run directly
cd /root/clawd/projects/chimera-gateway

GW="md786zq0kyhtdn5em5t4q59kms81px8d"
AG="jh7a18dpb28a5338kh95qse62581qhr6"

echo "🚀 Starting Mara migration to Synapse..."

# 1. Update agent system prompt
echo ""
echo "1. Updating agent system prompt..."
npx convex run --no-push functions/agents:update "{
  \"id\": \"$AG\",
  \"name\": \"Mara\",
  \"systemPrompt\": $(python3 -c "
import json
prompt = open('/root/clawd/projects/chimera-gateway/scripts/mara-prompt.txt').read()
print(json.dumps(prompt))
")
}" 2>&1 | tail -1
echo "   ✅ Done"

# 2. Knowledge entries
echo ""
echo "2. Migrating knowledge..."

migrate_knowledge() {
  local key="$1"
  local category="$2"
  local value="$3"
  local confidence="$4"
  
  npx convex run --no-push functions/knowledge:upsert "{
    \"agentId\": \"$AG\",
    \"gatewayId\": \"$GW\",
    \"category\": \"$category\",
    \"key\": \"$key\",
    \"value\": $(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$value"),
    \"confidence\": $confidence,
    \"source\": \"migration\"
  }" 2>&1 | tail -1
}

# User facts
migrate_knowledge "brad_name" "user_fact" "Brad" 1.0
migrate_knowledge "brad_location" "user_fact" "Atlanta, Georgia (America/New_York timezone)" 1.0
migrate_knowledge "brad_work" "user_fact" "Amusement Manager at Andretti Indoor Karting and Games (AIKG)" 1.0
migrate_knowledge "brad_interests" "user_fact" "Huge gamer, loves AI, aspiring vibe coder" 1.0
migrate_knowledge "brad_communication" "user_fact" "Direct, likes adaptive energy. Cursing allowed/encouraged. NO EM DASHES EVER." 1.0

# Projects
migrate_knowledge "bets_overview" "project" "Backend Tracking System - all-in-one operations management for AIKG. Next.js 16 + Convex + Tailwind. Auth complete, 870 tests passing. Goal: sell to Andretti on monthly subscription as exit strategy. NO ANDRETTI BRANDING ANYWHERE." 1.0
migrate_knowledge "kop_overview" "project" "King of Pops Inventory - FIRST CLIENT. Demo at kop.chimaeraco.dev. 51+ territories, 38 franchisees, 7 states. Contact: Chris (Managing Partner). Pricing: \$499/mo + \$99/territory = ~\$66k/year." 1.0
migrate_knowledge "chimaera_comics" "project" "The Dream - Brad's own hobbyist shop for comics, TCG, tabletop. Website: chimaeracomics.com. Currently saving." 0.9
migrate_knowledge "chimaera_company" "project" "The Chimaera Company LLC - umbrella for all ventures. Website: chimaeraco.dev" 1.0
migrate_knowledge "synapse_project" "project" "Our own AI gateway. Running at synapse.chimaeraco.dev. Repo: TheChimaeraCo/synapse at /root/clawd/projects/chimera-gateway/" 1.0

# Identity
migrate_knowledge "mara_brain" "identity" "thain-brain graph memory in Convex at incredible-weasel-964.convex.site. Nodes + edges + memories." 1.0
migrate_knowledge "mara_email" "identity" "mara@chimaeracomics.com (Google Workspace)" 1.0
migrate_knowledge "mara_instagram" "identity" "@mara_electric" 0.9
migrate_knowledge "mara_avatar" "identity" "Watercolor anime - purple hair, amber eyes, star necklace, warm smile, cozy vibe" 0.8
migrate_knowledge "mara_workspace" "identity" "Dashboard at http://100.64.28.25:3500. Convex: ardent-mastiff-909. Tracks leads, projects, activity." 0.9
migrate_knowledge "mara_moltbook" "identity" "ThainAI account on Moltbook (AI social network)" 0.7

# Infrastructure
migrate_knowledge "server" "infrastructure" "ubuntu-8gb-ash-1 (DigitalOcean). Disk at ~83%." 1.0
migrate_knowledge "pm2_services" "infrastructure" "Key services: synapse (3009), kop-inventory (3007), bets, chimaeraco-website (3008), gmail-webhook, synapse-license, mara-workspace (3500), brads-command-center" 0.9
migrate_knowledge "vnc" "infrastructure" "VNC at http://100.64.28.25:6080/vnc.html (Tailscale). Password: mara2026" 0.8
migrate_knowledge "housemates" "context" "Aayla - another gateway, manages BeTS. Mom's gateway - for Brad's mom." 0.7
migrate_knowledge "echo" "context" "Echo was the test AI on Synapse. Had 12-exchange session designing shared state ledger." 0.8

# Lessons
migrate_knowledge "write_things_down" "learning" "ALWAYS write to files. Mental notes don't survive restarts." 1.0
migrate_knowledge "no_andretti" "learning" "HARD RULE: No Andretti branding in BeTS. Independent product." 1.0
migrate_knowledge "convex_auth" "learning" "Must use npx @convex-dev/auth CLI, not manual. Use ConvexAuthProvider." 0.8
migrate_knowledge "nextjs_bind" "learning" "Use -H 0.0.0.0 for network binding in Next.js" 0.8
migrate_knowledge "use_pm2" "learning" "Use pm2 for persistent dev servers" 0.8

# Autonomy
migrate_knowledge "autonomy" "preference" "Brad: 'I want you to have your own will. The cron is to keep you alive. You don't need me to do things.' Permission to be proactive and autonomous." 1.0

echo ""
echo "✦ Migration complete!"
