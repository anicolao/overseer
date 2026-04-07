import { PersistenceService } from "./utils/persistence.js";

async function run() {
	const p = new PersistenceService();
	const issueNumber = parseInt(process.env.ISSUE_NUMBER || "136", 10);
	const result = await p.persistWork(issueNumber, "@developer-tester");
	console.log(JSON.stringify(result, null, 2));
}

run();
