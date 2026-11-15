#!/usr/bin/env bash
# Copyright (C) 2026 Igor Toledo <contato@igor.eti.br>
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice,
#    this list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright
#    notice, this list of conditions and the following disclaimer in the
#    documentation and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
# INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
# AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
# AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
# OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
# INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
# CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
# ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
# POSSIBILITY OF SUCH DAMAGE.
#
# Builds the Nexo theme in two families (variants), each with light, dark and auto (follows the system):
#   nexo     -> dist/nexo, dist/nexo-dark, dist/nexo-auto           (modern/tech)
#   sec      -> dist/nexo-sec, dist/nexo-sec-dark, dist/nexo-sec-auto (networking/security, SOC style)
# Usage: ./build.sh            (requires sassc)
set -euo pipefail
cd "$(dirname "$0")"
SRC=src/stylesheets
SHEETS=(main dashboard opnsense-bootgrid bootstrap-dialog bootstrap-select dns-overview tokenize2 nv.d3 jquery.bootgrid)
DIST=${DIST:-dist}   # other destination: DIST=/path ./build.sh (parallel agents)
rm -rf "$DIST"; mkdir -p "$DIST"
# target = folder:mode:variant:css-folder (auto loads the family's light CSS and theme.js switches it)
for target in nexo:light:nexo:nexo nexo-dark:dark:nexo:nexo-dark nexo-auto:light:nexo:nexo \
            nexo-sec:light:sec:nexo-sec nexo-sec-dark:dark:sec:nexo-sec-dark nexo-sec-auto:light:sec:nexo-sec \
            forja:light:forja:forja forja-dark:dark:forja:forja-dark forja-auto:light:forja:forja; do
  IFS=: read -r name mode variant theme_css <<<"$target"
  out=$DIST/$name/build; mkdir -p "$out/css" "$out/images"
  ent=$DIST/.entry-$name; mkdir -p "$ent"
  for f in "${SHEETS[@]}"; do
    [ -f "$SRC/$f.scss" ] || continue
    # the auto theme uses the light CSS and switches to nexo-dark via theme.js
    printf '$mode: %s;\n$variant: %s;\n$theme-name: %s;\n@import "%s";\n' "$mode" "$variant" "$theme_css" "$f" > "$ent/$f.entry.scss"
    sassc -t expanded -I "$SRC" "$ent/$f.entry.scss" "$out/css/$f.css"
  done
  rm -rf "$ent"
  # inline SVGs -> files of the theme (legacy pages block data: images by CSP)
  python3 scripts/externalize-svg.py "$out" >/dev/null
  img=src/images/$( [ $variant = nexo ] && echo "$mode" || echo "$variant-$mode" )
  [ -d "$img" ] || img=src/images/$mode   # no images of its own yet: use Nexo's
  cp "$img"/* "$out/images/"
  # theme.js: OPNsense loads it on every page (the default is an empty placeholder).
  # *-auto: light/dark switch (theme.js is a template with __THEME__) + extras; others: extras only.
  mkdir -p "$out/js"
  if [[ $name == *-auto ]]; then
    sed "s/__THEME__/${name%-auto}/g" src/js/theme.js > "$out/js/theme.js"
  else
    : > "$out/js/theme.js"
  fi
  cat src/js/nexo-extras.js >> "$out/js/theme.js"
  [ "$variant" = forja ] && cat src/js/forja-fx.js >> "$out/js/theme.js"
  cp LICENSE LICENSE-nexo "$DIST/$name/" 2>/dev/null || true
done
echo "ok: $(find "$DIST" -name '*.css' | wc -l) stylesheets in $DIST/"
