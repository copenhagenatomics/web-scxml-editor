/**
 * Types for the GitHub REST API client (src/lib/github/api.ts).
 *
 * These are deliberately NOT 1:1 with GitHub's raw REST response shapes —
 * each type here is the flattened/renamed shape our UI actually consumes.
 * The api.ts functions are responsible for mapping GitHub's snake_case /
 * nested fields (e.g. `owner.login`, `full_name`, `default_branch`) onto
 * these shapes.
 */

/** Flattened shape for a repo, derived from GitHub's `GET /user/repos` items. */
export interface GithubRepoSummary {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/** We only need the branch name for a branch picker; GitHub returns more (commit sha, protection, etc). */
export interface GithubBranchSummary {
  name: string;
}

/** Decoded (not base64) file content plus the blob sha needed to update it later. */
export interface GithubFileContent {
  content: string;
  sha: string;
}

/**
 * Thrown for any non-2xx response from the GitHub REST API.
 * `status` is the HTTP status code; `githubMessage` is GitHub's own
 * `message` field from the error response body, when present and parseable.
 */
export class GithubApiError extends Error {
  status: number;
  githubMessage?: string;

  constructor(status: number, message: string, githubMessage?: string) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.githubMessage = githubMessage;
  }
}
