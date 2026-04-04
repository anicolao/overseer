const fs = require("fs");
const path = "src/utils/agent_runner.ts";
let code = fs.readFileSync(path, "utf8");

code = code.replace(
    /if \(action\.type === "persist_work"\) \{/,
    'if (action.type === "persist_work" || action.type === "persist_qa") {'
);

code = code.replace(
    /'task_status "done" is not allowed after a successful run_shell action until persist_work succeeds'/,
    '\'task_status "done" is not allowed after a successful run_shell action until persist_work or persist_qa succeeds\''
);

code = code.replace(
    /'task_status "done" is not allowed after persist_work until you verify the persisted branch state with run_ro_shell'/,
    '\'task_status "done" is not allowed after persist_work or persist_qa until you verify the persisted branch state with run_ro_shell\''
);

code = code.replace(
    /"You have used run_shell successfully in this task\. Do not finish until persist_work succeeds\."/,
    '"You have used run_shell successfully in this task. Do not finish until persist_work or persist_qa succeeds."'
);

fs.writeFileSync(path, code);
