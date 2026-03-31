import { GitHubService } from './github.js';

export class PersonaHelper {
    static getAttribution(
        personaName: string,
        issueNumber: number,
        commenter?: string
    ): string {
        const responderContext = commenter ? `a comment from @${commenter} on issue #${issueNumber}` : `issue #${issueNumber}`;
        return `I am the ${personaName}, and I am responding to ${responderContext}.\n\n`;
    }

    static async isLimitReached(
        github: GitHubService,
        owner: string,
        repo: string,
        issueNumber: number,
        personaName: string,
        personaHandle: string,
        body?: string
    ): Promise<boolean> {
        const commentCount = await github.getIssueCommentCount(owner, repo, issueNumber);
        
        // Check for setlimit command in the current comment
        if (body && body.includes(`${personaHandle} setlimit`)) {
            const match = body.match(new RegExp(`${personaHandle} setlimit (\\d+)`, 'i'));
            if (match) {
                const newLimit = parseInt(match[1], 10);
                if (!isNaN(newLimit)) {
                    await github.addCommentToIssue(owner, repo, issueNumber, `I am the ${personaName}, and I have updated the comment limit for this issue to ${newLimit}.`);
                    return false; // Not really "reached" if we just updated it
                }
            }
        }

        // Get limit from issue body
        const issue = await github.getIssue(owner, repo, issueNumber);
        const limitMatch = (issue.data.body || '').match(new RegExp(`${personaHandle} setlimit (\\d+)`, 'i'));
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 100;

        if (commentCount >= limit) {
            await github.addCommentToIssue(owner, repo, issueNumber, `I am the ${personaName}. I have reached the safety limit of ${limit} comments on this issue. Please use \`${personaHandle} setlimit <number>\` to increase the limit if you wish for me to continue.`);
            return true;
        }

        return false;
    }
}
