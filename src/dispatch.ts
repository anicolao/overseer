import { Dispatcher } from './utils/dispatcher';

export interface DispatchEvent {
  event: string;
  payload: any;
}

export const globalDispatcher = new Dispatcher();

// Register the standard state machine / persona flow
globalDispatcher.register('issues', async (payload: any) => {
  // Label management and persona state machine routing
  const labels = payload.issue?.labels || [];
  const isActivePersona = labels.some((l: any) => l.name === 'active-persona');

  if (!isActivePersona) {
    console.log('Not an active persona, ignoring.');
    return;
  }

  // State machine routing based on payload action
  console.log('Processing active persona state machine for issue:', payload.issue?.number);
  
  if (payload.action === 'opened') {
    await handleIssueOpened(payload);
  } else if (payload.action === 'created' && payload.comment) {
    await handleIssueComment(payload);
  }
});

async function handleIssueOpened(payload: any) {
  console.log('Handling opened issue inside state machine.');
}

async function handleIssueComment(payload: any) {
  console.log('Handling issue comment inside state machine.');
}

export async function handleDispatch(event: string, payload: any): Promise<void> {
  await globalDispatcher.dispatch({ event, payload });
}