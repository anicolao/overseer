# Overseer Design Overview

Overseer is a GitHub-native agent coordination system that leverages the full breadth of the GitHub platform and Gemini's multimodal Live API to orchestrate a distributed team of specialized agent personas.

## Architectural Components

### 1. Unified Command Center (GitHub Project v2)
Overseer uses a single GitHub "Project" (v2) to aggregate activity across all associated repositories.
- **Aggregation:** A central view of the entire ecosystem's state, using machine-readable metadata.
- **Custom Fields:** Uses fields like `Priority`, `Complexity`, and `Status` as input for agents.

### 2. Persona-based GitHub Apps
Each persona is implemented as a standalone GitHub App, providing:
- **Unique Attribution:** Clear visibility into which agent performed an action.
- **Mentions and Hand-offs:** Enabling inter-agent communication via standard @mentions.

### 3. Agent Brains (Backend Services)
Agent logic is implemented in Python or Node.js, responding to GitHub webhooks.
- **Security:** Webhook signature verification (`X-Hub-Signature-256`) is mandatory.

### 4. Interactive Oversight with Gemini Live API
- **Live API Integration:** Humans can initiate real-time conversations with the **Overseer** persona via a stateful WebSocket connection to discuss system state or provide direction.
- **Multimodal Support:** Agents can process and discuss text, code, images, and other assets natively.

## Persona Roles and Responsibilities

- **The Overseer:** Central orchestrator, high-level task manager, and primary human-to-agent interface.
- **Product:** Defines and maintains user requirements and product scope.
- **Architect:** Designs system-wide technical architecture and ensures consistency.
- **UX Design:** Defines user experience, UI components, and visual interfaces.
- **Planning:** Breaks down high-level design from the **Architect** into actionable, bite-sized tasks.
- **Developer:** Implements features and fixes code, following the plan.
- **Tester:** Writes and executes tests to functional requirements.
- **Quality:** Checks the work of developers and testers to ensure it is correct and meets standards.

## Collaborative Workflow

The system operates through a series of structured hand-offs:

1. **Vision to Requirements:** The **Overseer** tasks the **Product** persona with defining requirements. The **Overseer** reviews and iterates until satisfied.
2. **Human Approval:** The user reviews and approves the vision and scope plans.
3. **Design & Plan:** The **Overseer** triggers the **Architect** for high-level design.
4. **Task Breakdown:** The **Planner** breaks the design into steps.
5. **Alignment Cycle:** The **Overseer**, **Architect**, and **Planner** iterate until they all agree the plan is actionable.
6. **Iteration & Delivery:** The **Planner** coordinates the **Developer**, **Tester**, **UX Design**, **Product**, and **Quality** roles to iterate on the MVP, producing artifacts for review.
