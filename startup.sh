#!/bin/bash
#
# Start the API on Azure App Service (Linux, Node).
#
# ## Why this file exists rather than a one-line startup command
#
# The server runs TypeScript directly through Node's `--experimental-strip-types`: there is no build
# step and no emitted JavaScript to point at. That needs a custom startup command, and a custom
# command turns off several things App Service otherwise does for you. Each step below replaces one
# of them, and each was added because the container died without it.
#
# ## The three problems, in the order they appeared
#
# 1. **App Service compresses the installed packages** into `node_modules.tar.gz` and leaves an empty
#    `node_modules` beside it. Its own startup script extracts that; a custom command skips the step
#    silently, and the container dies with `Cannot find package 'chess.js'` — which reads like a
#    dependency mistake and is really a packaging one.
#
# 2. **The archive holds the *contents* of node_modules** — `./chess.js/`, `./@nimiq/` — not a
#    `node_modules/` directory. Extracting it without `-C` scatters forty package folders across
#    wwwroot and leaves `node_modules` as empty as it found it.
#
# 3. **Everything goes to `/node_modules`, not into wwwroot, and that is the important one.**
#    `/home` is an SMB share: symlinks written there are accepted and then do not resolve, so npm's
#    workspace links for `@scoresheet/*` cannot be recreated. Copying the packages in instead fails
#    differently and more interestingly — Node refuses to strip types for anything under a
#    `node_modules` directory (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so the app's own
#    TypeScript becomes unloadable precisely by being installed correctly.
#
#    `/node_modules` is on the container's own disk, where symlinks work. Node resolves a symlink to
#    its real path before deciding whether it sits under `node_modules` — so linking to
#    `/home/site/wwwroot/packages/core` puts the source *outside* node_modules again and stripping is
#    allowed. It is also on Node's ordinary resolution walk from the app, so nothing else changes.

set -euo pipefail
cd /home/site/wwwroot

if [ ! -f node_modules.tar.gz ]; then
  echo "startup: node_modules.tar.gz is missing — the build never installed dependencies"
  exit 1
fi

mkdir -p /node_modules
if [ -z "$(ls -A /node_modules 2>/dev/null || true)" ]; then
  echo "startup: extracting dependencies to /node_modules"
  tar -xzf node_modules.tar.gz -C /node_modules
fi

# The workspace packages, linked to their real source. `ln -sfn` is idempotent, so this is safe on
# every boot, and the target is the wwwroot copy rather than a second copy: one source of truth for
# the code that actually runs.
mkdir -p /node_modules/@scoresheet
for pkg in core verify server; do
  if [ -d "/home/site/wwwroot/packages/$pkg" ]; then
    ln -sfn "/home/site/wwwroot/packages/$pkg" "/node_modules/@scoresheet/$pkg"
  fi
done

echo "startup: node $(node --version), $(ls /node_modules | wc -l) packages, workspace links ready"
exec node --experimental-strip-types packages/server/src/node.ts
