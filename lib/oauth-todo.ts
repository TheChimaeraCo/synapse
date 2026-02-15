/**
 * TODO: Full Anthropic OAuth / Setup Token Support
 *
 * Currently, setup tokens (sk-ant-oat01-*) are tested as regular API keys.
 * Full OAuth support would require the following:
 *
 * 1. TOKEN EXCHANGE
 *    - POST to https://console.anthropic.com/v1/oauth/token
 *    - Body: { grant_type: "setup_token", setup_token: "<token>" }
 *    - Returns: { access_token, refresh_token, expires_in }
 *
 * 2. BEARER AUTH vs X-API-KEY
 *    - Regular API keys use: x-api-key header
 *    - OAuth access tokens use: Authorization: Bearer <access_token>
 *    - The @mariozechner/pi-ai SDK currently only supports x-api-key for Anthropic
 *    - pi-ai would need an option to use Bearer auth instead
 *
 * 3. REFRESH TOKEN FLOW
 *    - Access tokens expire (typically ~1 hour)
 *    - Must store refresh_token securely and exchange before expiry
 *    - POST to same token endpoint with grant_type: "refresh_token"
 *    - Need background refresh or on-demand refresh on 401
 *
 * 4. PI-AI CHANGES NEEDED
 *    - Add auth_type option to Anthropic provider: "api_key" | "bearer"
 *    - When bearer, set Authorization header instead of x-api-key
 *    - Add anthropic-beta: oauth-2025-04-20 header for OAuth tokens
 *    - Optionally: built-in token refresh callback
 */

export {};
