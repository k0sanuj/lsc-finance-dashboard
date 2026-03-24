#!/bin/bash
set -e

# Navigate to monorepo root (from apps/web where Vercel sets rootDirectory)
cd ../..

# Install pnpm globally and install deps
npm i -g pnpm
pnpm install --no-frozen-lockfile

# Vercel's noop.js resolves modules from apps/web/node_modules/
# pnpm hoists to root node_modules/ — create symlinks so Vercel can find them
mkdir -p apps/web/node_modules
rm -rf apps/web/node_modules/next apps/web/node_modules/@swc apps/web/node_modules/styled-jsx
ln -s ../../node_modules/next apps/web/node_modules/next
ln -s ../../node_modules/@swc apps/web/node_modules/@swc
ln -s ../../node_modules/styled-jsx apps/web/node_modules/styled-jsx

echo "Vercel install complete — symlinks created"
