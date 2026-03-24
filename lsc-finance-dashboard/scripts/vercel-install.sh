#!/bin/bash
set -e

# Navigate to monorepo root (from apps/web where Vercel sets rootDirectory)
cd ../..

# Install pnpm globally and install deps
npm i -g pnpm
pnpm install --no-frozen-lockfile

# Vercel's noop.js resolves modules from apps/web/node_modules/
# pnpm hoists to root node_modules/ — use absolute path symlinks
MONO_ROOT=$(pwd)
mkdir -p apps/web/node_modules
rm -rf apps/web/node_modules/next apps/web/node_modules/@swc apps/web/node_modules/styled-jsx
ln -sf "$MONO_ROOT/node_modules/next" apps/web/node_modules/next
ln -sf "$MONO_ROOT/node_modules/@swc" apps/web/node_modules/@swc
ln -sf "$MONO_ROOT/node_modules/styled-jsx" apps/web/node_modules/styled-jsx

# Verify the critical file exists
if [ -f "apps/web/node_modules/next/dist/compiled/next-server/server.runtime.prod.js" ]; then
  echo "✓ server.runtime.prod.js accessible via symlink"
else
  echo "✗ symlink failed, trying hardlink..."
  rm -rf apps/web/node_modules/next
  cp -a node_modules/next apps/web/node_modules/next
fi

echo "Vercel install complete"
