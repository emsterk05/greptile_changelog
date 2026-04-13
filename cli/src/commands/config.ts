import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { readConfig, writeConfig, configExists, getConfigPath } from '../lib/config';
import type { Config } from '../lib/config';

export async function configCommand(): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  const config = readConfig(cwd);
  await mainMenu(config, cwd);
}

// ─── Main menu ────────────────────────────────────────────────────────────────

async function mainMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.bold('Changelog configuration'),
        choices: [
          { name: 'Tag management', value: 'tags' },
          { name: 'Generation behavior', value: 'generation' },
          { name: 'Model', value: 'model' },
          { name: 'Display', value: 'display' },
          new inquirer.Separator(),
          { name: 'Edit raw config file', value: 'edit' },
          { name: 'Exit', value: 'exit' },
        ],
        pageSize: 10,
      },
    ]);

    if (choice === 'exit') break;
    if (choice === 'edit') { openRawEditor(cwd); break; }
    if (choice === 'tags') await tagMenu(config, cwd);
    else if (choice === 'generation') await generationMenu(config, cwd);
    else if (choice === 'model') await modelMenu(config, cwd);
    else if (choice === 'display') await displayMenu(config, cwd);
  }
}

// ─── Tag management ───────────────────────────────────────────────────────────

async function tagMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    console.log(chalk.dim(`Tags: ${config.tags.length ? config.tags.join(', ') : '(none)'}`));

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Tag management',
        choices: [
          { name: 'List tags', value: 'list' },
          { name: 'Add tag', value: 'add' },
          { name: 'Remove tag', value: 'remove' },
          { name: 'Rename tag', value: 'rename' },
          new inquirer.Separator(),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (choice === 'back') break;
    if (choice === 'list') listTags(config);
    else if (choice === 'add') await addTag(config, cwd);
    else if (choice === 'remove') await removeTag(config, cwd);
    else if (choice === 'rename') await renameTag(config, cwd);
  }
}

function listTags(config: Config): void {
  console.log();
  if (config.tags.length === 0) {
    console.log(chalk.dim('  (no tags defined)'));
  } else {
    config.tags.forEach((t, i) => console.log(`  ${chalk.cyan(String(i + 1) + '.')} ${t}`));
  }
}

async function addTag(config: Config, cwd: string): Promise<void> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'New tag name:',
      validate: (v: string) => v.trim() ? true : 'Tag name cannot be empty',
    },
  ]);
  const tag = name.trim();
  if (config.tags.includes(tag)) {
    console.log(chalk.yellow(`  Tag "${tag}" already exists.`));
    return;
  }
  config.tags.push(tag);
  writeConfig(config, cwd);
  console.log(chalk.green(`  ✓ Added "${tag}"`));
}

async function removeTag(config: Config, cwd: string): Promise<void> {
  if (config.tags.length === 0) {
    console.log(chalk.dim('  No tags to remove.'));
    return;
  }
  const { tag } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tag',
      message: 'Select tag to remove:',
      choices: [
        ...config.tags,
        new inquirer.Separator(),
        { name: '← Cancel', value: null },
      ],
    },
  ]);
  if (!tag) return;
  config.tags = config.tags.filter((t) => t !== tag);
  writeConfig(config, cwd);
  console.log(chalk.green(`  ✓ Removed "${tag}"`));
}

async function renameTag(config: Config, cwd: string): Promise<void> {
  if (config.tags.length === 0) {
    console.log(chalk.dim('  No tags to rename.'));
    return;
  }
  const { oldTag } = await inquirer.prompt([
    {
      type: 'list',
      name: 'oldTag',
      message: 'Select tag to rename:',
      choices: [
        ...config.tags,
        new inquirer.Separator(),
        { name: '← Cancel', value: null },
      ],
    },
  ]);
  if (!oldTag) return;

  const { newName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'newName',
      message: `Rename "${oldTag}" to:`,
      default: oldTag,
      validate: (v: string) => v.trim() ? true : 'Tag name cannot be empty',
    },
  ]);
  const newTag = newName.trim();
  if (newTag === oldTag) return;
  if (config.tags.includes(newTag)) {
    console.log(chalk.yellow(`  Tag "${newTag}" already exists.`));
    return;
  }
  config.tags = config.tags.map((t) => (t === oldTag ? newTag : t));
  writeConfig(config, cwd);
  console.log(chalk.green(`  ✓ Renamed "${oldTag}" → "${newTag}"`));
}

