#!/bin/bash
set -e

# 1. Ensure branch state
git fetch
git checkout bot/issue-25 || git checkout -b bot/issue-25

# 2. Execute Code Replacements
echo "Applying code fixes..."
node fix.cjs

# 3. Update Dependencies
echo "Updating dependencies..."
npm uninstall express @types/express
npm install -D eslint @eslint/js typescript-eslint globals vitest

# 4. Generate Nix Flake Hash & Stage Files
git add package.json package-lock.json src/ flake.nix eslint.config.js
echo "Extracting actual NPM Deps Hash..."
nix build 2> nix_build_err.txt || true
HASH=$(grep -m 1 "got:" nix_build_err.txt | awk '{print $2}')
if [ -n "$HASH" ]; then
    sed -i "s|sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=|$HASH|g" flake.nix
    echo "Replaced hash with $HASH"
    git add flake.nix
else
    echo "Hash not found! Output:"
    cat nix_build_err.txt
fi

# 5. Quality Verifications
echo "--- Running Linter ---"
npm run lint

echo "--- Compiling TS ---"
npx tsc --noEmit

echo "--- Running Tests ---"
npm run test

echo "--- Running Nix Build ---"
nix build

echo "--- Running Flake Check ---"
git add .
nix flake check

# 6. Commit and Push
git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"
git commit -m "chore: apply comprehensive architectural and quality fixes"
git push -u origin bot/issue-25
echo "Implementation complete and pushed successfully!"