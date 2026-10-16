// Bootstrap for Electron renderer: load compiled TypeScript bundle via Node require
// This ensures relative requires inside dist/main.js resolve from the dist folder
require('../dist/main.js');
