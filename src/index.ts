import Logger from "electron-log";
import EventEmitter from "events";
import { GlobalKeyboardListener, IGlobalKeyEvent } from "node-global-key-listener";
import dotenv from "dotenv";
import path from "path";

import { createWindow } from "./data/utils";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import isDev from "electron-is-dev";
import frida from "frida";
import { existsSync, readFileSync } from "fs";
import { adb, attachProcess, autoConnectAdb, checkFridaPerm, connectFrida, connectAdbDevice, executeProcess, fileExist, fileName, fridaServerBin, getArch, getUrl, pushFile, startFrida } from "./data/frida";
import { loginPixel, defaultWebUrl } from "./data/auth";
import { exec } from "child_process";
import { createServer as createPixelServer } from "./core/server";
import type { ServerFacade } from "./core/server";
import { _anOffset, _eposOffset, _xaOffset, _xaPatch, _anPatch, _symbols, _libName } from "./offsets";
import { keyboard } from "@nut-tree-fork/nut-js";
import { nutKeymap } from "./keymaps";
import { Commander } from "./commander";

keyboard.config.autoDelayMs = 0;

const process_name = 'com.gameparadiso.milkchoco';
const frida_version = '16.4.10';
const agentPath = isDev ? path.join(__dirname, './../public/scripts/', 'agent.js') : path.join(__dirname, './../../public/scripts/', 'agent.js');
if(!existsSync(agentPath)) {
    Logger.error("Failed to open agent file");
    process.exit(1);
}

// Read agent script and strip everything up to the sentinel line "cut"; to avoid leaking helpers/types
const rawAgentScript = readFileSync(agentPath, 'utf8').toString();
let agentScript = rawAgentScript;
const cutIdx1 = rawAgentScript.indexOf('"cut";');
const cutIdx2 = cutIdx1 < 0 ? rawAgentScript.indexOf("'cut';") : cutIdx1;
const marker = cutIdx1 < 0 ? "'cut';" : '"cut";';
if (cutIdx2 >= 0) {
    agentScript = rawAgentScript.slice(cutIdx2 + marker.length);
} else {
    Logger.warn('Agent sentinel "cut" not found; using full agent script as fallback');
}

// load env (support both dev and packaged paths gracefully)
const envCandidates = [
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(process.cwd(), '.env'),
];
const resolvedEnvPath = envCandidates.find(p => existsSync(p));
if (resolvedEnvPath) {
    dotenv.config({ path: resolvedEnvPath });
} else {
    dotenv.config();
}

// register logger
Logger.initialize();
// create event emitter
const emitter = new EventEmitter();
const listener = new GlobalKeyboardListener();
// listen for global key events
listener.addListener((event, down) => {
    emitter.emit("gk", event, down);
});

// Commander
const commander = new Commander();

// vars
let main: BrowserWindow | null = null;
let serial:string = "127.0.0.1:5555";
let adbId:string = '';
let fridaDevice:frida.Device = null;
let cookie:string = '';
let exp:frida.ScriptExports = null;
let cheats:Cheats = {};
let config:Config = {};
let keybinds:Keybinds = {};
let wpdata:{[key:string]:WPData} = {};
let web: ServerFacade | null = null;

// exit app
const exitApp = async () => {
    Logger.log("App closed");
    emitter.removeAllListeners("pos");
    emitter.removeAllListeners("skillcode");
    emitter.removeAllListeners("esp");
    emitter.removeAllListeners("aim-circle");
    emitter.removeAllListeners("gyro");
    emitter.removeAllListeners("execute-macro");
    emitter.removeAllListeners("listen-sub");
    emitter.removeAllListeners("listen-main");
    emitter.removeAllListeners("reverse");
    emitter.removeAllListeners("state");
    emitter.removeAllListeners("scan-epos");
    emitter.removeAllListeners("scan-entity");
    app.quit();
    try { web?.stop(); } catch {}
    process.exit(0);
};

const getExceptNums = async (): Promise<number[]> => [];

