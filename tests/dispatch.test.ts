import { globalDispatcher, handleDispatch, WebhookEvent } from '../src/dispatch';
import { GitHubService } from '../src/utils/github';

jest.mock('../src/utils/github', () => ({
  GitHubService: {
    getInstance: jest.fn().mockReturnValue({
      setActivePersona: jest.fn().mockResolvedValue(undefined),
      addCommentToIssue: jest.fn().mockResolvedValue({}),
    }),
  },
}));

describe('Dispatcher & Workflow Execution', () => {
  it('should register and dispatch events independently', async () => {
    const handler = jest.fn();
    globalDispatcher.register('issues', handler);

    const event: WebhookEvent = { type: 'issues', payload: {} };
    await globalDispatcher.dispatch(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should call handleDispatch and successfully trigger run for persona activation', async () => {
      const github = GitHubService.getInstance();
      const event: WebhookEvent = { 
          type: 'issue_comment', 
          payload: {
              repository: { owner: { login: 'owner' }, name: 'repo' },
              issue: { number: 1, body: 'Hey @developer-tester can you fix this?' }
          } 
      };
      
      await handleDispatch(event);
      
      expect(github.setActivePersona).toHaveBeenCalledWith('owner', 'repo', 1, 'developer-tester');
      expect(github.addCommentToIssue).toHaveBeenCalledWith('owner', 'repo', 1, 'Persona developer-tester has been activated and is processing the event.');
  });
});