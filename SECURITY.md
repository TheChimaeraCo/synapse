# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Synapse, please report it responsibly:

**Email:** [contact@chimaeraco.dev](mailto:contact@chimaeraco.dev)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a fix or mitigation within 7 days for critical issues.

**Do not** open public GitHub issues for security vulnerabilities.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| 0.1.x   | Security fixes only |

## Security Features

Synapse includes several built-in security measures:

- **Authentication** - Auth.js v5 with secure session handling
- **Invite-only registration** - No open signups by default
- **Role-based access control** - Granular permissions per gateway
- **HMAC webhook signing** - Verified webhook delivery to external services
- **Rate limiting** - Per-user and per-endpoint rate limits
- **Circuit breakers** - Automatic failure isolation for external services
- **Prompt injection defense** - 10-layer defense system for AI interactions
- **Input validation** - Server-side validation on all API endpoints
- **Audit logging** - Track administrative actions and security events
- **CSRF protection** - Built into Next.js and Auth.js

## Best Practices for Self-Hosting

- Run behind a reverse proxy (nginx, Caddy) with TLS
- Keep `.env.local` out of version control
- Use strong, unique values for `AUTH_SECRET` and API keys
- Regularly update dependencies (`npm audit`)
- Monitor audit logs for suspicious activity
- Restrict network access to your Convex instance
