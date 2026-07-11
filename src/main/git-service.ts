import { simpleGit } from 'simple-git'
import { GitDiffFile, GitLogEntry, GitOverview, GitResult } from '../shared/ipc'
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

  /** Recent commits, newest first, with the current HEAD marked. */
  async log(cwd: string, limit = 50): Promise<GitLogEntry[]> {
    try {
      if (!(await this.headExists(cwd))) return []
      const git = simpleGit({ baseDir: cwd })
      const head = (await git.revparse(['HEAD'])).trim()
      const log = await git.log({ maxCount: limit })
      return log.all.map((c) => ({
        hash: c.hash,
        shortHash: c.hash.slice(0, 7),
        subject: c.message,
        author: c.author_name,
        date: c.date,
        isHead: c.hash === head
      }))
    } catch {
      return []
    }
  }

  /** Stage everything and create a commit. */
  async commit(cwd: string, message: string): Promise<GitResult> {
    try {
      const git = simpleGit({ baseDir: cwd })
      await git.raw(['add', '-A'])
      await git.commit(message)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  /** Undo the latest commit, keeping its changes in the working tree. */
  async undoLastCommit(cwd: string): Promise<GitResult> {
    try {
      await simpleGit({ baseDir: cwd }).reset(['--mixed', 'HEAD~1'])
      return { ok: true }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  /** Create a new commit that undoes the given commit. */
  async revert(cwd: string, hash: string): Promise<GitResult> {
    const git = simpleGit({ baseDir: cwd })
    try {
      await git.raw(['revert', '--no-edit', hash])
      return { ok: true }
    } catch (e) {
      // A conflicting revert leaves the repo mid-revert; roll it back so the
      // working tree is never left in a stuck state.
      try {
        await git.raw(['revert', '--abort'])
      } catch {
        // nothing to abort
      }
      return { ok: false, error: `打ち消せませんでした: ${messageOf(e)}` }
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
