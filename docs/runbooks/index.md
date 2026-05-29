# Runbooks

Operational procedures for installing, maintaining, and recovering this userscript.

| Runbook                                      | When to use                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| [install.md](install.md)                     | First-time install of the userscript                                             |
| [key-rotation.md](key-rotation.md)           | Rotating the PL Plugin API Key                                                   |
| [plan-regeneration.md](plan-regeneration.md) | Producing a fresh `plan.json` from `finance-memo.md` (legacy Claude-driven flow) |
| [generate.md](generate.md)                   | Running the generator (canonical path)                                           |
| [pages-republish.md](pages-republish.md)     | Re-publishing the `.user.js` to GitHub Pages                                     |
| [secret-leak.md](secret-leak.md)             | `plan.json` or the API key leaked somewhere public                               |
| [incident-response.md](incident-response.md) | The userscript broke in production                                               |
