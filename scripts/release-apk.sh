#!/usr/bin/env bash
# Publishes a signed Android APK without ever breaking venn.salemkode.com/android:
#   1. upload it under a new name with its checksum in it (the live asset is untouched),
#   2. download it back and check the hash,
#   3. record it in docs/blaze/android-apk.json (then: test, PR, merge, `npm run build:blaze`,
#      `cd deploy && cf deploy ../dist`, and `curl -sIL https://venn.salemkode.com/android`).
# Also refreshes the fixed name Venn-BLAZE-Android.apk last, for older direct links; /android
# never points at that one, so the short gap while it is replaced breaks nothing.
# Usage: scripts/release-apk.sh path/to/signed.apk
set -euo pipefail
apk=$1
repo=salemkode/venn-blaze-2026
tag=blaze-2026-android-preview
sha=$(shasum -a 256 "$apk" | cut -d' ' -f1)
name="Venn-BLAZE-Android-${sha:0:8}.apk"
work=$(mktemp -d)
cp "$apk" "$work/$name"
(cd "$work" && shasum -a 256 "$name" > "$name.sha256")
gh release upload "$tag" -R "$repo" "$work/$name" "$work/$name.sha256"
curl -sfL -o "$work/check.apk" "https://github.com/$repo/releases/download/$tag/$name"
got=$(shasum -a 256 "$work/check.apk" | cut -d' ' -f1)
[ "$got" = "$sha" ] || { echo "Downloaded hash $got does not match $sha" >&2; exit 1; }
node -e '
  const fs = require("fs"); const p = "docs/blaze/android-apk.json";
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j, { asset: process.argv[1], sha256: process.argv[2] });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
' "$name" "$sha"
cp "$apk" "$work/Venn-BLAZE-Android.apk"
(cd "$work" && shasum -a 256 Venn-BLAZE-Android.apk > Venn-BLAZE-Android.apk.sha256)
gh release upload "$tag" -R "$repo" --clobber "$work/Venn-BLAZE-Android.apk" "$work/Venn-BLAZE-Android.apk.sha256"
echo "Uploaded $name ($sha). Now commit docs/blaze/android-apk.json, merge, build and deploy."
