"cut";
// =============================================================================
//  Offsets, agentSyms and patch values are injected at runtime from the host
//  (`src/index.ts`) by replacing the placeholder comments below. Editing this
//  file should never be required for a game update — bump `src/offsets.ts`
//  instead.
//  Pre-injection the file stays valid TypeScript thanks to JSON.parse on
//  string literals.
// =============================================================================
const xaOffset   = JSON.parse('/*xaOffset*/');
const anOffset   = JSON.parse('/*anOffset*/');
const eposOffset = JSON.parse('/*eposOffset*/');
const xaPatch    = JSON.parse('/*xaPatch*/');
const anPatch    = JSON.parse('/*anPatch*/');
const agentSyms  = JSON.parse('/*agentSyms*/');
const libName    = JSON.parse('/*libName*/');

// Helper: convert any value into a NativePointer suitable for forceWrite*.
// Picks the writer based on the patch entry type ("s32" | "f32").
function applyXaPatch(name: string, on: boolean){
    const ofs = xaOffset[name];
    const pt  = xaPatch[name];
    if(!ofs || !pt) return;
    const addr = Module.getExportByName(libName, ofs.name).add(ofs.offset);
    const value = on ? pt.on : pt.off;
    if(pt.type === 'f32') forceWriteFloat(addr, value);
    else forceWriteS32(addr, value);
}

// 0 = ground stop
// 1 = ground walk
// 2 = air stop
// 3 = air walk
// 8 = shoot stop
// 9 = shoot walk
// 10 = shoot air stop
// 11 = shoot air walk
// 128 = grenade stop
// 129 = grenade walk
// 130 = grenade air stop
// 131 = grenade air walk
// 64 = reload
// 65 = reload walk
// 66 = reload air stop
// 67 = reload air walk
// 32 = jump
// 33 = jump walk
// 16 = death
// 256 = skill stop
// 257 = skill walk
// 258 = skill air stop
// 259 = skill air walk

const camFov = [92, 52];
const upSize = 9;
const downSize = -0.5;
const sideSize = 2.5;

interface Point{
    x:number;
    y:number;
}

interface DrawRect{
    upside:Point[];
    downside:Point[];
    number:number;
    nickname:string;
    hp:number;
    barrier:number;
    total:number;
    isTeam:boolean;
    isDead:boolean;
}

interface Macro{
    id: string;
    events: MacroEvent[];
}

interface MacroEvent{
    base: "xa" | "an" | "epos";
    type: "float" | "int32" | "int16" | "byte";
    offset: string; // offset name in xaOffset, anOffset, eposOffset
    target?: "self" | "enemy" | "all"; // only for epos
    index?: number; // only for epos & target is entity
    value: number;
}

interface WPData{
    nicks:{nick:string;date:number}[]
    chars:{
        [key:string]:{
            exp:number;
            totalkill:number;
            totaldeath:number;
            totalassist:number;
            date:number;
        }
    }
}

let isArm = false
let _libMyGame:Module | null = null;
let xa:NativePointer = null;
let an:NativePointer = null;
let cd:NativePointer = null;
let jit:NativePointer = null;
let jtRange:number = null;
let cas:RangeDetails[] = [];
let cambase:NativePointer = null;
let epos:NativePointer = null;
let entityList:Set<string> = new Set();
let excns:number[] = [];
let excepts:number[] = [];

let cheats:{[key:string]:boolean} = {};
let keybinds:{[key:string]:string} = {};
let config:{[key:string]:any} = {};
let keymap:{[key:string]:boolean} = {};
let wpdata:{[key:string]:WPData} = {};
let macros:Macro[] = [];

let listenSub: boolean = false;
let listenMain: boolean = false;
let devPerf: boolean = false;
let perfAccum = 0;
let perfCount = 0;
let perfLast = Date.now();

// let activeTouches: Record<string, any> = {}
// let InputManager:any = null;

let setYaw: any = null;
let setPitch: any = null;
let unlockChar: any = null;
let unlockAllChar: any = null;
let buyClanGold: any = null;
let getDailyReward: any = null;
let adsRequestShopADReward: any = null;
let onRewarded: any = null;
let purchaseP: any = null;
let purchaseT: any = null;
let changeNickname: any = null;
let exploitServer: any = null;
let createClan: any = null;
let breakClan: any = null;
let equip: any = null;

let elec: any = null;
let mago: any = null;

// Direct kick via SystemPacketSend::FMatchKickUserSlot. May be null on older
// libMyGame.so builds that don't export the symbol — every call site guards.
let fMatchKickUserSlot: any = null;

const log = (...args:any[]) => send(['log', ...args]);

// Matches the sentinel emitted by `Commander.call` when --silent/-s/--no-log
// is passed. Strips the return-value log so high-frequency native calls (e.g.
// scripted in a tight macro loop) don't flood the host devtools.
const silentCallSentinel = '__pixel_silent__';

let found: boolean = false;
const loadModule = setInterval(() => {
    try {
        if(Module.findBaseAddress(libName) && !found) {
            _libMyGame = Process.findModuleByName(libName);
            send(['Address.init', _libMyGame ? _libMyGame.base.toString() : 'null']);
            clearInterval(loadModule);
            init();
            loop();
            found = true;
        }
    } catch (error) {
        console.log(error)
    }
}, 500);
// Java.perform(() => {
    // let Activity = Java.use("android.app.Activity");
    // let MotionEvent = Java.use("android.view.MotionEvent");
    // Activity.dispatchTouchEvent.overload('android.view.MotionEvent').implementation = function(event: Java.Wrapper) {
    //     var actionMasked = event.getActionMasked();
    //     var pointerIndex = event.getActionIndex();
    //     var pointerId = event.getPointerId(pointerIndex);
    //     if (actionMasked === MotionEvent.ACTION_DOWN.value || actionMasked === MotionEvent.ACTION_POINTER_DOWN.value) {
    //         var x = event.getX(pointerIndex);
    //         var y = event.getY(pointerIndex);
    //         activeTouches[pointerId] = { x: x, y: y };
    //     }
    //     else if (actionMasked === MotionEvent.ACTION_MOVE.value) {
    //         var pointerCount = event.getPointerCount();
    //         for (var i = 0; i < pointerCount; i++) {
    //             var id = event.getPointerId(i);
    //             var x = event.getX(i);
    //             var y = event.getY(i);
    //             if (activeTouches[id]) {
    //                 activeTouches[id].x = x;
    //                 activeTouches[id].y = y;
    //             }
    //         }
    //     }
    //     else if (actionMasked === MotionEvent.ACTION_UP.value || actionMasked === MotionEvent.ACTION_POINTER_UP.value || actionMasked === MotionEvent.ACTION_CANCEL.value) {
    //         if (activeTouches.hasOwnProperty(pointerId)) {
    //             delete activeTouches[pointerId];
    //         }
    //     }
    //     var x = event.getX();
    //     var y = event.getY();
    //     if(listenSub){
    //         config['autoswap-subweapon-x'] = x;
    //         config['autoswap-subweapon-y'] = y;
    //         listenSub = false;
    //         send(['listen-sub', [x, y]]);
    //     }
    //     if(listenMain){
    //         config['autoswap-mainweapon-x'] = x;
    //         config['autoswap-mainweapon-y'] = y;
    //         listenMain = false;
    //         send(['listen-main', [x, y]]);
    //     }
    //     return this.dispatchTouchEvent(event);
    // };
    // const inp = Java.use("android.hardware.input.InputManager")
    // InputManager = inp.getInstance();
// });

function getFilteredEntityList(exceptMark:boolean):NativePointer[]{
    if(!epos) return [];
    if(epos.isNull()) return [];
    if(!entityList) return [];
    if(entityList.size === 0) return [];
    const reversed = config['except-reverse'] || false;
    return [...entityList].map(pt => ptr(pt))
    .filter(entity => entity.toString() !== '0x0')
    .filter(entity => !entity.isNull())
    .filter(entity => {
        // Treat zr1/zr2 as float flags and ignore entities with non-zero values
        const zr1 = entity.add(eposOffset['zr1']).readFloat();
        const zr2 = entity.add(eposOffset['zr2']).readFloat();
        const name = entity.add(eposOffset["nickname"]).readCString();
        const eps = 1e-6;
        return Math.abs(zr1) < eps && Math.abs(zr2) < eps && name !== "";
    })
    .filter(entity => entity.toString() !== epos.toString())
    .filter(entity => !excns.includes(entity.add(eposOffset['number']).readS32()))
    .filter(entity => {
        if(exceptMark){
            const except = excepts.includes(entity.add(eposOffset['number']).readS32())
            return reversed ? except : !except;
        } else {
            return true;
        }
    })
}

function getFocusedEntity(): NativePointer[] {
    if(!cambase) return [];
    if(cambase.isNull()) return [];
    const camX = cambase.add(anOffset['camX']).readFloat();
    const camY = cambase.add(anOffset['camY']).readFloat();
    const camZ = cambase.add(anOffset['camZ']).readFloat();
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat() + (+config['esp-pitch-offset'] || 0);
    return getFilteredEntityList(false).filter(entity => {
        const x = entity.add(eposOffset['x']).readFloat();
        const y = entity.add(eposOffset['y']).readFloat();
        const z = entity.add(eposOffset['z']).readFloat();
        const list:Point[] = [
            {x: x + sideSize, y: y + upSize, z: z + sideSize},
            {x: x - sideSize, y: y + upSize, z: z + sideSize},
            {x: x - sideSize, y: y + upSize, z: z - sideSize},
            {x: x + sideSize, y: y + upSize, z: z - sideSize},
            {x: x + sideSize, y: y + downSize, z: z + sideSize},
            {x: x - sideSize, y: y + downSize, z: z + sideSize},
            {x: x - sideSize, y: y + downSize, z: z - sideSize},
            {x: x + sideSize, y: y + downSize, z: z - sideSize},
        ].map(vec3 => calcESP(vec3, {x: camX, y: camY, z: camZ}, yaw, pitch, camFov)).filter(point => point);
        const minX = Math.min(...list.map(point => point.x)), maxX = Math.max(...list.map(point => point.x));
        const minY = Math.min(...list.map(point => point.y)), maxY = Math.max(...list.map(point => point.y));
        return minX < 0 && maxX > 0 && minY < 0 && maxY > 0;
    });
}

let updateWPData = false;
function saveWPData(pointer: NativePointer){
    const n = pointer.add(eposOffset['number']).readS32().toString();
    const nick = pointer.add(eposOffset['nickname']).readCString();
    const zr1 = pointer.add(eposOffset['zr1']).readFloat();
    const zr2 = pointer.add(eposOffset['zr2']).readFloat();
    if(zr1 !== 0 || zr2 !== 0 || nick === "" || n.startsWith("-")) return;
    const char = pointer.add(eposOffset['char']).readU8().toString();
    const exp = pointer.add(eposOffset['exp']).readS32();
    const totalkill = pointer.add(eposOffset['totalkill']).readS32();
    const totaldeath = pointer.add(eposOffset['totaldeath']).readS32();
    const totalassist = pointer.add(eposOffset['totalassist']).readS32();
    if(wpdata[n]){
        const haveNick = wpdata[n].nicks.filter(nck => nck.nick === nick);
        if(haveNick.length === 0){
            wpdata[n].nicks.push({nick, date: Date.now()});
        } else {
            wpdata[n].nicks = wpdata[n].nicks.map(nck => nck.nick === nick ? {nick, date: Date.now()} : nck);
        }
        if(Number(char) > 0) wpdata[n].chars[char] = {exp, totalkill, totaldeath, totalassist, date: Date.now()};
    } else {
        wpdata[n] = {
            nicks: [{nick, date: Date.now()}], 
            chars: Number(char) > 0 ? {[char]: {exp, totalkill, totaldeath, totalassist, date: Date.now()}} : {}
        };
    }
    updateWPData = true;
}
setInterval(() => {
    if(updateWPData){
        updateWPData = false;
        send(['wp-data', wpdata]);
    }
}, 5 * 1000);

