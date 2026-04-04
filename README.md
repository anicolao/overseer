# Overseer

Overseer is a GitHub-native agent coordination system designed to enable AI agents to collaborate autonomously as a virtual engineering team.

## Overview

Overseer leverages the GitHub platform as the primary collaboration surface for a distributed team of specialized agent personas. The long-term system is meant to support complex development workflows with minimal human intervention while preserving visibility, traceability, and repository-native control.

The code currently in this repository is an MVP focused on proving the risky parts of that design: structured handoffs, agent execution loops, controlled shell access, persistence onto issue branches, and artifact-driven debugging inside a real repository workflow.

## Key Features

- **GitHub-Native Orchestration:** Uses GitHub as the primary communication and state management layer.
- **Autonomous Agent Personas:** Specialized agents collaborate through structured hand-offs and clear role boundaries.
- **Repository-Centered Execution:** Planning, implementation, verification, and persistence all happen against the repository itself.
- **Structured Development Workflow:** The system is designed to support a rigorous process from product definition and planning through code changes and review.

## Documentation

- [Current System](./docs/current-system.md) - The implemented MVP as it exists in code today.
- [Operations](./docs/operations.md) - Workflow behavior, artifacts, persistence backstop, and inspection commands.

## License

This project is licensed under the GPLv3 license. See the [LICENSE](./LICENSE) file for details.
