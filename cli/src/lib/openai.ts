import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set.\nExport it in your shell: export OPENAI_API_KEY=sk-...'
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

const MAX_RETRIES = 5;

// Active spinner reference — set by callers so rate-limit messages appear inline
let _activeSpinner: { text: string } | null = null;
export function setActiveSpinner(spinner: { text: string } | null) {
  _activeSpinner = spinner;
}

async function chatWithRetry(
  params: ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const originalText = _activeSpinner?.text ?? '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await getClient().chat.completions.create(params);
      if (_activeSpinner && originalText) _activeSpinner.text = originalText;
      return result;
    } catch (err: any) {
      if (err?.status === 429 && attempt < MAX_RETRIES - 1) {
        const retryMs = parseInt(err?.headers?.['retry-after-ms'], 10);
        const waitMs = retryMs > 0 ? retryMs : (attempt + 1) * 15_000;
        const waitSec = (waitMs / 1000).toFixed(0);
        if (_activeSpinner) {
          _activeSpinner.text = `${originalText}  Rate limited — retrying in ${waitSec}s...`;
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export async function mapFiles(
  files: Array<{ path: string; content: string }>
): Promise<string> {
  const fileContent = files
    .map((f) => `// ${f.path}\n${f.content}`)
    .join('\n\n---\n\n');

  const response = await chatWithRetry({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `You are analyzing part of a codebase. Here are some source files:
<files>
${fileContent}
</files>
Summarize what this part of the codebase does, what it is responsible for, and any notable patterns. Be concise.`,
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0].message.content ?? '';
}

export interface ReduceResult {
  projectContext: string;
  suggestedTags: string[];
}

export async function reduceToContext(summaries: string[]): Promise<ReduceResult> {
  const summaryText = summaries
    .map((s, i) => `Summary ${i + 1}:\n${s}`)
    .join('\n\n---\n\n');

  const response = await chatWithRetry({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `You are building a project context summary from partial analyses of a codebase.
Here are the partial summaries:
<summaries>
${summaryText}
</summaries>
Produce:
1. A concise project context summary (what this product is, who uses it, what its main features are)
2. A suggested list of changelog tags for this project. Rules:
   - Tags must describe changes that END USERS would care about (e.g. "New Feature", "Bug Fix", "Performance", "Security", "Gameplay", "Deprecated", "API", "UI / UX")
   - Do NOT include internal/developer-only concerns like "Testing", "Documentation", "Refactor", "CI/CD", "Dependencies"
   - Only suggest a tag if it represents a genuinely distinct, recurring category of user-facing change
   - Aim for 4–6 tags. Only exceed 6 if the project clearly has more distinct user-facing change categories
   - Prefer broad, meaningful tags over narrow or redundant ones
Return as JSON: { "projectContext": "...", "suggestedTags": [...] }`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  return JSON.parse(response.choices[0].message.content ?? '{}');
}

export interface ChangelogEntry {
  title: string;
  description: string;
  details: string;
  tags: string[];
}

export interface GenerateResult {
  entries: ChangelogEntry[];
  newTags: string[];
  chunkCount: number;
}

export const DIFF_LIMIT = 30_000;

const BLOCKED_TAGS = new Set(['documentation', 'docs', 'refactor', 'testing', 'ci/cd', 'dependencies']);

function filterBlockedTags(tags: string[]): string[] {
  return tags.filter((t) => !BLOCKED_TAGS.has(t.toLowerCase()));
}

export interface GenerateOptions {
  audience?: string;
  alwaysInclude?: string[];
  model?: string;
}

/**
 * Split a diff into chunks of at most `chunkSize` bytes, breaking only on
 * "diff --git" boundaries so we never cut in the middle of a file hunk.
 */
function splitDiff(diff: string, chunkSize: number): string[] {
  if (diff.length <= chunkSize) return [diff];

  const parts = diff.split(/(?=^diff --git )/m);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > chunkSize && current.length > 0) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildMapPrompt(
  projectContext: string,
  tags: string[],
  chunk: string,
  options: GenerateOptions
): string {
  const { audience, alwaysInclude = [] } = options;

  const audienceLine = audience
    ? `The intended readers of this changelog are: ${audience}.`
    : 'The intended readers are developers using this tool.';

  const alwaysIncludeSection = alwaysInclude.length
    ? `\nAdditional rules:\n${alwaysInclude.map((r) => `- ${r}`).join('\n')}\n`
    : '';

  return `You are writing public-facing changelog entries for a developer tool.

Project context:
<context>
${projectContext}
</context>

${audienceLine}

Available tags: ${tags.join(', ')}
${alwaysIncludeSection}
Here is a portion of the cumulative diff of all changes since the last changelog:
<diff>
${chunk}
</diff>

Write changelog entries targeted at external developers who integrate with this product (via its API, SDK, or CLI).

Each entry has two text fields:
- "description": A short, technical summary of WHAT changed. One to two sentences. Include specifics like endpoint paths, function names, flag names, or config keys. Think of this as the at-a-glance line.
- "details": A longer explanation (2-4 sentences) of WHY it matters, WHO should care, and WHETHER any action is required. Include migration steps for breaking changes.

When an entry involves any of the following, include the relevant technical detail in the description and/or details:
- API endpoints: include method and path (e.g. "PATCH /v1/users/:id")
- SDK method changes: include the old and new call signature or usage
- Request/response schema changes: name the added, removed, or renamed fields
- Auth changes: new headers, token formats, or required scopes
- Breaking changes: clearly label as breaking and describe the migration
- Deprecations: name what is deprecated, when it will be removed, and what replaces it
- Rate limit or quota changes: include the actual numbers
- Webhook payload changes: describe what changed in the payload structure
- New required parameters: name the parameter and where it goes

Do NOT include internal refactors, test changes, CI/CD changes, documentation changes, or dependency bumps unless they have a direct effect on integrators.
- Never use "Documentation" as a tag — documentation is internal, not user-facing
- Each entry should have ALL tags from the available list that apply to it (can be multiple)
- If an entry represents something genuinely novel that doesn't fit any existing tag, invent a concise new tag and include it in both the entry's tags array AND in the top-level "newTags" array
- If there are no user-facing changes in this portion, return an empty entries array
- Return as JSON: { "entries": [{ "title": "...", "description": "...", "details": "...", "tags": ["tag1", "tag2"] }], "newTags": [] }`;
}

async function mapDiffChunk(
  projectContext: string,
  tags: string[],
  chunk: string,
  options: GenerateOptions
): Promise<{ entries: ChangelogEntry[]; newTags: string[] }> {
  const { model = 'gpt-4o' } = options;

  const response = await chatWithRetry({
    model,
    messages: [{ role: 'user', content: buildMapPrompt(projectContext, tags, chunk, options) }],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });

  const result = JSON.parse(response.choices[0].message.content ?? '{"entries":[],"newTags":[]}');
  const entries = (result.entries ?? []).map((e: any) => ({ ...e, tags: filterBlockedTags(e.tags ?? []) }));
  return {
    entries,
    newTags: filterBlockedTags(result.newTags ?? []),
  };
}

async function reduceDiffResults(
  projectContext: string,
  tags: string[],
  allEntries: ChangelogEntry[],
  allNewTags: string[],
  options: GenerateOptions
): Promise<{ entries: ChangelogEntry[]; newTags: string[] }> {
  const { model = 'gpt-4o' } = options;
  const combinedTags = [...new Set([...tags, ...allNewTags])];

  const response = await chatWithRetry({
    model,
    messages: [
      {
        role: 'user',
        content: `You are consolidating changelog entries that were extracted from multiple diff chunks of the same release.

Project context:
<context>
${projectContext}
</context>

Available tags: ${combinedTags.join(', ')}

Here are all the raw entries (may contain duplicates or closely related items from different chunks):
<entries>
${JSON.stringify(allEntries, null, 2)}
</entries>

Merge duplicates and closely related entries into single entries. Remove anything that is purely internal or implementation-level (including documentation-only changes). Keep all distinct user-facing changes.
- Never use "Documentation" as a tag — documentation is internal, not user-facing
- "description" should be a short, technical one-to-two-sentence summary of WHAT changed
- "details" should be a longer 2-4 sentence explanation of WHY it matters and what action is needed
- Each entry should have ALL tags from the available list that apply to it (can be multiple)
- If a genuinely new tag is still needed, include it in "newTags"
- Return as JSON: { "entries": [{ "title": "...", "description": "...", "details": "...", "tags": ["tag1"] }], "newTags": [] }`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });

  const result = JSON.parse(response.choices[0].message.content ?? '{"entries":[],"newTags":[]}');
  const entries = (result.entries ?? []).map((e: any) => ({ ...e, tags: filterBlockedTags(e.tags ?? []) }));
  return {
    entries,
    newTags: filterBlockedTags(result.newTags ?? []),
  };
}

export async function generateChangelog(
  projectContext: string,
  tags: string[],
  diff: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const chunks = splitDiff(diff, DIFF_LIMIT);

  if (chunks.length === 1) {
    const result = await mapDiffChunk(projectContext, tags, chunks[0], options);
    return { ...result, chunkCount: 1 };
  }

  // Map: process all chunks in parallel
  const mapResults = await Promise.all(
    chunks.map((chunk) => mapDiffChunk(projectContext, tags, chunk, options))
  );

  const allEntries = mapResults.flatMap((r) => r.entries);
  const allNewTags = [...new Set(mapResults.flatMap((r) => r.newTags))];

  // Reduce: consolidate and dedup entries across chunks
  const reduced = await reduceDiffResults(projectContext, tags, allEntries, allNewTags, options);

  return { ...reduced, chunkCount: chunks.length };
}
