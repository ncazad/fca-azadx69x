"use strict";

/**
 * fca-azadx69x
 * fixed by @Azadx69x
 *
 * Updated: checkpoint handling now lives in ./checkpoint.js and covers every
 * known checkpoint type (behavior warning, lock, suspension, device approval,
 * 2FA, unknown), auto-dismisses what it can, and reports the rest with a
 * persisted per-account status file (checkpoint_state.json).
 */

const utils = require("./utils");
const checkpoint = require("./checkpoint");
const session = require("./session");
const fs = require("fs");
const cron = require("node-cron");

let globalOptions = {};
let ctx = null;
let _defaultFuncs = null;
let api = null;
let region;

const errorRetrieving =
  "Error retrieving userID. This can be caused by a lot of things, including getting blocked by Facebook for logging in from an unknown location. Try logging in with a browser to verify.";

let request = require("request").defaults({ jar: true });

// ====== ANTI-SUSPENSION HELPERS ======
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 5000) {
  await sleep(getRandomInt(min, max));
}

class RequestThrottler {
  constructor() {
    this.lastRequestTime = 0;
    this.minDelay = 2000;
    this.maxDelay = 8000;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const requiredDelay = getRandomInt(this.minDelay, this.maxDelay);

    if (timeSinceLastRequest < requiredDelay) {
      await sleep(requiredDelay - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }
}

const requestThrottler = new RequestThrottler();
const throttle = () => requestThrottler.throttle();

async function setOptions(globalOptions_from, options = {}) {
  Object.keys(options).map((key) => {
    switch (key) {
      case "online":
        globalOptions_from.online = Boolean(options.online);
        break;
      case "selfListen":
        globalOptions_from.selfListen = Boolean(options.selfListen);
        break;
      case "selfListenEvent":
        globalOptions_from.selfListenEvent = options.selfListenEvent;
        break;
      case "listenEvents":
        globalOptions_from.listenEvents = Boolean(options.listenEvents);
        break;
      case "pageID":
        globalOptions_from.pageID = options.pageID.toString();
        break;
      case "updatePresence":
        globalOptions_from.updatePresence = Boolean(options.updatePresence);
        break;
      case "forceLogin":
        globalOptions_from.forceLogin = Boolean(options.forceLogin);
        break;
      case "userAgent":
        globalOptions_from.userAgent = options.userAgent;
        break;
      case "autoMarkDelivery":
        globalOptions_from.autoMarkDelivery = Boolean(options.autoMarkDelivery);
        break;
      case "autoMarkRead":
        globalOptions_from.autoMarkRead = Boolean(options.autoMarkRead);
        break;
      case "listenTyping":
        globalOptions_from.listenTyping = Boolean(options.listenTyping);
        break;
      case "proxy":
        if (typeof options.proxy != "string") {
          delete globalOptions_from.proxy;
          utils.setProxy();
        } else {
          globalOptions_from.proxy = options.proxy;
          utils.setProxy(globalOptions_from.proxy);
        }
        break;
      case "autoReconnect":
        globalOptions_from.autoReconnect = Boolean(options.autoReconnect);
        break;
      case "emitReady":
        globalOptions_from.emitReady = Boolean(options.emitReady);
        break;
      case "randomUserAgent":
        globalOptions_from.randomUserAgent = Boolean(options.randomUserAgent);
        if (globalOptions_from.randomUserAgent) {
          globalOptions_from.userAgent = utils.randomUserAgent();
          utils.warn("Random user agent enabled. This is an EXPERIMENTAL feature.");
        }
        break;
      case "bypassRegion":
        globalOptions_from.bypassRegion = options.bypassRegion;
        break;
      default:
        break;
    }
  });
  globalOptions = globalOptions_from;
}

async function updateDTSG(res, appstate, userId) {
  try {
    const appstateCUser =
      appstate.find((i) => i.key == "i_user") || appstate.find((i) => i.key == "c_user");
    const UID = userId || (appstateCUser ? appstateCUser.value : null);

    if (!res || !res.body) {
      utils.warn("updateDTSG: Invalid response, skipping token update");
      return res;
    }

    if (!UID) {
      utils.warn("updateDTSG: Could not find user ID, skipping token update");
      return res;
    }

    const { fb_dtsg, jazoest } = checkpoint.extractTokens(res.body, utils);

    if (fb_dtsg && jazoest) {
      const filePath = "fb_dtsg_data.json";
      let existingData = {};
      try {
        if (fs.existsSync(filePath)) {
          existingData = JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
      } catch {
        utils.warn("updateDTSG: Error reading existing data, creating new file");
        existingData = {};
      }

      existingData[UID] = { fb_dtsg, jazoest, updatedAt: new Date().toISOString() };

      try {
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), "utf8");
        utils.log(`fb_dtsg updated successfully for user ${UID}`);
      } catch (writeError) {
        utils.error(`updateDTSG: Error writing to file: ${writeError.message}`);
      }
    } else {
      utils.warn("updateDTSG: Could not extract fb_dtsg or jazoest from response");
    }

    return res;
  } catch (error) {
    utils.error(`Error updating DTSG: ${error.message}`);
    return res;
  }
}

let didBypassCheckpoint = false;

/**
 * Single gate every response passes through.
 * Dismisses what can be dismissed, stops cleanly on lock/suspension,
 * and throws a descriptive object otherwise.
 */
async function guardCheckpoint(res, appState, userID, jar) {
  const activeJar = jar || ctx?.jar;
  const result = await checkpoint.handle(res, {
    jar: activeJar,
    appState,
    userID,
    globalOptions,
    utils,
    throttle,
  });

  if (!result.checkpoint) return res;

  if (result.bypassed) {
    didBypassCheckpoint = true;
    return result.response;
  }

  // Locked / suspended accounts: stop everything, never retry.
  if (result.type === "account_suspended" || result.type === "account_locked") {
    const report = await session.handleSuspension(result, {
      jar: activeJar,
      ctx,
      globalOptions,
      onSuspended: globalOptions.onSuspended,
    });
    ctx = null;
    throw { ...result, ...report, fatal: true };
  }

  session.clearSession(activeJar, ctx, { wipeCookies: false, wipeFiles: false });
  ctx = null;
  throw result;
}


async function simulateHumanActivity(jar) {
  try {
    const pages = [
      "https://www.facebook.com/",
      "https://www.facebook.com/notifications",
      "https://www.facebook.com/messages",
      "https://www.facebook.com/friends",
    ];

    const randomPage = pages[getRandomInt(0, pages.length - 1)];
    await randomDelay(5000, 15000);
    await throttle();
    await utils.get(randomPage, jar, null, globalOptions, { noRef: true });
    utils.log(`Simulated human activity: visited ${randomPage}`);
  } catch {
    /* silent */
  }
}

function buildAPI(html, jar) {
  let fb_dtsg;
  let userID;
  const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
  if (tokenMatch) fb_dtsg = tokenMatch[1];

  let cookie = jar.getCookies("https://www.facebook.com");
  let primary_profile = cookie.filter((val) => val.cookieString().split("=")[0] === "c_user");
  let secondary_profile = cookie.filter((val) => val.cookieString().split("=")[0] === "i_user");

  if (primary_profile.length === 0 && secondary_profile.length === 0) {
    throw { error: errorRetrieving };
  }

  // Checkpoint pages are handled by the checkpoint module, not swallowed here.
  const inlineCheckpoint = checkpoint.detect({ body: html, request: { uri: { href: "" } } }, [], null);
  if (inlineCheckpoint) {
    checkpoint.report(inlineCheckpoint, utils);
    throw { ...inlineCheckpoint, blocked: true, error: inlineCheckpoint.label };
  }

  if (secondary_profile[0] && secondary_profile[0].cookieString().includes("i_user")) {
    userID = secondary_profile[0].cookieString().split("=")[1].toString();
  } else {
    userID = primary_profile[0].cookieString().split("=")[1].toString();
  }

  utils.log("Logged in!");
  const clientID = ((Math.random() * 2147483648) | 0).toString(16);

  const CHECK_MQTT = {
    oldFBMQTTMatch: html.match(/irisSeqID:"(.+?)",appID:219994525426954,endpoint:"(.+?)"/),
    newFBMQTTMatch: html.match(
      /{"app_id":"219994525426954","endpoint":"(.+?)","iris_seq_id":"(.+?)"}/
    ),
    legacyFBMQTTMatch: html.match(
      /\["MqttWebConfig",\[\],{"fbid":"(.*?)","appID":219994525426954,"endpoint":"(.*?)","pollingEndpoint":"(.*?)"/
    ),
  };

  let Slot = Object.keys(CHECK_MQTT);
  let mqttEndpoint, irisSeqID;

  Object.keys(CHECK_MQTT).map((MQTT) => {
    if (globalOptions.bypassRegion) return;
    if (CHECK_MQTT[MQTT] && !region) {
      switch (Slot.indexOf(MQTT)) {
        case 0: {
          irisSeqID = CHECK_MQTT[MQTT][1];
          mqttEndpoint = CHECK_MQTT[MQTT][2].replace(/\\\//g, "/");
          region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
          break;
        }
        case 1: {
          irisSeqID = CHECK_MQTT[MQTT][2];
          mqttEndpoint = CHECK_MQTT[MQTT][1].replace(/\\\//g, "/");
          region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
          break;
        }
        case 2: {
          mqttEndpoint = CHECK_MQTT[MQTT][2].replace(/\\\//g, "/");
          region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
          break;
        }
      }
      return;
    }
  });

  if (globalOptions.bypassRegion) region = globalOptions.bypassRegion.toUpperCase();
  else if (!region)
    region = ["prn", "pnb", "vll", "hkg", "sin", "ftw", "ash"][(Math.random() * 5) | 0].toUpperCase();

  if (globalOptions.bypassRegion || !mqttEndpoint)
    mqttEndpoint = "wss://edge-chat.facebook.com/chat?region=" + region;

  ctx = {
    userID,
    jar,
    clientID,
    globalOptions,
    loggedIn: true,
    access_token: "NONE",
    clientMutationId: 0,
    mqttClient: undefined,
    lastSeqId: irisSeqID,
    syncToken: undefined,
    mqttEndpoint,
    wsReqNumber: 0,
    wsTaskNumber: 0,
    reqCallbacks: {},
    region,
    firstListen: true,
    fb_dtsg,
  };

  let lastSaveTime = 0;
  const saveAppState = async () => {
    try {
      const now = Date.now();
      if (now - lastSaveTime < 60000) return;

      if (api && typeof api.getAppState === "function") {
        const currentAppState = api.getAppState();
        if (currentAppState && currentAppState.length > 0) {
          const appStatePath = `${process.cwd()}/appstate_backup_${userID}.json`;
          fs.writeFileSync(appStatePath, JSON.stringify(currentAppState, null, 2), "utf8");
          lastSaveTime = now;
          utils.log(`AppState auto-saved for user ${userID}`);
        }
      }
    } catch (e) {
      utils.warn(`AppState save error: ${e.message}`);
    }
  };

  const scheduleKeepAlive = () => {
    const randomHour = getRandomInt(8, 20);
    const randomMinute = getRandomInt(0, 59);

    cron.schedule(
      `${randomMinute} ${randomHour}/12 * * *`,
      async () => {
        try {
          await throttle();
          const res = await utils.get("https://www.facebook.com/", jar, null, globalOptions, {
            noRef: true,
          });

          // Keep-alive is also our checkpoint watchdog.
          const status = await checkpoint.handle(res, {
            jar,
            appState: [],
            userID,
            globalOptions,
            utils,
            throttle,
          });
          if (status.blocked) {
            utils.error(`Keep-alive: account ${userID} is in a checkpoint (${status.type}).`);
            return;
          }

          utils.log(`Keep-alive ping sent for user ${userID}`);
          if (Math.random() > 0.7) await simulateHumanActivity(jar);
          await saveAppState();
        } catch (e) {
          utils.warn(`Keep-alive ping failed: ${e.message}`);
        }
      },
      { timezone: "Asia/Dhaka", scheduled: true }
    );
  };

  const scheduleTokenRefresh = () => {
    const randomHour = getRandomInt(0, 23);
    const randomMinute = getRandomInt(0, 59);

    cron.schedule(
      `${randomMinute} ${randomHour}/8 * * *`,
      async () => {
        try {
          const filePath = "fb_dtsg_data.json";
          if (!fs.existsSync(filePath)) {
            utils.warn(`Token refresh: No fb_dtsg data file found for user ${userID}`);
            return;
          }

          let fbDtsgData;
          try {
            fbDtsgData = JSON.parse(fs.readFileSync(filePath, "utf8"));
          } catch (parseError) {
            utils.error(`Token refresh: Error parsing fb_dtsg data file: ${parseError.message}`);
            return;
          }

          if (!fbDtsgData || !fbDtsgData[userID]) {
            utils.warn(`Token refresh: No fb_dtsg data found for user ${userID}`);
            return;
          }

          const userFbDtsg = fbDtsgData[userID];
          const tokenAge = new Date() - new Date(userFbDtsg.updatedAt);
          if (tokenAge < 43200000) {
            utils.log(`Token for ${userID} is still fresh, skipping refresh`);
            return;
          }

          if (api && typeof api.refreshFb_dtsg === "function") {
            try {
              await throttle();
              await api.refreshFb_dtsg(userFbDtsg);
              utils.log(`Fb_dtsg refreshed successfully for user ${userID}.`);
              await saveAppState();
            } catch (refreshError) {
              utils.error(
                `Error during Fb_dtsg refresh for user ${userID}: ${refreshError.message}`
              );
            }
          } else {
            utils.warn(`Token refresh: api.refreshFb_dtsg is not available yet, skipping refresh`);
          }
        } catch (error) {
          utils.error(`Token refresh cron error: ${error.message}`);
        }
      },
      { timezone: "Asia/Dhaka", scheduled: true }
    );
  };

  setTimeout(() => {
    scheduleTokenRefresh();
    scheduleKeepAlive();
  }, 10000);

  let defaultFuncs = utils.makeDefaults(html, userID, ctx);
  return [ctx, defaultFuncs];
}

async function loginHelper(appState, email, password, apiCustomized = {}, callback) {
  let mainPromise = null;
  const jar = request.jar();
  utils.log("Logging in...");

  await randomDelay(1000, 3000);

  if (appState) {
    if (utils.getType(appState) === "Array" && appState.some((c) => c.name)) {
      appState = appState.map((c) => {
        c.key = c.name;
        delete c.name;
        return c;
      });
    } else if (utils.getType(appState) === "String") {
      const arrayAppState = [];
      appState.split(";").forEach((c) => {
        const [key, value] = c.split("=");
        arrayAppState.push({
          key: (key || "").trim(),
          value: (value || "").trim(),
          domain: ".facebook.com",
          path: "/",
          expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365,
        });
      });
      appState = arrayAppState;
    }

    const oneYearFromNow = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toUTCString();
    appState.map((c) => {
      const expiry = c.expires || oneYearFromNow;
      const str =
        c.key + "=" + c.value + "; expires=" + expiry + "; domain=" + c.domain + "; path=" + c.path + ";";
      jar.setCookie(str, "http://" + c.domain);
    });

    mainPromise = utils
      .get("https://www.facebook.com/", jar, null, globalOptions, { noRef: true })
      .then(utils.saveCookies(jar));
  } else if (email && password) {
    throw { error: "Credentials method is not implemented to fca yet." };
  } else {
    throw { error: "Please provide either appState or credentials." };
  }

  api = {
    setOptions: setOptions.bind(null, globalOptions),
    getAppState() {
      const appState = utils.getAppState(jar);
      if (!Array.isArray(appState)) return [];
      const uniqueAppState = appState.filter(
        (item, index, self) => self.findIndex((t) => t.key === item.key) === index
      );
      return uniqueAppState.length > 0 ? uniqueAppState : appState;
    },
    // Real logout: server-side logout + cookie/file cleanup. Callback or promise.
    logout(cb) {
      const done = (err, result) => {
        if (err) utils.error("logout:", err.error || err.message || err);
        if (!err) {
          api.__loggedOut = true;
          didBypassCheckpoint = false;
        }
        if (typeof cb === "function") cb(err, result);
      };
      return session
        .logout(jar, ctx, globalOptions)
        .then((r) => {
          ctx = null;
          done(null, r);
          return r;
        })
        .catch((e) => {
          ctx = null;
          done(e);
          return { success: false, error: e.error || e.message };
        });
    },
    clearSession(opts) {
      return session.clearSession(jar, ctx, opts);
    },
    // Suspension status for this account, if any.
    isSuspended() {
      const state = checkpoint.readState(ctx?.userID);
      if (!state) return false;
      return state.type === "account_suspended" || state.type === "account_locked" ? state : false;
    },
    getContext() {
      return ctx;
    },
    throttle,
    // Checkpoint helpers exposed to consumers.
    checkpoint: {
      status: (uid) => checkpoint.readState(uid),
      clear: (uid) => checkpoint.clearState(uid),
      check: async () => {
        await throttle();
        const res = await utils.get("https://www.facebook.com/", jar, null, globalOptions, {
          noRef: true,
        });
        return (
          checkpoint.detect(res, appState, ctx?.userID) || { checkpoint: false, ok: true }
        );
      },
    },
  };

  mainPromise = mainPromise
    .then((res) => guardCheckpoint(res, appState, null, jar))
    .then(async (res) => {
      await throttle();
      return updateDTSG(res, appState);
    })
    .then(async () => {
      await throttle();
      const resp = await utils.get(`https://www.facebook.com/home.php`, jar, null, globalOptions);
      const checked = await guardCheckpoint(resp, appState, null, jar);
      const html = checked?.body;
      const stuff = await buildAPI(html, jar);
      ctx = stuff[0];
      _defaultFuncs = stuff[1];

      api.addFunctions = (directory) => {
        const folder = directory.endsWith("/") ? directory : directory + "/";
        fs.readdirSync(folder)
          .filter((v) => v.endsWith(".js"))
          .map((v) => {
            api[v.replace(".js", "")] = require(folder + v)(_defaultFuncs, api, ctx);
          });
      };

      api.addFunctions(__dirname + "/src");
      api.listen = api.listenMqtt;
      api.ws3 = { ...apiCustomized };

      try {
        await throttle();
        if (api.getBotInitialData) {
          const bi = await api.getBotInitialData();
          if (!bi.error) {
            utils.log("Hello,", bi.name);
            utils.log("My User ID:", bi.uid);
            ctx.userName = bi.name;
          } else {
            utils.warn(bi.error);
            utils.warn(
              `WARNING: Failed to fetch account info. Proceeding to log in for user ${ctx.userID}`
            );
          }
        }
      } catch (e) {
        utils.warn(`Could not fetch bot initial data: ${e.message}`);
      }

      utils.log("Connected to server region:", region || "UNKNOWN");
      return checked;
    });

  if (globalOptions.pageID) {
    mainPromise = mainPromise
      .then(async function () {
        await throttle();
        return utils.get(
          "https://www.facebook.com/" +
            ctx.globalOptions.pageID +
            "/messages/?section=messages&subsection=inbox",
          ctx.jar,
          null,
          globalOptions
        );
      })
      .then(async function (resData) {
        await throttle();
        let url = utils
          .getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");')
          .split("\\")
          .join("");
        url = url.substring(0, url.length - 1);
        return utils.get("https://www.facebook.com" + url, ctx.jar, null, globalOptions);
      });
  }

  mainPromise
    .then(async (res) => {
      // Final gate: catches suspensions/locks that only appear late in the flow.
      await guardCheckpoint(res, appState, ctx?.userID, jar);
      checkpoint.clearState(ctx?.userID);
      utils.log("Successfully logged in.");
      return callback(null, api);
    })
    .catch((e) => {
      if (e && e.checkpoint) {
        utils.error("Login blocked by checkpoint:", `${e.label} (${e.type})`);
      } else {
        utils.error("Login error:", e.error || e.message || e);
      }
      callback(e);
    });
}

async function login(loginData, options, callback) {
  if (utils.getType(options) === "Function" || utils.getType(options) === "AsyncFunction") {
    callback = options;
    options = {};
  }

  const globalOptions = {
    selfListen: false,
    selfListenEvent: false,
    listenEvents: true,
    listenTyping: false,
    updatePresence: false,
    forceLogin: false,
    autoMarkDelivery: false,
    autoMarkRead: true,
    autoReconnect: true,
    online: true,
    emitReady: false,
    userAgent: utils.defaultUserAgent,
    randomUserAgent: false,
  };

  if (options) Object.assign(globalOptions, options);

  let reloginAttempts = 0;
  const MAX_RELOGIN = 3;

  const loginws3 = () => {
    loginHelper(
      loginData?.appState,
      loginData?.email,
      loginData?.password,
      {
        async relogin() {
          const delay = Math.min(30000 * 2 ** reloginAttempts, 300000);
          utils.warn(`Waiting ${delay / 1000}s before relogin...`);
          await sleep(delay);
          loginws3();
        },
      },
      (loginError, loginApi) => {
        if (loginError) {
          // Fatal = locked/suspended account: stop immediately, no retries.
          if (loginError.fatal) {
            utils.error("login", loginError.error || loginError.label);
            return callback(loginError);
          }

          // Only retry when a checkpoint was actually dismissed; never loop on a
          // lock, suspension, 2FA or device-approval checkpoint.
          const retryable =
            didBypassCheckpoint && !(loginError.checkpoint && !loginError.bypassable);


          if (retryable && reloginAttempts < MAX_RELOGIN) {
            reloginAttempts += 1;
            didBypassCheckpoint = false;
            utils.warn(`Checkpoint dismissed, relogging in (${reloginAttempts}/${MAX_RELOGIN})...`);
            setTimeout(loginws3, getRandomInt(10000, 30000));
            return;
          }

          utils.error("login", loginError);
          return callback(loginError);
        }
        reloginAttempts = 0;
        didBypassCheckpoint = false;
        callback(null, loginApi);
      }
    );
  };

  setOptions(globalOptions, options)
    .then(() => loginws3())
    .catch((err) => {
      utils.error("Error setting options:", err.message);
      callback(err);
    });
}

module.exports = { login, checkpoint, session };
