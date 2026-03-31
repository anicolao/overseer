import { GitHubService } from './github.js';

export class PersonaHelper {
    static async checkLimitAndGetAttribution(
        github: GitHubService,
        owner: string,
        repo: string,
        issueNumber: number,
        personaName: string,
        personaHandle: string,
        commenter?: string,
        body?: string
    ): Promise<{ shouldContinue: boolean; attribution: string }> {
        const commentCount = await github.getIssueCommentCount(owner, repo, issueNumber);
        
        // Check for setlimit command in the current comment
        if (body && body.includes(`${personaHandle} setlimit`)) {
            const match = body.match(new RegExp(`${personaHandle} setlimit (\\d+)`, 'i'));
            if (match) {
                const newLimit = parseInt(match[1], 10);
                if (!isNaN(newLimit)) {
                    await github.addCommentToIssue(owner, repo, issueNumber, `I am the ${personaName}, and I am responding to your comment. I have updated the comment limit for this issue to ${newLimit}.`);
                    return { shouldContinue: false, attribution: '' };
                }
            }
        }

        // Get limit from issue body
        const issue = await github.getIssue(owner, repo, issueNumber);
        const limitMatch = (issue.data.body || '').match(new RegExp(`${personaHandle} setlimit (\\d+)`, 'i'));
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 100;

        if (commentCount >= limit) {
            const context = commenter ? `your comment` : `issue #${issueNumber}`;
            await github.addCommentToIssue(owner, repo, issueNumber, `I am the ${personaName}, and I am responding to ${context}. I have reached the safety limit of ${limit} comments on this issue. Please use \`${personaHandle} setlimit <number>\` to increase the limit if you wish for me to continue.`);
            return { shouldContinue: false, attribution: '' };
        }

        const responderContext = commenter ? `a comment from @${commenter} on issue #${issueNumber}` : `issue #${issueNumber}`;
        const attribution = `I am the ${personaName}, and I am responding to ${responderContext}.\n\n`;
        
        return { shouldContinue: true, attribution };
    }
}
