import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAuthenticatedUser,
  listInstalledRepos,
  listBranches,
  getFileContent,
  createOrUpdateFile,
  isUnauthorizedError,
} from './api';
import { GithubApiError } from './types';

function mockResponse(status: number, body: unknown): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A response whose body is not parseable JSON, to exercise the error-parsing fallback. */
function mockUnparsableResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  } as unknown as Response;
}

const TOKEN = 'gho_faketoken123';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAuthenticatedUser', () => {
  it('GETs /user with correct headers and maps the response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, { login: 'octocat', avatar_url: 'https://example.com/a.png', id: 1 })
    );

    const user = await getAuthenticatedUser(TOKEN);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    expect(user).toEqual({ login: 'octocat', avatarUrl: 'https://example.com/a.png' });
  });

  it('throws GithubApiError with the response status on a non-2xx response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(401, { message: 'Bad credentials' })
    );

    await expect(getAuthenticatedUser(TOKEN)).rejects.toMatchObject({
      status: 401,
      githubMessage: 'Bad credentials',
    });
    await expect(getAuthenticatedUser(TOKEN)).rejects.toBeInstanceOf(GithubApiError);
  });

  it('does not crash and still throws GithubApiError when the error body is not parseable JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockUnparsableResponse(500));

    let caught: unknown;
    try {
      await getAuthenticatedUser(TOKEN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GithubApiError);
    expect((caught as GithubApiError).status).toBe(500);
    expect((caught as GithubApiError).githubMessage).toBeUndefined();
  });
});

describe('listInstalledRepos', () => {
  it('GETs /user/installations, then /user/installations/{id}/repositories per installation, merging into GithubRepoSummary[]', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(200, { installations: [{ id: 111 }, { id: 222 }] }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          repositories: [
            {
              owner: { login: 'octocat' },
              name: 'hello-world',
              full_name: 'octocat/hello-world',
              default_branch: 'main',
              private: false,
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          repositories: [
            {
              owner: { login: 'octocat-org' },
              name: 'secret-repo',
              full_name: 'octocat-org/secret-repo',
              default_branch: 'master',
              private: true,
            },
          ],
        })
      );

    const result = await listInstalledRepos(TOKEN);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('https://api.github.com/user/installations?per_page=100');
    expect(calls[1][0]).toBe('https://api.github.com/user/installations/111/repositories?per_page=100');
    expect(calls[2][0]).toBe('https://api.github.com/user/installations/222/repositories?per_page=100');

    expect(result).toEqual({
      hasInstallation: true,
      repos: [
        { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', defaultBranch: 'main', private: false },
        { owner: 'octocat-org', name: 'secret-repo', fullName: 'octocat-org/secret-repo', defaultBranch: 'master', private: true },
      ],
    });
  });

  it('returns hasInstallation: false and an empty repo list when the user has not installed the app anywhere', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(200, { installations: [] }));

    const result = await listInstalledRepos(TOKEN);

    expect(result).toEqual({ hasInstallation: false, repos: [] });
  });

  it('throws GithubApiError on a non-2xx /user/installations response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(401, { message: 'Bad credentials' }));

    await expect(listInstalledRepos(TOKEN)).rejects.toMatchObject({ status: 401 });
  });
});

describe('listBranches', () => {
  it('GETs /repos/{owner}/{repo}/branches with per_page=100 and maps to {name}', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, [
        { name: 'main', commit: { sha: 'abc' } },
        { name: 'dev', commit: { sha: 'def' } },
      ])
    );

    const branches = await listBranches(TOKEN, 'octocat', 'hello-world');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/octocat/hello-world/branches?per_page=100');
    expect(branches).toEqual([{ name: 'main' }, { name: 'dev' }]);
  });
});

