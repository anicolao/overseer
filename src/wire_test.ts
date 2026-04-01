import { ShellService } from "./utils/shell.js";

async function runTest() {
	console.log("Starting Overseer Nix VM Wire-Test...");
	const shell = new ShellService();

	// Test 1: Repository Visibility
	const lsResult = await shell.executeCommand("ls -R");
	console.log("TEST 1 (ls -R):", lsResult.exitCode === 0 ? "PASS" : "FAIL");
	if (lsResult.exitCode === 0) {
		console.log("Repository structure detected.");
	}

	// Test 2: Nix Environment Tools
	const nodeResult = await shell.executeCommand("node --version");
	console.log(
		"TEST 2 (node --version):",
		nodeResult.exitCode === 0 ? "PASS" : "FAIL",
	);
	console.log("Node version:", nodeResult.stdout);

	const ghResult = await shell.executeCommand("gh --version");
	console.log(
		"TEST 3 (gh --version):",
		ghResult.exitCode === 0 ? "PASS" : "FAIL",
	);

	const flakeResult = await shell.executeCommand("cat flake.nix");
	console.log(
		"TEST 4 (read flake.nix):",
		flakeResult.exitCode === 0 ? "PASS" : "FAIL",
	);

	if (
		lsResult.exitCode === 0 &&
		nodeResult.exitCode === 0 &&
		ghResult.exitCode === 0 &&
		flakeResult.exitCode === 0
	) {
		console.log("\nALL WIRE-TESTS PASSED. Wiring is ready for LLM personas.");
	} else {
		console.error("\nWIRE-TESTS FAILED. Check Nix configuration.");
		process.exit(1);
	}
}

runTest().catch(console.error);
