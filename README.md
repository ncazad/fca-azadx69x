
                             📘 fca-azadx69x                               
                🔥 Advanced Facebook Chat API for Node.js                
                             Fast • Reliable •

[📦 NPM Version: 3.0.0]  [⬇️ Downloads: 100+]  [📄 License: MIT]


✨ FEATURES

  ⚡ Lightning Fast    →  Axios-powered HTTP requests
  🔒 Secure            →  Built-in encryption & session management
  📡 WebSocket         →  Native ws implementation
  🛠️ Easy Setup        →  Zero-config with smart defaults
  📱 MQTT Support      →  Real-time message listening
  🎯 TypeScript Ready  →  Full type definitions


🚀 QUICK START

>> INSTALLATION

    npm install fca-azadx69x


>> BASIC USAGE

    const login = require('fca-azadx69x');

    login({ 
        email: 'your_email@example.com', 
        password: 'your_password' 
    }, (err, api) => {
        if (err) return console.error('❌ Login failed:', err);
        
        console.log('✅ Logged in successfully!');
        
        api.listenMqtt((err, message) => {
            if (message && message.body) {
                console.log(`📩 New message: ${message.body}`);
            }
        });
    });


📚 API REFERENCE

>> login(credentials, callback)

    ┌─────────────┬──────────┬──────────┬─────────────────────┐
    │ Parameter   │ Type     │ Required │ Description         │
    ├─────────────┼──────────┼──────────┼─────────────────────┤
    │ email       │ string   │    ✓     │ Facebook email      │
    │ password    │ string   │    ✓     │ Facebook password   │
    │ callback    │ function │    ✓     │ (err, api) => {}    │
    └─────────────┴──────────┴──────────┴─────────────────────┘


>> api.listenMqtt(callback)

    Listen for incoming messages in real-time.

    api.listenMqtt((err, message) => {
        if (err) return console.error(err);
        
        console.log({
            threadID: message.threadID,
            senderID: message.senderID,
            body: message.body,
            attachments: message.attachments
        });
    });



BREAKING CHANGES:

    - const request = require('request');
    + const axios = require('axios');

    - api.listen((err, msg) => { ... });
    + api.listenMqtt((err, msg) => { ... });


    ┌─────────────────────┬───────────────────┐
    │ Old                 │ New               │
    ├─────────────────────┼───────────────────┤
    │ request library     │ axios             │
    │ websocket-stream    │ native ws         │
    │ api.listen()        │ api.listenMqtt()  │
    └─────────────────────┴───────────────────┘


🛠️ DEVELOPMENT SCRIPTS

    npm start          →  Start application
    npm run lint:fix   →  Fix linting issues
    npm test           →  Run tests
    npm run build      →  Build for production


>> 🤖 Simple Echo Bot

    const login = require('fca-azadx69x');

    login(credentials, (err, api) => {
        api.listenMqtt((err, message) => {
            if (message.body === '/sesg') {
                api.sendMessage('💋 segs!', message.threadID);
            }
        });
    });


🤝 CONTRIBUTING

    1. 🍴 Fork the repository
    2. 🌿 Create branch: git checkout -b feature/amazing
    3. 💾 Commit: git commit -m 'Add amazing feature'
    4. 📤 Push: git push origin feature/amazing
    5. 🔃 Open Pull Request

    >> Before submitting, run:
       npm run lint:fix


📄 LICENSE

    MIT License © 2026 Azadx69x


    Made with ❤️ by Azadx69x
    ─────────────────────────────────────
    📦 NPM:  npmjs.com/package/fca-azadx69x
    💻 GitHub:  github.com/ncazad/fca-azadx69x
    🐛 Issues:  github.com/ncazad/fca-azadx69x/issues

