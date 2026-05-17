# `userscript/`

Source for the Tampermonkey userscript.

## Files

| File                 | Purpose                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pl-sync.user.js`    | The userscript itself. Hand-edited. Prettier ignores this file so the `// ==UserScript==` header survives intact.                                            |
| `header.template.js` | Just the `// ==UserScript== ... // ==/UserScript==` block, with `__VERSION__` as a placeholder. Used by `build.js` to stamp the released version.            |
| `build.js`           | Reads `header.template.js`, substitutes `__VERSION__` from `.release-please-manifest.json`, glues the source body on the end, writes `dist/pl-sync.user.js`. |
| `src/`               | Optional split-out modules (config, validator, mapping, sync, ui). The userscript can stay one file or split here; the tests import from this directory.     |

## Install (local dev)

```sh
npm run build
# In Tampermonkey: Dashboard → Utilities → File → choose dist/pl-sync.user.js
```

For published install, see [`../docs/runbooks/install.md`](../docs/runbooks/install.md).
