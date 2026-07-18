// Keeps manifest.json + versions.json in step with package.json's version.
//
// Run indirectly via `npm version <patch|minor|major>` (wired to the "version" script in
// package.json): npm updates package.json first, then this script copies the new version into
// manifest.json and appends a { version: minAppVersion } row to versions.json.
//
// Obsidian requires the release git tag to equal manifest.version exactly, with NO "v" prefix,
// so configure that once with:  npm config set tag-version-prefix ""
//
// JSON is written with 2-space indent + trailing newline to match the existing files (the
// upstream Obsidian template uses tabs; this repo uses 2 spaces).

import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error("npm_package_version is not set — run this via `npm version`, not directly.");
}

// Copy the new version into manifest.json; keep the current minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// Record which Obsidian version this release needs, so older apps resolve an older plugin build.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`Bumped manifest.json and versions.json to ${targetVersion} (minAppVersion ${minAppVersion}).`);
