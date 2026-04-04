# Vision: Overseer

Overseer is a standalone project dedicated to building a fully integrated GitHub-native ecosystem where a team of specialized AI agent personas collaborate autonomously to deliver high-quality, well-designed, and well-tested code.

## Core Philosophy

1. **GitHub-Native Ecosystem:** Every interaction, from task assignment to code review, happens within the GitHub platform using Issues, Pull Requests, Discussions, and Projects.
2. **Autonomous Collaboration:** Agents are autonomous entities with distinct, specialized personas. They operate as a virtual engineering team, breaking down complex visions into actionable steps and collaborating to achieve a high-quality MVP.
3. **Interactive Oversight:** The user remains "on the loop" by monitoring the GitHub Project or initiating real-time conversations with the Overseer persona via Gemini's multimodal Live API to understand the system state and provide direction.
4. **Structured Workflow:** The system follows a rigorous process of definition, design, and planning before execution, ensuring that user intent is captured and the architectural path is sound.
5. **Agent Personas as GitHub Apps:** Each persona is implemented as a distinct GitHub App, allowing for clear attribution, cross-persona mentions, and specialized task hand-offs.

## The End State

A single "Overseer" project acts as the command center, aggregating activity across multiple repositories using a GitHub Project (v2). The workflow follows a structured progression:

1. **Inception:** The user provides a vision to the **Overseer**.
2. **Product Definition:** The **Overseer** tasks the **Product** persona with defining requirements. They iterate until the **Overseer** is satisfied, at which point the user is asked to approve the vision and scope.
3. **Design & Planning:** The **Overseer** initiates high-level design with the **Architect**. The **Planner** then breaks this design into actionable, bite-sized steps.
4. **Alignment:** The **Overseer**, **Architect**, and **Planner** iterate until all three agree the plan is fully actionable.
5. **Execution:** The **Planner** coordinates the **Developer**, **Tester**, **UX Design**, **Product**, and **Quality** roles to iterate on the MVP, producing the first tangible artifacts for human review.

Humans interact with the system as high-level directors, providing approval and guidance while the agents manage the complex mechanics of software delivery.
