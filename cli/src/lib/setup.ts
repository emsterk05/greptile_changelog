import chalk from 'chalk';

export function checkApiKey(): void {
  if (process.env.OPENAI_API_KEY) return;

  console.error(chalk.red('\nError: OPENAI_API_KEY is not set.\n'));
  console.error(chalk.bold('Setup instructions:'));
  console.error('');
  console.error('  1. Get an API key from ' + chalk.cyan('https://platform.openai.com/api-keys'));
  console.error('');
  console.error('  2. Export it in your shell:');
  console.error(chalk.green('       export OPENAI_API_KEY=sk-...'));
  console.error('');
  console.error('     To make it permanent, add the line above to your shell profile');
  console.error('     (~/.bashrc, ~/.zshrc, etc.)');
  console.error('');
  console.error('  3. Run ' + chalk.bold('changelog init') + ' again from inside your repo.');
  console.error('');
  process.exit(1);
}
