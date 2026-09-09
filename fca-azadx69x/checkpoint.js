"use strict";
// fca-azadx69x 
// fixed by @Azadx69x

/**
 * Detects, classifies, reports and (where possible) bypasses Facebook checkpoints.
 * Usage: const checkpoint = require("./checkpoint");
 * const result = await checkpoint.handle(res, { jar, appState, userID, globalOptions, utils });
 * if (result.blocked) throw result;
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(process.cwd(), "checkpoint_state.json");

/** Known checkpoint flows, keyed by the numeric flow id in the checkpoint URL. */
const CHECKPOINT_TYPES = {
  "601051028565049": {
    id: "automated_behavior",
    label: "Automated behavior warning (scraping warning)",
    severity: "warning",
    bypassable: true,
  },
  "828281030927956": {
    id: "account_locked",
    label: "Account locked — identity/unvetted flow",
    severity: "blocked",
    bypassable: false,
  },
  "1501092823525282": {
    id: "account_suspended",
    label: "Account suspended — community standards",
    severity: "blocked",
    bypassable: false,
  },
  "1339039300213622": {
    id: "device_approval",
    label: "Login approval / new device confirmation required",
    severity: "blocked",
    bypassable: false,
  },
  "828281030927956_2fa": {
    id: "two_factor",
    label: "Two-factor authentication required",
    severity: "blocked",
    bypassable: false,
  },
};

const UNKNOWN_TYPE = {
  id: "unknown_checkpoint",
  label: "Unknown checkpoint",
  severity: "blocked",
  bypassable: false,
};

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeBody(res) {
  return typeof res?.body === "string" ? res.body : "";
}

function currentUrl(res) {
  return res?.request?.uri?.href || res?.request?.href || "";
}

function resolveUID(appState, userID) {
  if (userID) return String(userID);
  if (!Array.isArray(appState)) return "unknown";
  const c =
    appState.find((i) => i.key === "i_user" || i.name === "i_user") ||
    appState.find((i) => i.key === "c_user" || i.name === "c_user");
  return c ? String(c.value) : "unknown";
}

/** Pull the tokens needed for any checkpoint mutation out of the HTML. */
function extractTokens(body, utils) {
  const fb_dtsg = utils.getFrom(body, '["DTSGInitData",[],{"token":"', '","');
  const jazoest = utils.getFrom(body, "jazoest=", '",');
  const lsd = utils.getFrom(body, '["LSD",[],{"token":"', '"}');
  return { fb_dtsg, jazoest, lsd };
}

/**
 * Classify a response. Returns null when the response is not a checkpoint.
 */
function detect(res, appState, userID) {
  const url = currentUrl(res);
  const body = safeBody(res);
  const uid = resolveUID(appState, userID);

  const isCheckpointUrl = url.includes("/checkpoint/");
  const isBlockPage = body.includes("/checkpoint/block/?next");
  const isTwoFactor =
    body.includes("checkpoint/?next") &&
    /approvals_code|two_step_verification/i.test(body);

  if (!isCheckpointUrl && !isBlockPage && !isTwoFactor) return null;

  let type = UNKNOWN_TYPE;
  let flowId = null;
  for (const key of Object.keys(CHECKPOINT_TYPES)) {
    if (url.includes(key)) {
      flowId = key;
      type = CHECKPOINT_TYPES[key];
      break;
    }
  }
  if (!flowId && isTwoFactor) type = CHECKPOINT_TYPES["828281030927956_2fa"];

  return {
    checkpoint: true,
    uid,
    url,
    flowId,
    type: type.id,
    label: type.label,
    severity: type.severity,
    bypassable: type.bypassable,
    reasons: extractReasons(type.id, body),
    detectedAt: new Date().toISOString(),
  };
}

/** Human-readable reasons, per checkpoint type. */
function extractReasons(typeId, body) {
  const reasons = {};

  if (typeId === "account_suspended") {
    const duration = body.match(/"log_out_uri":"(.*?)","title":"(.*?)"/);
    if (duration?.[2]) reasons.durationInfo = duration[2];
    const long = body.match(/"reason_section_body":"(.*?)"/);
    if (long?.[1]) {
      reasons.longReason = long[1];
      const short = long[1]
        .toLowerCase()
        .replace(
          "your account, or activity on it, doesn't follow our community standards on ",
          ""
        );
      reasons.shortReason = short.charAt(0).toUpperCase() + short.slice(1);
    }
  }

  if (typeId === "account_locked") {
    const lock = body.match(/"is_unvetted_flow":true,"title":"(.*?)"/);
    if (lock?.[1]) reasons.reason = lock[1];
  }

  if (typeId === "device_approval") {
    const t = body.match(/"title":"(.*?)"/);
    if (t?.[1]) reasons.reason = t[1];
  }

  if (!reasons.reason && !reasons.longReason) {
    const generic = body.match(/<title>(.*?)<\/title>/);
    if (generic?.[1]) reasons.pageTitle = generic[1];
  }

  return reasons;
}

/** Persist per-account checkpoint status so the bot can decide to retry later. */
function saveState(uid, entry, utils) {
  try {
    let all = {};
    if (fs.existsSync(STATE_FILE)) {
      try {
        all = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {};
      } catch {
        all = {};
      }
    }
    const prev = all[uid] || {};
    all[uid] = {
      ...entry,
      attempts: entry.type === prev.type ? (prev.attempts || 0) + 1 : 1,
      firstSeenAt: entry.type === prev.type ? prev.firstSeenAt || entry.detectedAt : entry.detectedAt,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), "utf8");
    return all[uid];
  } catch (e) {
    utils?.warn?.(`checkpoint: could not save state: ${e.message}`);
    return entry;
  }
}

