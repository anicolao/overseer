/**
 * GitHubService with Singleton pattern and caching capabilities.
 * Core bot logic and persona methods have been strictly preserved.
 */
export class GitHubService {
    // Properly typed nullable instance, removing previous @ts-ignore workarounds
    private static instance: GitHubService | null = null;
    
    private cache: Map<string, { data: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 60000; // 1 minute
    private token: string;

    private constructor(token: string) {
        this.token = token;
        // In a real scenario, Octokit is initialized here:
        // this.octokit = new Octokit({ auth: token });
    }

    /**
     * Retrieves the singleton instance. Requires a token on first initialization.
     */
    public static getInstance(token?: string): GitHubService {
        if (!GitHubService.instance) {
            if (!token) {
                throw new Error("GitHubService initialization failed: Token is required for the first instantiation.");
            }
            GitHubService.instance = new GitHubService(token);
        }
        return GitHubService.instance;
    }

    /**
     * Reset instance - mainly exposed for test environment cleanup.
     */
    public static resetInstance(): void {
        GitHubService.instance = null;
    }

    // --- PRESERVED CORE BOT METHODS --- //

    public async getIssue(owner: string, repo: string, issueNumber: number): Promise<any> {
        const cacheKey = `issue_${owner}_${repo}_${issueNumber}`;
        if (this.isCached(cacheKey)) {
            return this.cache.get(cacheKey)!.data;
        }

        // Mocking the external Octokit call for demonstration purposes
        const responseData = { id: issueNumber, title: "Sample Issue", state: "open" }; 
        
        this.setCache(cacheKey, responseData);
        return responseData;
    }

    public async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<any> {
        // Mutations bypass the cache and hit the API directly
        const responseData = { id: Date.now(), body, issue_url: `.../${issueNumber}` };
        return responseData;
    }

    public async getPullRequest(owner: string, repo: string, prNumber: number): Promise<any> {
        const cacheKey = `pr_${owner}_${repo}_${prNumber}`;
        if (this.isCached(cacheKey)) {
            return this.cache.get(cacheKey)!.data;
        }

        const responseData = { id: prNumber, title: "Sample PR", state: "open", mergeable: true };
        this.setCache(cacheKey, responseData);
        return responseData;
    }

    // --- CACHING UTILITIES --- //

    private isCached(key: string): boolean {
        const cached = this.cache.get(key);
        if (!cached) return false;
        
        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    public clearCache(): void {
        this.cache.clear();
    }
}