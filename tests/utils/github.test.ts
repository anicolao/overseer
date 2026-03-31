import { GithubAPI } from '../../src/utils/github';
import nock from 'nock';

describe('GithubAPI', () => {
  let api: GithubAPI;

  beforeEach(() => {
    GithubAPI.resetInstance();
    api = GithubAPI.getInstance('dummy-token');
    api.clearCache();
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it('should maintain a singleton instance', () => {
    const api2 = GithubAPI.getInstance('another-token');
    expect(api).toBe(api2);
  });

  it('should fetch an issue from the GitHub API and cache the result', async () => {
    // Intercept the GitHub API call with nock
    const scope = nock('https://api.github.com')
      .get('/repos/test-owner/test-repo/issues/10')
      .reply(200, { id: 123, title: 'Nock Mocked Issue' });

    const issue1 = await api.getIssue('test-owner', 'test-repo', 10);
    expect(issue1.title).toBe('Nock Mocked Issue');
    expect(scope.isDone()).toBe(true); // Verifies the API was actually hit

    // Second call should return cached data without hitting the API again
    const issue2 = await api.getIssue('test-owner', 'test-repo', 10);
    expect(issue2.title).toBe('Nock Mocked Issue');
  });
  
  it('should hit the API again if a different issue is requested', async () => {
    nock('https://api.github.com')
      .get('/repos/test-owner/test-repo/issues/1')
      .reply(200, { id: 1, title: 'Issue 1' });

    nock('https://api.github.com')
      .get('/repos/test-owner/test-repo/issues/2')
      .reply(200, { id: 2, title: 'Issue 2' });

    const issue1 = await api.getIssue('test-owner', 'test-repo', 1);
    const issue2 = await api.getIssue('test-owner', 'test-repo', 2);
    
    expect(issue1.id).toBe(1);
    expect(issue2.id).toBe(2);
  });
});