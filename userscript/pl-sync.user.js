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
    accountMap: 'accountMap',
    lastSyncAt: 'lastSyncAt',
  };
  var CURRENT_SCHEMA_VERSION = 1;
  var ACCOUNT_TYPES = {
    TAXABLE_BROKERAGE: 1, TRADITIONAL_IRA: 1, ROTH_IRA: 1, TRADITIONAL_401K: 1,
    ROTH_401K: 1, CHECKING: 1, SAVINGS: 1, HSA: 1, CRYPTO: 1, REAL_ESTATE: 1, OTHER: 1,
  };
  var FREQUENCIES = { ANNUAL: 1, MONTHLY: 1, WEEKLY: 1, ONE_TIME: 1 };
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  }

  // ── Storage helpers ───────────────────────────────────────────────────────
  function trim(v) { return typeof v === 'string' ? v.trim() : v; }
  function getApiKey() { var v = trim(GM_getValue(KEYS.apiKey, null)); return v ? v : null; }
  function setApiKey(k) { var v = trim(k); if (!v) throw new Error('API key cannot be empty'); GM_setValue(KEYS.apiKey, v); }
  function hasApiKey() { return getApiKey() !== null; }
  function getPlan() {
    var raw = GM_getValue(KEYS.plan, null);
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function setPlanRaw(jsonString) { var parsed = JSON.parse(jsonString); GM_setValue(KEYS.plan, parsed); return parsed; }
  function getAccountMap() { var raw = GM_getValue(KEYS.accountMap, null); return (raw && typeof raw === 'object') ? raw : {}; }
  function getLastSyncAt() { return GM_getValue(KEYS.lastSyncAt, null); }
  function recordSync(ts) { var t = ts || new Date().toISOString(); GM_setValue(KEYS.lastSyncAt, t); return t; }

  // ── Plan validator ────────────────────────────────────────────────────────
  function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }
  function pushIf(errors, cond, msg) { if (!cond) errors.push(msg); }
  function validatePlan(plan) {
    var errors = [];
    if (!plan || typeof plan !== 'object') return { valid: false, errors: ['plan must be a JSON object'] };
    pushIf(errors, plan.schemaVersion === CURRENT_SCHEMA_VERSION, 'schemaVersion must be ' + CURRENT_SCHEMA_VERSION);
    pushIf(errors, typeof plan.asOfDate === 'string' && ISO_DATE.test(plan.asOfDate), 'asOfDate must be YYYY-MM-DD');
    pushIf(errors, Array.isArray(plan.accounts) && plan.accounts.length > 0, 'accounts must be a non-empty array');
    if (Array.isArray(plan.accounts)) {
      plan.accounts.forEach(function (a, i) {
        var p = 'accounts[' + i + ']';
        pushIf(errors, a && typeof a.name === 'string' && a.name.length > 0, p + '.name is required');
        pushIf(errors, a && ACCOUNT_TYPES[a.type] === 1, p + '.type unknown');
        pushIf(errors, a && isFiniteNumber(a.balance), p + '.balance must be a finite number');
        pushIf(errors, a && typeof a.currency === 'string' && a.currency.length === 3, p + '.currency must be a 3-letter code');
      });
    }
    if (Array.isArray(plan.income)) {
      plan.income.forEach(function (a, i) {
        var p = 'income[' + i + ']';
        pushIf(errors, a && typeof a.label === 'string', p + '.label is required');
        pushIf(errors, a && isFiniteNumber(a.amount), p + '.amount must be a finite number');
        pushIf(errors, a && FREQUENCIES[a.frequency] === 1, p + '.frequency unknown');
      });
    }
    if (Array.isArray(plan.expenses)) {
      plan.expenses.forEach(function (a, i) {
        var p = 'expenses[' + i + ']';
        pushIf(errors, a && typeof a.label === 'string', p + '.label is required');
        pushIf(errors, a && isFiniteNumber(a.amount), p + '.amount must be a finite number');
        pushIf(errors, a && FREQUENCIES[a.frequency] === 1, p + '.frequency unknown');
      });
    }
    if (Array.isArray(plan.milestones)) {
      plan.milestones.forEach(function (a, i) {
        var p = 'milestones[' + i + ']';
        pushIf(errors, a && typeof a.label === 'string', p + '.label is required');
        pushIf(errors, a && typeof a.date === 'string' && ISO_DATE.test(a.date), p + '.date must be YYYY-MM-DD');
      });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // ── Account mapping ───────────────────────────────────────────────────────
  function normalize(s) { return typeof s === 'string' ? s.trim().toLowerCase() : ''; }
  function resolveAccountId(name, accountMap, plAccounts) {
    if (!name) return null;
    if (accountMap && Object.prototype.hasOwnProperty.call(accountMap, name)) {
      return accountMap[name] || null;
    }
    var accts = Array.isArray(plAccounts) ? plAccounts : [];
    var exact = accts.find(function (a) { return a.name === name; });
    if (exact) return exact.id;
    var target = normalize(name);
    var ci = accts.find(function (a) { return normalize(a.name) === target; });
    if (ci) return ci.id;
    var sub = accts.find(function (a) {
      return normalize(a.name).indexOf(target) >= 0 || target.indexOf(normalize(a.name)) >= 0;
    });
    if (sub) return sub.id;
    return null;
  }

  // ── Sync ──────────────────────────────────────────────────────────────────
  function emptyResult() {
    return {
      ok: true,
      counts: { accounts: 0, milestones: 0, income: 0, expenses: 0 },
      errors: [],
      unresolved: [],
      skipped: { accounts: 0, milestones: 0, income: 0, expenses: 0 },
      startedAt: null, finishedAt: null,
    };
  }
  function recordError(result, scope, err) {
    result.ok = false;
    result.errors.push({ scope: scope, message: (err && err.message) || String(err) });
  }
  function accountsEqual(planAccount, plAccount) {
    if (!plAccount) return false;
    return plAccount.name === planAccount.name &&
      plAccount.type === planAccount.type &&
      plAccount.balance === planAccount.balance &&
      plAccount.currency === planAccount.currency;
  }
  async function syncAccounts(plan, pl, accountMap, result) {
    var existing = [];
    try { existing = await pl.getAccounts(); } catch (e) { recordError(result, 'getAccounts', e); return; }
    var unresolved = [];
    for (var i = 0; i < plan.accounts.length; i++) {
      var pa = plan.accounts[i];
      var id = resolveAccountId(pa.name, accountMap, existing);
      if (!id) { unresolved.push(pa); continue; }
      var current = existing.find(function (a) { return a.id === id; });
      if (accountsEqual(pa, current)) { result.skipped.accounts += 1; continue; }
      try { await pl.setAccount(Object.assign({ id: id }, pa)); result.counts.accounts += 1; }
      catch (e) { recordError(result, 'setAccount(' + pa.name + ')', e); }
    }
    unresolved.forEach(function (u) { result.unresolved.push({ kind: 'account', name: u.name }); });
  }
  async function syncLabeled(planList, listFn, setFn, scope, result, comparator) {
    if (!Array.isArray(planList) || planList.length === 0) return;
    var existing = [];
    try { existing = await listFn(); } catch (e) { recordError(result, scope + '.list', e); return; }
    for (var i = 0; i < planList.length; i++) {
      var item = planList[i];
      var current = (existing || []).find(function (x) { return x && x.label === item.label; });
      if (current && comparator(item, current)) { result.skipped[scope] += 1; continue; }
      try {
        var payload = current && current.id ? Object.assign({ id: current.id }, item) : Object.assign({}, item);
        await setFn(payload);
        result.counts[scope] += 1;
      } catch (e) { recordError(result, scope + '.set(' + item.label + ')', e); }
    }
  }
  async function syncPlan(plan, pl, accountMap) {
    accountMap = accountMap || {};
    var result = emptyResult();
    result.startedAt = new Date().toISOString();
    var v = validatePlan(plan);
    if (!v.valid) { result.ok = false; result.errors.push({ scope: 'validation', message: v.errors.join('; ') }); result.finishedAt = new Date().toISOString(); return result; }
    await syncAccounts(plan, pl, accountMap, result);
    await syncLabeled(plan.income, function () { return pl.getIncomes(); }, function (x) { return pl.setIncome(x); }, 'income', result, function (a, b) { return a.amount === b.amount && a.frequency === b.frequency && a.startDate === b.startDate; });
    await syncLabeled(plan.expenses, function () { return pl.getExpenses(); }, function (x) { return pl.setExpense(x); }, 'expenses', result, function (a, b) { return a.amount === b.amount && a.frequency === b.frequency && a.category === b.category; });
    await syncLabeled(plan.milestones, function () { return pl.getMilestones(); }, function (x) { return pl.setMilestone(x); }, 'milestones', result, function (a, b) { return a.date === b.date && a.kind === b.kind; });
    result.finishedAt = new Date().toISOString();
    return result;
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  var PANEL_ID = 'pl-sync-status-panel';
  var STYLE_TEXT = '#' + PANEL_ID + ' {position:fixed;bottom:16px;right:16px;z-index:2147483647;font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;background:rgba(20,22,28,0.92);color:#e8e8ec;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;min-width:220px;max-width:320px;box-shadow:0 4px 24px rgba(0,0,0,0.35);}' +
    '#' + PANEL_ID + ' header{font-weight:600;margin-bottom:6px;}' +
    '#' + PANEL_ID + ' .row{display:flex;justify-content:space-between;gap:12px;}' +
    '#' + PANEL_ID + ' .ok{color:#5fdb6c;} #' + PANEL_ID + ' .warn{color:#ffb84d;} #' + PANEL_ID + ' .err{color:#ff6c6c;}' +
    '#' + PANEL_ID + ' ul{margin:6px 0 0;padding-left:18px;} #' + PANEL_ID + ' li{margin:2px 0;}';
  function injectStyle() {
    if (document.getElementById(PANEL_ID + '-style')) return;
    var s = document.createElement('style'); s.id = PANEL_ID + '-style'; s.textContent = STYLE_TEXT; document.head.appendChild(s);
  }
  function row(label, value, cls) { return '<div class="row"><span>' + label + '</span><span class="' + (cls || '') + '">' + value + '</span></div>'; }
  function pluralize(n, label) { return n + ' ' + label + (n === 1 ? '' : 's'); }
  function formatResult(result) {
    if (!result) return '<div>No sync yet.</div>';
    var cls = result.ok ? 'ok' : 'err';
    var c = result.counts || {};
    var lines = [
      row('Status', result.ok ? 'OK' : 'Errors', cls),
      row('Updated', pluralize(c.accounts || 0, 'account')),
      row('Income', pluralize(c.income || 0, 'stream')),
      row('Expenses', pluralize(c.expenses || 0, 'stream')),
      row('Milestones', pluralize(c.milestones || 0, 'item')),
    ];
    if (result.unresolved && result.unresolved.length) {
      lines.push('<div class="warn">Unresolved: ' + result.unresolved.length + '</div>');
    }
    if (result.errors && result.errors.length) {
      var items = result.errors.slice(0, 3).map(function (e) { return '<li>' + e.scope + ': ' + e.message + '</li>'; }).join('');
      lines.push('<ul class="err">' + items + '</ul>');
    }
    return lines.join('');
  }
  function renderStatusPanel(state) {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) { panel = document.createElement('div'); panel.id = PANEL_ID; document.body.appendChild(panel); }
    var hdr = '<header>ProjectionLab Finance Sync</header>';
    var status = row('API key', state.hasApiKey ? 'set ✅' : 'missing ❌', state.hasApiKey ? 'ok' : 'err') +
      row('plan.json', state.hasPlan ? 'set ✅' : 'missing ❌', state.hasPlan ? 'ok' : 'err') +
      row('Last sync', state.lastSyncAt || 'never');
    panel.innerHTML = hdr + status + '<div style="margin-top:6px;">' + formatResult(state.lastResult) + '</div>';
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function readState(lastResult) {
    return { hasApiKey: hasApiKey(), hasPlan: !!getPlan(), lastSyncAt: getLastSyncAt(), lastResult: lastResult || null };
  }
  function rerender(lastResult) { renderStatusPanel(readState(lastResult)); }

  async function waitForPluginAPI(timeoutMs, pollMs) {
    timeoutMs = timeoutMs || 30000; pollMs = pollMs || 200;
    var win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      var api = win.projectionlabPluginAPI;
      if (api) return api;
      await new Promise(function (r) { setTimeout(r, pollMs); });
    }
    throw new Error('projectionlabPluginAPI did not load within timeout');
  }

  async function handleSyncCommand() {
    var plan = getPlan();
    if (!plan) { alert('No plan.json set. Use "Set plan.json" first.'); return; }
    if (!hasApiKey()) { alert('No PL API key set. Use "Set PL API Key" first.'); return; }
    var pl;
    try { pl = await waitForPluginAPI(); }
    catch (e) { log('Plugin API timeout', e); rerender({ ok: false, counts: {}, errors: [{ scope: 'waitForPluginAPI', message: e.message }] }); return; }
    log('Starting sync');
    var result = await syncPlan(plan, pl, getAccountMap());
    if (result.ok) recordSync(result.finishedAt);
    log('Sync done', result);
    rerender(result);
  }

  function handleSetApiKeyCommand() {
    var key = prompt('Paste your ProjectionLab Plugin API Key:');
    if (!key) return;
    try { setApiKey(key); log('API key set'); rerender(); }
    catch (e) { alert('Failed to set API key: ' + e.message); }
  }

  function handleSetPlanCommand() {
    var raw = prompt('Paste plan.json contents:');
    if (!raw) return;
    var parsed;
    try { parsed = setPlanRaw(raw); }
    catch (e) { alert('Could not parse JSON: ' + e.message); return; }
    var v = validatePlan(parsed);
    if (!v.valid) { alert('plan.json is invalid:\n\n' + v.errors.join('\n')); return; }
    log('plan.json set'); rerender();
  }

  GM_registerMenuCommand('Set PL API Key', handleSetApiKeyCommand);
  GM_registerMenuCommand('Set plan.json', handleSetPlanCommand);
  GM_registerMenuCommand('Sync now', function () { handleSyncCommand().catch(function (e) { log('Sync threw', e); }); });
  rerender();
  log('Loaded; trigger Sync now from the Tampermonkey menu.');
})();
