import * as fs from 'fs';
import { GeminiService } from './utils/gemini.js';
import { GitHubService } from './utils/github.js';
import { OverseerPersona } from './personas/overseer.js';
import { ProductArchitectPersona } from './personas/product_architect.js';
import { PlannerPersona } from './personas/planner.js';
import { DeveloperTesterPersona } from './personas/developer_tester.js';
import { QualityPersona } from './personas/quality.js';

async function run() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error('GITHUB_EVENT_PATH not found');

    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const eventName = process.env.GITHUB_EVENT_NAME;

    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    const githubToken = process.env.GITHUB_TOKEN || '';

    const gemini = new GeminiService(geminiApiKey);
    const github = new GitHubService(githubToken);

    const personas = {
        overseer: new OverseerPersona(gemini, github),
        productArchitect: new ProductArchitectPersona(gemini, github),
        planner: new PlannerPersona(gemini, github),
        developerTester: new DeveloperTesterPersona(gemini, github),
        quality: new QualityPersona(gemini, github),
    };

    const sender = eventData.sender?.login;
    const botUser = "anicolao"; // The identity used by OVERSEER_TOKEN

    console.log(`Received GitHub event: ${eventName} from ${sender}`);

    // Get issue context
    let issueNumber: number;
    let owner: string;
    let repo: string;

    if (eventName === 'issues') {
        issueNumber = eventData.issue.number;
        owner = eventData.repository.owner.login;
        repo = eventData.repository.name;
    } else if (eventName === 'issue_comment') {
        issueNumber = eventData.issue.number;
        owner = eventData.repository.owner.login;
        repo = eventData.repository.name;
    } else {
        console.log(`Ignoring event type: ${eventName}`);
        return;
    }

    const labels = await github.getIssueLabels(owner, repo, issueNumber);
    const activePersonaLabel = labels.find(l => l.startsWith('active-persona:'));
    const activePersona = activePersonaLabel ? activePersonaLabel.split(':')[1] : null;

    console.log(`Active persona: ${activePersona}`);

    // Mapping of handles to persona internal keys
    const handleMap: Record<string, string> = {
        '@overseer': 'overseer',
        '@product-architect': 'product-architect',
        '@planner': 'planner',
        '@developer-tester': 'developer-tester',
        '@quality': 'quality'
    };

    if (eventName === 'issues' && eventData.action === 'opened') {
        // Human opening an issue triggers Overseer
        await personas.overseer.handleNewIssue(owner, repo, issueNumber, eventData.issue.title, eventData.issue.body || '');
        await finalizeToken(github, owner, repo, issueNumber, 'overseer');
    } else if (eventName === 'issue_comment' && eventData.action === 'created') {
        const body = eventData.comment.body;

        // 1. Bot Protection: Ignore only if the bot is the one who posted the comment
        if (sender === botUser) {
            console.log('Ignoring comment from bot user');
            return;
        }

        // 2. Identify target persona
        let targetedPersona: string | null = null;
        for (const [handle, key] of Object.entries(handleMap)) {
            if (body.includes(handle)) {
                targetedPersona = key;
                break;
            }
        }

        if (!targetedPersona) {
            console.log('No persona mentioned in comment');
            return;
        }

        // 3. Authorization Check
        // Allow human to override or set active persona if none is set
        const isHuman = sender !== botUser;
        const isAuthorized = isHuman || (targetedPersona === activePersona);

        if (!isAuthorized) {
            console.log(`Unauthorized trigger: ${targetedPersona} is not the active persona (${activePersona})`);
            return;
        }

        // 4. Execution
        console.log(`Executing persona: ${targetedPersona}`);
        try {
            if (targetedPersona === 'overseer') {
                await personas.overseer.handleComment(owner, repo, issueNumber, sender, body);
            } else if (targetedPersona === 'product-architect') {
                await personas.productArchitect.handleMention(owner, repo, issueNumber, sender, body);
            } else if (targetedPersona === 'planner') {
                await personas.planner.handleMention(owner, repo, issueNumber, sender, body);
            } else if (targetedPersona === 'developer-tester') {
                await personas.developerTester.handleTask(owner, repo, issueNumber, body);
            } else if (targetedPersona === 'quality') {
                const prMatch = body.match(/PR.*?#(\d+)/i) || body.match(/pull.*?\/(\d+)/i);
                const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;
                await personas.quality.handleReviewRequest(owner, repo, issueNumber, prNumber, sender);
            }

            // 5. Finalize Token (Handoff)
            await finalizeToken(github, owner, repo, issueNumber, targetedPersona);
        } catch (error) {
            console.error(`Error during persona execution:`, error);
        }
    }
}

async function finalizeToken(github: GitHubService, owner: string, repo: string, issueNumber: number, currentPersona: string) {
    if (currentPersona !== 'overseer') {
        // Specialized agents always return to overseer
        console.log(`Agent ${currentPersona} finished. Returning token to overseer.`);
        await github.setActivePersona(owner, repo, issueNumber, 'overseer');
    } else {
        // Overseer decides the next step. Parse the last comment.
        const { data: comments } = await (github as any).octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: issueNumber,
            per_page: 1,
            sort: 'created',
            direction: 'desc'
        });

        if (comments.length > 0) {
            const lastComment = comments[0].body || '';
            const nextStepMatch = lastComment.match(/Next step: (@[a-z-]+) to take action/i);
            
            if (nextStepMatch) {
                const nextHandle = nextStepMatch[1].toLowerCase();
                const handleMap: Record<string, string> = {
                    '@overseer': 'overseer',
                    '@product-architect': 'product-architect',
                    '@planner': 'planner',
                    '@developer-tester': 'developer-tester',
                    '@quality': 'quality'
                };
                const nextPersona = handleMap[nextHandle];
                if (nextPersona) {
                    console.log(`Overseer delegated to ${nextPersona}. Setting token.`);
                    await github.setActivePersona(owner, repo, issueNumber, nextPersona);
                } else {
                    console.log(`Overseer mentioned unknown persona ${nextHandle}. Clearing token.`);
                    await github.setActivePersona(owner, repo, issueNumber, null);
                }
            } else if (lastComment.includes('Next step: human review required')) {
                console.log('Overseer requested human review. Clearing token.');
                await github.setActivePersona(owner, repo, issueNumber, null);
            } else {
                console.log('No explicit next step found in Overseer output. Clearing token.');
                await github.setActivePersona(owner, repo, issueNumber, null);
            }
        }
    }
}

run().catch((error) => {
    console.error('Fatal error in dispatcher:', error);
    process.exit(1);
});
