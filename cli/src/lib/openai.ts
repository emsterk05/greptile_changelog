import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set.\nAdd it to a .env file in this directory or export it in your shell.'
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export async function mapFiles(
  files: Array<{ path: string; content: string }>
): Promise<string> {
  const fileContent = files
    .map((f) => `// ${f.path}\n${f.content}`)
    .join('\n\n---\n\n');

  const response = await getClient().chat.completions.create({
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

  const response = await getClient().chat.completions.create({
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
2. A suggested list of 4-8 changelog tags relevant to this project (e.g. "New Feature", "Bug Fix", "Performance", "API", "Security")
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
  tags: string[];
}

export interface GenerateResult {
  entries: ChangelogEntry[];
  newTags: string[];
}

export const DIFF_LIMIT = 80_000;

export interface GenerateOptions {
  audience?: string;
  alwaysInclude?: string[];
  model?: string;
}

export async function generateChangelog(
  projectContext: string,
  tags: string[],
  diff: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { audience, alwaysInclude = [], model = 'gpt-4o' } = options;

  const audienceLine = audience
    ? `The intended readers of this changelog are: ${audience}.`
    : 'The intended readers are developers using this tool.';

  const alwaysIncludeSection = alwaysInclude.length
    ? `\nAdditional rules:\n${alwaysInclude.map((r) => `- ${r}`).join('\n')}\n`
    : '';

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: `You are writing a public-facing changelog for a developer tool.

Project context:
<context>
${projectContext}
</context>

${audienceLine}

Available tags: ${tags.join(', ')}
${alwaysIncludeSection}
Here is the cumulative diff of all changes since the last changelog:
<diff>
${diff.slice(0, DIFF_LIMIT)}
</diff>

Write changelog entries that describe changes from the perspective of an end user.
- Focus on what changed and why it matters, not implementation details
- Ignore internal refactors, test changes, and dependency bumps unless they affect the user
- Each entry should have ALL tags from the available list that apply to it (can be multiple)
- If an entry represents something genuinely novel that doesn't fit any existing tag, invent a concise new tag and include it in both the entry's tags array AND in the top-level "newTags" array
- If there are no user-facing changes, return an empty entries array
- Return as JSON: { "entries": [{ "title": "...", "description": "...", "tags": ["tag1", "tag2"] }], "newTags": [] }`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
  });

  const result = JSON.parse(response.choices[0].message.content ?? '{"entries":[],"newTags":[]}');
  return {
    entries: result.entries ?? [],
    newTags: result.newTags ?? [],
  };
}