let assistSpeed = 0;
let lastTime = Date.now();
let shooting = false;
function makeNFunc(symbol: string, retType: any, argTypes: any[]): any {
    try {
        return new NativeFunction(Module.findExportByName(libName, symbol), retType, argTypes);
    } catch (error) {
        console.log("[makeNFunc]: ", symbol, error)
        return null;
    }
}
function attachNFunc(symbol: string, callbacksOrProbe: InvocationListenerCallbacks | InstructionProbeCallback): void {
    Interceptor.attach(Module.findExportByName(libName, symbol), callbacksOrProbe)
}
function init(){
    try {
        attachNFunc(agentSyms['global.requestLogin'], {
            onEnter(args) {
                const id = args[0].toUInt32();
                const str1 = args[1].readPointer().readCString();
                const str2 = args[2].readPointer().readCString();
            },
        })
        const item = makeNFunc(agentSyms['buy.buyItem'], 'void', ['uchar', 'uchar', 'uchar', 'uchar']);
        setYaw = makeNFunc(agentSyms['camera.setCameraAngleX'], 'void', ['float']);
        setPitch = makeNFunc(agentSyms['camera.setCameraAngleY'], 'void', ['float']);
        unlockChar = (charId: number) => {
            for(let i = 1; i <= 255; i++){item(charId, 0, i, 1)}
            for(let i = 1; i <= 255; i++){item(charId, 1, i, 1)}
            for(let i = 1; i <= 384; i++){item(charId, 2, i, 1)}
            for(let i = 1; i <= 384; i++){item(charId, 3, i, 1)}
            for(let i = 1; i <= 384; i++){item(charId, 4, i, 1)}
            for(let i = 1; i <= 32; i++){item(charId, 5, i, 90)}
            for(let i = 1; i <= 127; i++){item(charId, 6, i, 1)}
            for(let i = 1; i <= 127; i++){item(charId, 7, i, 1)}
        };
        unlockAllChar = () => {
            for(let i = 1; i <= 255; i++){
                makeNFunc(agentSyms['buy.buyCharacter'], 'void', ['uchar'])(i);
            }
        };
        buyClanGold = makeNFunc(agentSyms['buy.buyWithClanGold'], 'void', ['uchar']);
        getDailyReward = makeNFunc(agentSyms['global.sendReqDailyBonus'], 'void', ['uchar']);
        adsRequestShopADReward = makeNFunc(agentSyms['ad.adsRequestShopADReward'], 'void', ['uchar']);
        onRewarded = makeNFunc(agentSyms['ad.onRewarded'], 'void', []);

        // Always-on bypass for the in-client daily/per-ad limit checks. The
        // server still enforces what it enforces, but the client UI stops
        // gating buttons after the local "you've watched N ads today" / "wait
        // M seconds" counters expire. forceTrue keeps the original args/regs
        // untouched and only overwrites the boolean return on the way out.
        const forceTrue = (sym: string) => {
            const addr = Module.findExportByName(libName, sym);
            if(!addr) {
                console.log("[ad-limit-bypass] missing symbol:", sym);
                return;
            }
            Interceptor.attach(addr, { onLeave(retval) { retval.replace(ptr(1)); } });
        };
        forceTrue(agentSyms['ad.isAvailableAds']);
        forceTrue(agentSyms['ad.isAvailableCount']);
        forceTrue(agentSyms['ad.isAvailableTime']);
        forceTrue(agentSyms['ad.isAvailableInitCycle']);
        forceTrue(agentSyms['ad.isAvailableShopADCount']);
        forceTrue(agentSyms['ad.isAvailableShopADTime']);
        forceTrue(agentSyms['ad.isAvailableShopADInitCycle']);
        forceTrue(agentSyms['ad.isAvailableCountBattleRoyal']);
        forceTrue(agentSyms['ad.isAvailableTimeBattleRoyal']);
        forceTrue(agentSyms['ad.isAvailableInitCycleBattleRoyal']);
        purchaseP = makeNFunc(agentSyms['global.sendPurchasePass'], 'void', ['uint', 'uchar']);
        purchaseT = makeNFunc(agentSyms['global.sendPurchasePassTier'], 'void', ['uint', 'uchar']);
        changeNickname = (name:string) => {
            const sp = Memory.allocUtf8String(name);
            makeNFunc(agentSyms['global.changeNickname'], 'void', ["uchar", "pointer", "uchar"])(1, sp, 0);
        }
        exploitServer = () => {
            makeNFunc(agentSyms['global.sendReqPassReward'], 'void', ['uint', 'uint', 'uchar', 'uchar', 'uchar'])(1, 100, 1, 1, 1);
        }
        createClan = (name:string = genRandom(), desc:string = " ", mark:number = 0, flag:number = 151) => {
            const npt = Memory.allocUtf8String(name);
            const dpt = Memory.allocUtf8String(desc);
            const nobj = Memory.alloc(Process.pageSize);
            const dobj = Memory.alloc(Process.pageSize);
            nobj.writePointer(npt);
            dobj.writePointer(dpt);
            makeNFunc(agentSyms['clan.clanCreate'], 'void', ["pointer", "pointer", "uchar", "uchar"])(nobj, dobj, mark, flag);
        }
        breakClan = () => makeNFunc(agentSyms['clan.clanBreakup'], 'void', []);
        equip = makeNFunc(agentSyms['buy.equipShort'], 'void', ['uchar', 'uchar', 'uint16']);
        elec = makeNFunc(agentSyms['ingame.buffHitElectric'], 'void', ['pointer', 'uint', 'uint']);
        mago = makeNFunc(agentSyms['ingame.debuffSkillMagoTotem'], 'void', ['uint', 'uint']);
        fMatchKickUserSlot = makeNFunc(agentSyms['fmatch.kickUserSlot'], 'void', ['uchar']);
        attachNFunc(agentSyms['camera.getCameraUser'], {
            onLeave(retval) {
                if(config['epos-number'] && config['epos-number'] != '0'){
                    let ts = ptr(retval.toString());
                    if(ts && !ts.isNull()){
                        if(ts.readS32() === +config['epos-number']){
                            epos = ts;
                        } else if (
                            epos.readS32() !== +config['epos-number']
                            || epos.isNull()
                            || epos.add(eposOffset['nickname']).readCString().trim() === ""
                            || epos.add(eposOffset['zr1']).readFloat() !== 0
                            || epos.add(eposOffset['zr2']).readFloat() !== 0
                        ) epos = null;
                    } else epos = null;
                }
            },
        });
        attachNFunc(agentSyms['global.getUserByUserSeq'], {
            onLeave(retval) {
                if(epos && !epos.isNull()){
                    let ts = ptr(retval.toString());
                    if(ts && !ts.isNull()){
                        saveWPData(ts);
                        if(ts.toString() !== epos.toString()){
                            entityList.add(ts.toString());
                            entityList.forEach(p => {
                                try{
                                    const pt = ptr(p);
                                    const myslot = epos.add(eposOffset['slot']).readU8() % 2;
                                    if(cheats['kicker'] && config['auto-kick']) {
                                        let n = pt.readS32()
                                        let slot = pt.add(eposOffset['slot']).readU8() % 2
                                        if(n > 0 && myslot != slot){
                                            if(!(config['auto-kick-ignore'] && excepts.includes(n))){
                                                purchaseT(n, 0);
                                            }
                                        }
                                    }
                                    const n = pt.add(eposOffset['nickname']).readCString();
                                    const zr1 = pt.add(eposOffset['zr1']).readFloat();
                                    const zr2 = pt.add(eposOffset['zr2']).readFloat();
                                    if(zr1 !== 0 || zr2 !== 0 || n === "") entityList.delete(p);
                                } catch (e){
                                    entityList.delete(p)
                                }
                            })
                        }
                    }
                }
            },
        });
        attachNFunc(agentSyms['camera.getCameraAngleY'], {
            onLeave(retval) {
                let ts = ptr(retval.toString());
                if(ts && !ts.isNull()){
                    cambase = ts;
                }
            },
        });
        const stateLoop = setInterval(() => {
            if(epos && !epos.isNull()) {
                send(['epos-state', 'succeed', epos.toString()]);
            } else {
                send(['epos-state', 'error', 'Epos not found']);
            }
            if(entityList.size > 0) {
                send(['entity-state', 'succeed', `${entityList.size} Found`]);
            } else {
                send(['entity-state', 'error', 'No entities found']);
            }
        }, 500);
        function api(message:any[]) {
            try{
                const [name, ...args] = message;
                if(name === 'log'){
                    log("[FRIDA]", ...args);
                } else if (name === 'init'){
                    cheats = args[0];
                    keybinds = args[1];
                    config = args[2];
                    wpdata = args[3];
                    excepts = (config['except-number'] as string || "").split(',').filter(v => v).map(v => parseInt(v) || 0).filter(v => v) || [];
                // } else if(name === 'addr'){
                    // isArm = Process.arch.includes('arm');
                    // const r = Process.enumerateRanges('r--');
                    // const rw = Process.enumerateRanges('rw-');
                    // const rx = Process.enumerateRanges('r-x');
                    // const rwx = Process.enumerateRanges('rwx');
                    // const _xa = r.filter((range:RangeDetails) =>
                    //     range.file &&
                    //     range.file.path.includes(libName)
                    // );
                    // if(_xa[0]) xa = _xa[0].base
                    // else {
                    //     const __xa = rx.filter((range:RangeDetails) =>
                    //         range.file &&
                    //         range.file.path.includes('split_config.arm64_v8a.apk') &&
                    //         range.size >= 0x442_8000
                    //     );
                    //     if(__xa[0]) {
                    //         xa = __xa[0].base;
                    //     }
                    // }
                    // const _an = rw.filter((range:RangeDetails) =>
                    //     (!range.file) &&
                    //     range.size >= (isArm ? 0x1000 : 0x14E_8000)
                    // );
                    // if(_an[0]) an = _an[0].base;
                    // if(isArm) rwx.filter((range:RangeDetails) =>
                    //     range.size >= 0x1_0000
                    // ).forEach((range:RangeDetails) => {
                    //     const dia = range.base.add(anOffset['cash-base']).readS32();
                    //     if(dia === 17){
                    //         log("AN Found:", range.base.toString())
                    //     } else {
                    //         log(range.base.toString(), dia)
                    //     }
                    // });
                    // const _jt = rx.filter(range => range.file && range.file.path.includes("jit"));
                    // if(_jt[0]) {
                    //     jit = _jt[0].base;
                    //     jtRange = _jt[0].size;
                    // }
                    // if(!xa || !an) return recv(api);
                    // if(!isArm && !jit) return recv(api);
                    // send(['Address.init', xa.toString(), an.toString(), jit.toString()])
                    // _libMyGame = Process.findModuleByName(libName);
                    // send(['Address.init', _libMyGame ? _libMyGame.base.toString() : 'null']);
                } else if(name === 'cheats'){
                    // if(!an || !xa) return recv(api);
                    if(!_libMyGame) return recv(api);
                    cheats[args[0]] = args[1];
                    // Enable/Disable values
                    switch(args[0]){
                        case 'esp':{
                            if(!args[1]) send(['clear-esp']);
                        }
                        case 'no-recoil':       applyXaPatch('no-recoil',       !!args[1]); break;
                        case 'no-clip':         applyXaPatch('no-clip',         !!args[1]); break;
                        case 'no-spread':
                            applyXaPatch('no-spread1',          !!args[1]);
                            applyXaPatch('no-spread2',          !!args[1]);
                            applyXaPatch('no-spread-idle',       !!args[1]);
                            applyXaPatch('no-spread-idle-zoom',  !!args[1]);
                            applyXaPatch('no-spread-jump',       !!args[1]);
                            applyXaPatch('no-spread-jump-zoom',  !!args[1]);
                            applyXaPatch('no-spread-move-zoom',  !!args[1]);
                            applyXaPatch('no-spread-shoot-zoom', !!args[1]);
                            break;
                        case 'no-reload':       applyXaPatch('no-reload',       !!args[1]); break;
                        case 'instant-respawn': applyXaPatch('instant-respawn', !!args[1]); break;
                        case 'one-kill':
                            applyXaPatch('body-one-kill', !!args[1]);
                            applyXaPatch('head-one-kill', !!args[1]);
                            break;
                        case 'skill-damage':    applyXaPatch('skill-damage',    !!args[1]); break;
                        case 'cooker-buff':     applyXaPatch('cooker-buff',     !!args[1]); break;
                    }
                } else if(name === 'config'){
                    config[args[0]] = args[1];
                } else if(name === 'keybind'){
                    keybinds[args[0]] = args[1];
                } else if(name === 'keyevent'){
                    const key = args[0];
                    const action = args[1];
                    keymap = args[2];
                    if(key === keybinds['reverse'] && action === 'DOWN') reverse();
                    // if(key === keybinds['scan-epos'] && action === 'DOWN') {
                    //     epos = scanEpos();
                    // }
                    // if(key === keybinds['scan-entity'] && action === 'DOWN') {
                    //     entityList = scanEntityList(epos);
                    // }
                    // if(key === keybinds['clear-all'] && action === 'DOWN') clearAll();
                    if(key === keybinds['esp-mark'] && action === 'DOWN'){
                        const numbers = getFocusedEntity().map(entity => entity.add(eposOffset['number']).readS32());
                        numbers.forEach(number => {
                            if(excepts.includes(number)){
                                excepts = excepts.filter(n => n !== number);
                            } else {
                                excepts.push(number);
                            }
                        });
                        send(['except-number', excepts]);
                    }
                    if(key === keybinds['kicker'] && action === 'DOWN'){
                        const numbers = getFocusedEntity().map(entity => entity.add(eposOffset['number']).readS32())
                        .filter(number => number > 0);
                        numbers.forEach(number => {
                            purchaseT(number, 0);
                        });
                    }
                    if(key === keybinds['electric'] && action === 'DOWN' && cheats['electric']){
                        if(!epos) return recv(api);
                        if(epos.isNull()) return recv(api);
                        const mynum = epos.add(eposOffset['number']).readS32();
                        getFocusedEntity().forEach(entity => {
                            elec(entity, mynum, mynum);
                        });
                    }
                    if(key === keybinds['mago'] && action === 'DOWN' && cheats['mago']){
                        if(!epos) return recv(api);
                        if(epos.isNull()) return recv(api);
                        const mynum = epos.add(eposOffset['number']).readS32();
                        getFocusedEntity().forEach(entity => {
                            mago(mynum, entity.add(eposOffset['number']).readS32());
                        });
                    }
                    if(key === keybinds['infinite-jump'] && action === 'DOWN' && cheats['infinite-jump']){
                        if(!epos) return recv(api);
                        if(epos.isNull()) return recv(api);
                        const y = epos.add(eposOffset['y']).readFloat();
                        epos.add(eposOffset['state']).writeS32(isWalking(epos) ? 33 : 32);
                        epos.add(eposOffset['dy']).writeFloat(-0.01);
                        epos.add(eposOffset['fall']).writeS8(0);
                        epos.add(eposOffset['y']).writeFloat(y + 0.1);
                    }
                    macros.forEach(macro => {
                        if(keybinds[macro.id]){
                            if(key === keybinds[macro.id] && action === 'DOWN'){
                                executeMacro(macro.events);
                            }
                        }
                    });
                } else if(name === 'listen-sub'){
                    listenSub = args[0];
                } else if(name === 'listen-main'){
                    listenMain = args[0];
                } else if(name === 'reverse'){
                    reverse();
                } else if(name === 'pos'){
                    pos(args[0]);
                } else if(name === 'skillcode'){
                    skillcode(+args[0]);
                } else if(name === 'change-ads-reward'){
                    // Single-tap ad reward: directly send the shop-AD reward
                    // packet for every shop slot (so the user gets all
                    // available rewards in one click) and fire the local
                    // OnRewarded callback so the in-client UI updates.
                    if(!adsRequestShopADReward) return recv(api);
                    for(let slot = 0; slot < 20; slot++){
                        try { adsRequestShopADReward(slot); } catch(_) {}
                    }
                    if(onRewarded){
                        try { onRewarded(); } catch(_) {}
                    }
                } else if(name === 'change-NaN'){
                    beNaN();
                } else if(name === 'unlock-all-item'){ unlockChar(+args[0] || 0);
                } else if(name === 'unlock-all-char'){ unlockAllChar();
                } else if(name === 'buy-clan-gold'){ 
                    const amount = +args[0] || 1;
                    for(let i = 0; i < amount; i++){
                        buyClanGold(3);
                    }
                } else if(name === 'get-daily-reward'){ 
                    const amount = +args[0] || 1;
                    for(let i = 0; i < amount; i++){
                        getDailyReward(0);
                        getDailyReward(1);
                    }
                } else if(name === 'kick-player'){ purchaseT(+args[0] || 0, 0);
                } else if(name === 'kick-by-slot'){
                    if(!fMatchKickUserSlot) return recv(api);
                    try { fMatchKickUserSlot(+args[0] || 0); } catch(_){}
                } else if(name === 'kick-all-enemy'){
                    if(!fMatchKickUserSlot) return recv(api);
                    if(!epos || epos.isNull()) return recv(api);
                    const myteam = epos.add(eposOffset['slot']).readU8() % 2;
                    [...entityList].forEach(p => {
                        try{
                            const pt = ptr(p);
                            if(pt.add(eposOffset['number']).readS32() <= 0) return;
                            const slot = pt.add(eposOffset['slot']).readU8();
                            if(slot % 2 !== myteam) fMatchKickUserSlot(slot);
                        }catch(_){}
                    });
                } else if(name === 'kick-loop-start'){ kickLoopStart(+args[0] || 0, +args[1] || 200);
                } else if(name === 'kick-loop-stop'){ kickLoopStop();
                } else if(name === 'change-nickname'){ changeNickname(args[0] || 'no name');
                } else if(name === 'purchase-pass'){ purchaseP(+args[0] || 0, +args[1] || 0);
                } else if(name === 'server-exploit'){ exploitServer();
                } else if(name === 'create-clan'){ createClan(args[0] || genRandom());
                } else if(name === 'break-clan'){ breakClan();
                } else if(name === 'equip-item'){ equip(+args[0] || 1, +args[1] || 0, +args[2] || 0);
                } else if(name === 'ctm-default-milk'){ ctmDefaultMilk();
                } else if(name === 'ctm-default-choco'){ ctmDefaultChoco();
                } else if(name === 'ctm-desert-milk'){ ctmDesertMilk();
                } else if(name === 'ctm-desert-choco'){ ctmDesertChoco();
                } else if(name === 'ctm-castle-milk'){ ctmCastleMilk();
                } else if(name === 'ctm-castle-choco'){ ctmCastleChoco();
                } else if(name === 'ctm-mountain-milk'){ ctmMountainMilk();
                } else if(name === 'ctm-mountain-choco'){ ctmMountainChoco();
                // } else if(name === 'scan-epos'){
                //     epos = scanEpos();
                // } else if(name === 'scan-entity'){
                //     if(!epos) return recv(api);
                //     if(epos.isNull()) return recv(api);
                //     entityList = scanEntityList(epos);
                // } else if(name === 'clear-all'){
                //     clearAll();
                } else if(name === 'tier-numbers'){
                    excns = args[0]
                } else if(name === 'except-number'){
                    excepts = args[0];
                } else if(name === 'get-ranges'){
                    const r = Process.getRangeByAddress(ptr(args[0]));
                    log(r)
                } else if(name === 'find-ranges'){
                    const r = Process.findRangeByAddress(ptr(args[0]));
                    const f = Process.enumerateRanges('rw-').find(range => range.base.equals(ptr(args[0])))
                    const c = !r.file && r.size >= 0x20_0000 && r.size < 0x1000_0000 && r.size % 0x10_0000 == 0
                    log(r, f, c)
                } else if(name === 'search-pattern'){
                    if(jit && !jit.isNull()){
                        log("[JIT] scanning pattern in jit ranges:", args[0], jit.toString(), jtRange)
                        Memory.scan(jit, jtRange, args[0], {
                            onMatch: (addr, sz) => {
                                log("[JIT] pattern found:", addr.toString(), sz)
                            },
                            onComplete: () => {
                                log("[JIT] scan complete")
                            }
                        })
                    }
                } else if(name === 'execute-cmd'){
                    console.log("[CMD]", args[0]);
                    eval(args[0]);
                } else if(name === 'search'){
                    cmdSearchF(args[0]);
                } else if(name === "hook"){
                    cmdHookF(args[0]);
                } else if(name === "unhook"){
                    cmdUnhookAll();
                } else if(name === "call"){
                    const silentLog = args[1] === silentCallSentinel;
                    const callArgs = silentLog ? args.slice(2) : args.slice(1);
                    cmdCallF(args[0], { silentLog }, ...callArgs);
                } else if(name === "read"){
                    cmdReadF(args[0], args[1]);
                } else if(name === "write"){
                    cmdWriteF(args[0], args[1], args[2]);
                } else if(name === 'gyro'){
                    gyro(args[0]);
                } else if(name === 'execute-macro'){
                    const macro = macros.find(macro => macro.id === args[0]);
                    if(macro) executeMacro(macro.events);
                } else if(name === 'dev-perf'){
                    devPerf = !!args[0];
                    perfAccum = 0; perfCount = 0; perfLast = Date.now();
                } else if(name === 'console-cmd'){
                }
            } catch(e){
                log("[API]", e, message);
            } finally {
                recv(api)
            }
        }
        recv(api)
    } catch (e) {
        log("[INIT] Failed to initialize:", e);
    }
}

