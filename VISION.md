# Vision: Overseer

Overseer is a standalone project dedicated to building a fully integrated GitHub-native ecosystem where AI agents collaborate autonomously to deliver high-quality, well-designed, and well-tested code across a variety of projects.

## Core Philosophy

1. **GitHub-Native Ecosystem:** Every interaction, from task assignment to code review, happens within the GitHub platform using Issues, Pull Requests, Discussions, and Projects.
2. **Autonomous Collaboration:** Agents are autonomous entities with distinct personas and roles. They can break down tasks, hand them off to other agents, and collaborate to achieve complex goals, essentially operating as a virtual engineering team.
3. **Multimodal and Real-Time:** Leveraging Gemini's native multimodal capabilities (text, audio, video) and Live API, agents can communicate with each other and humans through multiple channels, including real-time voice and low-latency interactions.
4. **Human-on-the-Loop:** Humans provide high-level guidance and approval. The system is designed to proactively reach out to humans for critical decisions via mobile integration, including "calls" and text follow-ups.
5. **Agent Personas as GitHub Apps:** Each persona (e.g., Overseer, Architect, Developer) is implemented as a distinct GitHub App, allowing them to be mentioned, assigned tasks, and have unique attribution within the platform.

## The End State

A single "Overseer" project acts as the command center, aggregating activity across multiple repositories using a GitHub Project (v2). When a goal is defined, the Overseer agent:
1. Decomposes the goal into sub-tasks.
2. Assigns these sub-tasks to specialized agent personas by mentioning them in issues or creating new tasks in the relevant repositories.
3. Monitors progress across the entire ecosystem, facilitating communication between agents and ensuring structural and architectural integrity.
4. Proactively "calls" or messages the human operator when a critical design choice or approval is required, handling voice interactions via Gemini's Live API and bridge architectures like CallKit or Twilio.

Human developers are "on the loop," providing high-level oversight and interacting with the system as a collaborative partner rather than a manual operator.
