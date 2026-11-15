# Upstream sources

The canonical server is the TypeScript `Yricky/new-cafe` checkout at
`a2614e2dead9072e8c5631f77b9745a39fccefd1`, with the existing local gameplay
extensions retained. Its server license is CC0-1.0.

The [GirlCafeGun-Offline server](https://github.com/BlackrUSter4/GirlCafeGun-Offline)
was reviewed at main commit `a357bc45dc8ca0569441d5d37764a0e4e0be14b9`.
Its C# source informed MOD costs, progression gates and protocol behavior.
It was adapted to this server's atomic JSON transactions. The MIT notice,
copyright 2025 luoxiadesu, is retained in `server/LICENSES/SssjServer-MIT.txt`
and in the embedded payload. Upstream tooling and documentation have a separate
MIT notice, copyright 2026 GCG2-Offline contributors. These licenses do not
license the game's art, audio, binaries, trademarks or other game assets.

The local pages for the web windows (`server/src/servers/web-pages.ts`,
`server/resources/web/`, `release/client/offline_web.lua`, `patch_offline_web.py`
and `test_offline_web.py`) are ported from that repository at
[189eec1](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/189eec1fe2f04648d62a43be2a8885e014329e2f):
`WebAssets.cs` and the notice routes of `BootstrapHttpServer.cs` in
`server/src/SssjServer.Core`, its pages `Web/notice/index.html` and
`Web/maintenance/index.html`, and `tools/patch_lua_offline_web.py`. Each ported
file names its source. That client loads its pages from the publisher's hosts and
the port maps two of those addresses; this release names the local server for
every web window, so the recipe here gives each window its page. See
[local web pages](../server/docs/modules/23-offline-web-pages.md).

The complete pull request inventory at review time contained one open request,
zero closed requests, and no review or conversation comments:
[PR #1](https://github.com/BlackrUSter4/GirlCafeGun-Offline/pull/1), 53 files and
18 commits, head `f2772356566214000630cba227a67ecf1cc2ac24`. It was unmerged.
The request concerns phone packaging, controller input, local pages, purchases,
event rewards and transaction hardening; it contains no Neptune or MOD fix.
Potentially useful references, rather than changes blindly copied into this release:

- [88c397d](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/88c397df641a1de19daba9c352aefc459682974c): gacha snapshots, stack consumption and arithmetic guards.
- [ba40bca](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/ba40bcacb31bbba92206e809261e3b13313c18db): preserve committed state when response sending fails.
- [d46a615](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/d46a615f90668393ad4c4e97d9112cee5f871b2d): activity achievements and login-day rewards.
- [5a66d20](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/5a66d204db734bc78fabc7704c4d1abcd8d26883): offline purchases and shop arithmetic.

The title-screen patch (`release/client/title_screens.lua`, `patch_title.py`
and `test_title.py`) recreates and extends an edit of that repository's phone
build. The edit, with two titles, exists there only inside a patched `lua.u`;
its description is section 3.2 of
`docs/05-PHONE-PORT-2026-11-11.md` at
[c5b9ed9](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/c5b9ed93e91028d7719e869da8e09ae07a34186c).
The recipe and its test are new tooling, MIT, copyright 2026 GCG2-Offline
contributors. The prefab with translated button labels that the section also
describes is a game asset and is not part of this release; see
[title screens](title-screens.md).

The controller layer (`release/client/gamepad_fight.lua`, `patch_gamepad.py` and
`test_gamepad.py`) is adapted from that repository's tooling at
[45510eb](https://github.com/BlackrUSter4/GirlCafeGun-Offline/commit/45510ebdcbf53ae18b52500d27546e4bd0501b64):
`tools/lua/GamepadFight.lua`, `tools/patch_lua_gamepad.py` and
`tools/lua/test_gamepad.py`, MIT, copyright 2026 GCG2-Offline contributors. Each
adapted file names its source. The InputManager change of that commit is not
part of this release; see [controller support](controller.md).

The local extracted C# reference and upstream have identical normalized source
for `RuneFeature.cs` (Git blob `aca74fc4cd2fc57bd9a6c6a788741d7c63f1a68d`) and
`RuneTable.cs` (`ac703fd32ded6cff980bbd24a7f1282e220b6920`). We corrected several
gaps rather than reproducing them: skills now unlock during enhancement;
revision preserves active and proposed skills separately; discarding a revision
really keeps the old skills; and breakthrough validates the submitted material
GUIDs. The client already supports active type-2 and pending type-6 skill entries.

Pull request #1 was later merged upstream at
`bf9f9220cb7021bcf203c4bbe6cdbb79ca5ace95`. Notes that follow from that work:

- The daily save backup follows the upstream phone launcher work, which copies
  the save before the embedded server starts. No code was copied; the store
  implementation here is new.
- The gacha ticket fix in 88c397d (spend across several stacks) was checked
  and is not needed here: every pool costs one ticket, and the spend already
  skips empty stacks. Its draw snapshot is not needed either, because a draw is
  one `JsonStore.update` transaction. The arithmetic guards of 88c397d and
  5a66d20 are not needed: quantities are JavaScript numbers, `buyNum` is
  limited to 99, and varints are encoded through `BigInt`.

Welcome rewards use their own persistent campaign marker, independent of other
mail and surviving message deletion. The fixed local account starts a fresh
tutorial save; development profiles and trial-state copying are not shipped.

The story editor in `tools/story-editor/` (a local viewer and translation editor for story cutscenes) was
written for GirlCafeGun-Offline and is contributed here under this repository's MIT license. It contains code
only and reads the game data that the user supplies. Characters need the Live2D Cubism Core, which is not
included; see `tools/story-editor/README.md`.
