#!/usr/bin/env node
/**
 * Substitutes offset/symbol JSON placeholders inside the compiled standalone
 * Frida script (`public/scripts/inj.js`) with the values exported from
 * `src/offsets.ts` (already compiled to `dist/offsets.js`).
 *
 * Run automatically as a postbuild step, or manually:
 *   node scripts/inject-offsets.cjs
 *
 * The Electron-side script (`public/scripts/agent.js`) is substituted at
 * runtime by `src/index.ts`, so it doesn't need a build-time pass — only the
 * standalone CLI script (`inj.js`, used by `npm run spawn` / `npm run attach`).
 */
const fs = require('fs');
const path = require('path');

const repoRoot   = path.resolve(__dirname, '..');
const offsetsJs  = path.join(repoRoot, 'dist', 'offsets.js');
const targetJs   = path.join(repoRoot, 'public', 'scripts', 'inj.js');

if (!fs.existsSync(offsetsJs)) {
    console.error(`[inject-offsets] dist/offsets.js missing — run \`npm run build\` first.`);
    process.exit(1);
}
if (!fs.existsSync(targetJs)) {
    console.error(`[inject-offsets] public/scripts/inj.js missing — run \`npm run build\` first.`);
    process.exit(1);
}

// Load compiled offsets module. CommonJS exports look like { _eposOffset, _symbols, ... }.
const off = require(offsetsJs);

const placeholders = {
    // Active inj.ts consumers
    '/*injLibName*/':  off._libName,
    '/*eposOffsets*/': off._eposOffset,
    '/*symbols*/':     off._symbols,
    '/*injXaOffset*/': off._xaOffset,
    '/*injXaPatch*/':  off._xaPatch,
    '/*injAnOffset*/': off._anOffset,
    // Reserved for future consumers — wire them in if/when needed:
    '/*xaOffset*/':    off._xaOffset,
    '/*anOffset*/':    off._anOffset,
    '/*xaPatch*/':     off._xaPatch,
    '/*anPatch*/':     off._anPatch,
    '/*libName*/':     off._libName,
};

let src = fs.readFileSync(targetJs, 'utf8');
let totalReplacements = 0;
for (const [token, value] of Object.entries(placeholders)) {
    const json = JSON.stringify(value);
    // Replace every occurrence (don't fail if some placeholders are absent —
    // not every script consumes every group).
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = src;
    src = src.replace(new RegExp(escaped, 'g'), () => {
        totalReplacements++;
        return json;
    });
    if (src === before) {
        // Quietly skip — placeholder not present in this file.
    }
}

fs.writeFileSync(targetJs, src, 'utf8');
console.log(`[inject-offsets] wrote ${path.relative(repoRoot, targetJs)} (${totalReplacements} substitutions).`);
