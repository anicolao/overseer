import { GitHubService } from '../src/utils/github';
import nock from 'nock';

describe('GitHubService', () => {
  let githubService: GitHubService;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test_token';
    githubService = GitHubService.getInstance();
    githubService.clearCache();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should be a singleton', () => {
    const instance1 = GitHubService.getInstance();
    const instance2 = GitHubService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should fetch an issue and cache it without hardcoded prod mocks', async () => {
    const issueData = { number: 1, title: 'Test Issue' };
    
    nock('https://api.github.com')
      .get('/repos/owner/repo/issues/1')
      .reply(200, issueData);

    const issue1 = await githubService.getIssue('owner', 'repo', 1);
    expect(issue1).toEqual(issueData);

    // Second call should return cached data without hitting the API
    const issue2 = await githubService.getIssue('owner', 'repo', 1);
    expect(issue2).toEqual(issueData);
    
    expect(nock.isDone()).toBe(true);
  });

  it('should create a branch properly formatting the real Octokit payload', async () => {
    nock('https://api.github.com')
      .get('/repos/owner/repo/git/refs/heads/main')
      .reply(200, { object: { sha: '12345' } });

    nock('https://api.github.com')
      .post('/repos/owner/repo/git/refs', {
        ref: 'refs/heads/new-branch',
        sha: '12345'
      })
      .reply(201, { ref: 'refs/heads/new-branch' });

    const response = await githubService.createBranch('owner', 'repo', 'new-branch');
    expect(response.ref).toBe('refs/heads/new-branch');
  });
});