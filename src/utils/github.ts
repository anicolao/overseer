import { Octokit } from '@octokit/rest';

export class GitHubService {
  private static instance: GitHubService;
  private octokit: Octokit;
  private cache: Map<string, any>;

  private constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.cache = new Map();
  }

  public static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  public getOctokit(): Octokit {
      return this.octokit;
  }

  public async getIssue(owner: string, repo: string, issueNumber: number): Promise<any> {
    const cacheKey = `issue_${owner}_${repo}_${issueNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const response = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  public async createBranch(owner: string, repo: string, newBranch: string, baseBranch: string = 'main'): Promise<any> {
    const baseRef = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    const response = await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha: baseRef.data.object.sha,
    });
    return response.data;
  }

  public async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    content: string,
    branch: string,
    sha?: string
  ): Promise<any> {
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

  public async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body: string
  ): Promise<any> {
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

  public clearCache(): void {
    this.cache.clear();
  }
}

export const githubService = GitHubService.getInstance();