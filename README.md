# AI Changelog Generator

An AI-powered CLI tool that reads your git history and automatically generates a public-facing changelog for your project. It uses the code diff (not commit messages) to write clear, user-friendly changelog entries via GPT-4o. It also hosts a local website to display your changelog.

## How It Works

1. Run `changelog init` inside any git repo — the tool scans your codebase, builds a project context using AI, and sets up the changelog directory.
2. Run `changelog generate` after you've made changes — it diffs your commits and writes changelog entries describing what changed from a user's perspective.
3. Run `changelog serve` to view your changelog in a local website — designed for external developers who integrate with your APIs or SDKs, so they can see what changed and whether they need to update their code.

## Setup

### 1. Clone this repo and install the CLI

```bash
git clone <this-repo-url>
cd greptile_changelog/cli
npm install
npm run build
npm install -g .
```

### 2. Add your OpenAI API key

The CLI reads your key from a `.env` file. In the `cli/` directory:

```bash
cp .env.example .env
```

Open `.env` and fill in your key:

```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run it in your project

Navigate to **any git repo** you want to generate a changelog for, then run:

```bash
changelog init
```

This will scan your codebase, use AI to understand your project, and prompt you to enter a product or company name (used as the title on the changelog website). It then creates a `.changelog/` directory with your project context and a suggested list of tags. It walks you through everything — no config needed upfront.

## Commands

| Command | Description |
|---|---|
| `changelog init` | Set up changelog in the current git repo |
| `changelog generate` | Generate entries from commits since last run |
| `changelog generate --from <ref> --to <ref>` | Generate entries for a specific commit range |
| `changelog config` | Edit preferences interactively |
| `changelog refresh` | Re-scan codebase to update project context |
| `changelog history` | Show entries from the last generate run |
| `changelog history -n 5` | Show entries from the last 5 generate runs |
| `changelog serve` | Start local website at `http://localhost:3000` |

## Tags

Each changelog entry is automatically assigned **all relevant tags** from your configured tag list — not just one. If the AI identifies a change that doesn't fit any existing tag, it creates a new tag and adds it to your config automatically.

Tags are filterable on the local website, letting readers browse by category.

## Configuration

Run `changelog config` to open an interactive menu:

### Tag management
- **List** all current tags
- **Add** a new tag
- **Remove** a tag
- **Rename** a tag

### Generation behavior
- **Always-include rules** — plain-English rules injected into the AI prompt, e.g. *"Always include security-related changes even if minor"*
- **Exclude patterns** — glob patterns for files to strip from the diff before sending to the AI, e.g. `prisma/migrations/**`, `*.generated.ts`, `docs/**`. Useful for auto-generated files or directories that never produce user-facing changes.
- **Audience** — describes who reads the changelog, e.g. *"backend engineers integrating this API"*. Shapes the writing style and technical depth of generated entries. Defaults to external developers using the product's API or SDK.

### Model
Override the OpenAI model used for generation. Options: `gpt-4o` (default), `gpt-4o-mini`, `gpt-4-turbo`, or any custom model ID.

### Display
- **Project name** — shown in the website header
- **Date format** — how dates appear in `CHANGELOG.md`

### Edit raw config file
Opens `.changelog/config.json` directly in your `$EDITOR`.

## Large Diffs

If the diff for a generate run exceeds 80KB, it is automatically split into chunks at file boundaries and processed in parallel. Results from all chunks are merged into a single set of changelog entries. Use `--from`/`--to` to narrow the range if you want to reduce the number of chunks.

## What Gets Created in Your Repo

```
your-repo/
├── .changelog/
│   ├── config.json     # project context, tags, preferences, scanned files
│   └── state.db        # tracks last generated commit
├── changelogs/         # one JSON file per generate run
│   └── 2024-01-15.json
└── CHANGELOG.md        # human-readable changelog, always kept in sync
```

## Requirements

- Node.js 18+
- An OpenAI API key (GPT-4o access)
- A git repo with at least one commit
