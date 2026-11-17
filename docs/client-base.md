# Client baseline

`release/client/build.py` pins the customized Neptune APK and its paired cache
by SHA-256. It is not an EN 1.0.9/build 179 baseline.

| Input | Resource version | Resource build |
| --- | ---: | ---: |
| Pinned Neptune APK | 10136 | 1366 |
| Local official EN 1.0.9 reference | 10009 | 179 |

These are `version.data` fields. The current client also contains recovered
Chinese content, English localization and custom additions. The exact official
version of the recovered content donor has not been established.

The EN reference shares some tables with the pinned client, but activity and
achievement tables differ. A matching Lua anchor or table name does not prove
that every row, ID or field has the same meaning.

Contributions must verify the specific scripts, tables and IDs they use against
the pinned input or the current published release. Record source hashes in
provenance and exercise the relevant client/server contract. English assets may
be donors after their layout and references have been checked; they do not
replace the current table baseline automatically.

The controller, title-screen and offline-web patches merged in PRs #2, #4 and #5
were subsequently applied and checked against the actual pinned source APK.
PR #5's activity table provenance names the published 0.1.3 settings bundle.
Those checks cover the named changes, rather than all future EN-based patches.
