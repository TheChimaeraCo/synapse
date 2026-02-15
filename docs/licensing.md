# Licensing

Synapse is source-available under the [Functional Source License (FSL)](https://fsl.software/). You can read, modify, and self-host the code. Commercial use requires a license.

## Tiers

| Tier | Price | Users | Use Case |
|------|-------|-------|----------|
| **Personal** | Free | Up to 5 | Personal projects, experimentation |
| **Team** | $29/mo | Up to 15 | Small teams, startups |
| **Business** | $79/mo | Up to 50 | Growing teams, multiple gateways |
| **Enterprise** | $199/mo | Unlimited | Organizations, custom support |

### What's Included

**Personal (Free)**
- All core features
- Web chat + 1 platform channel
- Up to 5 users per gateway
- Community support

**Team ($29/mo)**
- Everything in Personal
- Unlimited channels
- Up to 15 users per gateway
- Sub-agent system
- Priority tools (shell_exec, code_execute)
- Email support

**Business ($79/mo)**
- Everything in Team
- Up to 50 users per gateway
- Multiple gateways
- A2A cross-gateway messaging
- Self-modification tools (convex_deploy, create_tool)
- PM2 integration
- Priority support

**Enterprise ($199/mo)**
- Everything in Business
- Unlimited users
- Custom agent souls
- Advanced model routing
- Dedicated support channel
- License for multiple deployments

## Getting a License Key

1. Visit [chimaeraco.dev](https://chimaeraco.dev) (licensing portal coming soon)
2. Choose your tier
3. Enter your license key in Synapse under Settings > License
4. Features unlock immediately

For questions or custom arrangements, contact [licensing@chimaeraco.dev](mailto:licensing@chimaeraco.dev).

## How Validation Works

Synapse uses a lightweight phone-home system to validate licenses:

- On startup and periodically, Synapse checks the license key against our validation server
- The check sends only the license key and a deployment identifier - no user data, no conversation content, nothing personal
- If the server is unreachable, Synapse continues working with a grace period
- Invalid or expired keys gracefully downgrade to the Personal tier

### Self-Hosted Considerations

We understand that self-hosted deployments sometimes have restricted network access. If your environment can't reach the validation server:

- Contact us for an offline license key
- Enterprise tier includes offline validation options
- The grace period is generous enough to handle temporary network issues

## FAQ

**Can I use Synapse for free?**
Yes. The Personal tier is free for up to 5 users with no time limit.

**What happens if my license expires?**
Features gracefully downgrade to the Personal tier. No data is lost and conversations continue working.

**Can I switch tiers?**
Yes, upgrade or downgrade at any time. Changes take effect immediately.

**Do you offer annual pricing?**
Contact [licensing@chimaeraco.dev](mailto:licensing@chimaeraco.dev) for annual discounts.

---

Built by [The Chimaera Company LLC](https://chimaeraco.dev)
