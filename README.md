# HookTunnel CLI

**Webhook infrastructure that never drops a request.**

Webhooks are the weakest link in every platform integration. HookTunnel fixes that — reliable ingress, full history, instant replay. For development and production.

```bash
npx hooktunnel-cli connect dev 3000
```

---

## The Problem

Webhooks are fire-and-forget. When they fail, you're blind.

```
Provider ──────────────────────────────────▶ Your Server
              If down, webhook lost forever       💀
```

**Every team hits these:**

| Failure Mode | What Happens |
|--------------|--------------|
| **Server down** | Webhook gone. Stripe retries 8x, GitHub gives you 1 shot. |
| **Handler bug** | You need the exact payload to debug. It's gone. |
| **URL changed** | Redeployed? New infra? Webhooks silently fail. |
| **No visibility** | Something broke. What was in that payload? Who knows. |
| **Can't replay** | Fixed the bug, but need to wait for a real event to test. |

**Traditional tools don't solve this:**

| Tool | Problem |
|------|---------|
| **ngrok** | URL changes on restart. Dev only. No history. |
| **localtunnel** | Unstable. No persistence. Dev only. |
| **RequestBin** | View-only. Can't forward or replay. |
| **Custom logging** | You built it. You maintain it. It's missing features. |

---

## The Solution

HookTunnel is infrastructure between providers and your servers.

```
              WITHOUT                              WITH HOOKTUNNEL

Provider ────────▶ Your Server        Provider ────▶ HookTunnel ────▶ Your Server
        (if down, lost)                            (always on)      (can be down)
                                                    ✓ Captured       ✓ Process later
                                                    ✓ Logged         ✓ Debug anytime
                                                    ✓ Replayable     ✓ Test fixes
                                                    ✓ Stable URL     ✓ Redeploy freely
```

**What you get:**

- **Stable URLs** — Configure once in Stripe/Twilio/GitHub. Never change again.
- **Never lose webhooks** — Captured even when your server is down.
- **Full history** — See every request. Search by content. Debug with context.
- **Instant replay** — Re-send any webhook to test your fix. No waiting.
- **Local forwarding** — Forward to localhost for development.

---

## Use Cases

### Development: Forward to Localhost

Test against real webhooks while building:

```bash
# Terminal 1: Your server
npm run dev

# Terminal 2: Forward webhooks to localhost
hooktunnel connect dev 3000
```

Every Stripe/Twilio webhook instantly hits your local machine.

### Production: Debug Incidents

2am. Payments are failing. What's in those webhooks?

```bash
# See what's hitting your webhook endpoint
hooktunnel logs abc123 --limit 50

# Find the problematic request
# Note the log ID of the 500 error

# After fixing, replay to verify
hooktunnel replay log_xyz123 --to https://your-server.com/webhook
```

### Recovery: Server Was Down

Your server crashed for 10 minutes. Providers sent webhooks. They're not lost.

```bash
# See what came in while you were down
hooktunnel logs abc123 --limit 100

# Everything is there
# Process them now, or replay to your recovered server
```

### AI-Assisted Debugging

Use with Claude Code for intelligent troubleshooting:

**Prompt:** *"Use hooktunnel to find recent webhook errors and explain what's wrong"*

```bash
# Claude runs:
hooktunnel logs abc123 --limit 20

# Analyzes the 500 errors
# Explains what payload caused failure
# Suggests fixes
```

**Prompt:** *"Replay the failed payment webhook and debug my handler"*

```bash
# Claude runs:
hooktunnel replay log_abc123 --to http://localhost:3000

# Shows the response
# Explains the error
# Helps you fix it
```

---

## Quick Start

### 1. Get Your Free Account

```bash
# Go to hooktunnel.com
# Sign up (or sign in with GitHub)
# Generate a webhook URL
```

### 2. Get Your API Key

```bash
# Go to hooktunnel.com/app/settings
# Generate an API key
```

### 3. Connect

```bash
# Install and login
npx hooktunnel-cli login --key ht_your_api_key

# Start forwarding to localhost:3000
npx hooktunnel-cli connect dev 3000
```

### 4. Configure Your Provider

Add your HookTunnel URL to Stripe/Twilio/GitHub webhook settings:

```
https://hooks.hooktunnel.com/h/your-hook-id
```

**Done.** Webhooks flow through HookTunnel to your server.

---

## Installation

```bash
# Use directly with npx (recommended)
npx hooktunnel-cli <command>

# Or install globally
npm install -g hooktunnel-cli
hooktunnel <command>
```

**Requirements:** Node.js 18+

---

## Commands

### `hooktunnel login`

Authenticate with your API key.

```bash
hooktunnel login --key ht_abc123...
# or omit --key to paste it at a hidden prompt
hooktunnel login
```

