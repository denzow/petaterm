import { simpleGit } from 'simple-git'
import { GitDiffFile, GitOverview, GitResult } from '../shared/ipc'
import { parseUnifiedDiff } from './diff-parser'

export class GitService {
  async overview(cwd: string): Promise<GitOverview> {
    const empty: GitOverview = { isRepo: false, currentBranch: '', branches: [], hasCommits: false }
    if (!cwd) return empty
    try {
      const git = simpleGit({ baseDir: cwd })
      if (!(await git.checkIsRepo())) return empty
      const branchInfo = await git.branchLocal()
      const hasCommits = branchInfo.all.length > 0 || (await this.headExists(cwd))
      return {
        isRepo: true,
        currentBranch: branchInfo.current,
        branches: branchInfo.all,
        hasCommits
      }
    } catch {
      return empty
    }
  }

  async checkout(cwd: string, branch: string): Promise<GitResult> {
    try {
      await simpleGit({ baseDir: cwd }).checkout(branch)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  async createBranch(cwd: string, branch: string): Promise<GitResult> {
    try {
      await simpleGit({ baseDir: cwd }).checkoutLocalBranch(branch)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  /** Working-tree diff (staged + unstaged) against HEAD. */
  async diff(cwd: string): Promise<GitDiffFile[]> {
    try {
      const git = simpleGit({ baseDir: cwd })
      const args = (await this.headExists(cwd)) ? ['HEAD'] : []
      const text = await git.diff(args)
      return parseUnifiedDiff(text)
    } catch {
      return []
    }
  }

  private async headExists(cwd: string): Promise<boolean> {
    try {
      await simpleGit({ baseDir: cwd }).revparse(['--verify', 'HEAD'])
      return true
    } catch {
      return false
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
