import { execSync, execFileSync } from 'child_process';

export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getHeadHash(cwd: string = process.cwd()): string {
  return execSync('git rev-parse HEAD', { cwd, stdio: 'pipe' }).toString().trim();
}

export function resolveRef(ref: string, cwd: string = process.cwd()): string {
  return execFileSync('git', ['rev-parse', ref], { cwd, stdio: 'pipe' }).toString().trim();
}

export function getDiff(
  from: string,
  to: string = 'HEAD',
  cwd: string = process.cwd()
): string {
  try {
    return execFileSync('git', ['diff', `${from}..${to}`], {
      cwd,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch {
    return '';
  }
}

export function getCurrentBranch(cwd: string = process.cwd()): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe' }).toString().trim();
  } catch {
    return '';
  }
}

export function getDefaultBranch(cwd: string = process.cwd()): string {
  // Try to detect the default branch from the remote
  try {
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', { cwd, stdio: 'pipe' })
      .toString()
      .trim();
    return result.replace('refs/remotes/origin/', '');
  } catch {
    // Fall back to checking if main or master exists
    try {
      execSync('git rev-parse --verify main', { cwd, stdio: 'pipe' });
      return 'main';
    } catch {
      return 'master';
    }
  }
}

export function listTrackedFiles(cwd: string = process.cwd()): string[] {
  try {
    return execSync('git ls-files', { cwd, stdio: 'pipe' })
      .toString()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}
