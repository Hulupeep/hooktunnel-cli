# HookTunnel CLI

**Stop losing webhooks. Start shipping faster.**

Forward webhooks from Stripe, Twilio, GitHub, and any provider directly to your localhost. No more broken tunnels, changing URLs, or missed events.

```bash
npx hooktunnel-cli connect dev 3000
```

---

## The Problem

You're building a payment flow. Stripe sends webhooks. But your local machine isn't on the internet.

**Traditional solutions fail you:**

| Approach | Problem |
|----------|---------|
| **ngrok** | URL changes every restart. You update Stripe, forget, webhooks go nowhere. |
| **localtunnel** | Unstable. Random disconnects. No history. |
| **Cloudflare Tunnel** | Complex setup. Overkill for development. |
| **RequestBin** | View-only. Can't forward to localhost. |

**You need:**
- A stable URL that never changes
- Real-time forwarding to localhost
- Full request history when things break
- One command to start working

---

## The Solution

HookTunnel gives you a permanent webhook URL. Configure it once in Stripe/Twilio/GitHub. Never change it again.

```
https://hooks.hooktunnel.com/h/abc123def456
         ↓
    Your localhost:3000
```

**What you get:**
- **Stable URLs** - Same URL forever, even across restarts
- **Request history** - See every webhook, even when you weren't connected
- **Instant replay** - Re-send any webhook to test your fix
- **Smart search** - Find webhooks by meaning ("payment failed")
- **Zero config** - One command, you're connected

---

## Quick Start

### 1. Get Your Free Account

```bash
# Go to hooktunnel.com
# Click "Generate Webhook URL"
# Copy your hook ID
```

No credit card. No signup form. Just click and go.

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

Paste your HookTunnel URL into Stripe/Twilio/GitHub webhook settings:

```
https://hooks.hooktunnel.com/h/your-hook-id
```

**Done.** Webhooks now forward to your localhost in real-time.

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
```

Get your API key from [hooktunnel.com/app/settings](https://hooktunnel.com/app/settings)

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

# Replay to specific URL
hooktunnel replay log_abc123 --to http://localhost:4000/webhook
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

## Use Cases

### Local Development

Test webhooks while building:

```bash
# Terminal 1: Your server
npm run dev

# Terminal 2: Forward webhooks
hooktunnel connect dev 3000
```

Every Stripe/Twilio webhook instantly hits your localhost.

### Debug Failed Webhooks

Something broke in production. Find out what:

```bash
# See what happened
hooktunnel logs abc123 --limit 50

# Find the failed request, note the log ID

# Fix your code

# Replay to verify the fix
hooktunnel replay log_xyz123
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

### Team Development

Multiple developers, same webhook:

```bash
# Developer 1 (building the handler)
hooktunnel connect dev 3000

# Developer 2 (reviewing what's coming in)
hooktunnel logs abc123 --limit 10
```

### CI/CD Testing

Validate webhooks in your pipeline:

```bash
#!/bin/bash
npm start &
hooktunnel connect dev 3000 &
sleep 5
npm run test:webhooks
```

---

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Stripe/Twilio  │────▶│   HookTunnel     │────▶│   CLI Client    │
│                 │     │   Cloud          │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │                 │
                                                 │  localhost:3000 │
                                                 │                 │
                                                 └─────────────────┘
```

1. **Provider sends webhook** to your stable HookTunnel URL
2. **HookTunnel receives and logs** the request (stored for 24h-30d based on plan)
3. **CLI receives via WebSocket** in real-time
4. **CLI forwards to localhost** and returns the response
5. **You see the result** in your terminal

The URL never changes. Your localhost gets every webhook instantly.

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
- **Linux/macOS:** `~/.config/hooktunnel-cli/config.json`
- **Windows:** `%APPDATA%/hooktunnel-cli/config.json`

---

## Troubleshooting

### "Authentication required"

```bash
hooktunnel login --key <your-api-key>
```

### "Connection failed"

1. Check internet connection
2. Verify API key: `hooktunnel status`
3. Try verbose mode: `hooktunnel connect dev 3000 --verbose`

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