Get your API key from [hooktunnel.com/app/settings](https://hooktunnel.com/app/settings).
The key is verified against the HookTunnel control plane (`GET /api/keys/whoami`) and the
key's scopes are shown. If the server can't be reached, the key is still saved with a
warning and will be checked when you connect. (Using npx? Prefix commands with
`npx hooktunnel-cli` instead of `hooktunnel`.)

### `hooktunnel connect <env> <port>`

Forward webhooks to your local server.

```bash
# Basic usage
hooktunnel connect dev 3000

# Custom host
hooktunnel connect dev 3000 --host 127.0.0.1

# Verbose mode (shows all request details)
hooktunnel connect dev 3000 --verbose
```

**Output:**
```
🔗 HookTunnel
  Environment: dev
  Local port: 3000

✓ Connected to HookTunnel
  Session: abc12345...
  Forwarding to: http://localhost:3000

Waiting for webhooks... (Ctrl+C to stop)

[12:00:01] POST   /webhook    200  (45ms)
[12:00:05] POST   /webhook    500  (12ms)
```

**Environments:**
- `dev` - Development
- `staging` - Staging
- `prod` - Production

### `hooktunnel hooks`

List your webhook endpoints.

```bash
hooktunnel hooks
```

**Output:**
```
📌 Your Hooks (2)

  ID                      Provider    Status    Requests
  ------------------------------------------------------------
  abc123def456ghi789      stripe      active    142
  xyz789abc123def456      twilio      active    57

  Webhook URL: https://hooks.hooktunnel.com/h/<hook_id>
```

### `hooktunnel logs <hookId>`

View request history for a hook.

```bash
# Last 20 requests
hooktunnel logs abc123def456

# Last 100 requests
hooktunnel logs abc123def456 --limit 100
```

**Output:**
```
📋 Request Logs for abc123def456... (20)

  Time                Method  Path                          Status  Size
  ---------------------------------------------------------------------------
  1/11/2026 12:00:05  POST    /webhook                      200     1.2KB
  1/11/2026 11:58:32  POST    /webhook                      500     0.8KB

  Log ID (for replay): log_abc123...
```

### `hooktunnel replay <logId>` (Pro)

Re-send a captured webhook.

```bash
# Replay to connected tunnel
hooktunnel replay log_abc123

# Replay to specific URL (including production)
hooktunnel replay log_abc123 --to https://your-server.com/webhook
```

### `hooktunnel status`

Check your connection and account status.

```bash
hooktunnel status
```

### `hooktunnel logout`

Clear stored credentials.

```bash
hooktunnel logout
```

---

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Stripe/Twilio  │────▶│   HookTunnel     │────▶│  Your Server    │
│  GitHub/etc     │     │   (always on)    │     │  (or CLI)       │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Request History │
                        │  • Full payloads │
                        │  • Searchable    │
                        │  • Replayable    │
                        └──────────────────┘
```

1. **Provider sends webhook** to your stable HookTunnel URL
2. **HookTunnel captures and logs** — stored even if your server is down
3. **Request forwarded** to your server (or CLI for local dev)
4. **Full history available** — debug, search, replay anytime

The URL never changes. No webhook is ever lost.

---

## Pricing

| Feature | Free | Pro ($19/mo) |
|---------|:----:|:------------:|
| Webhook URLs | 1 | 10 |
| Requests/day | 100 | Unlimited |
| History | 24 hours | 30 days |
| CLI Access | ✓ | ✓ |
| Request Replay | - | ✓ |
| Payload Storage | - | ✓ |

**Start free:** [hooktunnel.com](https://hooktunnel.com)

---

## Configuration

Credentials stored in:
- **Linux:** `~/.config/hooktunnel-cli-nodejs/config.json`
- **macOS:** `~/Library/Preferences/hooktunnel-cli-nodejs/config.json`
- **Windows:** `%APPDATA%/hooktunnel-cli-nodejs/Config/config.json`

`hooktunnel status` prints the exact path. Set `HOOKTUNNEL_CONFIG_DIR` to use a different directory.
The API defaults to `https://app.hooktunnel.com`; configs still pointing at the old default
(`https://api.hooktunnel.com`) are migrated automatically.

---

## Troubleshooting

### "Authentication required"

```bash
hooktunnel login --key <your-api-key>
```

### "This API key was revoked" / "has expired" / "does not recognise this API key"

The server rejected your key. Generate a new one at
[hooktunnel.com/app/settings](https://hooktunnel.com/app/settings) and run `hooktunnel login` again.

### "Your API key lacks the ... scope"

The key is valid but missing a permission (e.g. `tunnel:connect` for `connect`, `hooks:read` for
`hooks`). Create a key with that scope.

### "HookTunnel's auth service is unavailable"

Server-side problem; your key is probably fine. `connect` retries automatically.

### "Could not reach HookTunnel"

1. Check internet connection
2. Try verbose mode: `hooktunnel connect dev 3000 --verbose`

### 502 errors in terminal

Your local server isn't responding:
1. Make sure it's running
2. Check the port number
3. Verify it's listening on localhost

### "Pro tier required"

Replay requires Pro. Upgrade at [hooktunnel.com/#pricing](https://hooktunnel.com/#pricing)

---

## Links

- **Website:** [hooktunnel.com](https://hooktunnel.com)
- **Dashboard:** [hooktunnel.com/app](https://hooktunnel.com/app)
- **Documentation:** [hulupeep.github.io/hooktunnel-help](https://hulupeep.github.io/hooktunnel-help)
- **Issues:** [github.com/Hulupeep/hooktunnel-cli/issues](https://github.com/Hulupeep/hooktunnel-cli/issues)

---

## License

MIT