let toggleDetector = makeNFunc(agentSyms['global.toggleAbuseDetector'], 'void', ['bool']);
let lastDebuffTime = Date.now();
function loop(){
    const delta = Date.now() - lastTime;
    lastTime = Date.now();
    // if(!an || !xa) return setTimeout(loop, 1000/(config['frame'] || 60));
    // Pin values
    try{
        if(epos && !epos.isNull()){
            toggleDetector(0);
            // if(!lastEpos){
            //     lastEpos = true;
            //     entityList = scanEntityList(epos);
            // }
            const x = epos.add(eposOffset['x']).readFloat();
            const y = epos.add(eposOffset['y']).readFloat();
            const z = epos.add(eposOffset['z']).readFloat();
            send(['pos', [x, y, z]])
            const char = epos.add(eposOffset['char']).readS8();
            send(['skillcode', char])
            const state = epos.add(eposOffset['state']).readS32();
            // send(['state', state])
            if(isShooting(epos) && !shooting){
                shooting = true;
                // if(cheats['autoswap']){
                //     const weapon = epos.add(eposOffset['weapon']).readS16();
                //     const useZoom = config['autoswap-use-zoom'] || false;
                //     const subposX = +config['autoswap-subweapon-x'] || 0;
                //     const subposY = +config['autoswap-subweapon-y'] || 0;
                //     const mainposX = +config['autoswap-mainweapon-x'] || 0;
                //     const mainposY = +config['autoswap-mainweapon-y'] || 0;
                //     // const mainKey = keybinds['autoswap-main'] || 'NUMPAD 0';
                //     // const subKey = keybinds['autoswap-sub'] || 'NUMPAD 1';
                //     // const zoomKey = keybinds['autoswap-zoom'] || 'NUMPAD 2';
                //     if(weapon === 0){
                //         // send(['sendkey', subKey])
                //         Click(subposX, subposY, 0);
                //     } else if(weapon === 1){
                //         // send(['sendkey', mainKey])
                //         // if(useZoom) send(['sendkey', zoomKey])
                //         Click(mainposX, mainposY, 0);
                //     }
                // }
            } else {
                shooting = false;
            }
            if(cheats['aimbot']){
                if(!keybinds['aimbot'] || keymap[keybinds['aimbot']]){
                    aimbot(epos, delta);
                }
            }
            if(cheats['aim-assist']){
                if(isShooting(epos)){
                    const _aimAssistSpeed = config['aim-assist-speed'] || 20;
                    assistSpeed = _aimAssistSpeed;
                } else if(assistSpeed > 0.001) {
                    assistSpeed -= assistSpeed * (config['aim-assist-decay'] || 0.1);
                    if(assistSpeed <= 0.001) assistSpeed = 0;
                }
                aimassist(epos, delta);
            }
            if(cheats['aim-by-circle']){
                if(!keybinds['aim-by-circle'] || keymap[keybinds['aim-by-circle']]){
                    aimbycircle(epos, delta);
                } else if(config['aim-by-circle-show-circle']){
                    send(['aim-circle', {
                        radius: Math.max(0, Math.min(100, Math.round(+config['aim-by-circle-radius'] || 0))),
                        color: config['aim-by-circle-color'] || '#00ffff',
                        active: false,
                    }]);
                }
            }
            if(cheats['esp']){
                if(cambase && !cambase.isNull() && entityList.size > 0){
                    const entities = getFilteredEntityList(false);
                    const pitchOffset = +config['esp-pitch-offset'] || 0;
                    const camX = cambase.add(anOffset['camX']).readFloat();
                    const camY = cambase.add(anOffset['camY']).readFloat();
                    const camZ = cambase.add(anOffset['camZ']).readFloat();
                    const yaw = cambase.add(anOffset['yaw']).readFloat();
                    const pitch = cambase.add(anOffset['pitch']).readFloat() + pitchOffset;
                    const data:DrawRect[] = entities.map(entity => {
                        const x = entity.add(eposOffset['x']).readFloat();
                        const y = entity.add(eposOffset['y']).readFloat();
                        const z = entity.add(eposOffset['z']).readFloat();
                        const number = entity.add(eposOffset['number']).readS32();
                        const nickname = entity.add(eposOffset['nickname']).readUtf8String();
                        const hp = entity.add(eposOffset["hp"]).readS16();
                        const barrier = entity.add(eposOffset["barrier"]).readS16();
                        const health = {
                            hp: +entity.add(eposOffset['maxhp']).readS32(),
                            barrier: +entity.add(eposOffset['maxbarrier']).readS32()
                        };
                        const total = health.hp + health.barrier;
                        const upside = [
                            {x: x + sideSize, y: y + upSize, z: z + sideSize},
                            {x: x - sideSize, y: y + upSize, z: z + sideSize},
                            {x: x - sideSize, y: y + upSize, z: z - sideSize},
                            {x: x + sideSize, y: y + upSize, z: z - sideSize},
                        ].map(vec3 => calcESP(vec3, {x: camX, y: camY, z: camZ}, yaw, pitch, camFov)).filter(point => point);
                        const downside = [
                            {x: x + sideSize, y: y + downSize, z: z + sideSize},
                            {x: x - sideSize, y: y + downSize, z: z + sideSize},
                            {x: x - sideSize, y: y + downSize, z: z - sideSize},
                            {x: x + sideSize, y: y + downSize, z: z - sideSize},
                        ].map(vec3 => calcESP(vec3, {x: camX, y: camY, z: camZ}, yaw, pitch, camFov)).filter(point => point);
                        const isMark = excepts.includes(number);
                        const _isTeam = isTeam(epos, entity);
                        const _isDead = isDead(entity);
                        return {
                            upside, downside, number, nickname, isMark, isTeam: _isTeam, isDead: _isDead,
                            hp, barrier, total
                        };
                    }).filter(rect => rect.upside.length > 3 && rect.downside.length > 3);
                    send(['esp', data]);
                }
            }
            if(cheats['blackhole']){
                if(!keybinds['blackhole'] || keymap[keybinds['blackhole']]){
                    blackhole(epos);
                }
            }
            if(cheats['shoot-speed']){
                if(!keybinds['shoot-speed'] || keymap[keybinds['shoot-speed']]){
                    epos.add(eposOffset['w1c']).writeFloat(0);
                    epos.add(eposOffset['w2c']).writeFloat(0);
                }
            }
            if(cheats['infinite-ammo']){
                epos.add(eposOffset['bulletusedw1']).readU8() > 0 && epos.add(eposOffset['bulletusedw1']).writeU8(0);
                epos.add(eposOffset['bulletusedw2']).readU8() > 0 && epos.add(eposOffset['bulletusedw2']).writeU8(0);
            }
            if(cheats['no-timer']){
                const reloadTimer: boolean = config['no-timer-reload'] || false;
                const grenadeTimer: boolean = config['no-timer-grenade'] || false;
                const respawnTimer: boolean = config['no-timer-respawn'] || false;
                if(reloadTimer &&
                    (state === 64 || state === 65 || state === 66 || state === 67)
                ) epos.add(eposOffset['timer']).writeFloat(9999);
                if(grenadeTimer &&
                    (state === 128 || state === 129 || state === 130 || state === 131)
                ) epos.add(eposOffset['timer']).writeFloat(9999);
                if(respawnTimer && state === 16){
                    const dc = Math.round(epos.add(eposOffset['dc']).readFloat());
                    if(dc != 1 && dc != 0) epos.add(eposOffset['dc']).writeFloat(1);
                }
            }
            if(cheats['move-speed']){
                if((!keybinds['move-speed'] || keymap[keybinds['move-speed']])){
                    const half:number = Math.sin(45/180*Math.PI)
                    const val:number = (+config['move-speed-value']) || 3;
                    if(keymap["W"] && keymap["A"]) epos.add(eposOffset['dx']).writeFloat(half*val), epos.add(eposOffset['dz']).writeFloat(half*val);
                    else if(keymap["W"] && keymap["D"]) epos.add(eposOffset['dx']).writeFloat(half*val), epos.add(eposOffset['dz']).writeFloat(-half*val);
                    else if(keymap["S"] && keymap["A"]) epos.add(eposOffset['dx']).writeFloat(-half*val), epos.add(eposOffset['dz']).writeFloat(half*val);
                    else if(keymap["S"] && keymap["D"]) epos.add(eposOffset['dx']).writeFloat(-half*val), epos.add(eposOffset['dz']).writeFloat(-half*val);
                    else if(keymap["W"]) epos.add(eposOffset['dx']).writeFloat(val);
                    else if(keymap["S"]) epos.add(eposOffset['dx']).writeFloat(-val);
                    else if(keymap["A"]) epos.add(eposOffset['dz']).writeFloat(val);
                    else if(keymap["D"]) epos.add(eposOffset['dz']).writeFloat(-val);
                    else {
                        epos.add(eposOffset['dx']).writeFloat(0);
                        epos.add(eposOffset['dz']).writeFloat(0);
                    }
                }
            }
            if(cheats['fly']){
                epos.add(eposOffset['dy']).writeFloat(-.1);
                epos.add(eposOffset['fall']).writeS8(0);
                const y = +epos.add(eposOffset['y']).readFloat();
                if(keybinds['fly-up'] && keymap[keybinds['fly-up']]) epos.add(eposOffset['y']).writeFloat(y + (+config['fly-speed'] || 1));
                if(keybinds['fly-down'] && keymap[keybinds['fly-down']]) epos.add(eposOffset['y']).writeFloat(y - (+config['fly-speed'] || 1));
            }
            if(cheats['freecam']){
                const camspeed = config["freecam-cam-speed"] || 0.05;
                const mvspeed = config["freecam-move-speed"] || 2;
                const pc = cambase.add(anOffset["pitch"])
                const yw = cambase.add(anOffset["yaw"])
                const x = epos.add(eposOffset["x"])
                const y = epos.add(eposOffset["x"])
                const z = epos.add(eposOffset["x"])
                if(keymap["NUMPAD 8"]){
                    pc.writeFloat(pc.readFloat() + camspeed)
                }
                if(keymap["NUMPAD 2"]){
                    pc.writeFloat(pc.readFloat() - camspeed)
                }
                if(keymap["NUMPAD 4"]){
                    yw.writeFloat(yw.readFloat() - camspeed)
                }
                if(keymap["NUMPAD 6"]){
                    yw.writeFloat(yw.readFloat() + camspeed)
                }
                if(keymap["UP ARROW"]){
                    
                }
                if(keymap["DOWN ARROW"]){
                    
                }
                if(keymap["LEFT ARROW"]){
                    
                }
                if(keymap["RIGHT ARROW"]){
                    
                }
            }
            if(cheats['upskill'] && (!keybinds['upskill'] || keymap[keybinds['upskill']])){
                const onlyonce = config['upskill-only-once'] || false;
                const timer = epos.add(eposOffset['timer']).readFloat();
                switch(char){
                    case 1: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.37) epos.add(eposOffset['timer']).writeFloat(0.37);
                            else if(timer > 0.37) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.37);
                        }
                    }; break;
                    case 2: if(isSkill(epos)) epos.add(eposOffset['timer']).writeFloat(9999); break;
                    case 3: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.31) epos.add(eposOffset['timer']).writeFloat(0.31);
                            else if(timer > 0.31) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.31);
                        }
                    }; break;
                    case 4: epos.add(eposOffset['sc']).writeFloat(9999); break;
                    case 5: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.85) epos.add(eposOffset['timer']).writeFloat(0.85);
                            else if(timer > 0.85) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.85);
                        }
                    }; break;
                    case 7: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 2.3) epos.add(eposOffset['timer']).writeFloat(2.3);
                            else if(timer > 2.3) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(2.3);
                        }
                    } else {
                        epos.add(eposOffset['skill']).writeU8(1);
                    }; break;
                    case 8: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.99) epos.add(eposOffset['timer']).writeFloat(0.99);
                            else if(timer > 0.99) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.99);
                        }
                    }; break;
                    case 9: if(isSkill(epos)) epos.add(eposOffset['timer']).writeFloat(9999); break;
                    case 10:
                    if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 1.14) epos.add(eposOffset['timer']).writeFloat(1.14);
                            else if(timer > 1.14) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(1.14);
                        }
                    }; break;
                    case 12: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.44) epos.add(eposOffset['timer']).writeFloat(0.44);
                            else if(timer > 0.44) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.44);
                        }
                    }; break;
                    case 13: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.09) epos.add(eposOffset['timer']).writeFloat(0.09);
                            else if(timer > 0.09) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.09);
                        }
                    }; break;
                    case 15: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.09) epos.add(eposOffset['timer']).writeFloat(0.09);
                            else if(timer > 0.09) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.09);
                        }
                    }; break;
                    case 17: if(isSkill(epos)) epos.add(eposOffset['timer']).writeFloat(9999); break;
                    case 20: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.09) epos.add(eposOffset['timer']).writeFloat(0.09);
                            else if(timer > 0.09) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.09);
                        }
                    }; break;
                    case 21: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.99) epos.add(eposOffset['timer']).writeFloat(0.99);
                            else if(timer > 0.99) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.99);
                        }
                    }; break;
                    case 24: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.49) epos.add(eposOffset['timer']).writeFloat(0.49);
                            else if(timer > 0.49) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.49);
                        }
                    }; break;
                    case 25: if(isSkill(epos)) {
                        if(onlyonce) {
                            if(timer < 0.99) epos.add(eposOffset['timer']).writeFloat(0.99);
                            else if(timer > 0.99) epos.add(eposOffset['timer']).writeFloat(9999);
                        } else {
                            epos.add(eposOffset['timer']).writeFloat(0.99);
                        }
                    }; break;
                }
            }
            if(cheats['grenade'] && (!keybinds['grenade'] || keymap[keybinds['grenade']])){
                // an.add(anOffset['grenade-base']).writeS8(1);
                epos.add(eposOffset['gc']).writeFloat(0);
            }
            if(cheats['debuff']){
                if(
                    (!keybinds['debuff'] || keymap[keybinds['debuff']]) &&
                    Date.now() - lastDebuffTime > (+config['debuff-interval'] || 0.1) * 1000
                ){
                    let ignoreExcepts = config['debuff-ignore'] || false;
                    let delectric = config['debuff-electric'] || false;
                    let dmago = config['debuff-mago'] || false;
                    let mynum = epos.add(eposOffset['number']).readS32();
                    getFilteredEntityList(ignoreExcepts)
                    .filter(entity => !isTeam(epos, entity))
                    .filter(entity => !isDead(entity))
                    .forEach(entity => {
                        let num = entity.add(eposOffset['number']).readS32();
                        if(delectric) elec(entity, mynum, mynum)
                        if(dmago) mago(mynum, num);
                    });
                    lastDebuffTime = Date.now();
                }
            }
            if(cheats['hide-me']){
                epos.add(eposOffset['oy']).writeFloat(100);
            } else {
                epos.add(eposOffset['oy']).writeFloat(0);
            }
        } else {
            // lastEpos = false;
            // clearAll();
        }
        if(devPerf){
            perfAccum += delta;
            perfCount += 1;
            const now = Date.now();
            if(now - perfLast >= 1000){
                const fps = perfCount / ((now - perfLast) / 1000);
                send(['perf', { fps: +fps.toFixed(1), entities: entityList.size }]);
                perfAccum = 0; perfCount = 0; perfLast = now;
            }
        }
    } catch(e){
        // log(e);
    }
    setTimeout(loop, 1000/(config['frame'] || 60));
}
lastTime = Date.now();

