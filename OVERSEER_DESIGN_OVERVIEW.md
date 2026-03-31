# Overseer Design Overview

Overseer is a GitHub-native agent coordination system that leverages the full breadth of the GitHub platform, Gemini's multimodal Live API, and mobile integration to orchestrate a distributed team of AI agent personas.

## Architectural Components

### 1. Unified Command Center (GitHub Project v2)
Overseer uses a single GitHub "Project" (v2) to aggregate Issues and Pull Requests across all associated repositories.
- **Aggregation:** Provides a central view of the entire ecosystem's state.
- **Custom Fields:** Uses fields like `Priority`, `Complexity`, and `Status` as machine-readable state for agents.
- **Webhooks:** Triggers based on project item changes allow agents to react to metadata updates.

### 2. Persona-based GitHub Apps
Each agent persona (Overseer, Architect, Developer, Tester) is implemented as a standalone GitHub App.
- **Attribution:** Actions are clearly attributed to `overseer[bot]`, `architect[bot]`, etc.
- **Mentions:** Humans or other agents can @mention a specific persona to hand off a task or request feedback.
- **Permission Scoping:** Each persona has precise, least-privilege access to the repositories they manage.

### 3. Agent Execution Logic (Backend Services)
Agent brains are implemented in Python or Node.js, often hosted as Cloud Functions or long-running services.
- **Event-Driven:** Triggered by GitHub webhooks (`issues`, `issue_comment`, `pull_request`, `projects_v2_item`).
- **Signature Verification:** All incoming webhooks are validated using `X-Hub-Signature-256`.

### 4. Gemini Multimodal and Live API
Overseer utilizes Gemini's natively multimodal capabilities.
- **Static Analysis:** Uses the Files API to process images, diagrams, and audio files for design reviews and bug reports.
- **Real-Time Voice (Live API):** Employs a stateful WebSocket connection (16kHz 16-bit Linear PCM) for low-latency voice interactions between humans and agents.

### 5. Outbound Mobile Integration ("Calls")
To ensure human-on-the-loop oversight, Overseer can proactively contact humans on their mobile devices.
- **Telephony Bridge (Twilio):** Initiates outbound calls, streaming audio between Gemini Live API and the mobile network via WebSockets.
- **iOS App Integration:** Uses **CallKit** and **PushKit** (VoIP Pushes) for a native "Incoming Call" experience.
- **Decline Handling:** If a call is declined or missed, the system automatically sends a follow-up SMS or Push Notification with a link to re-engage via text or a web interface.

## Key Personas

- **The Overseer:** The central orchestrator. Monitors the global project state, decomposes goals, and manages agent hand-offs.
- **The Architect:** Responsible for system design, documentation, and architectural reviews.
- **The Developer:** Implements features and fixes, creating Pull Requests for review.
- **The Tester:** Focuses on functional verification, automated test generation, and PR validation.

## Implementation Details

- **GitHub Platform:** REST/GraphQL APIs for platform interactions; GitHub Actions for isolated CI/CD and script execution.
- **Security:** Strict webhook signature verification and scoped GitHub App tokens.
- **Reliability:** Staggered schedules for cron-based Actions to avoid GitHub's top-of-the-hour congestion.
- **Tech Stack:** Python (google-genai SDK), Node.js for backend logic, and Swift for iOS-native components.
