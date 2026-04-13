import chalk from 'chalk';

export function checkApiKey(): void {
  if (process.env.OPENAI_API_KEY) return;

  console.error(chalk.red('\nError: OPENAI_API_KEY is not set.\n'));
  console.error(chalk.bold('Setup instructions:'));
  console.error('');
  console.error('  1. Get an API key from ' + chalk.cyan('https://platform.openai.com/api-keys'));
  console.error('');
  console.error('  2. Create a .env file in the root of the repo you want to track:');
  console.error(chalk.dim('       your-repo/'));
  console.error(chalk.dim('       └── .env'));
  console.error('');
  console.error('     With the contents:');
  console.error(chalk.green('       OPENAI_API_KEY=sk-...'));
  console.error('');
  console.error('  3. Make sure .env is in your .gitignore (never commit your key):');
  console.error(chalk.green('       echo ".env" >> .gitignore'));
  console.error('');
  console.error('  4. Run ' + chalk.bold('changelog init') + ' again from inside that repo.');
  console.error('');
  process.exit(1);
}
