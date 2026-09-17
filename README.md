# TokenLens — AI Usage & Cost Tracker

> **"See the true cost and impact of every AI model you use — in one place."**

TokenLens is a VS Code extension that tracks your AI spending, token usage, quota, and ROI across all major AI coding tools — all 100% locally, with no data leaving your machine.

## Features

### 🔍 9 Provider Support
| Provider | What's tracked |
|----------|---------------|
| **Claude** | Session/Weekly quota %, OAuth auto-refresh |
| **Cursor** | Plan usage $, billing reset date (SQLite) |
| **GitHub Copilot** | Chat, inline suggestion, premium quotas |
| **OpenAI Codex** | Session/Weekly usage % |
| **Windsurf** | Prompt & Flex credits |
| **Antigravity** | Gemini/Claude model quota groups |
| **Ollama** | Local model count, running models |
| **DeepSeek** | API balance, monthly spend |
| **Mistral** | Billing spend or Vibe plan % |

### 📊 Local Log Parsing
- Parses Claude Code, Codex CLI, and Grok session JSONL logs
- Per-session, per-model, per-provider token breakdown
- Trend chart (hourly or daily)

### 💰 Budget Alerts (Exclusive)
- Set a monthly budget (default: $20)
- Get notified at **75%**, **90%**, **95%** (Panic Mode), and **100%**
- Status bar color changes: green → yellow → orange → red

### 🚀 AI ROI Calculator (Exclusive)
- *"This month: $18 spent → ~34 hours saved → $1,700 equivalent"*
- Configurable hourly rate
- Per-session breakdown

### 🏆 Model Leaderboard (Exclusive)
- Ranks models by cost, tokens, and cost-per-session
- 🥇🥈🥉 medals for top 3

### 📤 One-Click Share Card (Exclusive)
- Export a beautiful PNG summary of your monthly stats
- Perfect for Twitter/X, LinkedIn

### 🔒 100% Local
- No API calls for your code or prompts
- All data stays on your machine
- Shield badge in Activity Bar

## Installation

1. Search for "TokenLens" in the VS Code Marketplace
2. Or install from VSIX: `code --install-extension tokenlens-0.1.0.vsix`

## Setup

### Claude
TokenLens auto-reads `~/.claude/.credentials.json` (Claude Code CLI). No setup needed if you use Claude Code.

### Cursor
TokenLens reads from Cursor's SQLite database automatically when Cursor is installed.

### GitHub Copilot
Uses VS Code's built-in GitHub authentication. No setup needed.

### OpenAI Codex
Auto-reads `~/.codex/auth.json`.

### DeepSeek
Set your API key: `TokenLens: Set DeepSeek API Key`

### Mistral
Set your admin cookie: `TokenLens: Set Mistral Admin Cookie`

## Commands

| Command | Description |
|---------|-------------|
| `TokenLens: Refresh All Providers` | Manually refresh all data |
| `TokenLens: Set Monthly Budget` | Configure budget alert threshold |
| `TokenLens: Set Hourly Rate for ROI` | Configure ROI calculation |
| `TokenLens: Detect Local Sources` | Auto-detect JSONL log paths |
| `TokenLens: Select Status Bar Provider` | Pin a provider to status bar |
| `TokenLens: Clear All Secrets` | Remove all stored credentials |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tokenlens.refreshInterval` | `5m` | Auto-refresh interval |
| `tokenlens.budget.monthly` | `20` | Monthly budget in USD |
| `tokenlens.roi.hourlyRate` | `35` | Hourly rate for ROI ($) |
| `tokenlens.display.currency` | `USD` | Display currency |
| `tokenlens.display.defaultRange` | `thisWeek` | Default time range |
| `tokenlens.display.statusBarStyle` | `blocks` | Status bar style (blocks/percent/minimal) |

## Privacy

TokenLens is **100% local**. It:
- ✅ Reads local credential files (OAuth tokens) already stored by AI tools
- ✅ Makes direct API calls to provider APIs (same as the AI tools themselves)
- ❌ Never sends your code, prompts, or usage data to any third party
- ❌ Has no telemetry or analytics

## Building from Source

```bash
git clone https://github.com/ta-shanto/tokenlens
cd TokenLens
npm install
npm run build
```

## License

MIT
