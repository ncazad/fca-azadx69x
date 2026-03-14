# fca-azadx69x

## 📦 Package Information

| Property | Value |
|----------|-------|
| Package | fca-azadx69x |
| Version | 2.0.0 |
| Main Entry | index.js |
| Node Requirement | >= 18.x |
| Author| @Azadx69x |

## 🚀 Installation

```bash
npm install fca-azadx69x
```
🛠️ Available Scripts

```bash
npm start          # Start the application
npm run lint:fix   # Fix linting issues
```

💡 Usage

```javascript
const login = require('fca-azadx69x');

login({email: 'your_email', password: 'your_password'}, (err, api) => {
    if(err) return console.error(err);
    
    api.listenMqtt((err, message) => {
        if(message && message.body) {
            console.log('Received:', message.body);
        }
    });
});
```

⚠️ Migration Guide

From v1.x to v2.0.0

1. Node.js Upgrade: Ensure you're running Node.js 18 or higher
   
```bash
   node --version  # Should be v18.x.x or higher
   ```

2. Dependency Updates: All internal HTTP requests now use `axios` instead of `request`. If you were extending the library, update your HTTP calls accordingly.

3. WebSocket Changes: `websocket-stream` has been replaced with native `ws`. Connection handling remains similar but more stable.

🤝 Contributing

Contributions are welcome! Please ensure your code follows the linting standards:

```bash
npm run lint:fix
```

📄 License

This project is licensed under the MIT License.

---

Maintained by [Azadx69x](https://github.com/azadx69x)
