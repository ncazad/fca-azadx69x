"use strict";

const utils = require("./utils");
const log = require("npmlog");
const https = require("https");
const http = require("http");

let checkVerified = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 5000;

const defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;
log.heading = "fca-azadx69x";

// Global message queue for super fast sending
const messageQueue = new Map();
const pendingReactions = new Map();
let isProcessingQueue = false;
const parallelLimit = 5; // Send up to 5 messages concurrently

function setOptions(globalOptions, options) {
	Object.keys(options).map(function (key) {
		switch (key) {
			case 'online':
				globalOptions.online = Boolean(options.online);
				break;
			case 'logLevel':
				log.level = options.logLevel;
				globalOptions.logLevel = options.logLevel;
				break;
			case 'logRecordSize':
				log.maxRecordSize = options.logRecordSize;
				globalOptions.logRecordSize = options.logRecordSize;
				break;
			case 'selfListen':
				globalOptions.selfListen = Boolean(options.selfListen);
				break;
			case 'selfListenEvent':
				globalOptions.selfListenEvent = options.selfListenEvent;
				break;
			case 'listenEvents':
				globalOptions.listenEvents = Boolean(options.listenEvents);
				break;
			case 'pageID':
				globalOptions.pageID = options.pageID.toString();
				break;
			case 'updatePresence':
				globalOptions.updatePresence = Boolean(options.updatePresence);
				break;
			case 'forceLogin':
				globalOptions.forceLogin = Boolean(options.forceLogin);
				break;
			case 'userAgent':
				globalOptions.userAgent = options.userAgent;
				break;
			case 'autoMarkDelivery':
				globalOptions.autoMarkDelivery = Boolean(options.autoMarkDelivery);
				break;
			case 'autoMarkRead':
				globalOptions.autoMarkRead = Boolean(options.autoMarkRead);
				break;
			case 'listenTyping':
				globalOptions.listenTyping = Boolean(options.listenTyping);
				break;
			case 'proxy':
				if (typeof options.proxy != "string") {
					delete globalOptions.proxy;
					utils.setProxy();
				} else {
					globalOptions.proxy = options.proxy;
					utils.setProxy(globalOptions.proxy);
				}
				break;
			case 'autoReconnect':
				globalOptions.autoReconnect = Boolean(options.autoReconnect);
				break;
			case 'emitReady':
				globalOptions.emitReady = Boolean(options.emitReady);
				break;
			default:
				log.warn("fca-azadx69x", "Unknown option: " + key);
				break;
		}
	});
}

// Super fast message queue processor
async function processMessageQueue(api, ctx) {
	if (isProcessingQueue || messageQueue.size === 0) return;
	isProcessingQueue = true;

	const batches = [];
	const entries = Array.from(messageQueue.entries());
	
	// Create batches of 5 for parallel processing
	for (let i = 0; i < entries.length; i += parallelLimit) {
		batches.push(entries.slice(i, i + parallelLimit));
	}

	for (const batch of batches) {
		await Promise.allSettled(batch.map(async ([msgId, msgData]) => {
			try {
				const { threadID, message, callback } = msgData;
				const result = await api.sendMessage(threadID, message);
				messageQueue.delete(msgId);
				if (callback) callback(null, result);
			} catch (err) {
				messageQueue.delete(msgId);
				if (msgData.callback) callback(err);
			}
		}));
	}

	isProcessingQueue = false;
	if (messageQueue.size > 0) processMessageQueue(api, ctx);
}

// Checkpoint bypass handler
async function handleCheckpoint(jar, userID) {
	try {
		// Try to bypass checkpoint by visiting home page
		const res = await utils.get("https://www.facebook.com/", jar, null, {
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
		});
		
		if (res.body.includes("checkpoint") || res.body.includes("security")) {
			log.warn("fca-azadx69x", "Checkpoint detected, attempting bypass...");
			
			// Simulate human behavior
			await new Promise(r => setTimeout(r, 2000));
			
			// Try alternative endpoint
			const altRes = await utils.get("https://www.facebook.com/messages/", jar, null, {
				userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
			});
			
			if (!altRes.body.includes("checkpoint")) {
				log.info("fca-azadx69x", "Checkpoint bypassed via messages endpoint");
				return true;
			}
			return false;
		}
		return true;
	} catch (err) {
		log.error("fca-azadx69x", "Checkpoint bypass failed:", err.message);
		return false;
	}
}

