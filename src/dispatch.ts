import * as fs from 'fs';
import { Dispatcher } from './core/dispatcher';

export const personaStateMachine = {
  getNextPersona(currentPersona: string): string {
    const sequence = ['Planner', 'DeveloperTester', 'Quality', 'Overseer'];
    const idx = sequence.indexOf(currentPersona);
    if (idx !== -1 && idx < sequence.length - 1) {
      return sequence[idx + 1];
    }
    return sequence[0];
  }
};

export async function run() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (!eventPath || !eventName) {
    console.error('Missing GITHUB_EVENT_PATH or GITHUB_EVENT_NAME');
    process.exit(1);
  }

  try {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const dispatcher = new Dispatcher();
    
    // Core GitHub Action handlers can be registered here
    dispatcher.register('issues', async (eventPayload: any) => {
      console.log('Handled issues event internally via Action');
    });

    await dispatcher.dispatch(eventName, payload);
  } catch (error) {
    console.error('Error in dispatch:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}