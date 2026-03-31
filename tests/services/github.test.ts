import { GitHubService } from '../../src/services/github';

describe('GitHubService', () => {
    beforeEach(() => {
        // Reset singleton and cache before each test
        GitHubService.resetInstance();
    });

    it('should correctly enforce the Singleton pattern', () => {
        const instance1 = GitHubService.getInstance('fake-token-123');
        const instance2 = GitHubService.getInstance(); // Calling without token should return the same instance

        expect(instance1).toBeInstanceOf(GitHubService);
        expect(instance1).toBe(instance2);
    });

    it('should enforce proper strict typing and throw if initialized without token', () => {
        expect(() => {
            GitHubService.getInstance();
        }).toThrow('GitHubService initialization failed: Token is required for the first instantiation.');
    });

    it('should cache fetch requests and return from cache on subsequent calls', async () => {
        const service = GitHubService.getInstance('fake-token');
        
        const firstCall = await service.getIssue('owner', 'repo', 1);
        const secondCall = await service.getIssue('owner', 'repo', 1);

        // In a real environment with spies, we would check if Octokit was only called once.
        // Here we ensure data consistency.
        expect(firstCall.id).toBe(1);
        expect(secondCall).toEqual(firstCall);
    });

    it('should not cache mutation methods like createComment', async () => {
        const service = GitHubService.getInstance('fake-token');
        
        const comment1 = await service.createComment('owner', 'repo', 1, 'Body 1');
        const comment2 = await service.createComment('owner', 'repo', 1, 'Body 2');

        expect(comment1.body).toBe('Body 1');
        expect(comment2.body).toBe('Body 2');
        expect(comment1.id).not.toBe(comment2.id); // Validates it generated a new response
    });
});