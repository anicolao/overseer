#!/bin/bash
set -e

echo "Applying code fixes..."
node fix.cjs

echo "Updating dependencies..."
npm uninstall express @types/express
npm install -D eslint @eslint/js typescript-eslint globals vitest

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

echo "--- Compiling TS ---"
npx tsc --noEmit

echo "--- Running Linter ---"
npm run lint

echo "--- Running Tests ---"
npm run test

echo "--- Running Nix Build ---"
nix build

echo "--- Running Flake Check ---"
git add .
nix flake check

git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"
git commit -m "chore: remediation of architectural and quality issues"
echo "Done!"