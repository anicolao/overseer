import { GitHubService } from './services/github';
import { handleWebhook } from './dispatch';

/**
 * Main application initialization.
 */
export function initApp(githubToken: string): void {
    // Safely initialize the singleton pattern
    GitHubService.getInstance(githubToken);
    console.log('Application initialized successfully with strict TS typings and caching.');
}

/**
 * API entry point for handling external webhook payloads.
 */
export async function processIncomingEvent(eventType: string, payload: any): Promise<void> {
    try {
        await handleWebhook(eventType, payload);
    } catch (err) {
        console.error('Failed to process incoming event:', err);
    }
}