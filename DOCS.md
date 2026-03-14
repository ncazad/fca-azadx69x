# FCA-AZADX69X

**Facebook Chat API by Azadx69x**  
GitHub: [https://github.com/ncazad/fca-azadx69x](https://github.com/ncazad/fca-azadx69x)

---

## 📦 Installation

Install:

```bash
npm install git+https://github.com/ncazad/fca-azadx69x.git
```

Or using the short form:

```bash
npm install ncazad/fca-azadx69x
```

---

## 🗂 Folder Structure

fca-azadx69x/
├ package.json
├ index.js
├ LICENSE
├ DOCS.md
├ utils.js
└ src/
   ├ login.js
   ├ listenMqtt.js
   ├ sendMessage.js
   ├ getThreadInfo.js
   ├ getUserInfo.js
   └ unsendMessage.js

---

## ⚙️ Usage

### Basic Bot Example

```javascript
const login = require("fca-azadx69x");

// Load appState exported from Facebook account login
const appState = require("./appstate.json");

login({ appState: appState }, (err, api) => {
    if (err) return console.error(err);

    // Listen to incoming messages
    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        // Simple ping-pong example
        if (event.body === "ping") {
            api.sendMessage("pong", event.threadID);
        }
    });
});
```

---

## 🔧 Login Options

| Option             | Type      | Default | Description |
|-------------------|-----------|---------|-------------|
| selfListen        | Boolean   | false   | Listen to your own messages |
| selfListenEvent   | Boolean   | false   | Listen to your own events |
| listenEvents      | Boolean   | false   | Listen to message events |
| listenTyping      | Boolean   | false   | Listen to typing indicators |
| updatePresence    | Boolean   | false   | Show online status |
| forceLogin        | Boolean   | false   | Force login even if cookies exist |
| autoMarkDelivery  | Boolean   | true    | Automatically mark messages as delivered |
| autoMarkRead      | Boolean   | false   | Automatically mark messages as read |
| autoReconnect     | Boolean   | true    | Reconnect automatically if disconnected |
| logLevel          | String    | info    | Log level (info, warn, error) |
| logRecordSize     | Number    | 100     | Max number of log records |
| userAgent         | String    | Default | Browser User-Agent for requests |
| pageID            | String    | null    | Login as a Facebook page |

---

## 📝 Available API Functions

| Function | Description |
|----------|-------------|
| sendMessage(msg, threadID, callback) | Send a message to a thread |
| unsendMessage(messageID, threadID, callback) | Remove a message from a thread |
| setMessageReaction(reaction, messageID, threadID, callback) | React to a message |
| listenMqtt(callback) | Listen to incoming events via MQTT |
| getThreadInfo(threadID, callback) | Get information about a thread |
| getUserInfo(userID, callback) | Get information about a user |
| markAsRead(threadID, callback) | Mark a thread as read |
| markAsSeen(messageID, threadID, callback) | Mark a message as seen |
| logout(callback) | Log out from Facebook session |

---

## 💡 Tips & Best Practices

1. Always use `appState` login. Email/password login is deprecated.  
2. Keep `appstate.json` secure. Never share it publicly.  
3. Enable `autoReconnect` for bots running 24/7.  
4. Wrap `sendMessage` in try/catch when sending many messages quickly.  
5. Use `listenMqtt` instead of old polling methods for faster response.

---

## 📜 License

MIT License © 2026 Azadx69x  
Open-source, free to use under MIT terms.

---

For updates, bug reports, or contributions, visit the [GitHub repository](https://github.com/ncazad/fca-azadx69x).
