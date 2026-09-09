"use strict";
// fca-azadx69x 
// fixed by @Azadx69x

/**
 * session.js 
 * Real logout / clearSession implementation (does not depend on utils.logout,
 * which does not exist in most utils.js builds) plus suspension recovery.
 */

const fs = require("fs");
const path = require("path");
const utils = require("./utils");
const checkpoint = require("./checkpoint");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cookieValue(jar, name) {
  try {
    const found = jar
      .getCookies("https://www.facebook.com")
      .find((c) => c.cookieString().split("=")[0] === name);
    return found ? found.cookieString().split("=")[1] : null;
  } catch {
    return null;
  }
}

function tokensFrom(body) {
  return checkpoint.extractTokens(typeof body === "string" ? body : "", utils);
}

/** Remove every Facebook cookie from the jar. */
function wipeJar(jar) {
  try {
    const expired = new Date(0).toUTCString();
    jar.getCookies("https://www.facebook.com").forEach((c) => {
      const key = c.cookieString().split("=")[0];
      jar.setCookie(
        `${key}=; expires=${expired}; domain=.facebook.com; path=/;`,
        "http://.facebook.com"
      );
    });
    if (typeof jar._jar?.removeAllCookiesSync === "function") jar._jar.removeAllCookiesSync();
  } catch (e) {
    utils.warn(`session: could not wipe cookies: ${e.message}`);
  }
}

/** Delete the local files tied to a session. */
function wipeLocalState(userID) {
  const files = [
    userID ? path.join(process.cwd(), `appstate_backup_${userID}.json`) : null,
    path.join(process.cwd(), "fb_dtsg_data.json"),
  ].filter(Boolean);

  files.forEach((file) => {
    try {
      if (!fs.existsSync(file)) return;
      if (file.endsWith("fb_dtsg_data.json") && userID) {
        // Only drop this user's entry, keep other accounts intact.
        const all = JSON.parse(fs.readFileSync(file, "utf8")) || {};
        delete all[userID];
        fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
      } else {
        fs.unlinkSync(file);
      }
    } catch (e) {
      utils.warn(`session: could not clean ${file}: ${e.message}`);
    }
  });

  if (userID) checkpoint.clearState(userID);
}

/**
 * Close listeners and drop in-memory state. Safe to call twice.
 */
