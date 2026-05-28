// ==UserScript==
// @name         ProjectionLab Finance Sync
// @namespace    https://github.com/jaetill/projectionlab-finance-sync
// @version      0.1.0
// @description  Push plan.json into ProjectionLab via the Plugin API
// @author       Jason Tilley
// @match        https://app.projectionlab.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @updateURL    https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js
// @downloadURL  https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

// NOTE: This file is the deliverable installed by Tampermonkey.
// The logic mirrors userscript/src/*.js, which are the unit-tested ES-module copies.
// Any change to behavior here MUST also land in src/*.js (and vice versa).
// Build (`npm run build`) only substitutes the @version line — it does NOT regenerate this file.

(function () {
  'use strict';

  // ── Constants & storage keys ──────────────────────────────────────────────
  var LOG_PREFIX = '[pl-sync]';
  var KEYS = {
    apiKey: 'apiKey',
    plan: 'plan',
    lastSyncAt: 'lastSyncAt',
    rollbackSnapshot: 'rollbackSnapshot',
  };
  var KNOWN_ACCOUNT_TYPES = {
    'ira': 1, 'roth-ira': 1, 'taxable': 1, 'savings': 1, 'checking': 1,
    '401k': 1, 'roth-401k': 1, '403b': 1, 'hsa': 1, 'sep-ira': 1, 'simple-ira': 1,
    'crypto': 1, 'cd': 1, 'money-market': 1, 'brokerage': 1,
  };
  var KNOWN_MILESTONE_CRITERIA_TYPES = {
    'year': 1, 'age': 1, 'spending': 1, 'net_worth': 1,
    'savings': 1, 'income': 1, 'asset': 1,
  };

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  }

  // ── Storage helpers (mirrors src/auth.js) ─────────────────────────────────
  function trim(v) { return typeof v === 'string' ? v.trim() : v; }

  function getApiKey() {
    var v = trim(GM_getValue(KEYS.apiKey, null));
    return v ? v : null;
  }
  function setApiKey(key) {
    var v = trim(key);
    if (!v) throw new Error('API key cannot be empty');
    GM_setValue(KEYS.apiKey, v);
  }
  function clearApiKey() { GM_setValue(KEYS.apiKey, ''); }
  function hasApiKey() { return getApiKey() !== null; }

  function getPlan() {
    var raw = GM_getValue(KEYS.plan, null);
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function setPlanRaw(jsonString) {
    var parsed = JSON.parse(jsonString);
    GM_setValue(KEYS.plan, parsed);
    return parsed;
  }

  function getLastSyncAt() { return GM_getValue(KEYS.lastSyncAt, null); }
  function recordSync(ts) {
    var stamp = ts || new Date().toISOString();
    GM_setValue(KEYS.lastSyncAt, stamp);
    return stamp;
  }

  function getRollbackSnapshot() { return GM_getValue(KEYS.rollbackSnapshot, null); }
  function setRollbackSnapshot(snap) {
    if (!snap || typeof snap !== 'object') throw new Error('rollback snapshot must be an object');
    GM_setValue(KEYS.rollbackSnapshot, snap);
  }
  function clearRollbackSnapshot() { GM_setValue(KEYS.rollbackSnapshot, null); }

  // ── Plan validator (mirrors src/plan-validator.js) ────────────────────────
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNonEmptyString(v) { return typeof v === 'string' && v.length > 0; }
  function pushIf(errors, cond, msg) { if (!cond) errors.push(msg); }

  function validateAccountList(list, listName, errors, warnings) {
    if (!Array.isArray(list)) { errors.push('today.' + listName + ' must be an array'); return; }
    for (var i = 0; i < list.length; i++) {
      var acct = list[i];
      var prefix = 'today.' + listName + '[' + i + ']';
      pushIf(errors, isObject(acct), prefix + ' must be an object');
      if (!isObject(acct)) continue;
      pushIf(errors, isNonEmptyString(acct.id), prefix + '.id must be a non-empty string');
      pushIf(errors, isNonEmptyString(acct.name), prefix + '.name must be a non-empty string');
      pushIf(errors, isNonEmptyString(acct.type), prefix + '.type must be a non-empty string');
      pushIf(errors, typeof acct.balance === 'number' && isFinite(acct.balance),
        prefix + '.balance must be a finite number');
      if (isNonEmptyString(acct.type) && !KNOWN_ACCOUNT_TYPES[acct.type]) {
        warnings.push(prefix + ".type='" + acct.type + "' is not in KNOWN_ACCOUNT_TYPES — PL may reject it");
      }
    }
  }

  function validateMilestone(m, planIdx, mi, errors, warnings) {
    var prefix = 'plans[' + planIdx + '].milestones[' + mi + ']';
    pushIf(errors, isObject(m), prefix + ' must be an object');
    if (!isObject(m)) return;
    pushIf(errors, isNonEmptyString(m.id), prefix + '.id must be a non-empty string');
    pushIf(errors, isNonEmptyString(m.name), prefix + '.name must be a non-empty string');
    if (m.criteria !== undefined) {
      pushIf(errors, Array.isArray(m.criteria), prefix + '.criteria must be an array');
      if (Array.isArray(m.criteria)) {
        for (var ci = 0; ci < m.criteria.length; ci++) {
          var c = m.criteria[ci];
          var cp = prefix + '.criteria[' + ci + ']';
          pushIf(errors, isObject(c), cp + ' must be an object');
          if (!isObject(c)) continue;
          pushIf(errors, isNonEmptyString(c.type), cp + '.type must be a non-empty string');
          if (isNonEmptyString(c.type) && !KNOWN_MILESTONE_CRITERIA_TYPES[c.type]) {
            warnings.push(cp + ".type='" + c.type + "' is not in KNOWN_MILESTONE_CRITERIA_TYPES");
          }
        }
      }
    }
  }

  function validateEventBag(bag, label, planIdx, errors) {
    if (bag === undefined) return;
    var prefix = 'plans[' + planIdx + '].' + label;
    pushIf(errors, isObject(bag), prefix + ' must be an object with an events array');
    if (!isObject(bag)) return;
    pushIf(errors, Array.isArray(bag.events), prefix + '.events must be an array');
    if (Array.isArray(bag.events)) {
      for (var ei = 0; ei < bag.events.length; ei++) {
        var ev = bag.events[ei];
        var ep = prefix + '.events[' + ei + ']';
        pushIf(errors, isObject(ev), ep + ' must be an object');
        if (!isObject(ev)) continue;
        pushIf(errors, isNonEmptyString(ev.id), ep + '.id must be a non-empty string');
        pushIf(errors, isNonEmptyString(ev.name), ep + '.name must be a non-empty string');
      }
    }
  }

  function validatePlan_one(plan, idx, errors, warnings) {
    var prefix = 'plans[' + idx + ']';
    pushIf(errors, isObject(plan), prefix + ' must be an object');
    if (!isObject(plan)) return;
    pushIf(errors, isNonEmptyString(plan.id), prefix + '.id must be a non-empty string');
    pushIf(errors, isNonEmptyString(plan.name), prefix + '.name must be a non-empty string');
    if (plan.milestones !== undefined) {
      pushIf(errors, Array.isArray(plan.milestones), prefix + '.milestones must be an array');
      if (Array.isArray(plan.milestones)) {
        for (var mi = 0; mi < plan.milestones.length; mi++) {
          validateMilestone(plan.milestones[mi], idx, mi, errors, warnings);
        }
      }
    }
    validateEventBag(plan.income, 'income', idx, errors);
    validateEventBag(plan.expenses, 'expenses', idx, errors);
    validateEventBag(plan.accounts, 'accounts', idx, errors);
    validateEventBag(plan.assets, 'assets', idx, errors);
  }

  function validatePlan(plan) {
    var errors = [];
    var warnings = [];
    if (!isObject(plan)) return { valid: false, errors: ['plan must be a JSON object'], warnings: warnings };
    if (!isObject(plan.today)) {
      errors.push('top-level "today" must be an object');
    } else {
      validateAccountList(plan.today.savingsAccounts, 'savingsAccounts', errors, warnings);
      validateAccountList(plan.today.investmentAccounts, 'investmentAccounts', errors, warnings);
      if (!Array.isArray(plan.today.debts)) errors.push('today.debts must be an array');
      if (!Array.isArray(plan.today.assets)) errors.push('today.assets must be an array');
    }
    if (!Array.isArray(plan.plans) || plan.plans.length === 0) {
      errors.push('top-level "plans" must be a non-empty array');
    } else {
      for (var i = 0; i < plan.plans.length; i++) {
        validatePlan_one(plan.plans[i], i, errors, warnings);
      }
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ── Sync orchestrator (mirrors src/sync.js) ───────────────────────────────
  function emptyResult() {
    return {
      ok: true, steps: [], rollbackSnapshot: null,
      errors: [], warnings: [], startedAt: null, finishedAt: null,
    };
  }

  function runStep(name, fn, result) {
    var startedAt = Date.now();
    return Promise.resolve()
      .then(fn)
      .then(function (value) {
        result.steps.push({ name: name, ok: true, durationMs: Date.now() - startedAt });
        return { ok: true, value: value };
      })
      .catch(function (err) {
        var message = (err && err.message) || String(err);
        result.steps.push({ name: name, ok: false, durationMs: Date.now() - startedAt, error: message });
        result.errors.push({ scope: name, message: message });
        result.ok = false;
        return { ok: false, error: err };
      });
  }

  async function syncPlan(plan, pl, apiKey) {
    var result = emptyResult();
    result.startedAt = Date.now();
    var validation = validatePlan(plan);
    if (!validation.valid) {
      result.ok = false;
      result.errors.push({ scope: 'validate-plan', message: validation.errors.join('; ') });
      result.finishedAt = Date.now();
      return result;
    }
    if (validation.warnings && validation.warnings.length) {
      result.warnings.push.apply(result.warnings, validation.warnings);
    }
    if (!apiKey) {
      result.ok = false;
      result.errors.push({ scope: 'validate-plan', message: 'apiKey is required' });
      result.finishedAt = Date.now();
      return result;
    }
    var options = { key: apiKey };

    var step1 = await runStep('validate-api-key', function () { return pl.validateApiKey(options); }, result);
    if (!step1.ok) { result.finishedAt = Date.now(); return result; }

    var step2 = await runStep('export-data', function () { return pl.exportData(options); }, result);
    if (!step2.ok) { result.finishedAt = Date.now(); return result; }
    result.rollbackSnapshot = step2.value;

    await runStep('restore-current-finances', function () {
      return pl.restoreCurrentFinances(plan.today, options);
    }, result);
    await runStep('restore-plans', function () {
      return pl.restorePlans(plan.plans, options);
    }, result);

    result.finishedAt = Date.now();
    return result;
  }

  async function rollbackTo(snapshot, pl, apiKey) {
    var result = emptyResult();
    result.startedAt = Date.now();
    if (!snapshot || typeof snapshot !== 'object') {
      result.ok = false;
      result.errors.push({ scope: 'rollback', message: 'snapshot is missing or invalid' });
      result.finishedAt = Date.now();
      return result;
    }
    if (!apiKey) {
      result.ok = false;
      result.errors.push({ scope: 'rollback', message: 'apiKey is required' });
      result.finishedAt = Date.now();
      return result;
    }
    var options = { key: apiKey };
    await runStep('validate-api-key', function () { return pl.validateApiKey(options); }, result);
    if (!result.ok) { result.finishedAt = Date.now(); return result; }
    if (snapshot.today !== undefined) {
      await runStep('restore-current-finances', function () {
        return pl.restoreCurrentFinances(snapshot.today, options);
      }, result);
    }
    if (Array.isArray(snapshot.plans)) {
      await runStep('restore-plans', function () {
        return pl.restorePlans(snapshot.plans, options);
      }, result);
    }
    result.finishedAt = Date.now();
    return result;
  }

  // ── UI (mirrors src/ui.js) ────────────────────────────────────────────────
  var PANEL_ID = 'pl-sync-status-panel';
  var STYLE = '#' + PANEL_ID + ' {' +
    'position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;' +
    'font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;' +
    'background: rgba(20, 22, 28, 0.92); color: #e8e8ec;' +
    'border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;' +
    'padding: 10px 12px; min-width: 240px; max-width: 360px;' +
    'box-shadow: 0 4px 24px rgba(0,0,0,0.35); }' +
    '#' + PANEL_ID + ' header { font-weight: 600; margin-bottom: 6px; }' +
    '#' + PANEL_ID + ' .row { display: flex; justify-content: space-between; gap: 12px; }' +
    '#' + PANEL_ID + ' .ok { color: #5fdb6c; }' +
    '#' + PANEL_ID + ' .warn { color: #ffb84d; }' +
    '#' + PANEL_ID + ' .err { color: #ff6c6c; }' +
    '#' + PANEL_ID + ' ul { margin: 6px 0 0; padding-left: 18px; }' +
    '#' + PANEL_ID + ' li { margin: 2px 0; }' +
    '#' + PANEL_ID + ' .step { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }';

  function injectStyle(doc) {
    if (doc.getElementById(PANEL_ID + '-style')) return;
    var style = doc.createElement('style');
    style.id = PANEL_ID + '-style';
    style.textContent = STYLE;
    doc.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function row(label, value, cls) {
    return '<div class="row"><span>' + escapeHtml(label) + '</span><span class="' + (cls || '') + '">' + escapeHtml(value) + '</span></div>';
  }

  function formatResult(result) {
    if (!result) return '<div>No sync yet.</div>';
    var cls = result.ok ? 'ok' : 'err';
    var lines = [row('Sync result', result.ok ? 'OK' : 'Errors', cls)];
    if (Array.isArray(result.steps) && result.steps.length) {
      var stepHtml = result.steps.map(function (s) {
        var mark = s.ok ? '✅' : '❌';
        var dur = typeof s.durationMs === 'number' ? ' (' + s.durationMs + 'ms)' : '';
        return '<li class="step">' + mark + ' ' + escapeHtml(s.name) + escapeHtml(dur) + '</li>';
      }).join('');
      lines.push('<ul>' + stepHtml + '</ul>');
    }
    if (Array.isArray(result.warnings) && result.warnings.length) {
      var w = result.warnings.slice(0, 3).map(function (m) { return '<li>' + escapeHtml(m) + '</li>'; }).join('');
      lines.push('<div class="warn">Warnings:</div><ul class="warn">' + w + '</ul>');
    }
    if (Array.isArray(result.errors) && result.errors.length) {
      var items = result.errors.slice(0, 3).map(function (e) {
        return '<li>' + escapeHtml(e.scope) + ': ' + escapeHtml(e.message) + '</li>';
      }).join('');
      lines.push('<ul class="err">' + items + '</ul>');
    }
    return lines.join('');
  }

  function statusRows(state) {
    return [
      row('API key', state.hasApiKey ? 'set ✅' : 'missing ❌', state.hasApiKey ? 'ok' : 'err'),
      row('plan.json', state.hasPlan ? 'set ✅' : 'missing ❌', state.hasPlan ? 'ok' : 'err'),
      row('Last sync', state.lastSyncAt || 'never'),
      row('Rollback ready', state.hasRollback ? 'yes' : 'no', state.hasRollback ? 'ok' : 'warn'),
    ].join('');
  }

  function renderStatusPanel(state, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    injectStyle(doc);
    var panel = doc.getElementById(PANEL_ID);
    if (!panel) {
      panel = doc.createElement('div');
      panel.id = PANEL_ID;
      doc.body.appendChild(panel);
    }
    panel.innerHTML = '<header>ProjectionLab Finance Sync</header>' +
      statusRows(state) +
      '<div style="margin-top:6px;">' + formatResult(state.lastResult) + '</div>';
    return panel;
  }

  // ── Bootstrap (mirrors src/main.js) ───────────────────────────────────────
  async function waitForPluginAPI(timeoutMs, pollMs) {
    timeoutMs = timeoutMs || 30000;
    pollMs = pollMs || 200;
    var win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      var api = win && win.projectionlabPluginAPI;
      if (api) return api;
      await new Promise(function (r) { setTimeout(r, pollMs); });
    }
    throw new Error('projectionlabPluginAPI did not load within timeout');
  }

  function readState(lastResult) {
    return {
      hasApiKey: hasApiKey(),
      hasPlan: !!getPlan(),
      hasRollback: !!getRollbackSnapshot(),
      lastSyncAt: getLastSyncAt(),
      lastResult: lastResult || null,
    };
  }

  function rerender(lastResult) { renderStatusPanel(readState(lastResult)); }

  async function handleSyncCommand() {
    var plan = getPlan();
    if (!plan) { alert('No plan.json set. Use "Set plan.json" first.'); return; }
    var apiKey = getApiKey();
    if (!apiKey) { alert('No PL API key set. Use "Set PL API Key" first.'); return; }
    var pl;
    try {
      pl = await waitForPluginAPI();
    } catch (err) {
      log('Plugin API timeout', err);
      rerender({ ok: false, steps: [], errors: [{ scope: 'wait-for-plugin-api', message: err.message }] });
      return;
    }
    log('Starting sync');
    var result = await syncPlan(plan, pl, apiKey);
    if (result.rollbackSnapshot) {
      try { setRollbackSnapshot(result.rollbackSnapshot); }
      catch (err) { log('Failed to save rollback snapshot', err); }
    }
    if (result.ok) recordSync(new Date(result.finishedAt || Date.now()).toISOString());
    log('Sync done', result);
    rerender(result);
  }

  async function handleRollbackCommand() {
    var snapshot = getRollbackSnapshot();
    if (!snapshot) { alert('No rollback snapshot stored. Run a sync first to capture one.'); return; }
    var apiKey = getApiKey();
    if (!apiKey) { alert('No PL API key set.'); return; }
    if (!confirm('Restore ProjectionLab to the snapshot captured before the last sync?')) return;
    var pl;
    try { pl = await waitForPluginAPI(); }
    catch (err) { alert('Plugin API not ready: ' + err.message); return; }
    log('Starting rollback');
    var result = await rollbackTo(snapshot, pl, apiKey);
    log('Rollback done', result);
    rerender(result);
  }

  function handleSetApiKeyCommand() {
    var key = prompt('Paste your ProjectionLab Plugin API Key:');
    if (!key) return;
    try { setApiKey(key); log('API key set'); rerender(); }
    catch (err) { alert('Failed to set API key: ' + err.message); }
  }
  function handleClearApiKeyCommand() {
    if (!confirm('Clear the stored PL API key?')) return;
    clearApiKey(); log('API key cleared'); rerender();
  }
  function handleSetPlanCommand() {
    var raw = prompt('Paste plan.json contents:');
    if (!raw) return;
    var parsed;
    try { parsed = setPlanRaw(raw); }
    catch (err) { alert('Could not parse JSON: ' + err.message); return; }
    var validation = validatePlan(parsed);
    if (!validation.valid) {
      alert('plan.json is invalid:\n\n' + validation.errors.join('\n'));
      return;
    }
    if (validation.warnings && validation.warnings.length) {
      log('plan.json warnings', validation.warnings);
    }
    log('plan.json set');
    rerender();
  }
  function handleClearRollbackCommand() {
    if (!confirm('Discard the stored rollback snapshot?')) return;
    clearRollbackSnapshot(); log('Rollback snapshot cleared'); rerender();
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand === 'undefined') return;
    GM_registerMenuCommand('Set PL API Key', handleSetApiKeyCommand);
    GM_registerMenuCommand('Clear PL API Key', handleClearApiKeyCommand);
    GM_registerMenuCommand('Set plan.json', handleSetPlanCommand);
    GM_registerMenuCommand('Sync now', function () {
      handleSyncCommand().catch(function (err) { log('Sync threw', err); });
    });
    GM_registerMenuCommand('Rollback to last snapshot', function () {
      handleRollbackCommand().catch(function (err) { log('Rollback threw', err); });
    });
    GM_registerMenuCommand('Clear rollback snapshot', handleClearRollbackCommand);
  }

  function bootstrap() {
    registerMenuCommands();
    rerender();
    log('Loaded; waiting for user to trigger Sync now');
  }

  bootstrap();
})();