// ─── Generation behavior ──────────────────────────────────────────────────────

async function generationMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Generation behavior',
        choices: [
          { name: 'Always-include rules', value: 'alwaysInclude' },
          { name: 'Exclude patterns', value: 'exclude' },
          { name: 'Audience', value: 'audience' },
          new inquirer.Separator(),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (choice === 'back') break;
    if (choice === 'alwaysInclude') await alwaysIncludeMenu(config, cwd);
    else if (choice === 'exclude') await excludeMenu(config, cwd);
    else if (choice === 'audience') await editAudience(config, cwd);
  }
}

async function alwaysIncludeMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    if (config.alwaysInclude.length === 0) {
      console.log(chalk.dim('  No rules set.'));
    } else {
      config.alwaysInclude.forEach((r, i) => console.log(`  ${chalk.cyan(String(i + 1) + '.')} ${r}`));
    }
    console.log();

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Always-include rules',
        choices: [
          { name: 'Add rule', value: 'add' },
          ...(config.alwaysInclude.length ? [{ name: 'Remove rule', value: 'remove' }] : []),
          new inquirer.Separator(),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (choice === 'back') break;

    if (choice === 'add') {
      const { rule } = await inquirer.prompt([
        {
          type: 'input',
          name: 'rule',
          message: 'Rule (e.g. "Always include security-related changes even if minor"):',
          validate: (v: string) => v.trim() ? true : 'Rule cannot be empty',
        },
      ]);
      config.alwaysInclude.push(rule.trim());
      writeConfig(config, cwd);
      console.log(chalk.green('  ✓ Rule added'));
    } else if (choice === 'remove') {
      const { rule } = await inquirer.prompt([
        {
          type: 'list',
          name: 'rule',
          message: 'Remove which rule?',
          choices: [
            ...config.alwaysInclude,
            new inquirer.Separator(),
            { name: '← Cancel', value: null },
          ],
        },
      ]);
      if (!rule) continue;
      config.alwaysInclude = config.alwaysInclude.filter((r) => r !== rule);
      writeConfig(config, cwd);
      console.log(chalk.green('  ✓ Rule removed'));
    }
  }
}

async function excludeMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    if (config.excludePatterns.length === 0) {
      console.log(chalk.dim('  No exclude patterns set.'));
    } else {
      config.excludePatterns.forEach((p, i) =>
        console.log(`  ${chalk.cyan(String(i + 1) + '.')} ${p}`)
      );
    }
    console.log();

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Exclude patterns',
        choices: [
          { name: 'Add pattern', value: 'add' },
          ...(config.excludePatterns.length ? [{ name: 'Remove pattern', value: 'remove' }] : []),
          new inquirer.Separator(),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (choice === 'back') break;

    if (choice === 'add') {
      console.log(chalk.dim('  Examples: prisma/migrations/**, *.generated.ts, docs/**'));
      const { pattern } = await inquirer.prompt([
        {
          type: 'input',
          name: 'pattern',
          message: 'Pattern:',
          validate: (v: string) => v.trim() ? true : 'Pattern cannot be empty',
        },
      ]);
      config.excludePatterns.push(pattern.trim());
      writeConfig(config, cwd);
      console.log(chalk.green(`  ✓ Added "${pattern.trim()}"`));
    } else if (choice === 'remove') {
      const { pattern } = await inquirer.prompt([
        {
          type: 'list',
          name: 'pattern',
          message: 'Remove which pattern?',
          choices: [
            ...config.excludePatterns,
            new inquirer.Separator(),
            { name: '← Cancel', value: null },
          ],
        },
      ]);
      if (!pattern) continue;
      config.excludePatterns = config.excludePatterns.filter((p) => p !== pattern);
      writeConfig(config, cwd);
      console.log(chalk.green('  ✓ Pattern removed'));
    }
  }
}

