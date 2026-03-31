import * as fs from 'fs';
import { GeminiService } from './utils/gemini';
import { GitHubService } from './utils/github';
import { OverseerPersona } from './personas/overseer';
import { ProductArchitectPersona } from './personas/product_architect';
import { PlannerPersona } from './personas/planner';
import { DeveloperTesterPersona } from './personas/developer_tester';
import { QualityPersona } from './personas/quality';

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
        // ... routing for Developer/Tester and Quality ...
    }
}

run().catch((error) => {
    console.error('Fatal error in dispatcher:', error);
    process.exit(1);
});
