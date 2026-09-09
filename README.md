<p align="center">
  <img src="https://img.shields.io/npm/v/fca-azadx69x?style=flat-square&color=blue" alt="npm version">
  <img src="https://img.shields.io/npm/dt/fca-azadx69x?style=flat-square&color=green" alt="downloads">
  <img src="https://img.shields.io/npm/l/fca-azadx69x?style=flat-square&color=orange" alt="license">
</p>

<h1 align="center">⚡ fca-azadx69x</h1>
<p align="center"><b>Advanced Facebook Chat API for Node.js</b><br>Fast • Reliable • Modern</p>

---

## ✨ Features

- ⚡ **Lightning Fast** – Axios-powered HTTP requests
- 🔒 **Secure** – Built‑in encryption & session management
- 📡 **WebSocket** – Native `ws` implementation
- 🛠️ **Easy Setup** – Zero‑config with smart defaults
- 📱 **MQTT Support** – Real‑time message listening
- 🎯 **TypeScript Ready** – Full type definitions included

---

## 🚀 Quick Start

### Installation

```bash
npm install fca-azadx69x
```

Basic Usage

```javascript
const login = require('fca-azadx69x');

login(
  {
    email: 'your_email@example.com',
    password: 'your_password'
  },
  (err, api) => {
    if (err) return console.error('❌ Login failed:', err);
    console.log('✅ Logged in successfully!');

    api.listenMqtt((err, message) => {
      if (message && message.body) {
        console.log(`📩 New message: ${message.body}`);
      }
    });
  }
);
```

---

📚 API Reference

login(credentials, callback)

Parameter Type Required Description
email string ✓ Facebook email or phone
password string ✓ Facebook account password
callback function ✓ (err, api) => {}

api.listenMqtt(callback)

Listens for incoming messages in real‑time.

```javascript
api.listenMqtt((err, message) => {
  if (err) return console.error(err);
  console.log({
    threadID: message.threadID,
    senderID: message.senderID,
    body: message.body,
    attachments: message.attachments
  });
});
```

---

⚠️ Breaking Changes

Old New
const request = require('request'); const axios = require('axios');
api.listen((err, msg) => { ... }); api.listenMqtt((err, msg) => { ... });
websocket-stream native ws
request library axios

---

🛠️ Development Scripts

Command Description
npm start Start the application
npm run lint:fix Fix linting issues
npm test Run tests
npm run build Build for production

---

🤖 Simple Echo Bot

```javascript
const login = require('fca-azadx69x');

login(credentials, (err, api) => {
  api.listenMqtt((err, message) => {
    if (message.body === '/sesg') {
      api.sendMessage('💋 segs!', message.threadID);
    }
  });
});
```

---

🤝 Contributing

We ❤️ contributions! Here’s how you can help:

1. 🍴 Fork the repository
2. 🌿 Create a branch: git checkout -b feature/amazing
3. 💾 Commit your changes: git commit -m 'Add amazing feature'
4. 📤 Push to the branch: git push origin feature/amazing
5. 🔃 Open a Pull Request

Before submitting, please run:
npm run lint:fix

---

📄 License

MIT License © 2026 Azadx69x

---

<p align="center">
  📦 <a href="https://www.npmjs.com/package/fca-azadx69x">npm</a> &nbsp;·&nbsp;
  💻 <a href="https://github.com/ncazad/fca-azadx69x">GitHub</a> &nbsp;·&nbsp;
  🐛 <a href="https://github.com/ncazad/fca-azadx69x/issues">Issues</a>
</p>
