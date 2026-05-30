# Changelog

## [0.2.0](https://github.com/jaetill/projectionlab-finance-sync/compare/v0.1.0...v0.2.0) (2026-05-30)


### ⚠ BREAKING CHANGES

* userscript API surface differs from initial scaffold.

### Features

* **generator:** Account Registry + Spending Targets parsers (PR-I) ([aea9d04](https://github.com/jaetill/projectionlab-finance-sync/commit/aea9d0401469bd51bb87f8ba175820438badc9db))
* **generator:** Actual Budget source — balance + 90d category spend (PR-C) ([9b70edf](https://github.com/jaetill/projectionlab-finance-sync/commit/9b70edfa8bc0d50033bb16988ceb735a1883de09))
* **generator:** add state-tax-rate lever (PR-K2) ([5fb9877](https://github.com/jaetill/projectionlab-finance-sync/commit/5fb98774b2d83f6d82a6c626b78a8bc7ac4139fe))
* **generator:** drift report markdown + cli wiring (PR-F) ([0961c6d](https://github.com/jaetill/projectionlab-finance-sync/commit/0961c6d2a099bfea58192c23072239ef29579c57))
* **generator:** emit plan.json + cli pipeline wired (PR-E) ([59e8c95](https://github.com/jaetill/projectionlab-finance-sync/commit/59e8c95667f68e7ef81bab30382b71a516ab094c))
* **generator:** map remaining 8 accounts (CDs, 529s, CCs, Truist SAV, mortgage) ([005701f](https://github.com/jaetill/projectionlab-finance-sync/commit/005701f9c425398f82caa94223d3608a6a94e1a1))
* **generator:** memo parser with inline-tag metadata (PR-B) ([5e59b12](https://github.com/jaetill/projectionlab-finance-sync/commit/5e59b12dee1dfab4990744008a2e7288e84e9086))
* **generator:** memo-native scenarios with 3 levers (PR-K) ([40d77a5](https://github.com/jaetill/projectionlab-finance-sync/commit/40d77a577bb488f367112d549876a2c80b60f766))
* **generator:** reconcile — memo + actual + manual per matrix (PR-D) ([b7df60e](https://github.com/jaetill/projectionlab-finance-sync/commit/b7df60e9bf6dd1293d741b8331f001c22b729984))
* **generator:** scaffold for Phase 3 plan.json generator (PR-A) ([b30e9f4](https://github.com/jaetill/projectionlab-finance-sync/commit/b30e9f4f0b0e7fdfde485db72326c295e3e6b3fb))
* **mcp-server:** scaffold MCP server wrapping generator (PR-J) ([d1ddead](https://github.com/jaetill/projectionlab-finance-sync/commit/d1ddead64aa9a84da05ba29c1ea12f12aae185a9))
* rewrite userscript on verified PL Plugin API (snapshot + wholesale restore) ([6dd72db](https://github.com/jaetill/projectionlab-finance-sync/commit/6dd72db3d2588b16019bf3ddfbcdad982e2c6a0e))
* **userscript:** sync accounts only; do not call restorePlans ([6335f98](https://github.com/jaetill/projectionlab-finance-sync/commit/6335f98fb0433c9de5973bab64fad582dc309499))


### Bug Fixes

* **generator:** MEMO_PATH env fallback + actual cache dir auto-create ([0244216](https://github.com/jaetill/projectionlab-finance-sync/commit/02442169d3ff45dfdca3273b2ac5c2c400a570ef))
* **generator:** real Actual balances via getAccountBalance + map TSP/Ally/Truist ([28e8338](https://github.com/jaetill/projectionlab-finance-sync/commit/28e833892af6ae0b93e31be7220916e757126b3d))


### Documentation

* **generator:** runbook + architecture + README refresh (PR-G) ([7647cbc](https://github.com/jaetill/projectionlab-finance-sync/commit/7647cbcca43289f0bc83c9f98fea39648ab1764f))
* relocate NEXT_STEPS to repo root + add explicit plan.json gen step ([d383038](https://github.com/jaetill/projectionlab-finance-sync/commit/d383038e46a7d18ae3ffb384e630cdda50e6ffbd))