function buildAPI(globalOptions, html, jar) {
	const maybeCookie = jar.getCookies("https://www.facebook.com").filter(function (val) {
		return val.cookieString().split("=")[0] === "c_user";
	});

	if (maybeCookie.length === 0) {
		throw {
			error: "Cannot get userID. Login blocked or checkpoint detected."
		};
	}

	const userID = maybeCookie[0].cookieString().split("=")[1].toString();
	log.info("fca-azadx69x", `Logged in as ${userID}`);

	const clientID = (Math.random() * 2147483648 | 0).toString(16);

	const ctx = {
		userID: userID,
		jar: jar,
		clientID: clientID,
		globalOptions: globalOptions,
		loggedIn: true,
		access_token: "NONE",
		clientMutationId: 0,
		mqttClient: undefined,
		lastSeqId: null,
		syncToken: undefined,
		mqttEndpoint: null,
		region: null,
		firstListen: true,
		reconnectTimer: null,
		heartbeatInterval: null
	};

	// Auto reconnect with exponential backoff
	function scheduleReconnect(api) {
		if (!globalOptions.autoReconnect || reconnectAttempts >= maxReconnectAttempts) {
			log.error("fca-azadx69x", "Max reconnection attempts reached");
			return;
		}

		reconnectAttempts++;
		const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), 60000);
		
		log.info("fca-azadx69x", `Reconnecting in ${delay}ms... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
		
		ctx.reconnectTimer = setTimeout(async () => {
			try {
				// Verify session is still valid
				const checkRes = await utils.get("https://www.facebook.com/", jar, null, globalOptions);
				
				if (checkRes.body.includes("logout") || checkRes.body.includes("session")) {
					log.warn("fca-azadx69x", "Session expired, attempting refresh...");
					
					// Try to refresh session
					const refreshed = await handleCheckpoint(jar, userID);
					if (!refreshed) {
						api.emit('error', { error: "Session expired and checkpoint bypass failed" });
						return;
					}
				}

				// Restart MQTT if needed
				if (api.listenMqtt && globalOptions.listenEvents !== false) {
					api.listenMqtt((err, event) => {
						if (err) {
							log.error("fca-azadx69x", "MQTT Error:", err);
							scheduleReconnect(api);
						} else {
							reconnectAttempts = 0; // Reset on success
							api.emit('message', event);
						}
					});
				}
				
				log.info("fca-azadx69x", "Reconnection successful");
				reconnectAttempts = 0;
			} catch (err) {
				log.error("fca-azadx69x", "Reconnection failed:", err.message);
				scheduleReconnect(api);
			}
		}, delay);
	}

	// Heartbeat to keep connection alive
	function startHeartbeat() {
		if (ctx.heartbeatInterval) clearInterval(ctx.heartbeatInterval);
		
		ctx.heartbeatInterval = setInterval(async () => {
			try {
				await utils.get("https://www.facebook.com/ping", jar, null, globalOptions);
			} catch (err) {
				// Silent fail
			}
		}, 300000); // Every 5 minutes
	}

	const api = {
		setOptions: setOptions.bind(null, globalOptions),
		
		getAppState: function () {
			const appState = utils.getAppState(jar);
			return appState.filter((item, index, self) =>
				self.findIndex(t => t.key === item.key) === index
			);
		},

		// Super fast sendMessage with queue
		sendMessage: function(threadID, message, callback) {
			return new Promise((resolve, reject) => {
				const msgId = Date.now() + Math.random().toString(36);
				
				messageQueue.set(msgId, {
					threadID,
					message,
					callback: callback || ((err, res) => {
						if (err) reject(err);
						else resolve(res);
					})
				});

				// Process immediately if queue is small
				if (messageQueue.size <= parallelLimit) {
					processMessageQueue(api, ctx);
				}
			});
		},

		// Stable reaction handler
		setMessageReaction: function(reaction, messageID, callback) {
			return new Promise((resolve, reject) => {
				const reactionId = Date.now() + Math.random().toString(36);
				
				// Debounce reactions to prevent spam detection
				if (pendingReactions.has(messageID)) {
					clearTimeout(pendingReactions.get(messageID));
				}

				const timeout = setTimeout(async () => {
					try {
						const reactionFunc = require('./src/setMessageReaction');
						const result = await reactionFunc(reaction, messageID);
						pendingReactions.delete(messageID);
						if (callback) callback(null, result);
						resolve(result);
					} catch (err) {
						pendingReactions.delete(messageID);
						if (callback) callback(err);
						reject(err);
					}
				}, 300); // 300ms debounce

				pendingReactions.set(messageID, timeout);
			});
		},

		// Stable unsend handler
		unsendMessage: function(messageID, callback) {
			return new Promise(async (resolve, reject) => {
				try {
					// Retry logic for unsend
					let attempts = 0;
					const maxAttempts = 3;
					
					while (attempts < maxAttempts) {
						try {
							const unsendFunc = require('./src/unsendMessage');
							const result = await unsendFunc(messageID);
							if (callback) callback(null, result);
							resolve(result);
							return;
						} catch (err) {
							attempts++;
							if (attempts >= maxAttempts) throw err;
							await new Promise(r => setTimeout(r, 1000 * attempts));
						}
					}
				} catch (err) {
					if (callback) callback(err);
					reject(err);
				}
			});
		},

		// Fixed logout - properly clears session
		logout: function(callback) {
			return new Promise(async (resolve, reject) => {
				try {
					// Clear intervals
					if (ctx.reconnectTimer) clearTimeout(ctx.reconnectTimer);
					if (ctx.heartbeatInterval) clearInterval(ctx.heartbeatInterval);
					
					// Clear queues
					messageQueue.clear();
					pendingReactions.forEach(t => clearTimeout(t));
					pendingReactions.clear();

					// Call server logout
					const logoutFunc = require('./src/logout');
					await logoutFunc();
					
					// Clear cookies
					jar._jar.store.removeCookiesSync("facebook.com");
					jar._jar.store.removeCookiesSync("messenger.com");
					
					ctx.loggedIn = false;
					log.info("fca-azadx69x", "Logout successful");
					
					if (callback) callback(null, { success: true });
					resolve({ success: true });
				} catch (err) {
					log.error("fca-azadx69x", "Logout error:", err.message);
					// Force clear anyway
					ctx.loggedIn = false;
					if (callback) callback(null, { success: true, warning: "Force logged out" });
					resolve({ success: true, warning: "Force logged out" });
				}
			});
		},

		// Listen with auto-reconnect
		listenMqtt: function(callback) {
			const listenFunc = require('./src/listenMqtt');
			
			const wrappedCallback = (err, event) => {
				if (err) {
					if (err.message && (
						err.message.includes("Connection closed") ||
						err.message.includes("ECONNRESET") ||
						err.message.includes("ETIMEDOUT")
					)) {
						log.warn("fca-azadx69x", "Connection lost, scheduling reconnect...");
						scheduleReconnect(api);
					}
					callback(err);
				} else {
					callback(null, event);
				}
			};

			startHeartbeat();
			return listenFunc(defaultFuncs, api, ctx, wrappedCallback);
		},

		listen: function(callback) {
			return api.listenMqtt(callback);
		}
	};

	const apiFuncNames = [
		'getThreadInfo',
		'getUserInfo',
		'markAsRead',
		'markAsSeen'
	];

	const defaultFuncs = utils.makeDefaults(html, userID, ctx);

	apiFuncNames.map(function (v) {
		api[v] = require('./src/' + v)(defaultFuncs, api, ctx);
	});

	// Handle process exit gracefully
	process.on('exit', () => {
		if (ctx.loggedIn) {
			api.logout().catch(() => {});
		}
	});

	return [ctx, defaultFuncs, api];
}

async function login(loginData, options, callback) {
	if (utils.getType(options) === "Function") {
		callback = options;
		options = {};
	}

	const globalOptions = {
		selfListen: false,
		listenEvents: false,
		listenTyping: false,
		updatePresence: false,
		forceLogin: false,
		autoMarkDelivery: true,
		autoMarkRead: false,
		autoReconnect: true,
		logRecordSize: defaultLogRecordSize,
		online: true,
		emitReady: true,
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
	};

	setOptions(globalOptions, options);

	const jar = utils.getJar();

	if (!loginData.appState) {
		throw {
			error: "fca-azadx69x requires appState login"
		};
	}

	// Validate and set cookies with better error handling
	try {
		loginData.appState.map(function (c) {
			if (!c.key || !c.value || !c.domain) return;
			
			const str = c.key + "=" + c.value + "; domain=" + c.domain + "; path=" + (c.path || "/") + ";";
			jar.setCookie(str, "http://" + c.domain);
		});
	} catch (err) {
		log.error("fca-azadx69x", "Invalid appState format");
		throw { error: "Invalid appState format" };
	}

	try {
		const res = await utils.get("https://www.facebook.com/", jar, null, globalOptions);
		await utils.saveCookies(jar)(res);

		// Check for checkpoint immediately
		const userID = jar.getCookies("https://www.facebook.com")
			.find(c => c.cookieString().split("=")[0] === "c_user");
			
		if (!userID) {
			// Try checkpoint bypass
			const bypassed = await handleCheckpoint(jar, null);
			if (!bypassed) {
				throw { error: "Login blocked or checkpoint detected. Please verify your account manually." };
			}
		}

		const html = res.body;
		const stuff = buildAPI(globalOptions, html, jar);
		const api = stuff[2];

		log.info("fca-azadx69x", "Login successful");
		reconnectAttempts = 0; // Reset counter on fresh login

		if (callback) callback(null, api);
		return api;

	} catch (err) {
		log.error("fca-azadx69x", err.error || err.message || err);
		
		// Better error messages
		if (err.message && err.message.includes("ECONNREFUSED")) {
			err = { error: "Connection refused. Check your internet connection." };
		} else if (err.message && err.message.includes("ETIMEDOUT")) {
			err = { error: "Connection timeout. Facebook may be blocking your IP." };
		}
		
		if (callback) callback(err);
		throw err;
	}
}

module.exports = login;