function scanEpos():NativePointer{
    if(!an) return null;
    if(an.isNull()) return null;
    if(an.add(anOffset['position-base']).isNull()) {
        send(['epos-state', 'error', 'Base Not Found']);
        return null;
    }
    send(['epos-state', 'pending', 'Scanning']);
    const _arr = an.add(anOffset['position-base']).readByteArray(0xC);
    const _pattern = bufferToHex(_arr);
    cas = Process.enumerateRanges('rw-').filter(range =>
        !range.file &&
        range.size >= 0x20_0000 &&
        range.size < 0x1000_0000 &&
        range.size % 0x10_0000 == 0 &&
        range.base.toString().length > 10
    );
    for(let range of cas){
        const eposes = Memory.scanSync(range.base, range.size, _pattern);
        if(eposes.length > 0){
            const _epos = eposes.find(np => np.address.toString().match(/190$/));
            if(_epos){
                const _pointer = _epos.address.add(-0x190);
                log("Epos Found:", _pointer.toString())
                send(['epos-state', 'succeed', _pointer.toString().toUpperCase()]);
                return _pointer;
            }
        }
    }
    send(['epos-state', 'error', 'Not Found']);
    return null;
}

function scanEntityList(_eposPointer:NativePointer):Set<NativePointer>{
    if(!_eposPointer) return new Set();
    if(_eposPointer.isNull()) return new Set();
    if(_eposPointer.add(eposOffset['pointer']).isNull()) return new Set();
    let _entityList:Set<NativePointer> = new Set();
    const _pattern = bufferToHex(_eposPointer.add(eposOffset['pointer']).readByteArray(0x8));
    send(['entity-state', 'pending', 'Scanning']);
    cas.forEach(range => {
        try{
            const entities = Memory.scanSync(range.base, range.size, _pattern)
            .filter(entity => !entity.address.isNull())
            entities.forEach(entity => _entityList.add(entity.address.add(-eposOffset['pointer'])));
        } catch(e){
            log(e);
        }
    });
    try{
        _entityList = new Set([..._entityList]
            .filter(entity => entity.toString().match(/000$/))
            .filter(entity => !excns.includes(entity.add(eposOffset['number']).readS32())));
    } catch(e){
        send(['entity-state', 'error', 'Error filtering']);
    }
    try{
        log("Entity Found:", _entityList.size, '\n',
            [..._entityList].map(entity => `${entity.toString()} [${entity.add(eposOffset['number']).readS32()}] ${entity.add(eposOffset['nickname']).readUtf8String()}`).join('\n')
        );
    } catch(e){
        send(['entity-state', 'error', 'Error logging']);
    }
    send(['entity-state', 'succeed', `Found: ${_entityList.size}`]);
    return _entityList || new Set();
}

