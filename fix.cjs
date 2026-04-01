const fs = require('fs');

// 1. package.json configuration
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.test = 'vitest run';
pkg.scripts.lint = 'eslint src/';
delete pkg.dependencies['express'];
if (pkg.devDependencies) delete pkg.devDependencies['@types/express'];
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

// 2. Remove orphaned index.ts 
if (fs.existsSync('src/index.ts')) {
    fs.unlinkSync('src/index.ts');
}

// 3. Fix dispatch.ts: State Machine, PR detection & useless assignments
let dispatchContent = fs.readFileSync('src/dispatch.ts', 'utf8');

// A) PR Detection Regex Fix
dispatchContent = dispatchContent.replace('const prMatch = body.match(/PR.*?#(\\d+)/i) || body.match(/pull.*?\\/(\\d+)/i);', 'let prNumber = 0;\n                    if (eventData.issue && eventData.issue.pull_request) {\n                        prNumber = issueNumber;\n                    } else {\n                        const prMatch = body.match(/PR.*?#(\\d+)/i) || body.match(/pull.*?\\/(\\d+)/i);');
dispatchContent = dispatchContent.replace('const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;', 'prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;\n                    }');

// B) ESLint `no-useless-assignment` fixes
dispatchContent = dispatchContent.replace(/let shellOutput = '';/g, 'let shellOutput: string;');
dispatchContent = dispatchContent.replace(/let nextPersona: string \| null = null;/g, 'let nextPersona: string | null;');
fs.writeFileSync('src/dispatch.ts', dispatchContent);

// 4. Update Shell Docs
let shellContent = fs.readFileSync('src/utils/shell.ts', 'utf8');
shellContent = shellContent.replace(/Parses a string for \[RUN:command\]\.\.\.\[\/RUN\] blocks/g, 'Parses a string for [RUN:command] blocks');
fs.writeFileSync('src/utils/shell.ts', shellContent);

// 5. Enhance github.ts scaling (Git Trees API instead of Recursive fetch + catch error fixes)
let githubContent = fs.readFileSync('src/utils/github.ts', 'utf8');
const regexGetFiles = /async getFilesRecursive.*?return results;\n    }/s;
const newGetFilesFunc = `async getFilesRecursive(owner: string, repo: string, path: string = '', ref: string = 'main'): Promise<{ path: string, content: string }[]> {
        const { data: treeData } = await this.octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: ref,
            recursive: "true"
        });

        const results: { path: string, content: string }[] = [];

        for (const item of treeData.tree) {
            if (item.type === 'blob' && item.path && item.path.startsWith(path)) {
                const { data: blobData } = await this.octokit.rest.git.getBlob({
                    owner,
                    repo,
                    file_sha: item.sha as string
                });
                const content = Buffer.from(blobData.content, 'base64').toString('utf8');
                results.push({ path: item.path, content });
            }
        }

        return results;
    }`;
githubContent = githubContent.replace(regexGetFiles, newGetFilesFunc);
githubContent = githubContent.replace(/catch \(error\)/g, 'catch'); // Safe fix for unused variables inside the class
fs.writeFileSync('src/utils/github.ts', githubContent);

// 6. Fix `filePaths` const requirement & unused catch exception `e`
for (const file of ['src/personas/developer_tester.ts', 'src/personas/product_architect.ts']) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/let filePaths = \[\];/g, 'const filePaths: string[] = [];');
    content = content.replace(/catch \(e\)/g, 'catch');
    fs.writeFileSync(file, content);
}

// 7. Fix unused parameter `body`
for (const file of ['src/personas/planner.ts', 'src/personas/product_architect.ts']) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/mentioner: string, body: string/g, 'mentioner: string, _body: string');
    fs.writeFileSync(file, content);
}