describe('getFileContent', () => {
  it('GETs contents with the ref query param and decodes base64 content', async () => {
    const original = 'Hello, world!';
    const base64 = Buffer.from(original, 'utf-8').toString('base64');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, { content: base64, sha: 'blobsha123', encoding: 'base64' })
    );

    const result = await getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'flows/main.scxml');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(
      'https://api.github.com/repos/octocat/hello-world/contents/flows/main.scxml?ref=main'
    );
    expect(result).toEqual({ content: original, sha: 'blobsha123' });
  });

  it('strips embedded newlines from the base64 payload before decoding', async () => {
    const original = 'line one\nline two\nline three';
    const rawBase64 = Buffer.from(original, 'utf-8').toString('base64');
    // GitHub wraps base64 content with embedded newlines every ~60 chars.
    const wrapped = rawBase64.match(/.{1,20}/g)!.join('\n');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, { content: wrapped, sha: 'blobsha456' })
    );

    const result = await getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'file.txt');
    expect(result?.content).toBe(original);
  });

  it('encodes each path segment (e.g. a space in a filename) while preserving slashes as separators', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, { content: Buffer.from('x', 'utf-8').toString('base64'), sha: 's' })
    );

    await getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'flows/my file.scxml');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(
      'https://api.github.com/repos/octocat/hello-world/contents/flows/my%20file.scxml?ref=main'
    );
  });

  it('returns null (not throwing) on a 404', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(404, { message: 'Not Found' }));

    const result = await getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'missing.scxml');
    expect(result).toBeNull();
  });

  it('still throws GithubApiError for a 500 on the same endpoint', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(500, { message: 'Internal Server Error' })
    );

    await expect(
      getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'file.scxml')
    ).rejects.toMatchObject({ status: 500 });
  });

  it('still throws GithubApiError for a 403 on the same endpoint', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(403, { message: 'Forbidden' })
    );

    await expect(
      getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'file.scxml')
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('createOrUpdateFile', () => {
  it('PUTs contents with method/headers and omits sha from the body when creating a new file', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(201, { content: { sha: 'newsha001' } })
    );

    const newSha = await createOrUpdateFile(
      TOKEN,
      'octocat',
      'hello-world',
      'main',
      'flows/new.scxml',
      '<scxml/>',
      'Create new.scxml via SCXML Editor'
    );

    expect(newSha).toBe('newsha001');

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/octocat/hello-world/contents/flows/new.scxml');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    const body = JSON.parse(init.body);
    expect(body).toEqual({
      message: 'Create new.scxml via SCXML Editor',
      content: Buffer.from('<scxml/>', 'utf-8').toString('base64'),
      branch: 'main',
    });
    expect(body).not.toHaveProperty('sha');
  });

  it('includes sha in the body when updating an existing file', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(200, { content: { sha: 'newsha002' } })
    );

    await createOrUpdateFile(
      TOKEN,
      'octocat',
      'hello-world',
      'main',
      'flows/existing.scxml',
      '<scxml/>',
      'Update existing.scxml via SCXML Editor',
      'oldsha999'
    );

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      message: 'Update existing.scxml via SCXML Editor',
      content: Buffer.from('<scxml/>', 'utf-8').toString('base64'),
      branch: 'main',
      sha: 'oldsha999',
    });
  });

  it('throws GithubApiError on a non-2xx response (e.g. sha conflict)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(409, { message: 'sha does not match' })
    );

    await expect(
      createOrUpdateFile(TOKEN, 'octocat', 'hello-world', 'main', 'f.scxml', 'x', 'msg', 'stale-sha')
    ).rejects.toMatchObject({ status: 409, githubMessage: 'sha does not match' });
  });
});

describe('isUnauthorizedError', () => {
  it('returns true for a GithubApiError with status 401', () => {
    expect(isUnauthorizedError(new GithubApiError(401, 'Bad credentials'))).toBe(true);
  });

  it('returns false for a GithubApiError with a different status', () => {
    expect(isUnauthorizedError(new GithubApiError(404, 'Not Found'))).toBe(false);
    expect(isUnauthorizedError(new GithubApiError(500, 'Server Error'))).toBe(false);
  });

  it('returns false for a plain Error', () => {
    expect(isUnauthorizedError(new Error('some other failure'))).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isUnauthorizedError('401')).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });
});

describe('base64 UTF-8 round-trip correctness', () => {
  it('round-trips non-ASCII content (emoji + accented characters) through createOrUpdateFile -> getFileContent unmangled', async () => {
    // This is the case a naive btoa(content)/atob(base64) implementation
    // mangles: btoa throws (or silently corrupts, depending on engine) on
    // characters outside Latin1, and multi-byte UTF-8 sequences get split
    // incorrectly without an explicit TextEncoder/TextDecoder step.
    const original = 'État: 🚀 déjà-vu — café, naïve, façade';

    let capturedBase64: string | undefined;
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      capturedBase64 = body.content;
      return mockResponse(201, { content: { sha: 'roundtrip-sha' } });
    });

    await createOrUpdateFile(TOKEN, 'octocat', 'hello-world', 'main', 'unicode.scxml', original, 'msg');

    expect(capturedBase64).toBeDefined();
    // Cross-check against Node's own UTF-8-correct base64 encoding.
    expect(capturedBase64).toBe(Buffer.from(original, 'utf-8').toString('base64'));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, { content: capturedBase64, sha: 'roundtrip-sha' })
    );

    const result = await getFileContent(TOKEN, 'octocat', 'hello-world', 'main', 'unicode.scxml');
    expect(result?.content).toBe(original);
  });
});