function clearAll(){
    epos = null;
    entityList = new Set();
    send(['clear-all']);
    assistSpeed = 0;
    shooting = false;
}

function reverse(){
    // if(!cd) return;
    const eposPointer = epos;
    if(!eposPointer) return;
    if(eposPointer.isNull()) return;
    const x = eposPointer.add(eposOffset['x']).readFloat();
    const z = eposPointer.add(eposOffset['z']).readFloat();
    eposPointer.add(eposOffset['x']).writeFloat(-x);
    eposPointer.add(eposOffset['z']).writeFloat(-z);
}

function pos(nums:number[]){
    // if(!cd) return;
    const eposPointer = epos;
    if(!eposPointer) return;
    if(eposPointer.isNull()) return;
    eposPointer.add(eposOffset['x']).writeFloat(nums[0]);
    eposPointer.add(eposOffset['y']).writeFloat(nums[1]);
    eposPointer.add(eposOffset['z']).writeFloat(nums[2]);
}

function skillcode(num:number){
    // if(!cd) return;
    const eposPointer = epos;
    if(!eposPointer) return;
    if(eposPointer.isNull()) return;
    eposPointer.add(eposOffset['char']).writeS8(num);
}

function beNaN(){
    const eposPointer = epos;
    if(!eposPointer) return;
    if(eposPointer.isNull()) return;
    eposPointer.add(eposOffset['x']).writeFloat(NaN);
    eposPointer.add(eposOffset['y']).writeFloat(NaN);
    eposPointer.add(eposOffset['z']).writeFloat(NaN);
}

// Frame-rate independent exponential smoothing for natural follow.
// dt is in seconds; rate is "per-second response strength". With a fixed
// rate the camera approaches the target asymptotically — fast at first
// (large gap) and slowing as it closes in, which is how a human hand
// tracks a moving target. factor stays in (0, 1) so we never overshoot.
function aimEaseFactor(speed:number, deltaMs:number):number{
    const dt = Math.min(0.1, Math.max(0, deltaMs) / 1000);
    const rate = Math.max(0.01, speed) * 0.3;
    return 1 - Math.exp(-rate * dt);
}

function aimbot(eposPointer:NativePointer, delta:number){
    if(!cambase) return;
    if(!eposPointer) return;
    if(cambase.isNull()) return;
    if(eposPointer.isNull()) return;
    if(isDead(eposPointer)) return;
    if(config['aimbot-main-weapon-only'] && eposPointer.add(eposOffset["weapon"]).readS16() == 1) return;
    const mode = config['aimbot-mode'] || 'smooth';
    const speed = +config['aimbot-speed'] || 20;
    const angle = config['aimbot-angle'] || 10;
    const ignoreExcept = config['aimbot-ignore'] || false;
    const ignoreTeam = config['aimbot-ignore-team'] || false;
    const ignoreDead = config['aimbot-ignore-death'] || false;
    const pitchOffset = +config['aimbot-pitch-offset'] || 0;
    const rad = angle/180*Math.PI;
    const camX = cambase.add(anOffset['camX']).readFloat();
    const camY = cambase.add(anOffset['camY']).readFloat();
    const camZ = cambase.add(anOffset['camZ']).readFloat();
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat() + pitchOffset;
    const targets = getFilteredEntityList(ignoreExcept)
    .filter(entity => ignoreTeam ? !isTeam(eposPointer, entity) : true)
    .filter(entity => ignoreDead ? !isDead(entity) : true)
    .map((entity:NativePointer) => {
        let dx = entity.add(eposOffset["x"]).readFloat() - camX;
        let dy = entity.add(eposOffset["y"]).readFloat()+4.7 - camY;
        let dz = entity.add(eposOffset["z"]).readFloat() - camZ;
        if(config["aimbot-acceleration"]){
            dx += entity.add(eposOffset["dx"]).readFloat();
            if(!isGround(entity)) dy -= entity.add(eposOffset["dy"]).readFloat();
            dz += entity.add(eposOffset["dz"]).readFloat();
            dx -= eposPointer.add(eposOffset["dx"]).readFloat();
            if(!isGround(eposPointer)) dy += eposPointer.add(eposOffset["dy"]).readFloat();
            dz -= eposPointer.add(eposOffset["dz"]).readFloat();
        }
        const yo = Math.atan2(dx, dz)
        let ya = yo - yaw;
        while(ya > Math.PI) ya -= Math.PI * 2;
        while(ya < -Math.PI) ya += Math.PI * 2;
        const po = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz))
        let pi = po - pitch;
        const from = Math.sqrt(ya * ya + pi * pi);
        return [yo, po, -ya, -pi, from];
    }).filter((d:any[]) => d[4] <= rad).sort((a:any[], b:any[]) => a[4] - b[4]);
    const target = targets[0];
    if(target){
        if(mode === "instant") {
            setYaw(target[0]);
            setPitch(target[1] - pitchOffset);
        } else {
            const factor = aimEaseFactor(speed, delta);
            const nyaw = yaw - target[2] * factor;
            const npitch = pitch - target[3] * factor;
            setYaw(nyaw);
            setPitch(npitch - pitchOffset);
        }
    }
}

function aimassist(eposPointer:NativePointer, delta:number){
    if(!cambase) return;
    if(!eposPointer) return;
    if(cambase.isNull()) return;
    if(eposPointer.isNull()) return;
    if(isDead(eposPointer)) return;
    const angle = config['aim-assist-angle'] || 10;
    const ignoreExcept = config['aim-assist-ignore'] || false;
    const ignoreTeam = config['aim-assist-ignore-team'] || false;
    const ignoreDead = config['aim-assist-ignore-death'] || false;
    const pitchOffset = +config['aim-assist-pitch-offset'] || 0;
    const rad = angle/180*Math.PI;
    const camX = cambase.add(anOffset['camX']).readFloat();
    const camY = cambase.add(anOffset['camY']).readFloat();
    const camZ = cambase.add(anOffset['camZ']).readFloat();
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat() + pitchOffset;
    const targets = getFilteredEntityList(ignoreExcept)
    .filter(entity => ignoreTeam ? !isTeam(eposPointer, entity) : true)
    .filter(entity => ignoreDead ? !isDead(entity) : true)
    .map((entity:NativePointer) => {
        const dx = entity.add(eposOffset["x"]).readFloat() - camX;
        const dy = entity.add(eposOffset["y"]).readFloat()+4.7 - camY;
        const dz = entity.add(eposOffset["z"]).readFloat() - camZ;
        const yo = Math.atan2(dx, dz)
        let ya = yo - yaw;
        while(ya > Math.PI) ya -= Math.PI * 2;
        while(ya < -Math.PI) ya += Math.PI * 2;
        const po = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz))
        let pi = po - pitch;
        const from = Math.sqrt(ya * ya + pi * pi);
        return [yo, po, -ya, -pi, from];
    }).filter((d:any[]) => d[4] <= rad).sort((a:any[], b:any[]) => a[4] - b[4]);
    const target = targets[0];
    if(target){
        const factor = aimEaseFactor(assistSpeed, delta);
        const nyaw = yaw - target[2] * factor;
        const npitch = pitch - target[3] * factor;
        setYaw(nyaw);
        setPitch(npitch - pitchOffset);
    }
}

