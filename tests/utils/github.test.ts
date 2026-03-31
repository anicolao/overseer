import { GitHubService } from '../../src/utils/github';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@octokit/rest', () => {
  const mOctokit = {
    issues: {
      get: jest.fn().mockResolvedValue({ data: { labels: [{ name: 'bug' }, { name: 'persona:Planner' }] } }),
      createComment: jest.fn().mockResolvedValue({ data: { id: 1 } }),
      listComments: jest.fn().mockResolvedValue({ data: [{ body: 'First comment' }] }),
      addLabels: jest.fn().mockResolvedValue({ data: {} }),
      removeLabel: jest.fn().mockResolvedValue({ data: {} }),
    }
  };
  return { Octokit: jest.fn(() => mOctokit) };
});

describe('GitHubService Implementation', () => {
  let githubService: GitHubService;

  beforeEach(() => {
    githubService = GitHubService.getInstance();
    githubService.clearCache();
    process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
  });

  it('should be structured as a functional singleton', () => {
    const instance1 = GitHubService.getInstance();
    const instance2 = GitHubService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should cache and retrieve sequential getIssue calls correctly', async () => {
    const issue1 = await githubService.getIssue(42);
    const issue2 = await githubService.getIssue(42);
    expect(issue1.labels).toBeDefined();
    expect(issue2).toEqual(issue1);
  });

  it('should properly proxy adding a comment to an issue', async () => {
    const response = await githubService.addCommentToIssue(42, 'Hello from tests');
    expect(response.id).toEqual(1);
  });

  it('should fetch associated issue labels', async () => {
    const labels = await githubService.getIssueLabels(42);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('should securely replace the active persona state', async () => {
    await expect(githubService.setActivePersona(42, 'DeveloperTester')).resolves.not.toThrow();
  });

  it('should retrieve full contextual issue context including comments', async () => {
    const context = await githubService.getFullIssueContext(42);
    expect(context.issue).toBeDefined();
    expect(context.comments.length).toBeGreaterThan(0);
  });

  it('should read the target file system directory recursively', async () => {
    const testDir = path.join(__dirname, 'temp_test_dir');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    const testFile = path.join(testDir, 'test_mock.txt');
    fs.writeFileSync(testFile, 'dummy content');

    const files = await githubService.getFilesRecursive(testDir);
    expect(files).toContain(testFile);

    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
  });
});