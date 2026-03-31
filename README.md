# Overseer

Overseer is a GitHub-native agent coordination system designed to enable AI agents to collaborate autonomously as a virtual engineering team.

## Overview

Overseer leverages the full capabilities of the GitHub platform (Issues, PRs, Projects v2, GitHub Apps) alongside Gemini's multimodal Live API to orchestrate a distributed team of specialized agent personas. The system is designed to handle complex development tasks across multiple repositories with minimal human intervention.

## Key Features

- **GitHub-Native Orchestration:** Uses GitHub as the primary communication and state management layer.
- **Autonomous Agent Personas:** Specialized agents (Overseer, Product, Architect, UX Design, Planning, Developer, Tester, Quality) collaborate through mentions and task hand-offs.
- **Unified Global View:** Aggregates activity across multiple repositories using a single GitHub Project (v2).
- **Real-Time Voice & Multimodal Interaction:** Integrates Gemini's Live API for low-latency conversations with the Overseer persona to understand system state and provide direction.
- **Structured Development Workflow:** A rigorous process from vision and product definition to design, planning, and execution.

## Documentation

- [Vision](./VISION.md) - The project's "why" and its long-term goals.
- [Design Overview](./OVERSEER_DESIGN_OVERVIEW.md) - Technical architecture and implementation details.

## License

This project is licensed under the GPLv3 license. See the [LICENSE](./LICENSE) file for details.