function aimbycircle(eposPointer:NativePointer, delta:number){
    if(!cambase) return;
    if(!eposPointer) return;
    if(cambase.isNull()) return;
    if(eposPointer.isNull()) return;
    if(isDead(eposPointer)) return;

    const radiusPx = Math.max(0, Math.min(100, Math.round(+config['aim-by-circle-radius'] || 0)));
    const showCircle = config['aim-by-circle-show-circle'] !== false;
    const color = config['aim-by-circle-color'] || '#00ffff';
    const mode = config['aim-by-circle-mode'] || 'smooth';
    const speed = +config['aim-by-circle-speed'] || 30;
    const pitchOffset = +config['aim-by-circle-pitch-offset'] || 0;
    const ignoreExcept = config['aim-by-circle-ignore'] || false;
    const ignoreTeam = config['aim-by-circle-ignore-team'] || false;
    const ignoreDead = config['aim-by-circle-ignore-death'] || false;
    const wallCheck = config['aim-by-circle-wallcheck'] || false;

    const camX = cambase.add(anOffset['camX']).readFloat();
    const camY = cambase.add(anOffset['camY']).readFloat();
    const camZ = cambase.add(anOffset['camZ']).readFloat();
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat() + pitchOffset;

    // Screen-space radius in normalized coordinates is resolved on the renderer
    // (which knows window size). Here we approximate against a reference 1080p
    // half-width so the on-screen circle and hit-test agree within ~few px on
    // typical displays. The renderer re-uses the same px value verbatim.
    const refHalfWidth = 960;

    const candidates = getFilteredEntityList(ignoreExcept)
    .filter(entity => ignoreTeam ? !isTeam(eposPointer, entity) : true)
    .filter(entity => ignoreDead ? !isDead(entity) : true)
    .map((entity:NativePointer) => {
        const ex = entity.add(eposOffset["x"]).readFloat();
        const ey = entity.add(eposOffset["y"]).readFloat() + 4.7;
        const ez = entity.add(eposOffset["z"]).readFloat();
        const proj = calcESP({x:ex, y:ey, z:ez}, {x:camX, y:camY, z:camZ}, yaw, pitch, camFov);
        if(!proj) return null;
        const pxX = proj.x * refHalfWidth;
        const pxY = proj.y * refHalfWidth;
        const screenDist = Math.sqrt(pxX*pxX + pxY*pxY);
        if(screenDist > radiusPx) return null;
        const dx = ex - camX;
        const dy = ey - camY;
        const dz = ez - camZ;
        const worldDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const yo = Math.atan2(dx, dz);
        let ya = yo - yaw;
        while(ya > Math.PI) ya -= Math.PI * 2;
        while(ya < -Math.PI) ya += Math.PI * 2;
        const po = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
        const pi = po - pitch;
        return { yo, po, ya: -ya, pi: -pi, worldDist, entity };
    })
    .filter((c):c is NonNullable<typeof c> => c !== null);

    // Wall check is an approximation: drop entities whose chained-hit byte is
    // unset and whose visibility cannot be otherwise confirmed. The game does
    // not expose a true raycast, so this only filters known-occluded targets
    // when the user explicitly opts in.
    const targets = (wallCheck
        ? candidates.filter(c => {
            try {
                const hitable = c.entity.add(eposOffset['chainedhit']).readU8();
                return hitable !== 0;
            } catch { return true; }
        })
        : candidates
    ).sort((a, b) => a.worldDist - b.worldDist);

    const target = targets[0];

    if(showCircle){
        send(['aim-circle', { radius: radiusPx, color, active: !!target }]);
    }

    if(!target) return;

    if(mode === 'instant'){
        setYaw(target.yo);
        setPitch(target.po - pitchOffset);
    } else {
        const factor = aimEaseFactor(speed, delta);
        const nyaw = yaw - target.ya * factor;
        const npitch = pitch - target.pi * factor;
        setYaw(nyaw);
        setPitch(npitch - pitchOffset);
    }
}

function calcESP(vec3:{x:number; y:number; z:number;}, cam3:{x:number; y:number; z:number;}, yaw:number, pitch:number, fov:number[]):Point{
    const camX = cam3.x;
    const camY = cam3.y;
    const camZ = cam3.z;
    const dx = vec3.x - camX;
    const dy = vec3.y - camY;
    const dz = vec3.z - camZ;
    let rotatedX:number = dx * Math.cos(yaw + Math.PI) - dz * Math.sin(yaw + Math.PI);
    let rotatedZ:number = dz * Math.cos(yaw + Math.PI) + dx * Math.sin(yaw + Math.PI);
    let rotatedY:number = - dy * Math.cos(-pitch) + rotatedZ * Math.sin(-pitch);
    rotatedZ = rotatedZ * Math.cos(-pitch) + dy * Math.sin(-pitch);
    if(rotatedZ >= 0) return null;
    return {
        x:-(rotatedX / rotatedZ)*(90/fov[0]),
        y:-(rotatedY / rotatedZ)*(90/fov[1])
    };
}

function blackhole(eposPointer:NativePointer){
    if(!cambase) return;
    if(!eposPointer) return;
    if(cambase.isNull()) return;
    if(eposPointer.isNull()) return;
    const ignoreExcept = config['blackhole-ignore'] || false;
    const ignoreTeam = config['blackhole-ignore-team'] || false;
    const ignoreDead = config['blackhole-ignore-dead'] || false;
    const preventLagger = config['blackhole-prevent-lagger'] || false;
    const forceDrop = config['blackhole-force-drop'] || false;
    const target = config['blackhole-target'] || 'crosshair';
    let resX:number, resY:number, resZ:number;
    if(target === 'crosshair'){
    const camX = cambase.add(anOffset['camX']).readFloat();
    const camY = cambase.add(anOffset['camY']).readFloat();
    const camZ = cambase.add(anOffset['camZ']).readFloat();
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat();
    const camDist = - cambase.add(anOffset['cam-distance']).readFloat();
    const dist = camDist + (+config['blackhole-distance'] || 20);
    resX = camX + Math.sin(yaw) * dist;
    resY = camY + Math.sin(pitch) * dist;
    resZ = camZ + Math.cos(yaw) * dist;
    } else if(target === 'position'){
        resX = +config['blackhole-x'] || 0;
        resY = +config['blackhole-y'] || 0;
        resZ = +config['blackhole-z'] || 0;
    }
    getFilteredEntityList(ignoreExcept)
    .filter(entity => ignoreTeam ? !isTeam(eposPointer, entity) : true)
    .filter(entity => ignoreDead ? !isDead(entity) : true)
    .filter(entity => preventLagger ? entity.add(eposOffset['y']).readFloat() < -64 : true)
    .forEach((entity:NativePointer) => {
        entity.add(eposOffset['x']).writeFloat(resX);
        entity.add(eposOffset['y']).writeFloat(resY - 4.7);
        entity.add(eposOffset['z']).writeFloat(resZ);
        if(forceDrop) {
            entity.add(eposOffset['dx']).writeFloat(1);
            entity.add(eposOffset['dy']).writeFloat(0.1);
            entity.add(eposOffset['dz']).writeFloat(1);
            if(!isDead(entity)) entity.add(eposOffset['state']).writeS32(1);
        } else {
            entity.add(eposOffset['dx']).writeFloat(0);
            entity.add(eposOffset['dy']).writeFloat(0);
            entity.add(eposOffset['dz']).writeFloat(0);
        }
    });
}

function isShooting(eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    const state = eposPointer.add(eposOffset['state']).readS32();
    return state === 8 || state === 9 || state === 10 || state === 11;
}

function isGround(eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    const state = eposPointer.add(eposOffset['state']).readS32();
    return state % 4 >= 2;
}

function isWalking(eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    const state = eposPointer.add(eposOffset['state']).readS32();
    return state % 2 === 1;
}

function isSkill(eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    const state = eposPointer.add(eposOffset['state']).readS32();
    return state === 256 || state === 257 || state === 258 || state === 259;
}

function isDead(eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    return eposPointer.add(eposOffset['hp']).readS16() <= 0 || eposPointer.add(eposOffset['state']).readS32() === 16;
}

function isTeam(my:NativePointer, eposPointer:NativePointer):boolean{
    if(!eposPointer) return false;
    if(eposPointer.isNull()) return false;
    const myslot = my.add(eposOffset['slot']).readU8();
    const tarslot = eposPointer.add(eposOffset['slot']).readU8();
    return myslot % 2 === tarslot % 2;
}

// function actionName(action: number) {
//     const names:Record<number, string> = {
//         0: 'DOWN',
//         1: 'UP',
//         2: 'MOVE',
//         3: 'CANCEL',
//         5: 'POINTER_DOWN',
//         6: 'POINTER_UP',
//     };
//     return names[action] || 'UNKNOWN';
// }

// function Click(x:number, y:number, msOffset:number = 0): void{
//     if(InputManager){
//         const touchUpDelay = 10;
//         const MotionEvent = Java.use('android.view.MotionEvent');
//         const PointerProperties = Java.use('android.view.MotionEvent$PointerProperties');
//         const PointerCoords = Java.use('android.view.MotionEvent$PointerCoords');
//         const SystemClock = Java.use('android.os.SystemClock');

//         const now: number = SystemClock.uptimeMillis() + msOffset;
//         const existingPointerIds = Object.keys(activeTouches).map(id => parseInt(id));
//         const newPointerId = Math.max(...existingPointerIds, -1) + 1;
//         const pointerCount = existingPointerIds.length + 1;
//         const newPointerIndex = existingPointerIds.length; // Index of the new pointer being added

//         // Create arrays with the final size
//         const PointerPropertiesArray = Java.use('[Landroid.view.MotionEvent$PointerProperties;');
//         let pointerPropertiesArray = PointerPropertiesArray.$new(pointerCount);
//         const PointerCoordsArray = Java.use('[Landroid.view.MotionEvent$PointerCoords;');
//         let pointerCoordsArray = PointerCoordsArray.$new(pointerCount);

//         // Populate existing pointers
//         for (let i = 0; i < existingPointerIds.length; i++) {
//             const id = existingPointerIds[i];
//             const prop = PointerProperties.$new();
//             prop.id.value = id;
//             prop.toolType.value = MotionEvent.TOOL_TYPE_FINGER.value;
//             pointerPropertiesArray[i] = prop;

//             const coord = PointerCoords.$new();
//             coord.x.value = activeTouches[id].x;
//             coord.y.value = activeTouches[id].y;
//             coord.pressure.value = 1.0;
//             coord.size.value = 1.0;
//             pointerCoordsArray[i] = coord;
//         }

//         // Populate the new pointer
//         const newProp = PointerProperties.$new();
//         newProp.id.value = newPointerId;
//         newProp.toolType.value = MotionEvent.TOOL_TYPE_FINGER.value;
//         pointerPropertiesArray[newPointerIndex] = newProp;

//         const newCoord = PointerCoords.$new();
//         newCoord.x.value = x;
//         newCoord.y.value = y;
//         newCoord.pressure.value = 1.0;
//         newCoord.size.value = 1.0;
//         pointerCoordsArray[newPointerIndex] = newCoord;

//         // Get the specific obtain method overload
//         const obtainMethod = MotionEvent.obtain.overload(
//             'long', 'long', 'int', 'int',
//             '[Landroid.view.MotionEvent$PointerProperties;',
//             '[Landroid.view.MotionEvent$PointerCoords;',
//             'int', 'int', 'float', 'float', 'int', 'int', 'int', 'int'
//         );

//         // Determine the correct DOWN action
//         var downAction;
//         if (pointerCount === 1) { // First pointer down
//             downAction = MotionEvent.ACTION_DOWN.value; // 0
//         } else { // Additional pointer down
//             downAction = (newPointerIndex << MotionEvent.ACTION_POINTER_INDEX_SHIFT.value) | MotionEvent.ACTION_POINTER_DOWN.value; // (index << 8) + 5
//         }

//         // Create the DOWN event
//         var downEvent = obtainMethod(
//             now, // downTime
//             now, // eventTime
//             downAction,
//             pointerCount,
//             pointerPropertiesArray,
//             pointerCoordsArray,
//             0, // metaState
//             0, // buttonState
//             1.0, // xPrecision
//             1.0, // yPrecision
//             0, // deviceId
//             0, // edgeFlags
//             0x1002, // source InputDevice.SOURCE_TOUCHSCREEN
//             0 // flags
//         );

//         // Inject the DOWN event
//         InputManager.injectInputEvent(downEvent, 0); // INJECT_INPUT_EVENT_MODE_ASYNC

//         // Schedule the UP event
//         setTimeout(function () {
//             const upTime = now + touchUpDelay;

//             // Determine the correct UP action
//             var upAction;
//             if (pointerCount === 1) { // Last pointer up
//                 upAction = MotionEvent.ACTION_UP.value; // 1
//             } else { // One of multiple pointers going up
//                 upAction = (newPointerIndex << MotionEvent.ACTION_POINTER_INDEX_SHIFT.value) | MotionEvent.ACTION_POINTER_UP.value; // (index << 8) + 6
//             }