function readState(uid) {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const all = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {};
    return uid ? all[uid] || null : all;
  } catch {
    return null;
  }
}

function clearState(uid) {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const all = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {};
    if (uid) delete all[uid];
    fs.writeFileSync(STATE_FILE, JSON.stringify(uid ? all : {}, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

function report(info, utils) {
  const log = info.severity === "blocked" ? utils.error : utils.warn;
  log(`Checkpoint on ${info.uid}:`, `${info.label} (${info.type})`);
  if (info.flowId) log("Checkpoint flow id:", info.flowId);
  Object.entries(info.reasons || {}).forEach(([k, v]) => log(`  ${k}:`, v));
  if (!info.bypassable) {
    utils.error(
      "Action required:",
      "open https://www.facebook.com in a browser with this account and clear the checkpoint manually."
    );
  }
}

/** Bypass state, tracked per account so one bad account can't stall the rest. */
const bypassTracker = new Map();
const MAX_BYPASS_RETRIES = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function tracker(uid) {
  if (!bypassTracker.has(uid)) bypassTracker.set(uid, { count: 0, cooldownUntil: 0 });
  return bypassTracker.get(uid);
}

/**
 * Attempt the scraping-warning dismissal mutation.
 * Returns { bypassed, response }.
 */
async function bypass(res, { jar, appState, userID, globalOptions, utils, throttle }) {
  const uid = resolveUID(appState, userID);
  const t = tracker(uid);

  if (Date.now() < t.cooldownUntil) {
    utils.warn(
      `checkpoint: bypass for ${uid} is cooling down for ${Math.ceil(
        (t.cooldownUntil - Date.now()) / 1000
      )}s`
    );
    return { bypassed: false, response: res };
  }

  if (t.count >= MAX_BYPASS_RETRIES) {
    t.count = 0;
    t.cooldownUntil = Date.now() + COOLDOWN_MS;
    utils.warn(`checkpoint: max bypass retries reached for ${uid}, cooling down 5 minutes`);
    return { bypassed: false, response: res };
  }

  const { fb_dtsg, jazoest, lsd } = extractTokens(safeBody(res), utils);
  if (!fb_dtsg || !jazoest) {
    utils.warn("checkpoint: missing fb_dtsg/jazoest, cannot dismiss warning");
    return { bypassed: false, response: res };
  }

  // Exponential backoff with jitter before each attempt.
  const backoff = Math.min(3000 * 2 ** t.count, 60000) + getRandomInt(500, 3000);
  await sleep(backoff);
  if (typeof throttle === "function") await throttle();

  const form = {
    av: uid,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "FBScrapingWarningMutation",
    variables: JSON.stringify({}),
    server_timestamps: true,
    doc_id: 6339492849481770,
    fb_dtsg,
    jazoest,
    lsd,
  };

  t.count += 1;

  try {
    const posted = await utils
      .post("https://www.facebook.com/api/graphql/", jar, form, globalOptions)
      .then(utils.saveCookies(jar));

    // Verify: re-load home and confirm we are no longer on a checkpoint.
    if (typeof throttle === "function") await throttle();
    const verify = await utils
      .get("https://www.facebook.com/", jar, null, globalOptions, { noRef: true })
      .then(utils.saveCookies(jar));

    const still = detect(verify, appState, uid);
    if (still && still.type === "automated_behavior") {
      utils.warn(
        `checkpoint: warning still present after attempt ${t.count}/${MAX_BYPASS_RETRIES}`
      );
      return { bypassed: false, response: verify };
    }

    t.count = 0;
    t.cooldownUntil = 0;
    clearState(uid);
    utils.log(`checkpoint: automated behavior warning dismissed for ${uid}`);
    return { bypassed: true, response: verify || posted };
  } catch (e) {
    utils.error("checkpoint: bypass request failed:", e.message || e);
    return { bypassed: false, response: res };
  }
}

/**
 * Main entry point. Always safe to call on any response.
 *
 * Returns:
 *   { checkpoint: false }                                     — clean response
 *   { checkpoint: true, bypassed: true, response }             — handled, keep going
 *   { checkpoint: true, blocked: true, ...info }               — cannot continue
 */
async function handle(res, opts = {}) {
  const { utils } = opts;
  if (!utils) throw new Error("checkpoint.handle: utils is required");

  let info;
  try {
    info = detect(res, opts.appState, opts.userID);
  } catch (e) {
    utils.error("checkpoint: detection failed:", e.message);
    return { checkpoint: false, response: res };
  }

  if (!info) return { checkpoint: false, response: res };

  report(info, utils);
  const stored = saveState(info.uid, info, utils);

  if (info.bypassable) {
    const { bypassed, response } = await bypass(res, opts);
    if (bypassed) return { checkpoint: true, bypassed: true, response };
    return {
      checkpoint: true,
      blocked: true,
      bypassed: false,
      response,
      ...info,
      attempts: stored.attempts,
      error: `${info.label} could not be dismissed automatically.`,
    };
  }

  return {
    checkpoint: true,
    blocked: true,
    bypassed: false,
    response: res,
    ...info,
    attempts: stored.attempts,
    error: info.label,
  };
}

module.exports = {
  handle,
  detect,
  bypass,
  report,
  readState,
  clearState,
  extractTokens,
  CHECKPOINT_TYPES,
  STATE_FILE,
};
