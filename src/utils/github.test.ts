import { createAppAuth } from "@octokit/auth-app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppTokenManager } from "./github.js";

vi.mock("@octokit/auth-app", () => ({
	createAppAuth: vi.fn(),
}));

vi.mock("@octokit/rest", () => {
	return {
		Octokit: class {
			rest = {
				apps: {
					getRepoInstallation: vi.fn().mockResolvedValue({
						data: { id: 456 },
					}),
				},
			};
		},
	};
});

describe("AppTokenManager", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = { ...originalEnv };
	});

	it("should initialize with environment variables", () => {
		process.env.GITHUB_APP_ID = "123";
		process.env.GITHUB_APP_PRIVATE_KEY = "private_key";
		process.env.GITHUB_WEBHOOK_SECRET = "secret";

		const manager = new AppTokenManager();
		expect(manager.appId).toBe("123");
		expect(manager.privateKey).toBe("private_key");
		expect(manager.webhookSecret).toBe("secret");
	});

	it("should throw error if getInstallationToken is called without credentials", async () => {
		delete process.env.GITHUB_APP_ID;
		delete process.env.GITHUB_APP_PRIVATE_KEY;

		const manager = new AppTokenManager();
		await expect(manager.getInstallationToken("owner", "repo")).rejects.toThrow(
			"GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required to get an installation token.",
		);
	});

	it("should fetch an installation token successfully", async () => {
		process.env.GITHUB_APP_ID = "123";
		process.env.GITHUB_APP_PRIVATE_KEY = "private_key";

		const mockAuth = vi.fn().mockResolvedValue({
			type: "installation",
			token: "mock_installation_token",
			installationId: 456,
		});

		vi.mocked(createAppAuth).mockReturnValue(mockAuth as any);

		const manager = new AppTokenManager();
		const token = await manager.getInstallationToken("owner", "repo");

		expect(token).toBe("mock_installation_token");
		expect(mockAuth).toHaveBeenCalledWith({
			type: "installation",
			installationId: 456,
		});
	});
});