async function editAudience(config: Config, cwd: string): Promise<void> {
  console.log();
  console.log(
    chalk.dim(
      `Current: ${config.audience || '(not set — defaults to "developers using this tool")'}`
    )
  );
  console.log(chalk.dim('  Examples: "backend engineers familiar with the codebase"'));
  console.log(chalk.dim('            "developers integrating this REST API"'));
  console.log();
  const { audience } = await inquirer.prompt([
    {
      type: 'input',
      name: 'audience',
      message: 'Who reads this changelog?',
      default: config.audience || undefined,
    },
  ]);
  config.audience = audience.trim();
  writeConfig(config, cwd);
  console.log(chalk.green('  ✓ Audience updated'));
}

// ─── Model ────────────────────────────────────────────────────────────────────

const KNOWN_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];

async function modelMenu(config: Config, cwd: string): Promise<void> {
  console.log();
  console.log(chalk.dim(`Current model: ${config.model || 'gpt-4o'}`));

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Select model:',
      choices: [
        ...KNOWN_MODELS.map((m) => ({
          name: m === (config.model || 'gpt-4o') ? `${m}  ${chalk.green('← current')}` : m,
          value: m,
        })),
        { name: 'Custom model ID...', value: '__custom__' },
        new inquirer.Separator(),
        { name: '← Cancel', value: null },
      ],
    },
  ]);

  if (!choice) return;

  let model = choice;
  if (choice === '__custom__') {
    const { custom } = await inquirer.prompt([
      {
        type: 'input',
        name: 'custom',
        message: 'Model ID:',
        default: config.model,
        validate: (v: string) => v.trim() ? true : 'Model ID cannot be empty',
      },
    ]);
    model = custom.trim();
  }

  config.model = model;
  writeConfig(config, cwd);
  console.log(chalk.green(`  ✓ Model set to "${model}"`));
}

// ─── Display ──────────────────────────────────────────────────────────────────

const DATE_FORMATS = [
  { name: '2024-01-15  (YYYY-MM-DD)', value: 'YYYY-MM-DD' },
  { name: 'January 15, 2024', value: 'MMMM DD, YYYY' },
  { name: 'Jan 15, 2024', value: 'MMM DD, YYYY' },
  { name: '15/01/2024  (DD/MM/YYYY)', value: 'DD/MM/YYYY' },
];

async function displayMenu(config: Config, cwd: string): Promise<void> {
  while (true) {
    console.log();
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Display settings',
        choices: [
          {
            name: `Project name   ${chalk.dim(config.projectName || '(not set)')}`,
            value: 'projectName',
          },
          {
            name: `Date format    ${chalk.dim(config.dateFormat || 'YYYY-MM-DD')}`,
            value: 'dateFormat',
          },
          new inquirer.Separator(),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);

    if (choice === 'back') break;

    if (choice === 'projectName') {
      const { name } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name (shown in website header):',
          default: config.projectName || undefined,
        },
      ]);
      config.projectName = name.trim();
      writeConfig(config, cwd);
      console.log(chalk.green('  ✓ Project name updated'));
    } else if (choice === 'dateFormat') {
      const { fmt } = await inquirer.prompt([
        {
          type: 'list',
          name: 'fmt',
          message: 'Date format:',
          choices: [
            ...DATE_FORMATS.map((f) => ({
              name:
                f.name +
                (f.value === (config.dateFormat || 'YYYY-MM-DD')
                  ? `  ${chalk.green('← current')}`
                  : ''),
              value: f.value,
            })),
            new inquirer.Separator(),
            { name: '← Cancel', value: null },
          ],
        },
      ]);
      if (!fmt) continue;
      config.dateFormat = fmt;
      writeConfig(config, cwd);
      console.log(chalk.green('  ✓ Date format updated'));
    }
  }
}

// ─── Raw editor ───────────────────────────────────────────────────────────────

function openRawEditor(cwd: string): void {
  const configPath = getConfigPath(cwd);
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  console.log(chalk.dim(`\nOpening ${configPath} in ${editor}...\n`));
  try {
    execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
  } catch {
    // editor exited non-zero (e.g. user quit vi with :q!) — not an error
    console.log(chalk.dim(`Config file: ${configPath}`));
  }
}
