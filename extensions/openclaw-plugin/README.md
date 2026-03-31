# @clawteams/openclaw-plugin

ClawTeams adapter plugin for OpenClaw. Sends lightweight hook events
to the ClawTeams backend for real-time agent status monitoring.

## What it does

Registers 5 hooks in OpenClaw to report events to ClawTeams:

| Hook | Event | Description |
|------|-------|-------------|
| `gateway_start` | `claw_online` | Lobster comes online |
| `gateway_stop` | `claw_offline` | Lobster goes offline |
| `agent_end` | `agent_execution` | Agent completes (success/failure, duration, token usage) |
| `subagent_spawned` | `subagent_spawned` | Subagent created for task delegation |
| `subagent_ended` | `subagent_ended` | Subagent finishes execution |

## Zero impact on OpenClaw

- All hooks are **fire-and-forget** (no await, no blocking)
- If ClawTeams server is unreachable, events are silently dropped
- Auto-reconnect with exponential backoff (1s base, 30s max)
- No buffering: if a message cannot be sent immediately, it is discarded

## Installation

Copy or symlink this directory into your OpenClaw extensions folder:

```bash
# From the ClawTeams repo root
cp -r extensions/openclaw-plugin /path/to/openclaw/extensions/
```

Or install as a local dependency:

```bash
cd /path/to/openclaw
npm install /path/to/clawteams/extensions/openclaw-plugin
```

Then build the plugin:

```bash
cd extensions/openclaw-plugin
npm install
npm run build
```

## Configuration

Add the following to your `openclaw.json` (or equivalent config):

```json
{
  "clawteams": {
    "serverUrl": "ws://localhost:3001/ws/hook",
    "clawId": "your-claw-id"
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `clawteams.serverUrl` | `ws://localhost:3001/ws/hook` | ClawTeams WebSocket endpoint |
| `clawteams.clawId` | `default-claw` | Unique identifier for this lobster instance |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Architecture

```
OpenClaw                        ClawTeams Backend
  |                                    |
  |-- gateway_start hook -->           |
  |     ClawTeamsClient.connect()      |
  |         ws://...  ---- claw_online --> WS Server (:3001)
  |                                    |
  |-- agent_end hook -->               |
  |     client.send(agent_execution)   |
  |         ws://...  ------msg------> |
  |                                    |
  |-- gateway_stop hook -->            |
  |     client.send(claw_offline)      |
  |     client.disconnect()            |
```
