import { Octokit } from '@octokit/rest';

export class GitHubService {
  private static instance: GitHubService;
  private octokit: Octokit;
  private cache: Map<string, any> = new Map();

  private constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || 'test_token',
    });
  }

  public static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public async getIssue(owner: string, repo: string, issue_number: number) {
    const cacheKey = `issue_${owner}_${repo}_${issue_number}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const response = await this.octokit.issues.get({ owner, repo, issue_number });
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  public async addCommentToIssue(owner: string, repo: string, issue_number: number, body: string) {
    const response = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
    return response.data;
  }

  public async createOrUpdateFile(owner: string, repo: string, path: string, message: string, content: string, branch: string, sha?: string) {
    const params: any = {
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (sha) {
        params.sha = sha;
    }
    const response = await this.octokit.repos.createOrUpdateFileContents(params);
    return response.data;
  }

  public async createBranch(owner: string, repo: string, branch: string, sha: string) {
    const response = await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });
    return response.data;
  }

  public async createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body: string) {
    const response = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
    });
    return response.data;
  }

  public async setActivePersona(owner: string, repo: string, issue_number: number, persona: string) {
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number,
      labels: [`persona:${persona}`],
    });
  }
}