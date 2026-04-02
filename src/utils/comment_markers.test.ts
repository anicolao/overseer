import { describe, expect, it } from "vitest";
import {
	hasPersistenceBackstopSentinel,
	hasStatusUpdateSentinel,
	isWorkflowNoiseComment,
	PERSISTENCE_BACKSTOP_SENTINEL,
	prependStatusUpdateSentinel,
	STATUS_UPDATE_SENTINEL,
} from "./comment_markers.js";

describe("comment markers", () => {
	it("prepends the status update sentinel once", () => {
		const initial = prependStatusUpdateSentinel("Started work.");
		const repeated = prependStatusUpdateSentinel(initial);

		expect(initial).toContain(STATUS_UPDATE_SENTINEL);
		expect(repeated).toBe(initial);
	});

	it("detects workflow noise comments", () => {
		expect(
			hasStatusUpdateSentinel(`${STATUS_UPDATE_SENTINEL}\n\nprogress`),
		).toBe(true);
		expect(
			hasPersistenceBackstopSentinel(
				`${PERSISTENCE_BACKSTOP_SENTINEL}\n\nbackstop`,
			),
		).toBe(true);
		expect(
			isWorkflowNoiseComment(`${STATUS_UPDATE_SENTINEL}\n\nprogress`),
		).toBe(true);
		expect(
			isWorkflowNoiseComment(`${PERSISTENCE_BACKSTOP_SENTINEL}\n\nbackstop`),
		).toBe(true);
		expect(isWorkflowNoiseComment("normal user comment")).toBe(false);
	});
});
