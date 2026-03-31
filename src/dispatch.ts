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

    const handleMap: Record<string, string> = {
        '@overseer': 'overseer',
        '@product-architect': 'product-architect',
        '@planner': 'planner',
        '@developer-tester': 'developer-tester',
        '@quality': 'quality'
    };

    let responseContent: string = '';
    let executedPersona: string | null = null;

    if (eventName === 'issues' && eventData.action === 'opened') {
        responseContent = await personas.overseer.handleNewIssue(owner, repo, issueNumber, eventData.issue.title, eventData.issue.body || '');
        executedPersona = 'overseer';
    } else if (eventName === 'issue_comment' && eventData.action === 'created') {
        const body = eventData.comment.body;

        // 1. Identify target persona
        let targetedPersona: string | null = null;

        // Prioritize the standardized suffix
        const nextStepMatch = body.match(/Next step: (@[a-z-]+) to take action/i);
        if (nextStepMatch) {
            targetedPersona = handleMap[nextStepMatch[1].toLowerCase()] || null;
        }

        // If no suffix, look for the LAST mention in the body (usually the intended handoff)
        if (!targetedPersona) {
            const mentions = body.match(/@[a-z-]+/gi);
            if (mentions) {
                for (let i = mentions.length - 1; i >= 0; i--) {
                    const handle = mentions[i].toLowerCase();
                    if (handleMap[handle]) {
                        targetedPersona = handleMap[handle];
                        break;
                    }
                }
            }
        }

        if (!targetedPersona) {
            console.log('No persona identified in comment');
            return;
        }

        // 2. State Machine Logic
        let shouldExecute = false;

        if (activePersona === 'overseer') {
            // Overseer always runs when it has the token
            shouldExecute = true;
            executedPersona = 'overseer';
        } else if (activePersona !== null) {
            // Specialized agent runs only if it was the one intended
            if (targetedPersona === activePersona) {
                shouldExecute = true;
                executedPersona = activePersona;
            }
        } else {
            // Quiescent state: only Overseer runs if explicitly mentioned
            if (targetedPersona === 'overseer') {
                shouldExecute = true;
                executedPersona = 'overseer';
            }
        }

        // 3. Persona-Specific Bot Protection: 
        // Only ignore if the bot POSTED the comment AND it's that persona's OWN attribution.
        if (shouldExecute && executedPersona && sender === botUser) {
            const personaNameMap: Record<string, string> = {
                'overseer': 'Overseer',
                'product-architect': 'Product/Architect',
                'planner': 'Planner',
                'developer-tester': 'Developer/Tester',
                'quality': 'Quality'
            };
            const currentPersonaName = personaNameMap[executedPersona];
            if (body.startsWith(`I am the ${currentPersonaName},`)) {
                console.log(`Ignoring bot-generated comment from ${executedPersona} to prevent self-loop`);
                return;
            }
        }

        if (shouldExecute && executedPersona) {
            console.log(`Executing persona: ${executedPersona}`);
            if (executedPersona === 'overseer') {
                responseContent = await personas.overseer.handleComment(owner, repo, issueNumber, sender, body);
            } else if (executedPersona === 'product-architect') {
                responseContent = await personas.productArchitect.handleMention(owner, repo, issueNumber, sender, body);
            } else if (executedPersona === 'planner') {
                responseContent = await personas.planner.handleMention(owner, repo, issueNumber, sender, body);
            } else if (executedPersona === 'developer-tester') {
                responseContent = await personas.developerTester.handleTask(owner, repo, issueNumber, body);
            } else if (executedPersona === 'quality') {
                const prMatch = body.match(/PR.*?#(\d+)/i) || body.match(/pull.*?\/(\d+)/i);
                const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;
                responseContent = await personas.quality.handleReviewRequest(owner, repo, issueNumber, prNumber, sender);
            }
        }
    }

    if (responseContent && executedPersona) {
        // Atomic Transition: Determine next persona, set label, THEN post comment
        let nextPersona: string | null = null;

        if (executedPersona !== 'overseer') {
            // Specialized agents always return to Overseer
            nextPersona = 'overseer';
        } else {
            // Parse Overseer output for delegation
            const nextStepMatch = responseContent.match(/Next step: (@[a-z-]+) to take action/i);
            if (nextStepMatch) {
                const nextHandle = nextStepMatch[1].toLowerCase();
                nextPersona = handleMap[nextHandle] || null;
                
                // Safety Rule: No self-delegation or invalid persona
                if (nextPersona === 'overseer' || !nextPersona) {
                    const errorMsg = nextPersona === 'overseer' 
                        ? "ERROR: Overseer attempted to delegate to itself. Transitioning to 'none' to prevent loop."
                        : `ERROR: Overseer delegated to unknown persona ${nextHandle}. Transitioning to 'none'.`;
                    console.error(errorMsg);
                    await github.addCommentToIssue(owner, repo, issueNumber, errorMsg);
                    nextPersona = null;
                }
            } else if (responseContent.includes('Next step: human review required')) {
                nextPersona = null;
            } else {
                // Fallback for missing suffix
                const errorMsg = "ERROR: Overseer failed to specify a valid 'Next step:' suffix. Transitioning to 'none'.";
                console.error(errorMsg);
                await github.addCommentToIssue(owner, repo, issueNumber, errorMsg);
                nextPersona = null;
            }
        }

        console.log(`Setting next active persona: ${nextPersona}`);
        await github.setActivePersona(owner, repo, issueNumber, nextPersona);
        await github.addCommentToIssue(owner, repo, issueNumber, responseContent);
    }
}

run().catch((error) => {
    console.error('Fatal error in dispatcher:', error);
    process.exit(1);
});
