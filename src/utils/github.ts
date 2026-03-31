import { Octokit } from '@octokit/rest';

export class GithubAPI {
  private static instance: GithubAPI;
  public octokit: Octokit;
  
  // API Optimization: Memory cache to prevent redundant GET requests and preserve rate limits
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

  private constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  public static getInstance(token: string): GithubAPI {
    if (!GithubAPI.instance) {
      GithubAPI.instance = new GithubAPI(token);
    }
    return GithubAPI.instance;
  }

  public static resetInstance(): void {
    // @ts-ignore
    GithubAPI.instance = undefined;
  }

  public async getIssue(owner: string, repo: string, issue_number: number): Promise<any> {
    const cacheKey = `issue:${owner}:${repo}:${issue_number}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const response = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number,
    });

    this.cache.set(cacheKey, {
      data: response.data,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return response.data;
  }
  
  public clearCache(): void {
    this.cache.clear();
  }
}