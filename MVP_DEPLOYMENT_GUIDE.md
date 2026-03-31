# MVP Deployment Guide: Overseer

The Overseer MVP is designed to be deployed as a GitHub-native system using GitHub Actions. This allows the system to respond to repository events without requiring a separate, manually managed server.

## Prerequisites

1.  **Gemini API Key:** Obtain an API key from the [Google AI Studio](https://aistudio.google.com/).
2.  **GitHub Token:** Create a Personal Access Token (PAT) with `repo` and `project` scopes, or use the default `GITHUB_TOKEN` with appropriate permissions.
3.  **Repository Setup:** Ensure the `overseer` repository exists and you have administrative access.

## Setting Up Secrets

Add the following secrets to your GitHub repository (Settings > Secrets and variables > Actions):

- `GEMINI_API_KEY`: Your Gemini API key.
- `OVERSEER_TOKEN`: Your GitHub PAT (recommended) or use `secrets.GITHUB_TOKEN`.
- `GITHUB_WEBHOOK_SECRET`: A secret string for verifying webhook signatures (if using a separate webhook endpoint).

## Deployment via GitHub Actions

To deploy Overseer as a set of GitHub Actions, create a workflow file at `.github/workflows/overseer.yml`:

```yaml
name: Overseer Agent Dispatcher

on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created]
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  overseer:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm install

      - name: Run Overseer Dispatcher
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.OVERSEER_TOKEN || secrets.GITHUB_TOKEN }}
        run: npx ts-node src/dispatch.ts
```

## Creating the Dispatcher

Create a `src/dispatch.ts` file to act as the entry point for the GitHub Action. This script will read the GitHub event payload from the environment and dispatch it to the appropriate persona.

```typescript
import * as fs from 'fs';
import { GeminiService } from './utils/gemini';
import { GitHubService } from './utils/github';
import { OverseerPersona } from './personas/overseer';
// ... import other personas

async function run() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error('GITHUB_EVENT_PATH not found');

    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const eventName = process.env.GITHUB_EVENT_NAME;

    // Initialize services and personas...
    // Dispatch based on eventName and eventData...
}

run().catch(console.error);
```

## Local Development and Testing

You can test the persona logic locally by creating a `.env` file with your secrets and running the personas directly via `ts-node`.

```bash
export GEMINI_API_KEY="your-key"
export GITHUB_TOKEN="your-token"
npx ts-node src/personas/overseer.ts
```

## Monitoring and Maintenance

- **Logs:** Monitor the "Actions" tab in your GitHub repository for execution logs and errors.
- **Project Board:** Use the GitHub Project board to track the state and progress of all agent-driven tasks.
