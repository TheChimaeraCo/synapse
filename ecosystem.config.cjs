module.exports={
  "apps": [
    {
      "name": "synapse",
      "script": "node_modules/.bin/next",
      "args": "start -p 3009",
      "cwd": "/root/clawd/projects/chimera-gateway",
      "env": {
        "ANTHROPIC_API_KEY": "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",
        "AUTH_SECRET": "d0e76566a10bd232a7fec0dab34f70d7591d4eca774465e39c6bbf79c2527ebe",
        "AUTH_TRUST_HOST": "true",
        "AUTH_URL": "https://synapse.chimaeraco.dev",
        "CONVEX_SELF_HOSTED_ADMIN_KEY": "convex-self-hosted|010a3e7c8b0bb540a281ef03a35a6a10bc0e31ce3122d0c875a7d3707b2676bdb72d99b75b",
        "CONVEX_SELF_HOSTED_URL": "http://127.0.0.1:3220",
        "CONVEX_SITE_URL": "http://127.0.0.1:3221",
        "NEXTAUTH_SECRET": "d0e76566a10bd232a7fec0dab34f70d7591d4eca774465e39c6bbf79c2527ebe",
        "NEXTAUTH_URL": "https://synapse.chimaeraco.dev",
        "NEXT_PUBLIC_CONVEX_URL": "http://127.0.0.1:3220",
        "TELEGRAM_BOT_TOKEN": "8464630126:AAGizvoIp55_DSRL5-4JFObmyY9rn26jEeY"
      }
    }
  ]
}