//             // Create the UP event
//             // Note: For ACTION_POINTER_UP, the pointerCount and arrays should reflect the state *before* the pointer goes up.
//             // The 'action' indicates which pointer is going up.
//             var upEvent = obtainMethod(
//                 now, // downTime (original down time)
//                 upTime, // eventTime
//                 upAction,
//                 pointerCount, // Still includes the pointer going up
//                 pointerPropertiesArray, // Still includes the pointer going up
//                 pointerCoordsArray, // Still includes the pointer going up
//                 0, // metaState
//                 0, // buttonState
//                 1.0, // xPrecision
//                 1.0, // yPrecision
//                 0, // deviceId
//                 0, // edgeFlags
//                 0x1002, // source
//                 0 // flags
//             );

//             // Inject the UP event
//             InputManager.injectInputEvent(upEvent, 0); // INJECT_INPUT_EVENT_MODE_ASYNC

//             // Clean up the pointer from activeTouches *after* injecting UP event
//             // This part was missing in the original logic and might be needed depending on how activeTouches is used elsewhere.
//             // delete activeTouches[newPointerId]; // Uncomment if necessary

//         }, touchUpDelay);
//     }
// }

function gyro(data:{
    alpha:number;
    beta:number;
    gamma:number;
}){
    if(!cambase) return;
    if(cambase.isNull()) return;
    const yaw = cambase.add(anOffset['yaw']).readFloat();
    const pitch = cambase.add(anOffset['pitch']).readFloat();
    const sensitivity = (config['gyro-scope-sensitivity'] || 10) / 180 * Math.PI;
    const alpha = data.alpha * sensitivity;
    const beta = data.beta * sensitivity;
    const gamma = data.gamma * sensitivity;
    const pitchAdd = (config['gyro-scope-use-gamma'] ? gamma : beta) * (config['gyro-scope-invert'] ? -1 : 1);
    setYaw(yaw + alpha);
    setPitch(pitch + pitchAdd);
}

function executeMacro(events:MacroEvent[]){
    if(!xa) return;
    if(xa.isNull()) return;
    if(!an) return;
    if(an.isNull()) return;
    if(!epos) return;
    if(epos.isNull()) return;
    events.forEach(event => {
        if(event.base === "epos"){
            const offset = eposOffset[event.offset as keyof typeof eposOffset];
            const value = event.value;
            const type = event.type;
            const apply = (base:NativePointer) => {
                if(type === "byte"){
                    base.add(offset).writeS8(value);
                } else if(type === "int16"){
                    base.add(offset).writeU16(value);
                } else if(type === "int32"){
                    base.add(offset).writeU32(value);
                } else if(type === "float"){
                    base.add(offset).writeFloat(value);
                }
            }
            if(event.target === "self"){
                const base = epos;
                apply(base);
            } else if(event.target === "all"){
                const entities = getFilteredEntityList(false);
                if(entities.length > 0){
                    if(event.index !== undefined){
                        apply(entities[event.index]);
                    } else {
                        entities.forEach(entity => {
                            apply(entity);
                        });
                    }
                }
            } else if(event.target === "enemy"){
                const entities = getFilteredEntityList(true);
                if(entities.length > 0){
                    if(event.index !== undefined){
                        apply(entities[event.index]);
                    } else {
                        entities.forEach(entity => {
                            apply(entity);
                        });
                    }
                }
            }
        } else {
            const base = event.base === "xa" ? xa : an;
            const offset = event.base === "xa" ? xaOffset[event.offset as keyof typeof xaOffset] : anOffset[event.offset as keyof typeof anOffset];
            const value = event.value;
            const type = event.type;
            if(type === "byte"){
                base.add(offset).writeS8(value);
            } else if(type === "int16"){
                base.add(offset).writeU16(value);
            } else if(type === "int32"){
                base.add(offset).writeU32(value);
            } else if(type === "float"){
                base.add(offset).writeFloat(value);
            }
        }
    });
}

async function sleep(ms:number){
    return await new Promise(resolve => setTimeout(resolve, ms));
}

async function teleport(eposPointer:NativePointer, x:number, y:number, z:number){
    if(!eposPointer) return;
    if(eposPointer.isNull()) return;
    eposPointer.add(eposOffset['x']).writeFloat(x);
    eposPointer.add(eposOffset['y']).writeFloat(y);
    eposPointer.add(eposOffset['z']).writeFloat(z);
    await sleep(170);
}

async function ctmDefaultMilk(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, -255, 48.22, 0);
    await teleport(epos, 262, 48.22, -44);
    await home();
    await teleport(epos, 262, 48.22, -72);
    await home();
    await teleport(epos, 262, 48.22, 44);
    await home();
    await teleport(epos, 262, 48.22, 72);
    await home();
}

async function ctmDefaultChoco(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, 255, 48.22, 0);
    await teleport(epos, -262, 48.22, -44);
    await home();
    await teleport(epos, -262, 48.22, -72);
    await home();
    await teleport(epos, -262, 48.22, 44);
    await home();
    await teleport(epos, -262, 48.22, 72);
    await home();
}

async function ctmDesertMilk(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, -200, 38.4, 128);
    await teleport(epos, 209, 38.4, -112);
    await home();
    await teleport(epos, 209, 38.4, -144);
    await home();
    await teleport(epos, 175, 38.4, -112);
    await home();
    await teleport(epos, 175, 38.4, -144);
    await home();
}

async function ctmDesertChoco(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, 200, 38.4, -128);
    await teleport(epos, -209, 38.4, 112);
    await home();
    await teleport(epos, -209, 38.4, 144);
    await home();
    await teleport(epos, -175, 38.4, 112);
    await home();
    await teleport(epos, -175, 38.4, 144);
    await home();
}

async function ctmCastleMilk(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, -250, 54.4, 0);
    await teleport(epos, 242, 19.2, -37);
    await home();
    await teleport(epos, 242, 19.2, -60);
    await home();
    await teleport(epos, 242, 19.2, 37);
    await home();
    await teleport(epos, 242, 19.2, 60);
    await home();
}

async function ctmCastleChoco(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, 250, 54.4, 0);
    await teleport(epos, -242, 19.2, -37);
    await home();
    await teleport(epos, -242, 19.2, -60);
    await home();
    await teleport(epos, -242, 19.2, 37);
    await home();
    await teleport(epos, -242, 19.2, 60);
    await home();
}

async function ctmMountainMilk(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, -170, 0, -124);
    await teleport(epos, 162, 0, 142);
    await home();
    await teleport(epos, 162, 0, 158);
    await home();
    await teleport(epos, 162, 0, 106);
    await home();
    await teleport(epos, 162, 0, 90);
    await home();
}

async function ctmMountainChoco(){
    if(!epos) return;
    if(epos.isNull()) return;
    epos.add(eposOffset['state']).writeS32(1);
    const home = async () => await teleport(epos, 170, 0, 124);
    await teleport(epos, -162, 0, -142);
    await home();
    await teleport(epos, -162, 0, -158);
    await home();
    await teleport(epos, -162, 0, -106);
    await home();
    await teleport(epos, -162, 0, -90);
    await home();
}

