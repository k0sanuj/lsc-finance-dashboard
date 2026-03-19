#!/bin/sh
# Fix @swc/helpers subpath exports for Vercel nft trace
# Creates physical _/<helper>/package.json for each subpath export

fix_dir() {
  SWC_DIR="$1/@swc/helpers"
  if [ -d "$SWC_DIR" ] && [ ! -d "$SWC_DIR/_/_interop_require_default" ]; then
    mkdir -p "$SWC_DIR/_"
    for entry in "$SWC_DIR"/_*/; do
      [ -d "$entry" ] || continue
      base=$(basename "$entry")
      target="$SWC_DIR/_/$base"
      if [ ! -d "$target" ]; then
        mkdir -p "$target"
        printf '{"type":"module","main":"../../esm/%s.js"}\n' "$base" > "$target/package.json"
      fi
    done
    echo "Fixed @swc/helpers in $SWC_DIR"
  fi
}

fix_dir "node_modules"
fix_dir "/node_modules"
fix_dir "/vercel/path0/node_modules"

echo "swc-helpers fix complete"
