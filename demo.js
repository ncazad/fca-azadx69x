"use strict";

const pkg = require("./package.json");

console.log("========================================");
console.log(`  ${pkg.name} v${pkg.version}`);
console.log("  " + pkg.description);
console.log("========================================");
console.log("");

// Verify full library loads without errors
const fca = require("./index.js");
const utils = require("./utils.js");
const fs = require("fs");
const path = require("path");

console.log("Library loaded successfully!");
console.log("");

// Verify all src modules load
const srcFiles = fs.readdirSync(path.join(__dirname, "src")).filter(f => f.endsWith(".js"));
let allOk = true;
for (const file of srcFiles) {
  try {
    require("./src/" + file);
  } catch (e) {
    console.error("ERROR loading " + file + ":", e.message);
    allOk = false;
  }
}

if (allOk) {
  console.log("All " + srcFiles.length + " API modules verified OK:");
  srcFiles.forEach(f => console.log("  OK: " + f.replace(".js", "")));
} else {
  console.error("Some modules failed to load.");
  process.exit(1);
}

console.log("");
console.log("Dependencies:");
console.log("  axios       - HTTP requests");
console.log("  tough-cookie - Cookie jar management");
console.log("  form-data   - Multipart form uploads");
console.log("  mqtt        - Real-time messaging");
console.log("  ws          - WebSocket support");
console.log("  npmlog      - Logging");
console.log("  https-proxy-agent - Proxy support");
console.log("");
console.log("Usage example:");
console.log("  const login = require('fca-azadx69x');");
console.log("  login({ appstate: [...] }, (err, api) => {");
console.log("    api.listenMqtt((err, message) => {");
console.log("      console.log(message);");
console.log("    });");
console.log("  });");
console.log("");
console.log("All systems ready.");
