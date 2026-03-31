import { Octokit } from '@octokit/rest';

export class GitHubService {
    private octokit: Octokit;

    constructor(token: string) {
        this.octokit = new Octokit({ auth: token });
    }

    async addCommentToIssue(owner: string, repo: string, issueNumber: number, body: string) {
        return this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body,
        });
    }

    async updateIssueLabels(owner: string, repo: string, issueNumber: number, labels: string[]) {
        return this.octokit.rest.issues.setLabels({
            owner,
            repo,
            issue_number: issueNumber,
            labels,
        });
    }

    async getIssue(owner: string, repo: string, issueNumber: number) {
        return this.octokit.rest.issues.get({
            owner,
            repo,
            issue_number: issueNumber,
        });
    }

    // Simplified for MVP, this would interact with Project v2 GraphQL
    async updateProjectField(projectId: string, itemId: string, fieldId: string, value: string) {
        // Implementation for Project v2 GraphQL
        console.log(`Setting project item ${itemId} field ${fieldId} to ${value}`);
    }
}
