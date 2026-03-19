#!/bin/sh
# Fix @swc/helpers subpath exports for Vercel nft trace
# Creates physical directories for package.json exports that use _/ prefix
SWC_DIR="node_modules/@swc/helpers"
if [ -d "$SWC_DIR" ]; then
  for entry in "$SWC_DIR"/_*/; do
    base=$(basename "$entry")
    target="$SWC_DIR/_/$base"
    if [ ! -d "$target" ]; then
      mkdir -p "$target"
      echo '{"type":"module","main":"../../esm/'"$base"'.js"}' > "$target/package.json"
    fi
  done
  echo "Fixed @swc/helpers subpath exports"
fi
