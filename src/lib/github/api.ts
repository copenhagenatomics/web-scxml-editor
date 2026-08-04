import type { GithubUser } from '@/stores/github-store';
import { GithubApiError, type GithubRepoSummary, type GithubBranchSummary, type GithubFileContent } from './types';

const API_BASE = 'https://api.github.com';

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Throws a GithubApiError for any non-2xx response. Attempts to read GitHub's
 * own `message` field from the JSON error body, but never lets a parse
 * failure on that body (e.g. an empty or non-JSON response) crash the
 * error-handling path itself.
 */
async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return;

  let githubMessage: string | undefined;
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') {
      githubMessage = body.message;
    }
  } catch {
    // Response body wasn't parseable JSON (or was empty) - ignore and fall
    // back to a generic message below.
  }

  throw new GithubApiError(
    response.status,
    githubMessage || `GitHub API request failed with status ${response.status}`,
    githubMessage
  );
}

/**
 * Encodes a repo-relative file path for use in a contents API URL, escaping
 * each segment individually so slashes keep acting as path separators while
 * spaces/unicode/etc within a segment (e.g. a filename with a space) are
 * still safely encoded.
 */
function encodeRepoPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Encodes a string to base64, correctly handling multi-byte UTF-8 characters
 * (naive `btoa(content)` mangles anything outside Latin1).
 */
function encodeBase64Utf8(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string (GitHub's contents API returns base64 with
 * embedded newlines) back to a UTF-8 string, correctly handling multi-byte
 * characters (naive `atob(base64)` mangles anything outside Latin1).
 */
function decodeBase64Utf8(base64: string): string {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** GET /user - the currently authenticated user. */
export async function getAuthenticatedUser(token: string): Promise<GithubUser> {
  const response = await fetch(`${API_BASE}/user`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  await throwIfNotOk(response);
  const data = await response.json();
  return {
    login: data.login,
    avatarUrl: data.avatar_url,
  };
}

/**
 * GET /user/repos - repos the user owns, collaborates on, or belongs to via
 * an org. Only fetches the first page (100 repos, sorted by most recently
 * updated). Pagination is a known MVP limitation, not implemented here.
 */
export async function listUserRepos(token: string): Promise<GithubRepoSummary[]> {
  const url = `${API_BASE}/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member`;
  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(token),
  });
  await throwIfNotOk(response);
  const data = await response.json();
  return (data as unknown[]).map((item) => {
    const repo = item as {
      owner: { login: string };
      name: string;
      full_name: string;
      default_branch: string;
      private: boolean;
    };
    return {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private,
    };
  });
}

/** GET /repos/{owner}/{repo}/branches - branches for a repo. */
export async function listBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GithubBranchSummary[]> {
  const url = `${API_BASE}/repos/${owner}/${repo}/branches?per_page=100`;
  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(token),
  });
  await throwIfNotOk(response);
  const data = await response.json();
  return (data as unknown[]).map((item) => {
    const branch = item as { name: string };
    return { name: branch.name };
  });
}

/**
 * GET /repos/{owner}/{repo}/contents/{path} - a single file's decoded
 * content and blob sha. Returns null (rather than throwing) specifically on
 * a 404, since "file doesn't exist yet" is a normal, expected outcome the
 * UI needs to distinguish from a real error (to offer "create new file").
 * All other non-2xx statuses still throw GithubApiError.
 */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<GithubFileContent | null> {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(token),
  });

  if (response.status === 404) {
    return null;
  }

  await throwIfNotOk(response);
  const data = await response.json();
  return {
    content: decodeBase64Utf8(data.content),
    sha: data.sha,
  };
}

/**
 * PUT /repos/{owner}/{repo}/contents/{path} - creates a new file (when `sha`
 * is undefined) or updates an existing one (when `sha` is provided, the blob
 * sha of the file's current content on the target branch). Returns the new
 * blob sha.
 */
export async function createOrUpdateFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<string> {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`;

  const body: Record<string, string> = {
    message,
    content: encodeBase64Utf8(content),
    branch,
  };
  if (sha !== undefined) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response);
  const data = await response.json();
  return data.content.sha;
}

/** True only for a GithubApiError whose status is specifically 401 (expired/revoked token). */
export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof GithubApiError && err.status === 401;
}
