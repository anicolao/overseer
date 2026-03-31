import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

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

  public clearCache(): void {
    this.cache.clear();
  }

  private getRepoInfo(): { owner: string; repo: string } {
    const repoStr = process.env.GITHUB_REPOSITORY || 'owner/repo';
    const [owner, repo] = repoStr.split('/');
    return { owner, repo };
  }

  public async getIssue(issueNumber: number) {
    const cacheKey = `issue_${issueNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const { owner, repo } = this.getRepoInfo();
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });
    this.cache.set(cacheKey, data);
    return data;
  }

  public async addCommentToIssue(issueNumber: number, body: string) {
    const { owner, repo } = this.getRepoInfo();
    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
    return data;
  }

  public async getIssueLabels(issueNumber: number) {
    const issue = await this.getIssue(issueNumber);
    return issue.labels || [];
  }

  public async setActivePersona(issueNumber: number, persona: string) {
    const { owner, repo } = this.getRepoInfo();
    const labels = await this.getIssueLabels(issueNumber);
    const labelNames = labels.map((l: any) => typeof l === 'string' ? l : l.name);
    
    // Remove existing persona labels
    const currentPersonas = labelNames.filter((name: string) => name && name.startsWith('persona:'));
    for (const label of currentPersonas) {
      await this.octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label
      });
    }

    // Add new persona label
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [`persona:${persona}`]
    });
  }

  public async getFullIssueContext(issueNumber: number) {
    const issue = await this.getIssue(issueNumber);
    const { owner, repo } = this.getRepoInfo();
    const { data: comments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber
    });
    return {
      issue,
      comments
    };
  }

  public async getFilesRecursive(dir: string): Promise<string[]> {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        const res = await this.getFilesRecursive(filePath);
        results = results.concat(res);
      } else {
        results.push(filePath);
      }
    }
    return results;
  }
}