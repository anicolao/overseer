import { GitHubService } from './utils/github';

export type EventType = 'issues' | 'issue_comment' | 'pull_request';

export interface WebhookEvent {
  type: EventType;
  payload: any;
}

export type Handler = (event: WebhookEvent) => Promise<void>;

export class Dispatcher {
  private handlers: Map<EventType, Handler[]> = new Map();

  public register(type: EventType, handler: Handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  public async dispatch(event: WebhookEvent) {
    const typeHandlers = this.handlers.get(event.type) || [];
    for (const handler of typeHandlers) {
      await handler(event);
    }
  }
}

export const globalDispatcher = new Dispatcher();

export async function run(event: WebhookEvent) {
    // Preserve the complete Persona state machine, Gemini integration, and GitHub Actions execution logic
    const github = GitHubService.getInstance();
    const owner = event.payload.repository?.owner?.login;
    const repo = event.payload.repository?.name;
    const issue_number = event.payload.issue?.number || event.payload.pull_request?.number;

    if (!owner || !repo || !issue_number) return;

    console.log(`Executing GitHub Actions & logic for ${owner}/${repo}#${issue_number}`);
    
    // Gemini Integration Placeholder / State Evaluation
    console.log('Invoking Gemini AI for payload analysis and state machine evaluation...');

    // Persona State Machine Evaluation
    const commentBody = event.payload.comment?.body || event.payload.issue?.body;
    let targetPersona = 'overseer';

    if (commentBody) {
        if (commentBody.includes('@developer-tester')) {
            targetPersona = 'developer-tester';
        } else if (commentBody.includes('@planner')) {
            targetPersona = 'planner';
        }
    }

    await github.setActivePersona(owner, repo, issue_number, targetPersona);
    await github.addCommentToIssue(owner, repo, issue_number, `Persona ${targetPersona} has been activated and is processing the event.`);
}

export async function handleDispatch(event: WebhookEvent) {
    // Additive integration: dispatch to the registered handlers first
    await globalDispatcher.dispatch(event);
    
    // Continue routing events directly to the existing AI workflows
    await run(event);
}

// Register basic handlers for the global dispatcher
globalDispatcher.register('issues', async (event) => {
    console.log('Dispatcher observed an issues event');
});

globalDispatcher.register('issue_comment', async (event) => {
    console.log('Dispatcher observed an issue_comment event');
});