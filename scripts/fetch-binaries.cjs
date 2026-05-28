#!/usr/bin/env node
/**
 * Downloads the binaries that end users would otherwise have to install
 * manually, so they get bundled straight into the installer:
 *
 *   - Windows `adb.exe` (+ its two DLLs) from Google platform-tools
 *   - `frida-server` for arm64 and x86_64 (BlueStacks 5 is x86_64,
 *     modern physical phones are arm64 — 32-bit ABIs are skipped to
 *     keep the installer small)
 *
 * Output goes to `bin/` (git-ignored). electron-builder ships `bin/` via
 * `extraResources`, and the app resolves these at runtime instead of
 * requiring the user to install ADB or download/upload frida-server.
 *
 * Idempotent: a file that already exists with a sane size is left alone,
 * so incremental rebuilds are fast.
 *
 *   node scripts/fetch-binaries.cjs
 */
const fs = require('fs');
const path = require('path');
const { XzReadableStream } = require('xz-decompress');
const AdmZip = require('adm-zip');

const FRIDA_VERSION = '16.4.10';
const ARCHES = ['arm64', 'x86_64'];
const PLATFORM_TOOLS_URL =
    'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin');
const ADB_DIR = path.join(BIN, 'adb');
const FRIDA_DIR = path.join(BIN, 'frida-server');

const fridaName = (arch) => `frida-server-${FRIDA_VERSION}-android-${arch}`;
const fridaUrl = (arch) =>
    `https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/${fridaName(arch)}.xz`;

const ok = (p, min) => {
    try { return fs.statSync(p).size >= min; } catch { return false; }
};

async function fetchBuffer(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

async function fetchXz(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
    const decompressed = new Response(new XzReadableStream(res.body));
    return Buffer.from(await decompressed.arrayBuffer());
}

async function fetchAdb() {
    const adbExe = path.join(ADB_DIR, 'adb.exe');
    if (ok(adbExe, 100_000)) {
        console.log('[fetch-binaries] adb.exe already present, skipping');
        return;
    }
    console.log('[fetch-binaries] downloading platform-tools ...');
    const zip = new AdmZip(await fetchBuffer(PLATFORM_TOOLS_URL));
    fs.mkdirSync(ADB_DIR, { recursive: true });
    const wanted = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll'];
    for (const name of wanted) {
        const entry = zip.getEntry(`platform-tools/${name}`);
        if (!entry) throw new Error(`platform-tools zip missing ${name}`);
        fs.writeFileSync(path.join(ADB_DIR, name), entry.getData());
        console.log(`[fetch-binaries]   extracted ${name}`);
    }
    if (Buffer.from(fs.readFileSync(adbExe)).subarray(0, 2).toString() !== 'MZ') {
        throw new Error('extracted adb.exe is not a Windows executable');
    }
}

async function fetchFridaServers() {
    fs.mkdirSync(FRIDA_DIR, { recursive: true });
    for (const arch of ARCHES) {
        const dest = path.join(FRIDA_DIR, fridaName(arch));
        if (ok(dest, 1_000_000)) {
            console.log(`[fetch-binaries] ${fridaName(arch)} already present, skipping`);
            continue;
        }
        console.log(`[fetch-binaries] downloading + decompressing ${fridaName(arch)} ...`);
        const buf = await fetchXz(fridaUrl(arch));
        if (buf.subarray(0, 4).toString('hex') !== '7f454c46') {
            throw new Error(`decompressed ${fridaName(arch)} is not an ELF binary`);
        }
        fs.writeFileSync(dest, buf);
        console.log(`[fetch-binaries]   wrote ${fridaName(arch)} (${buf.length} bytes)`);
    }
}

(async () => {
    try {
        fs.mkdirSync(BIN, { recursive: true });
        await fetchAdb();
        await fetchFridaServers();
        console.log('[fetch-binaries] done');
    } catch (err) {
        console.error('[fetch-binaries] FAILED:', err.message);
        process.exit(1);
    }
})();
