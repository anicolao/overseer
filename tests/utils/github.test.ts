import { GitHubService } from '../../src/utils/github';

// Mock Octokit comprehensively
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => {
      return {
        issues: {
          get: jest.fn().mockResolvedValue({ data: { id: 1, title: 'Test Issue' } }),
          createComment: jest.fn().mockResolvedValue({ data: { id: 2 } }),
          addLabels: jest.fn().mockResolvedValue({ data: [{ name: 'persona:developer-tester' }] }),
        },
        repos: {
            createOrUpdateFileContents: jest.fn().mockResolvedValue({ data: { content: { name: 'file.ts' } } })
        },
        git: {
            createRef: jest.fn().mockResolvedValue({ data: { ref: 'refs/heads/new-branch' } })
        },
        pulls: {
            create: jest.fn().mockResolvedValue({ data: { id: 3, number: 1 } })
        }
      };
    }),
  };
});

describe('GitHubService', () => {
  let githubService: GitHubService;

  beforeEach(() => {
    githubService = GitHubService.getInstance();
    githubService.clearCache();
  });

  it('should be a singleton', () => {
    const instance1 = GitHubService.getInstance();
    const instance2 = GitHubService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should get an issue and cache it', async () => {
    const issue1 = await githubService.getIssue('owner', 'repo', 1);
    expect(issue1).toEqual({ id: 1, title: 'Test Issue' });

    const issue2 = await githubService.getIssue('owner', 'repo', 1);
    expect(issue2).toEqual({ id: 1, title: 'Test Issue' });
  });

  it('should add a comment to an issue', async () => {
    const response = await githubService.addCommentToIssue('owner', 'repo', 1, 'test comment');
    expect(response).toEqual({ id: 2 });
  });

  it('should create or update a file', async () => {
    const response = await githubService.createOrUpdateFile('owner', 'repo', 'path/to/file.ts', 'commit message', 'content', 'branch');
    expect(response).toEqual({ content: { name: 'file.ts' } });
  });

  it('should create a branch', async () => {
    const response = await githubService.createBranch('owner', 'repo', 'new-branch', 'sha-hash');
    expect(response).toEqual({ ref: 'refs/heads/new-branch' });
  });

  it('should create a pull request', async () => {
    const response = await githubService.createPullRequest('owner', 'repo', 'PR Title', 'new-branch', 'main', 'PR body');
    expect(response).toEqual({ id: 3, number: 1 });
  });

  it('should set an active persona', async () => {
    await expect(githubService.setActivePersona('owner', 'repo', 1, 'planner')).resolves.toBeUndefined();
  });
});