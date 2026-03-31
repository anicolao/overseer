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

    console.log(`Processing GitHub event: ${eventName}`);

    if (eventName === 'issues' && eventData.action === 'opened') {
        const { owner, name } = eventData.repository;
        const { number, title, body } = eventData.issue;
        await personas.overseer.handleNewIssue(owner.login, name, number, title, body || '');
    } else if (eventName === 'issue_comment' && eventData.action === 'created') {
        const { owner, name } = eventData.repository;
        const { number } = eventData.issue;
        const { body, user } = eventData.comment;

        if (body.includes('@overseer')) {
            await personas.overseer.handleComment(owner.login, name, number, user.login, body);
        }
        if (body.includes('@product-architect')) {
            await personas.productArchitect.handleMention(owner.login, name, number, user.login, body);
        }
        if (body.includes('@planner')) {
            await personas.planner.handleMention(owner.login, name, number, user.login, body);
        }
        if (body.includes('@developer-tester')) {
            await personas.developerTester.handleTask(owner.login, name, number, body);
        }
        if (body.includes('@quality')) {
            // Try to extract PR number from body
            const prMatch = body.match(/PR.*?#(\d+)/i) || body.match(/pull.*?\/(\d+)/i);
            const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;
            await personas.quality.handleReviewRequest(owner.login, name, number, prNumber, user.login);
        }
    }
}

run().catch((error) => {
    console.error('Fatal error in dispatcher:', error);
    process.exit(1);
});