// main app events
app.on("ready", async () => {
    main = createWindow("main", 380, 620, true, {
        title: `はぐるま v${app.getVersion()}`,
        maximizable: false,
        fullscreenable: false,
        fullscreen: false,
        backgroundColor: "#08080b",
        minWidth: 340,
        minHeight: 520,
    }, async () => {
        try{
            Logger.info(isDev ? "Development mode" : "Production mode");
            if(isDev){
                main.webContents.send("enter");
            } else {
                autoUpdater.checkForUpdatesAndNotify();
            }
        } catch(err){
            Logger.error("Update error", err);
            main.webContents.send("enter");
        }
    });
    main.once('close', exitApp);
    main.once('closed', exitApp);
    const state = (id:string, state:string, log:string) => {
        if(main.isDestroyed()) return;
        main.webContents.send("update-state", id, state, log);
    };

    const layout = createWindow("layout", 800, 600, false, {
        maximizable: true,
        fullscreenable: true,
        fullscreen: false,
        frame: false,
        transparent: true,
        resizable: true,
        movable: true,
    });

    autoUpdater.on("checking-for-update", () => {
    });

    autoUpdater.on("update-available", () => {
        main.webContents.send("update");
        autoUpdater.downloadUpdate();
    });

    autoUpdater.on("download-progress", (progress) => {
        main.webContents.send("download", progress.percent);
    });

    autoUpdater.on("update-downloaded", () => {
        Logger.log("Update downloaded");
        autoUpdater.quitAndInstall(false, true);
        exitApp();
    });

    const sendPostUpdate = () => {
        if(main.isDestroyed()) return;
        const bypass = process.env.PIXEL_DEV_BYPASS_AUTH === 'true';
        main.webContents.send(bypass ? "enter" : "updater-done");
    };

    autoUpdater.on("error", (err) => {
        Logger.error("Update error", err);
        sendPostUpdate();
    });

    autoUpdater.on("update-cancelled", () => {
        sendPostUpdate();
    });

    autoUpdater.on("update-not-available", () => {
        sendPostUpdate();
    });

    // pixel-code-web authentication
    ipcMain.handle("auth:login", async (_e, payload: { id?: string; password?: string }) => {
        try {
            const id = (payload?.id || '').trim();
            const password = payload?.password || '';
            if(!id || !password) return { ok: false, error: 'ID / Password required' };
            return await loginPixel(id, password);
        } catch (err:any) {
            Logger.error("auth:login error", err);
            return { ok: false, error: err?.message || 'login error' };
        }
    });
    ipcMain.on("open-web", () => {
        const url = process.env.PIXEL_WEB_URL || defaultWebUrl;
        shell.openExternal(url).catch(err => Logger.error("openExternal error", err));
    });

    // web server (create after windows + state function exist)
    web = createPixelServer(
        () => config,
        (channel: string, ...args: any[]) => emitter.emit(channel, ...args),
        (id: string, st: string, log: string) => state(id, st, log)
    );

    // macros (DB removed; return empty result so renderer can handle)
    ipcMain.on("get-macros", async (e, ids:string[]) => {
        main.webContents.send("macros", []);
    })

    // layout
    ipcMain.on("show-layout", (e, bool:boolean) => {
        if(bool) layout.show();
        else layout.hide();
    });
    ipcMain.on("lock-layout", (e, bool:boolean) => {
        layout.setMovable(!bool);
        layout.setResizable(!bool);
        layout.setAlwaysOnTop(bool);
        layout.setIgnoreMouseEvents(bool);
    });
    ipcMain.on("resize-layout", (e) => {
        main.webContents.send("resize-layout", layout.getBounds());
    });

    // initialize
    ipcMain.on("init", (e, _keybinds, _config, _wpdata, _layoutBounds:Electron.Rectangle|null) => {
        keybinds = _keybinds;
        config = _config;
        wpdata = _wpdata;
        if(_layoutBounds) layout.setBounds(_layoutBounds);
        layout.webContents.send("init-config", config);
    });
    ipcMain.on("get-config", (e) => {e.returnValue = config;});
    ipcMain.on('serial', (e, s:string) => {serial = s});
    ipcMain.on('cookie', (e, c:string) => {cookie = c});
    ipcMain.on("keybind", (e, id, key) => {
        keybinds[id] = key;
        emitter.emit("keybind", id, key);
    });
    ipcMain.on("config", (e, id, data) => {
        config[id] = data;
        emitter.emit("config", id, data);
        layout.webContents.send("config", id, data);
    });
    ipcMain.on("cheats", (e, id, _state:boolean) => {
        cheats[id] = _state;
        emitter.emit("cheats", id, _state);
    });

    const _main = async (onip:boolean) => {
        try{
            if(onip){
                state("adb", "pending", "Detecting BlueStacks emulator");
                const resolved = await autoConnectAdb(serial);
                if(resolved === ''){
                    return state("adb", "error", "No emulator found. Enable ADB in BlueStacks Settings > Advanced");
                }
                serial = resolved;
                adbId = resolved;
                if(!main.isDestroyed()) main.webContents.send("serial", resolved);
            } else {
                const ip = await adb.getIpAddress(serial);
                if(ip.length > 0) {
                    await adb.tcpip(serial);
                    adbId = serial;
                } else {
                    state("adb", "error", "Failed to get ip address");
                }
            }
            if(adbId === '') return state("adb", "error", "Failed to connect to adb");
            state("adb", "active", `Connected to adb`);
        } catch(err){
            Logger.error("ADB error", err);
            state("adb", "error", "Failed to connect to adb");
        }
    }
    ipcMain.on("connect-adb", async (e, serial:string, onip:boolean) => {
        state("adb", "pending", "Trying to connect to adb");
        try{
            await adb.startServer();
            state("adb", "pending", "Server started");
            await _main(onip);
        } catch(err){
            Logger.error("ADB error", err);
            state("adb", "pending", "Server error");
            await _main(onip);
        }
    });

    ipcMain.on("download-server", async (e) => {
        if(adbId === '') return state("server", "error", "ADB not connected");
        const url = getUrl(frida_version, await getArch(adbId));
        exec(`start ${url}`);
    });

    ipcMain.on("upload-server", async (e) => {
        if(adbId === '') return state("server", "error", "ADB not connected");
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{name: 'Frida Server', extensions:[]}]
        })
        if(result.canceled) return;
        const filePath = result.filePaths[0];
        const name = fileName(frida_version, await getArch(adbId));
        try{
            await pushFile(adbId, filePath, `/data/local/tmp/${name}`);
        } catch(e) {
            Logger.error("Failed to upload frida server");
        }
    });

    ipcMain.on("start-server", async (e) => {
        if(adbId === '') return state("server", "error", "ADB not connected");
        state("server", "pending", "Starting frida server");
        try{
            const arch = await getArch(adbId);
            if(arch === '') return state("server", "error", "Failed to get arch");
            let filename = await fileExist(adbId, frida_version);
            if(filename === '') {
                const bundled = fridaServerBin(frida_version, arch);
                if(bundled === '') return state("server", "error", "Cannot find frida server");
                const name = fileName(frida_version, arch);
                state("server", "pending", "Deploying bundled frida server");
                try {
                    await pushFile(adbId, bundled, `/data/local/tmp/${name}`);
                } catch(err) {
                    Logger.error("Failed to deploy bundled frida server", err);
                    return state("server", "error", "Failed to deploy frida server");
                }
                filename = name;
            }
            const perm = await checkFridaPerm(adbId, filename);
            if(!perm) return state("server", "error", "Frida permissions denied");
            if(!await startFrida(adbId, filename, () => state("server", "error", "Frida server crashed"))) {
                return state("server", "error", "Failed to start frida server");
            }
            state("server", "active", "Frida server started");
        } catch(e) {
            Logger.error("Frida server error", e);
            state("server", "error", "Failed to start frida server");
        }
    });

    ipcMain.on("connect-frida", async (e) => {
        state("frida", "pending", "Connecting to frida server");
        await connectFrida(serial, () => state("frida", "error", "Frida server crashed"), (d) => {
            fridaDevice = d;
            state("frida", "active", "Connected to frida server");
        });
    });

    ipcMain.on("get-cookie", async (e) => {
        if(!fridaDevice) return state("session", "error", "Frida not connected");
        state("session", "pending", "Getting cookie");
        try{
            const [dispose, script] = await executeProcess(process_name, fridaDevice, `
                setTimeout(() => {
                    setImmediate(function() {
                        Java.perform(() => {
                            let XigncodeClientSystem = Java.use("com.wellbia.xigncode.XigncodeClientSystem");
                            XigncodeClientSystem["getCookie2"].implementation = function (str) {
                                let result = this["getCookie2"](str);
                                send(result);
                                return result;
                            };
                        });
                    });
                }, 100)`,
                (message:frida.Message, data:Buffer) => {
                    if(message.type === 'send') {
                        cookie = message.payload;
                        state("session", "succeed", "Cookie received");
                        main.webContents.send("cookie", cookie);
                    }
                },
                () => {
                    state("session", "active", "Script attached");
                },
                () => {
                    state("session", "error", "Session disposed");
                    dispose();
                },
                false // useEmulator
            )
        } catch (err){
            Logger.error("Cookie error", err);
            state("session", "error", "Failed to get cookie");
        }
    });

    ipcMain.on("start-agent", async (e) => {
        if(!fridaDevice) return state("session", "error", "Frida not connected");
        state("session", "pending", "Starting agent");
        let found:boolean = false;
        try{
            const [bpDispose, byScript, bpPid] = await executeProcess(process_name, fridaDevice,
                `Java.perform(() => {
                    let XigncodeClientSystem = Java.use("com.wellbia.xigncode.XigncodeClientSystem");
                    XigncodeClientSystem["initialize"].implementation = function (activity,str,str2,str3,callback) {
                        send(["XigncodeClientSystem.initialize", activity, str, str2, str3]);
                        return 0;
                    };
                    XigncodeClientSystem["getCookie2"].implementation = function (str) {
                        let result = this["getCookie2"](str);
                        return result;
                    };
                });`.replace("return result", `return '${cookie.trim()}'`),
                async (message:frida.Message, data:Buffer) => {
                    if(message.type === 'send') {
                        state("session", "active", "Xigncode Bypassed");
                        const [dispose, script] = await attachProcess(bpPid, fridaDevice,
                            agentScript
                            .replace("/*xaOffset*/",  JSON.stringify(_xaOffset))
                            .replace("/*anOffset*/",  JSON.stringify(_anOffset))
                            .replace("/*eposOffset*/",JSON.stringify(_eposOffset))
                            .replace("/*xaPatch*/",   JSON.stringify(_xaPatch))
                            .replace("/*anPatch*/",   JSON.stringify(_anPatch))
                            .replace("/*agentSyms*/", JSON.stringify(_symbols))
                            .replace("/*libName*/",   JSON.stringify(_libName))
                            ,
                            (message:frida.Message, data:Buffer) => {
                                if(message.type === 'send') {
                                    const [channel, ...args] = [...message.payload];
                                    if(channel == 'Address.init'){
                                        found = true;
                                        Logger.info("Module Initialized", args);
                                        state("session", "succeed", `Module Initialized`);
                                        main.webContents.send("init", true);
                                        script.post(['init', cheats, keybinds, config, wpdata]);
                                    } else emitter.emit(channel, ...args);
                                }
                            },
                            () => {
                                state("session", "pending", "Agent attached");
                                layout.webContents.send("init-config", config);
                                emitter.on("config", (key, value) => {
                                    script.post(['config', key, value]);
                                });
                                emitter.on("keybind", (key, value) => {
                                    script.post(['keybind', key, value]);
                                });
                                emitter.on("cheats", (key, value) => {
                                    script.post(['cheats', key, value]);
                                });
                                emitter.on("gk", (event:IGlobalKeyEvent, down) => {
                                    script.post(['keyevent', event.name, event.state, down]);
                                });
                                ipcMain.on("listen-sub", (e, val:boolean) => {
                                    script.post(['listen-sub', val]);
                                });
                                ipcMain.on("listen-main", (e, val:boolean) => {
                                    script.post(['listen-main', val]);
                                });
                                ipcMain.on("reverse", (e) => {
                                    script.post(['reverse']);
                                });
                                ipcMain.on("pos", (e, pos:number[]) => {
                                    script.post(['pos', pos]);
                                });
                                ipcMain.on("skillcode", (e, code:number) => {
                                    script.post(['skillcode', code]);
                                });
                                if(isDev) ipcMain.on("state", (e, code:number) => {
                                    script.post(['state', code]);
                                });
                                ipcMain.on("scan-epos", async (e) => {
                                    script.post(['scan-epos']);
                                    script.post(['tier-numbers', await getExceptNums()]);
                                });
                                ipcMain.on("scan-entity", async (e) => {
                                    script.post(['scan-entity']);
                                    script.post(['tier-numbers', await getExceptNums()]);
                                });
                                ipcMain.on("clear-all", (e) => {
                                    script.post(['clear-all']);
                                });
                                ipcMain.on("except-number", (e, data:number[]) => {
                                    script.post(['except-number', data]);
                                });
                                ipcMain.on("change-NaN", (e) => {
                                    script.post(['change-NaN']);
                                });
                                ipcMain.on("unlock-all-item", (e, charid: number) => script.post(['unlock-all-item', charid]));
                                ipcMain.on("unlock-all-char", (e) => script.post(['unlock-all-char']));
                                ipcMain.on("get-daily-reward", (e, repeat: number) => script.post(['get-daily-reward', repeat]));
                                ipcMain.on("change-ads-reward", (e) => script.post(['change-ads-reward']));

                                ipcMain.on("kick-player", (e, number: number) => script.post(['kick-player', number]));
                                ipcMain.on("kick-by-slot", (e, slot: number) => script.post(['kick-by-slot', slot]));
                                ipcMain.on("kick-all-enemy", (e) => script.post(['kick-all-enemy']));
                                ipcMain.on("kick-loop-start", (e, slot: number, interval: number) => script.post(['kick-loop-start', slot, interval]));
                                ipcMain.on("kick-loop-stop", (e) => script.post(['kick-loop-stop']));

                                ipcMain.on("change-nickname", (e, name: string) => script.post(['change-nickname', name]));
                                ipcMain.on("purchase-pass", (e, num: number, item: number) => script.post(['purchase-pass', num, item]));
                                ipcMain.on("server-exploit", (e) => script.post(['server-exploit']));
                                ipcMain.on("create-clan", (e, name: string) => script.post(['create-clan', name]));
                                ipcMain.on("break-clan", (e) => script.post(['break-clan']));
                                ipcMain.on("buy-clan-gold", (e, amount: number) => script.post(['buy-clan-gold', amount]));
                                ipcMain.on("equip-item", (e, char: number, slot: number, number: number) => script.post(['equip-item', char, slot, number]));

                                ipcMain.on("ctm-default-milk", (e) => script.post(['ctm-default-milk']));
                                ipcMain.on("ctm-default-choco", (e) => script.post(['ctm-default-choco']));
                                ipcMain.on("ctm-desert-milk", (e) => script.post(['ctm-desert-milk']));
                                ipcMain.on("ctm-desert-choco", (e) => script.post(['ctm-desert-choco']));
                                ipcMain.on("ctm-castle-milk", (e) => script.post(['ctm-castle-milk']));
                                ipcMain.on("ctm-castle-choco", (e) => script.post(['ctm-castle-choco']));
                                ipcMain.on("ctm-mountain-milk", (e) => script.post(['ctm-mountain-milk']));
                                ipcMain.on("ctm-mountain-choco", (e) => script.post(['ctm-mountain-choco']));
                                ipcMain.on("execute-cmd", (e, data:string) => script.post(['execute-cmd', data]));
                                if(isDev) {
                                    ipcMain.on("get-ranges", (e, data:string) => script.post(['get-ranges', data]));
                                    ipcMain.on("find-ranges", (e, data:string) => script.post(['find-ranges', data]));
                                    ipcMain.on("search-pattern", (e, data:string) => script.post(['search-pattern', data]));
                                    ipcMain.on("dev-perf", (e, val:boolean) => script.post(['dev-perf', val]));
                                }
                                emitter.on("gyro", (data) => {
                                    script.post(['gyro', data]);
                                });
                                emitter.on('execute-macro', (e, id:string) => {
                                    script.post(['execute-macro', id]);
                                });
                            },
                            () => {
                                layout.webContents.send("init-config", config);
                                main.webContents.send("init", false);
                                emitter.removeAllListeners("config");
                                emitter.removeAllListeners("keybind");
                                emitter.removeAllListeners("cheats");
                                emitter.removeAllListeners("gk");
                                ipcMain.removeAllListeners("listen-sub");
                                ipcMain.removeAllListeners("listen-main");
                                ipcMain.removeAllListeners("reverse");
                                ipcMain.removeAllListeners("pos");
                                ipcMain.removeAllListeners("skillcode");
                                if(isDev) ipcMain.removeAllListeners("state");
                                ipcMain.removeAllListeners("scan-epos");
                                ipcMain.removeAllListeners("scan-entity");
                                ipcMain.removeAllListeners("clear-all");
                                ipcMain.removeAllListeners("except-number");
                                ipcMain.removeAllListeners("change-NaN");
                                ipcMain.removeAllListeners("change-ads-reward");
                                ipcMain.removeAllListeners("unlock-all-item");
                                ipcMain.removeAllListeners("get-daily-reward");
                                ipcMain.removeAllListeners("kick-player");
                                ipcMain.removeAllListeners("kick-by-slot");
                                ipcMain.removeAllListeners("kick-all-enemy");
                                ipcMain.removeAllListeners("kick-loop-start");
                                ipcMain.removeAllListeners("kick-loop-stop");
                                ipcMain.removeAllListeners("change-nickname");
                                ipcMain.removeAllListeners("purchase-pass");
                                ipcMain.removeAllListeners("server-exploit");
                                ipcMain.removeAllListeners("create-clan");
                                ipcMain.removeAllListeners("break-clan");
                                ipcMain.removeAllListeners("buy-clan-gold");
                                ipcMain.removeAllListeners("equip-item");
                                ipcMain.removeAllListeners("get-ranges");
                                ipcMain.removeAllListeners("find-ranges");
                                ipcMain.removeAllListeners("execute-cmd");
                                emitter.removeAllListeners("gyro");
                                emitter.removeAllListeners("execute-macro");
                                exp = null;
                                commander.dispose()
                                cheats = {};
                                state("epos", "clear", "");
                                state("entity", "clear", "");
                                state("session", "error", "Session disposed");
                                dispose();
                            },
                            true // useEmulator
                        )
                        commander.init(script);
                    }
                },
                () => {
                    state("session", "pending", "Process attached");
                },
                () => {
                    state("session", "error", "Session disposed");
                    bpDispose();
                }, false // useEmulator
            );
        } catch (err){
            Logger.error("Agent error", err);
            state("session", "error", "Failed to start agent");
        }
    });

    emitter.on("wp-data", (_wpdata:{[key:string]:WPData}) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        wpdata = _wpdata;
        main.webContents.send("wp-data", _wpdata);
    })

    // cheat
    emitter.on("listen-sub", (v:[number, number]) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("listen-sub", v);
    })
    emitter.on("listen-main", (v:[number, number]) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("listen-main", v);
    });
    emitter.on("pos", (pos:number[]) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("pos", pos);
    });
    emitter.on("skillcode", (code:number) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("skillcode", code);
    });
    if(isDev) emitter.on("state", (code:number) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("state", code);
    });
    emitter.on("epos-state", (_state:string, msg:string) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        state("epos", _state, msg);
    });
    emitter.on("entity-state", (_state:string, msg:string) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        state("entity", _state, msg);
    });
    emitter.on("clear-all", () => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        state("epos", "clear", "");
        state("entity", "clear", "");
        layout.webContents.send("clear");
    });
    emitter.on("clear-esp", () => {
        if(!layout || layout.isDestroyed() || !layout.isVisible()) return;
        layout.webContents.send("clear");
    });
    emitter.on("esp", (data:DrawRect[]) => {
        if(!layout || layout.isDestroyed() || !layout.isVisible() || !cheats['esp']) return;
        layout.webContents.send("draw", data);
    })
    emitter.on("aim-circle", (data:{radius:number;color:string;active:boolean}) => {
        if(!layout || layout.isDestroyed() || !layout.isVisible() || !cheats['aim-by-circle']) return;
        layout.webContents.send("aim-circle", data);
    })
    emitter.on("except-number", (data:number[]) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("except-number", data);
    });
    // developer perf output forwarding
    emitter.on("perf", (data:any) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("perf", data);
    });
    ipcMain.on("console-cmd", (e: any, data:string) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        const [cmd, ...args] = data.trim().split(" ").map(s => s.trim())
        const msg = commander.apply(cmd, ...args);
        main.webContents.send("log", msg);
    });

    ipcMain.on("search-wp", async (e, data:string, type:string) => {
        if(!main || main.isDestroyed() || !main.isVisible()) return;
        main.webContents.send("search-wp", []);
    })

    // server
    ipcMain.on("server-start", (e, port:number) => {
        web?.start(port || 3000);
    });
    ipcMain.on("server-stop", (e) => {
        web?.stop();
    });

    // click
    emitter.on("touch", (x:number, y:number) => {
        adb.shell(adbId, `input tap ${x} ${y}`);
    })
    // keyboard
    emitter.on("sendkey", async (keyName: string) => {
        if(nutKeymap[keyName]){
            keyboard.pressKey(nutKeymap[keyName]);
            keyboard.releaseKey(nutKeymap[keyName]);
        }
    })
});

emitter.on("log", (...args:any[]) => {
    Logger.log(...args);
    if(!main || main.isDestroyed() || !main.isVisible()) return;
    main.webContents.send("log", ...args);
});
ipcMain.on("log", (e, ...args:any[]) => {
    Logger.log(...args);
});
