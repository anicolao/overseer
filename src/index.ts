import { dispatcher } from './dispatch';
import { GithubAPI } from './utils/github';

const token = process.env.GITHUB_TOKEN || '';
GithubAPI.getInstance(token);

// Example handler registration combining both modules
dispatcher.register('issues', async (event) => {
  console.log(`Received ${event.eventName} event: ${event.action} for ${event.repoOwner}/${event.repoName}`);
  
  if (event.action === 'opened' && event.repoOwner && event.repoName && event.rawPayload.issue?.number) {
    const api = GithubAPI.getInstance(token);
    const issueDetails = await api.getIssue(event.repoOwner, event.repoName, event.rawPayload.issue.number);
    
    console.log(`Successfully fetched Issue Title: ${issueDetails.title}`);
  }
});

// Primary entry point handler for incoming webhooks
export async function handleWebhook(eventName: string, payload: any) {
  try {
    await dispatcher.dispatch(eventName, payload);
  } catch (error) {
    console.error('Webhook handling encountered a critical failure:', error);
  }
}