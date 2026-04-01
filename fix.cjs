const fs = require('fs');

// 1. package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.test = 'vitest run';
pkg.scripts.lint = 'eslint src/';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

// 2. src/index.ts
if (fs.existsSync('src/index.ts')) {
    fs.unlinkSync('src/index.ts');
}

// 3. src/dispatch.ts
let dispatchContent = fs.readFileSync('src/dispatch.ts', 'utf8');
const oldPrStr = `const prMatch = body.match(/PR.*?#(\\d+)/i) || body.match(/pull.*?\\/(\\d+)/i);\n                const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;`;
const newPrStr = `let prNumber = 0;\n                if (eventData.issue && eventData.issue.pull_request) {\n                    prNumber = issueNumber;\n                } else {\n                    const prMatch = body.match(/PR.*?#(\\d+)/i) || body.match(/pull.*?\\/(\\d+)/i);\n                    prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;\n                }`;
dispatchContent = dispatchContent.replace(oldPrStr, newPrStr);
fs.writeFileSync('src/dispatch.ts', dispatchContent);

// 4. src/utils/shell.ts
let shellContent = fs.readFileSync('src/utils/shell.ts', 'utf8');
const oldDoc = `Parses a string for [RUN:command]...[/RUN] blocks and executes them.`;
const newDoc = `Parses a string for [RUN:command] blocks and executes them.`;
shellContent = shellContent.replace(oldDoc, newDoc);
fs.writeFileSync('src/utils/shell.ts', shellContent);

// 5. src/utils/github.ts
let githubContent = fs.readFileSync('src/utils/github.ts', 'utf8');
const regex = /async getFilesRecursive.*?return results;\n    }/s;
const newFunc = `async getFilesRecursive(owner: string, repo: string, path: string = '', ref: string = 'main'): Promise<{ path: string, content: string }[]> {
        const { data: treeData } = await this.octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: ref,
            recursive: "true"
        });

        let results: { path: string, content: string }[] = [];

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
githubContent = githubContent.replace(regex, newFunc);
fs.writeFileSync('src/utils/github.ts', githubContent);