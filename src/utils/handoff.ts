import type { AgentHandoffTarget } from "./agent_protocol.js";

export const HANDOFF_TO_PERSONA: Record<
	Exclude<AgentHandoffTarget, "human_review_required">,
	string
> = {
	"@overseer": "overseer",
	"@product-architect": "product-architect",
	"@planner": "planner",
	"@developer-tester": "developer-tester",
	"@quality": "quality",
};

export function stripTrailingNextStep(text: string): string {
	return text
		.replace(/\n*\s*Next step: @[a-z-]+ to take action\.?\s*$/i, "")
		.replace(/\n*\s*Next step: human review required\.?\s*$/i, "")
		.trim();
}

export function resolveNextPersona(
	persona: string,
	handoffTo?: AgentHandoffTarget,
): string | null {
	if (persona !== "overseer") {
		return "overseer";
	}
	if (!handoffTo || handoffTo === "human_review_required") {
		return null;
	}
	return HANDOFF_TO_PERSONA[handoffTo] || null;
}

export function buildNextStepLine(
	persona: string,
	handoffTo?: AgentHandoffTarget,
): string {
	if (persona !== "overseer") {
		return "Next step: @overseer to take action";
	}
	if (!handoffTo || handoffTo === "human_review_required") {
		return "Next step: human review required";
	}
	return `Next step: ${handoffTo} to take action`;
}
