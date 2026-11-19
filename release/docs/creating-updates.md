# Creating a resource update

Use Python 3.10 or newer and a JDK (Java and javac on the same installation).
Set `GCG_JAVA` to the Java executable if it is not discovered automatically.
Work from the repository root. Keep a backup of the installed release's full
manifest: its `releaseId` is the update's required base.

1. Create a `changes/` directory with only changed/new resources at their normal
   relative paths, such as `changes/lang.u` or `changes/npc/example.u`.
2. Give the update a new release ID. Run:

   ```sh
   python release/tools/make_update.py --base-manifest inputs/manifest.json --changes changes --release-id community-001 --output outputs/community-001.gcgupdate
   ```

3. The first invocation creates a private signing identity under
   `release/private/signing/` and embeds its **public** verification key in the
   update. Preserve the private key securely; do not publish it. Share the public
   key's SHA-256 fingerprint through a trusted channel so players can compare the
   one-time trust prompt.
4. Import the package through the login Update button. It must match the
   currently committed base release and pass verification before publication.

Use `--remove path/to/obsolete.u` for an intentional resource deletion.
`version.data` must agree with changed asset bundles and their routes, sizes and
CRCs. The tool signs bytes; it cannot validate every game's gameplay schema.

For an embedded server change, build a clean payload from the server source and
add `--server-payload outputs/payload.zip`. Payloads must exclude player state,
logs, profile tools and development configuration. Persistent player data remains
outside payloads.

Official APK deltas additionally take `--base-apk`, `--target-apk`,
`--version-code` and `--certificate`. Both APKs must have the same package and
publisher certificate, and the target version code must increase. Preserve the
exact signed source APK: re-signing or re-compressing it changes its identity.
The delta reuses identical compressed members and stores only the remaining
bytes. Android reconstructs and verifies the exact signed target APK before
showing its installer. Only the APK's original publisher key can authorize this
operation; another data publisher cannot replace it.

For a sequence of community updates, retain a complete manifest for each
resulting resource state. A delta's changed-file list is not a complete full
manifest and must not be used as if it were one.

## Hosting budget and update size

The project's R2 storage budget is 10 GB. Before every upload, inventory the
actual stored object sizes and calculate peak usage, including the temporary
overlap while old and new artifacts coexist. Keep at least 1 GB of headroom;
if the projected peak exceeds 9 GB, reduce duplication or safely retire
unreferenced objects before uploading. Do not treat delayed dashboard usage
figures as an object inventory.

Reuse unchanged pack URLs and exact hashes across releases. Renaming a release
does not justify copying its full data set into another version directory.
Separate frequently edited bundles and indexes from large static media in a
future pack layout so a small edit does not duplicate a mostly unchanged
180 MB pack. The current installer strictly validates each pack's complete
membership; changing pack layout requires a matching signed manifest and
verified installation, rather than pointing it at an incompatible old ZIP.

Publish changed-resource/server updates without an APK delta when the installed
launcher can apply them. Rebuild the full APK when needed for a correct fresh
install or launcher changes, and publish exact APK deltas for existing players.
The present resource format includes whole changed files; it does not yet apply
binary patches inside asset bundles. Do not claim otherwise when estimating
download sizes.

Keep one current full APK on R2. Retire older APK parts only after the new public
APK passes full hash and range checks and older installer links redirect to it.
Keep private exact APK bases and rollback archives locally. Prefer a bounded,
tested chain of small update bridges over accumulating cumulative direct deltas
for every historical base; verify every supported starting version still has a
working route before retiring a delta.

Delete data packs or update packages only after tracing all retained full
manifests, signed channels, bridge routes and download pages. A pack under an
older version prefix may still be required by the current release. Record the
objects removed and bytes reclaimed after each release. Never prune player data
or signing keys as part of hosting cleanup.