function clearSession(jar, ctx, { wipeCookies = true, wipeFiles = false } = {}) {
  try {
    if (ctx) {
      try {
        if (ctx.mqttClient) {
          ctx.mqttClient.removeAllListeners?.();
          ctx.mqttClient.end?.(true);
          ctx.mqttClient = undefined;
        }
      } catch (e) {
        utils.warn(`session: mqtt teardown warning: ${e.message}`);
      }

      ctx.loggedIn = false;
      ctx.syncToken = undefined;
      ctx.lastSeqId = undefined;
      ctx.reqCallbacks = {};
      ctx.firstListen = true;
    }

    if (wipeCookies && jar) wipeJar(jar);
    if (wipeFiles) wipeLocalState(ctx?.userID);

    utils.log("Session cleared.");
    return { success: true };
  } catch (e) {
    utils.error(`session: clearSession failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Full logout: hits Facebook's logout endpoint with valid tokens, then clears
 * everything locally. Works with a callback or as a promise.
 */
async function logout(jar, ctx, globalOptions, callback) {
  const finish = (err, result) => {
    if (typeof callback === "function") callback(err, result);
    if (err) throw err;
    return result;
  };

  try {
    if (!jar) return finish(null, { success: true, note: "no session to log out" });

    const uid = ctx?.userID || cookieValue(jar, "i_user") || cookieValue(jar, "c_user");

    // Fetch a fresh page to obtain valid fb_dtsg / jazoest / ref.
    let body = "";
    try {
      const res = await utils.get(
        "https://www.facebook.com/bookmarks/",
        jar,
        null,
        globalOptions || ctx?.globalOptions || {},
        { noRef: true }
      );
      body = typeof res?.body === "string" ? res.body : "";
    } catch (e) {
      utils.warn(`logout: could not load page for tokens: ${e.message}`);
    }

    const { fb_dtsg, jazoest } = tokensFrom(body);
    const ref = utils.getFrom(body, 'name="ref" value="', '"') || "mb";

    if (fb_dtsg) {
      const form = { fb_dtsg, jazoest, ref, button: "logout" };
      try {
        await utils
          .post(
            "https://www.facebook.com/auth/logout/?next",
            jar,
            form,
            globalOptions || ctx?.globalOptions || {}
          )
          .then(utils.saveCookies(jar));
        utils.log(`Logged out of Facebook${uid ? ` (user ${uid})` : ""}.`);
      } catch (e) {
        // A redirect or 302 here is normal; treat network failure as non-fatal.
        utils.warn(`logout: server logout returned an error, clearing locally: ${e.message}`);
      }
    } else {
      utils.warn("logout: no fb_dtsg token available, clearing session locally only.");
    }

    clearSession(jar, ctx, { wipeCookies: true, wipeFiles: true });
    if (ctx) ctx.loggedIn = false;

    return finish(null, { success: true, userID: uid });
  } catch (e) {
    utils.error(`logout failed: ${e.message}`);
    // Never leave a half-open session behind.
    try {
      clearSession(jar, ctx, { wipeCookies: true, wipeFiles: true });
    } catch {
      /* ignore */
    }
    return finish({ error: `logout failed: ${e.message}` });
  }
}

/**
 * Suspension / lock handling.
 * Facebook suspensions cannot be bypassed — the correct behaviour is to stop
 * cleanly, keep the reason, and tell the caller when it can retry.
 */
async function handleSuspension(info, { jar, ctx, globalOptions, onSuspended } = {}) {
  const uid = info?.uid || ctx?.userID || "unknown";

  utils.error(`Account ${uid} is ${info.type === "account_locked" ? "locked" : "suspended"}.`);
  if (info.reasons?.longReason) utils.error("Reason:", info.reasons.longReason);
  if (info.reasons?.shortReason) utils.error("Category:", info.reasons.shortReason);
  if (info.reasons?.durationInfo) utils.error("Time remaining:", info.reasons.durationInfo);

  // Stop all activity: no reconnects, no cron pings, no relogin loops.
  clearSession(jar, ctx, { wipeCookies: false, wipeFiles: false });

  const record = {
    ...info,
    uid,
    stoppedAt: new Date().toISOString(),
    retryAfter: estimateRetryAfter(info),
    recoverable: false,
    action:
      "Open facebook.com in a browser with this account, complete the appeal/verification, then export a fresh appState.",
  };

  try {
    const file = path.join(process.cwd(), "suspension_report.json");
    let all = {};
    if (fs.existsSync(file)) {
      try {
        all = JSON.parse(fs.readFileSync(file, "utf8")) || {};
      } catch {
        all = {};
      }
    }
    all[uid] = record;
    fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
    utils.error("Suspension details written to suspension_report.json");
  } catch (e) {
    utils.warn(`session: could not write suspension report: ${e.message}`);
  }

  if (typeof onSuspended === "function") {
    try {
      await onSuspended(record);
    } catch (e) {
      utils.warn(`session: onSuspended handler threw: ${e.message}`);
    }
  }

  return record;
}

/** Parse "Your account is restricted for 30 days" style strings into a date. */
function estimateRetryAfter(info) {
  const text = `${info?.reasons?.durationInfo || ""} ${info?.reasons?.longReason || ""}`;
  const days = text.match(/(\d+)\s*day/i);
  const hours = text.match(/(\d+)\s*hour/i);
  const ms =
    (days ? Number(days[1]) * 86400000 : 0) + (hours ? Number(hours[1]) * 3600000 : 0);
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

module.exports = {
  logout,
  clearSession,
  handleSuspension,
  wipeLocalState,
  wipeJar,
  sleep,
};