rpc.exports = {
    readArrayBytes: function(addr, size, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readByteArray(size);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readByte: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readU8();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readInt16: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readS16();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readInt32: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readS32();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readFloat: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readFloat();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readDouble: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readDouble();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    readPointer: function(addr, ignoreProtection:boolean = false) {
        const pointer = ptr(addr)
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
        const res = pointer.readPointer();
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r--');
        return res;
    },
    writeArrayBytes: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeByteArray(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writeByte: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeS8(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writeInt16: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeS16(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writeInt32: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeS32(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writeFloat: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeFloat(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writeDouble: function(addr, data, ignoreProtection:boolean = false) {
        const pointer = ptr(addr);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'rwx');
        pointer.writeDouble(data);
        if(ignoreProtection) Memory.protect(pointer, Process.pageSize, 'r-x');
    },
    writePointer: function(addr, data, ignoreProtection:boolean = false) {
        if(ignoreProtection) Memory.protect(ptr(addr), Process.pageSize, 'rwx');
        ptr(addr).writePointer(ptr(data));
        if(ignoreProtection) Memory.protect(ptr(addr), Process.pageSize, 'r-x');
    },
    scan: function(base, size, pattern) {
        return Memory.scanSync(ptr(base), size, pattern);
    },
    enumerateModules: function() {
        return Process.enumerateModules();
    }
}
let kickLoopInterval: ReturnType<typeof setInterval> | null = null;
function kickLoopStart(slot: number, interval: number){
    kickLoopStop();
    if(!fMatchKickUserSlot) {
        send(['kick-loop', 'unavailable']);
        return;
    }
    kickLoopInterval = setInterval(() => {
        if(!epos || epos.isNull()) return;
        try { fMatchKickUserSlot(slot); } catch(_){}
    }, interval);
    send(['kick-loop', 'started', slot]);
}
function kickLoopStop(){
    if(kickLoopInterval){
        clearInterval(kickLoopInterval);
        kickLoopInterval = null;
    }
    send(['kick-loop', 'stopped']);
}

function genRandom(length: number = 9): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randIndex = Math.floor(Math.random() * chars.length);
      result += chars[randIndex];
    }
    return result;
}
function getChainedPointer(_bs:NativePointer, iter:number[]):NativePointer{
    let pt = _bs;
    for(let offset of iter){
        pt = pt.add(offset);
        pt = pt.readPointer();
        if(pt.isNull()) return null;
    }
    return pt;
}
function readHex(ptr: NativePointer): string {
    const buffer = ptr.readByteArray(4);
    const byteArray = new Uint8Array(buffer).reverse();
    
    let hexString = '';
    for (let byte of byteArray) {
        hexString += byte.toString(16).padStart(2, '0');
    }
    return "0x" + hexString;
}
function bufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer)
    const str:string[] = []
    byteArray.forEach(byte => {
        str.push(byte.toString(16).padStart(2, '0'))
    })
    return str.join(' ')
}
function qwordToHex(qword: Int64): string {
    const x = qword.toString(16)
    return x.match(/.{2}/g).reverse().join(' ')
}
function withWritable<T>(_ptr: NativePointer, fn: () => T): T {
    let base: NativePointer = _ptr;
    let size: number = Process.pageSize;
    let originalProt: any = 'r-x';
    try {
        const range = Process.getRangeByAddress(_ptr);
        base = range.base;
        size = range.size;
        originalProt = range.protection as any;
    } catch (_) {
        // Fallback to single page protection if range lookup fails
    }
    Memory.protect(base, size, 'rwx');
    try {
        return fn();
    } finally {
        Memory.protect(base, size, originalProt);
    }
}
function forceWriteS32(_ptr:NativePointer, value:number){
    // Write 32-bit signed integer with safe protection handling
    withWritable(_ptr, () => { _ptr.writeS32(value); });
}
function forceWriteFloat(_ptr:NativePointer, value:number){
    // Write float with safe protection handling
    withWritable(_ptr, () => { _ptr.writeFloat(value); });
}

function popName(str: string) {
    /* The name is in the format <length><str> */

    let isLast = false;
    let namestr = "";
    let rlen = 0;
    const ostr = str;
    let isEntity = false;

    let maxNames = 0;
    while (!isLast && maxNames < 100) {

        /* This is used for decoding names inside complex namespaces
        Whenever we find an 'N' preceding a number, it's a prefix/namespace
        */
        isLast = str[0] != "N";

        /* St means std:: in the mangled string 
        This std:: check is for inside the name, not outside, 
        unlike the one in the demangle function
        */
        if (str.substr(1, 2) === "St") {
            namestr = namestr.concat("std::");
            str = str.replace("St", "");
            rlen++;
        }

        /* This is used for us to know we'll find an E in the end of this name
        The E marks the final of our name
        */
        isEntity = isEntity || !isLast;

        if (!isLast)
            str = str.substr(1);

        const res = /(\d*)/.exec(str);

        const len = parseInt(res[0], 10);

        rlen += res[0].length + len;
        
        const strstart = str.substr(res[0].length);
        namestr = namestr.concat(strstart.substr(0, len));

        if (!isLast) namestr = namestr.concat("::");
        str = strstart.substr(len);
        maxNames++;
    }

    if (isEntity)
	rlen += 2; // Take out the "E", the entity end mark

    return {name: namestr, str: ostr.substr(rlen)};
}
function popChar(str: string) {
    return {ch: str[0], str: str.slice(1)};
}
function isMangled(name:string):boolean{
    return name.startsWith('_Z');
}
function demangle(name:string):any{
    if (!isMangled(name)) return null;
    try {
        
        const encoding = name.substr(2, (name.indexOf('.') < 0) ? undefined : name.indexOf('.')-2);
        let fname = popName(encoding);
        let functionname = fname.name;
        let types: any[] = [];
        let template_count = 0;
        let template_types: any[] = [];
    
        // Process the types
        let str = fname.str;
        
        let maxTypes = 0;
        while (str.length > 0 && maxTypes < 20) {
            let process = popChar(str);
    
            /* The type info
    
               isBase -> is the type the built-in one in the mangler, represented with few letters?
               typeStr: the type name
               templateType: type info for the current template.
    
               The others are self descriptive
            */
            let typeInfo: any = {isBase: true, typeStr: "", isConst: false, numPtr: 0,
                    isRValueRef: false, isRef: false, isRestrict: false,
                    templateStart: false, templateEnd: false,
                    isVolatile: false, templateType: null};
    
            /* Check if we have a qualifier (like const, ptr, ref... )*/
            var doQualifier = true;
    
            let maxQualifiers = 0;
            while (doQualifier && maxQualifiers < 20) {
                switch (process.ch) {
                case 'R': typeInfo.isRef = true; process = popChar(process.str); break;
                case 'O': typeInfo.isRValueRef = true; process = popChar(process.str); break;
                case 'r': typeInfo.isRestrict = true; process = popChar(process.str); break;
                case 'V': typeInfo.isVolatile = true; process = popChar(process.str); break;
                case 'K': typeInfo.isConst = true; process = popChar(process.str); break;
                case 'P': typeInfo.numPtr++; process = popChar(process.str); break;
                default: doQualifier = false;
                }
                maxQualifiers++;
            }
    
            /* Get the type code. Process it */
            switch (process.ch) {
            case 'v': typeInfo.typeStr = "void"; break;
            case 'w': typeInfo.typeStr = "wchar_t"; break;
            case 'b': typeInfo.typeStr = "bool"; break;
            case 'c': typeInfo.typeStr = "char"; break;
            case 'a': typeInfo.typeStr = "signed char"; break;
            case 'h': typeInfo.typeStr = "unsigned char"; break;
            case 's': typeInfo.typeStr = "short"; break;
            case 't': typeInfo.typeStr = "unsigned short"; break;
            case 'i': typeInfo.typeStr = "int"; break;
            case 'S':
            /* Abbreviated std:: types */
            process = popChar(process.str);
    
            switch (process.ch) {
            case 't': {
                // It's a custom type name
                const tname = popName(process.str);
                typeInfo.typeStr = "std::".concat(tname.name);
                process.str = tname.str;
                break;
            }
            case 'a': typeInfo.typeStr = "std::allocator"; break;
            case 'b': typeInfo.typeStr = "std::basic_string"; break;
            case 's': typeInfo.typeStr = "std::basic_string<char, std::char_traits<char>, std::allocator<char>>"; break;
            case 'i': typeInfo.typeStr = "std::basic_istream<char, std::char_traits<char>>"; break;
            case 'o': typeInfo.typeStr = "std::basic_ostream<char, std::char_traits<char>>"; break;
            case 'd': typeInfo.typeStr = "std::basic_iostream<char, std::char_traits<char>>"; break;
            default:
                process.str = process.ch.concat(process.str);
                break;
            }
            
            break;
            
            case 'I':
            // Template open bracket (<)
            types[types.length-1].templateStart = true;
            template_types.push(types[types.length-1]);
            template_count++;
            
            break;
            case 'E':
            // Template closing bracket (>)
            if ((template_count <= 0)) {
                str = process.str;
                continue;
            }
            
            typeInfo.templateEnd = true;
    
            template_count--;
            typeInfo.templateType = template_types[template_count];
            template_types = template_types.slice(0, -1);
            
            break;
                    
            case 'j': typeInfo.typeStr = "unsigned int"; break;
            case 'l': typeInfo.typeStr = "long int"; break;
            case 'm': typeInfo.typeStr = "unsigned long int"; break;
            case 'x': typeInfo.typeStr = "long long int"; break;
            case 'y': typeInfo.typeStr = "unsigned long long int"; break;
            case 'n': typeInfo.typeStr = "__int128"; break;
            case 'o': typeInfo.typeStr = "unsigned __int128"; break;
            case 'f': typeInfo.typeStr = "float"; break;
            case 'd': typeInfo.typeStr = "double"; break;
            case 'e': typeInfo.typeStr = "long double"; break;
            case 'g': typeInfo.typeStr = "__float128"; break;
            case 'z': typeInfo.typeStr = "..."; break;
    
            /* No type code. We have a type name instead */
            default: {
            if (!isNaN(parseInt(process.ch, 10)) || process.ch == "N") {
    
                // It's a custom type name
                const tname = popName(process.ch.concat(process.str));
                typeInfo.typeStr = typeInfo.typeStr.concat(tname.name);
                process.str = tname.str;
            }
    
            } break;
            }
    
    
            types.push(typeInfo);
            str = process.str;
            maxTypes++;
        }
    
        /* Create the string representation of the type */
        const typelist = types.map((t) => {
            let typestr = "";
            if (t.isConst) typestr = typestr.concat("const ");
            if (t.isVolatile) typestr = typestr.concat("volatile ");
            
            typestr = typestr.concat(t.typeStr);
    
            if (t.templateStart) typestr = typestr.concat("<");
            if (t.templateEnd) typestr = typestr.concat(">");
    
            if (!t.templateStart) {
            if (t.isRef) typestr = typestr.concat("&");
            if (t.isRValueRef) typestr = typestr.concat("&&");
            for (let i = 0; i < t.numPtr; i++) typestr = typestr.concat("*");
            if (t.isRestrict) typestr = typestr.concat(" __restrict");
            }
            
            if (t.templateType) {		
            if (t.templateType.isRef) typestr = typestr.concat("&");
            if (t.templateType.isRValueRef) typestr = typestr.concat("&&");
            for (let i = 0; i < t.templateType.numPtr; i++) typestr = typestr.concat("*");
            }
            
            return typestr;
        });
    
        /* Those replaces are an stupid shortcut to fix templates and make it fast
           Without that, we would need to complicate the code
    
           What it does is remove the commas where we would have the angle brackets
           for the templates
        */
        
        return {
            name: functionname.concat("(" + typelist.join(', ') + ")")
            .replaceAll("<, ", "<")
            .replaceAll(", >", ">")
            .replaceAll(", <", "<"),
            functionname,
            args: typelist
        }
    } catch (error) {
        return null;
    }
}
function argMap(arg:string): string {
    switch(arg){
        case "unsigned int": return "uint";
        case "int": return "int";
        case "unsigned long": return "uint64";
        case "long": return "int64";
        case "unsigned short": return "uint16";
        case "short": return "int16";
        case "unsigned char": return "uint8";
        case "char": return "int8";
        case "float": return "float";
        case "double": return "double";
        case "bool": return "bool";
        case "void": return "void";
        default: return "pointer";
    }
}
function cmdCallF(str:string, options: { silentLog?: boolean } = {}, ...args:any[]):any{
    try {
        const demangled = demangle(str);
        const f = new NativeFunction(
            _libMyGame.findExportByName(str),
            "pointer",
            demangled.args.map((arg: string) => argMap(arg)).filter((arg: string) => arg !== "void")
        );
        args = args.map((arg, i) => {
            switch(argMap(demangled.args[i])){
                case "uint":
                case "int":
                case "uint64":
                case "int64":
                case "uint16":
                case "int16":
                case "uint8":
                case "int8":
                case "float":
                case "double":
                    return Number(arg);
                case "bool":
                case "pointer":
                    return ptr(arg)
                case "void":
                    return null;
                default:
                    return arg;
            }
        }).filter(arg => arg !== null);
        const ret = (f as any)(...args);
        if(!options.silentLog) log(ret);
        return ret;
    } catch (error) {
        console.error(error);
        if(!options.silentLog) log(error);
    }
}
function cmdArg(arg: string, args: NativePointer): string {
    switch(arg){
        case "uint":
        case "int":
        case "uint64":
        case "int64":
        case "uint16":
        case "int16":
        case "uint8":
        case "int8":
            return `[${arg}] ${args.toInt32()}`;
        case "float":
            return `[${arg}] ${args.readFloat()}`;
        case "double":
            return `[${arg}] ${args.readDouble()}`;
        case "bool":
            return `[${arg}] ${args.toInt32() === 1 ? "true" : "false"}`;
        case "void":
            return "";
        default:
            return `[${arg}] ${args.toString()}`;
    }
}
function cmdSearchF(str: string): void {
    const exports = _libMyGame.enumerateExports();
    const names = exports.map((exp) => {
        // const demangled = demangle(exp.name);
        // if(!demangled) return null;
        // return demangled.name;
        return exp.name;
    }).filter(name => name !== null);
    const filtered = names.filter(name => name.toLowerCase().includes(str.toLowerCase()));
    log(filtered.join("\n"));
}
function cmdHookF(str: string): void {
    const demangled = demangle(str);
    try {
        Interceptor.attach(
            _libMyGame.findExportByName(str),
            {
                onEnter: (args) => {
                    log(`[+ ${demangled.functionname}]`);
                for(let i = 0; i < demangled.args.length; i++){
                    log(cmdArg(argMap(demangled.args[i]), args[i]));
                }
            },
            onLeave: (retval) => {
                log(`[- ${demangled.functionname}] -> ${retval.toString()}`);
            }
        }
    )
    } catch (error) {
        console.error(error);
        log(error);
    }
}
function cmdUnhookAll(): void {
    try {
        Interceptor.detachAll();
    } catch (error) {
        console.error(error);
        log(error);
    }
}
function cmdReadF(str: string, type: string): void {
    try {
        const pt = ptr(str);
        if(!pt) return log("null pointer");
        if(pt.isNull()) return log("null pointer");
        switch(type.toLowerCase()){
            case "uint64":
                log(pt.readU64());
                break;
            case "int64":
                log(pt.readS64());
                break;
            case "uint16":
                log(pt.readU16());
                break;
            case "int16":
                log(pt.readS16());
                break;
            case "uint8":
                log(pt.readU8());
                break;
            case "int8":
                log(pt.readS8());
                break;
            case "uint":
            case "uint32":
                log(pt.readU32());
                break;
            case "int":
            case "int32":
                log(pt.readS32());
                break;
            case "float":
                log(pt.readFloat());
                break;
            case "double":
                log(pt.readDouble());
                break;
            case "bool":
                log(pt.readU8() === 1 ? true : false);
                break;
            case "void":
                break;
            default:
                log(pt.toString());
                break;
        }
    } catch (error) {
        console.error(error);
        log(error);
    }
}
function cmdWriteF(str: string, type: string, value: string): void {
    try {
        const pt = ptr(str);
        if(!pt) return log("null pointer");
        if(pt.isNull()) return log("null pointer");
        switch(type.toLowerCase()){
            case "uint64":
                pt.writeU64(Number(value));
                break;
            case "int64":
                pt.writeS64(Number(value));
                break;
            case "uint16":
                pt.writeU16(Number(value));
                break;
            case "int16":
                pt.writeS16(Number(value));
                break;
            case "uint8":
                pt.writeU8(Number(value));
                break;
            case "int8":
                pt.writeS8(Number(value));
                break;
            case "uint":
            case "uint32":
                pt.writeU32(Number(value));
                break;
            case "int":
            case "int32":
                pt.writeS32(Number(value));
                break;
            case "float":
                pt.writeFloat(Number(value));
                break;
            case "double":
                pt.writeDouble(Number(value));
                break;
            case "bool":
                pt.writeU8(Number(value) === 1 ? 1 : 0);
                break;
            case "void":
                break;
            default:
                pt.writePointer(ptr(value));
                break;
        }
    } catch (error) {
        console.error(error);
        log(error);
    }
}