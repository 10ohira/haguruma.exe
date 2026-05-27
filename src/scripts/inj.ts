const bypassMode = false;
const cookie = "";

let excs:number[] = [];
let cwbots:number[] = [];
const inj_defaultConfig = {
    elec: false,
    mago: false,
    heal: false,
    bf: false,
    br: false,
    bh: false,
    ab: true,
    ab_radius: 10,
    ab_shoot: true,
    ab_main: true,
    as: true,
    esp: false,
    ws: false,
    nr: true,
    us: true,
    mv: false,
    ld: false,
    kick: false,
    ccl: 0,
    // static
    clip: false,
    onek: false,
    onesk: true,
    resp: true,
}

interface OffsetInfo {
    name: string;
    str: string;
    args: NativeFunctionArgumentType[];
}

// =============================================================================
//  Offsets, symbols and patch values are pulled from `src/offsets.ts` via
//  build-time JSON placeholder substitution (see scripts/inject-offsets.cjs).
//  Pre-substitution the file is still valid TypeScript thanks to JSON.parse on
//  string literals.
//  Identifiers are prefixed with `inj` so they don't collide with agent.ts at
//  TS compile time (both files share the same scripts tsconfig program).
// =============================================================================
const injLibName: string                     = JSON.parse('/*injLibName*/');
const eposOffsets: Record<string, number>    = JSON.parse('/*eposOffsets*/');
const symbols: Record<string, string>        = JSON.parse('/*symbols*/');
const injXaOffset: Record<string, {name:string; offset:number}> = JSON.parse('/*injXaOffset*/');
const injXaPatch: Record<string, {on:number; off:number; type:'s32'|'f32'}> = JSON.parse('/*injXaPatch*/');
const injAnOffset: Record<string, number>    = JSON.parse('/*injAnOffset*/');

// Backwards-compat aliases used throughout this file.
const libMyGame = injLibName;
let modl = Module.findBaseAddress(libMyGame);

// Build a typed OffsetInfo entry from a symbol key + arg list. `name` is just
// the trailing identifier — useful for log messages.
const O = (key: string, args: NativeFunctionArgumentType[]): OffsetInfo => ({
    name: key.split('.').pop()!,
    str:  symbols[key],
    args,
});

// Toggle one of the `_xaOffset` patches by writing the corresponding
// `_xaPatch` value at the patch site. Mirrors the host-side helper in
// agent.ts so future patches need to be added in only one place.
function injApplyXaPatch(name: string, on: boolean){
    const ofs = injXaOffset[name];
    const pt  = injXaPatch[name];
    if(!ofs || !pt) return;
    const addr = Module.findExportByName(libMyGame, ofs.name).add(ofs.offset);
    Memory.protect(addr, Process.pageSize, 'rwx');
    if(pt.type === 'f32') addr.writeFloat(on ? pt.on : pt.off);
    else                  addr.writeS32(on ? pt.on : pt.off);
    Memory.protect(addr, Process.pageSize, 'r-x');
}

// -----------------------------------------------------------------------------
//  All OffsetInfo records below pull their mangled symbol from `symbols` (the
//  centralized table in src/offsets.ts). Args are kept inline because they
//  describe the calling convention, which doesn't change with game updates.
// -----------------------------------------------------------------------------
const buyOffsets: Record<string, OffsetInfo> = {
    buyWithGold:            O('buy.buyWithGold',            ["uchar"]),
    buyCharacter:           O('buy.buyCharacter',           ["uchar"]),
    buyBoost:               O('buy.buyBoost',               ["uchar"]),
    buyWithClanGold:        O('buy.buyWithClanGold',        ["uchar"]),
    buyResetKillDeathRatio: O('buy.buyResetKillDeathRatio', ["uchar"]),
    buyItem:                O('buy.buyItem',                ["uchar", "uchar", "uint16", "uchar"]),
    buyRandomOption:        O('buy.buyRandomOption',        ["uchar", "uchar", "uchar", "uchar"]),
    buyToyItem:             O('buy.buyToyItem',             ["uint", "uchar", "int"]),
    equip:                  O('buy.equip',                  ["uchar", "uchar", "uchar"]),
    getRewardClassPacket:   O('buy.getRewardClassPackage',  []),
};

const inGameOffsets: Record<string, OffsetInfo> = {
    hitUser:                      O('ingame.hitUser',                      ["pointer", "uchar", "pointer", "pointer", "int16", "float"]),
    ElectricDebuffToUser:         O('ingame.electricDebuffToUser',         ["pointer", "pointer"]),
    buffHitElectric:              O('ingame.buffHitElectric',              ["pointer", "uint", "uint"]),
    buffHitElectricAi:            O('ingame.buffHitElectricAi',            ["pointer", "uint", "uint"]),
    buffHitElectricOff:           O('ingame.buffHitElectricOff',           ["pointer", "uint", "uint"]),
    debuffToUser:                 O('ingame.electricDebuffToUser',         ["pointer", "pointer"]),
    debuffSkillMagoTotem:         O('ingame.debuffSkillMagoTotem',         ["uint", "uint"]),
    updateHookSkill:              O('ingame.updateHookSkill',              ["pointer"]),
    updateMedicSkill:             O('ingame.updateMedicSkill',             ["pointer"]),
    ironSetActivation:            O('ingame.ironSetActivation',            ["pointer", "bool"]),
    setEnableJump:                O('ingame.setEnableJump',                ["bool"]),
    medicSelfHeal:                O('ingame.medicSelfHeal',                ["pointer"]),
    buffOnWheelleg:               O('ingame.buffOnWheelleg',               ["pointer"]),
    buffMagoTotem:                O('ingame.buffMagoTotem',                ["uint", "pointer"]),
    timeOverRespawn:              O('ingame.timeOverRespawn',              ["pointer"]),
    changeMissionCount:           O('ingame.changeMissionCount',           ["uint", "ulong", "uint", "uint16"]),
    completeGameData:             O('ingame.completeGameData',             ["uint"]),
    MoveAi:                       O('ingame.MoveAi',                       ["pointer", "pointer", "pointer", "float", "pointer", "pointer", "float"]),
    getMySkillCoolTime:           O('ingame.getMySkillCoolTime',           []),
    getMaxSkill:                  O('ingame.getMaxSkill',                  ["uchar"]),
    getCurSkill:                  O('ingame.getCurSkill',                  []),
    makeSkillAvailable:           O('ingame.makeSkillAvailable',           []),
    getSkillInvokeTime:           O('ingame.getSkillInvokeTime',           ['uchar']),
    skillOff:                     O('ingame.skillOff',                     ['pointer']),
    isSkillManyTimes:             O('ingame.isSkillManyTimes',             ["uchar"]),
    calculateSpeed:               O('ingame.calculateSpeed',               ["float", "pointer", "pointer", "float"]),
    createMoveSpeed:              O('ingame.createMoveSpeed',              ["uint", "uint"]),
    createMaxBarrier:             O('ingame.createMaxBarrier',             ["uint", "uint"]),
    createDamageReduction:        O('ingame.createDamageReduction',        ["pointer"]),
    barrierRecharge:              O('ingame.barrierRecharge',              ["pointer"]),
    createChooChoo:               O('ingame.createChooChoo',               ["pointer"]),
    getRespawnTime:               O('ingame.getRespawnTime',               ["pointer"]),
    wheellegSpeedUpBuffApplyBuff: O('ingame.wheellegSpeedUpBuffApplyBuff', ["pointer"]),
    checkRemainedBullet:          O('ingame.checkRemainedBullet',          ["pointer"]),
    getMedal:                     O('ingame.getMedal',                     ["uchar"]),
    canHeal:                      O('ingame.canHeal',                      ["pointer", "pointer"]),
};

const charStatusOffsets: Record<string, OffsetInfo> = {
    getMaxHP:          O('charStatus.getMaxHP',          ["pointer", "uchar"]),
    getMaxBarrier:     O('charStatus.getMaxBarrier',     ["pointer", "uchar"]),
    getShootDelay:     O('charStatus.getShootDelay',     ["pointer", "uchar"]),
    getReloadSpeed:    O('charStatus.getReloadSpeed',    ["pointer", "uchar"]),
    getMoveSpeed:      O('charStatus.getMoveSpeed',      ["pointer", "uchar"]),
    getSkillDamage:    O('charStatus.getSkillDamage',    ["pointer", "uchar"]),
    getSkillCooltime:  O('charStatus.getSkillCooltime',  ["pointer", "uchar"]),
    getShotgunBullet:  O('charStatus.getShotgunBullet',  ["pointer", "uchar"]),
    getBodyshotDamage: O('charStatus.getBodyshotDamage', ["pointer"]),
    getHeadshotDamage: O('charStatus.getHeadshotDamage', ["pointer"]),
    cookerBuffWeight:  O('charStatus.cookerBuffWeight',  ["pointer"]),
};

const charRefOffsets: Record<string, OffsetInfo> = {
    getJumpSpeed:       O('charRef.getJumpSpeed',       ["uchar"]),
    getMoveSpeed:       O('charRef.getMoveSpeed',       ["uchar"]),
    getMaxBarrier:      O('charRef.getMaxBarrier',      ["uchar"]),
    getSkillDamage:     O('charRef.getSkillDamage',     ["uchar"]),
    getSkillCooltime:   O('charRef.getSkillCooltime',   ["uchar"]),
    getBarrierRecovery: O('charRef.getBarrierRecovery', ["uchar"]),
};

const clanOffsets: Record<string, OffsetInfo> = {
    matchEndGame:               O('clan.matchEndGame',               ["uint", "uchar", "uint"]),
    matchStartReq:              O('clan.matchStartReq',              []),
    matchReqReady:              O('clan.matchReqReady',              []),
    matchCreateTeam:            O('clan.matchCreateTeam',            []),
    reqInfoEndMatch:            O('clan.reqInfoEndMatch',            ["uint"]),
    clanBreakup:                O('clan.clanBreakup',                []),
    clanCreate:                 O('clan.clanCreate',                 ["pointer", "pointer", "uchar", "uchar"]),
    clanLeave:                  O('clan.clanLeave',                  []),
    clanAccept:                 O('clan.clanAccept',                 ["uint", "uint"]),
    clanInvite:                 O('clan.clanInvite',                 ["uint"]),
    clanChangeMemberGrade:      O('clan.clanChangeMemberGrade',      ["uint", "uchar"]),
    clanChangeIntroduceMessage: O('clan.clanChangeIntroduceMessage', ["uint", "pointer"]),
    clanRequestInformation:     O('clan.clanRequestInformation',     ["uint"]),
    clanKickMember:             O('clan.clanKickMember',             ["uint"]),
};

const cloudOffsets: Record<string, OffsetInfo> = {
    getSkillTime:             O('cloud.getSkillTime',             []),
    getSkillElapsed:          O('cloud.getSkillElapsed',          []),
    isSkillAvailable:         O('cloud.isSkillAvailable',         []),
    getSendContribPacketTime: O('cloud.getSendContribPacketTime', []),
    setSendContribPacketTime: O('cloud.setSendContribPacketTime', ["float"]),
    getIsVisibleSnail:        O('cloud.getIsVisibleSnail',        []),
    setIsVisibleSnail:        O('cloud.setIsVisibleSnail',        ["bool"]),
    getAbusingDetector:       O('cloud.getAbusingDetector',       []),
    getIsTest:                O('cloud.getIsTest',                []),
    getIsTutorial:            O('cloud.getIsTutorial',            []),
};

const globalOffsets: Record<string, OffsetInfo> = {
    updatePacketReceiveTime: O('global.updatePacketReceiveTime', ["float"]),
    requestLogin:            O('global.requestLogin',            ["int", "ssize_t", "ssize_t"]),
    onReceive:               O('global.onReceive',               ["int", "pointer", "int"]),
    testDeleteAccount:       O('global.testDeleteAccount',       []),
    deleteAccount:           O('global.deleteAccount',           []),
    chatting:                O('global.chatting',                ["uchar", "pointer"]),
    getUserByOrder:          O('global.getUserByOrder',          ["uchar"]),
    getUserByUserSeq:        O('global.getUserByUserSeq',        ["uint"]),
    resetPacketReceive:      O('global.resetPacketReceive',      []),
    sendPacket:              O('global.sendPacket',              []),
    addPacketData:           O('global.addPacketData',           ["pointer"]),
    getTCPSocketManager:     O('global.getTCPSocketManager',     []),
    changeNickname:          O('global.changeNickname',          ["uchar", "pointer", "uchar"]),
    connectToGameServer:     O('global.connectToGameServer',     []),
    setPSAuthCode:           O('global.setPSAuthCode',           []),
    toggleAbuseDetector:     O('global.toggleAbuseDetector',     ["bool"]),
    abuseDetectorOnSkill:    O('global.abuseDetectorOnSkill',    ["pointer"]),
    sendPurchasePass:        O('global.sendPurchasePass',        ["uint", "uchar"]),
    sendPurchasePassTier:    O('global.sendPurchasePassTier',    ["uint", "uchar"]),
    purchaseHeroPackage:     O('global.purchaseHeroPackage',     ["int", "uchar"]),
    receiveReward:           O('global.receiveReward',           ["uchar"]),
    sendReqPassReward:       O('global.sendReqPassReward',       ["uint", "uint", "uchar", "uchar", "uchar"]),
    sendReqUserPassData:     O('global.sendReqUserPassData',     ["uint"]),
    sendKnockBack:           O('global.sendKnockBack',           ["uint", "pointer"]),
    changeTeam:              O('global.changeTeam',              []),
    reportClanMark:          O('global.reportClanMark',          ['uint', 'uint']),
    reportHackingUser:       O('global.reportHackingUser',       ['uint', 'uint', 'uchar']),
};

const cameraOffsets: Record<string, OffsetInfo> = {
    getCamera:          O('camera.getCamera',          []),
    getCameraAngleX:    O('camera.getCameraAngleX',    []),
    setCameraAngleX:    O('camera.setCameraAngleX',    ["float"]),
    getCameraAngleY:    O('camera.getCameraAngleY',    []),
    setCameraAngleY:    O('camera.setCameraAngleY',    ["float"]),
    getCameraZoom:      O('camera.getCameraZoom',      []),
    setCameraZoom:      O('camera.setCameraZoom',      ["float"]),
    getCameraDistanceZ: O('camera.getCameraDistanceZ', []),
    getCameraDistanceY: O('camera.getCameraDistanceY', []),
    getCameraRay:       O('camera.getCameraRay',       []),
    setCameraRayOrigin: O('camera.setCameraRayOrigin', ["pointer"]),
    getCameraUser:      O('camera.getCameraUser',      ["pointer"]),
};

const callOffsets: Record<string, OffsetInfo> = {
    changeGun:     O('call.changeGun',     ["pointer"]),
    gameChangeGun: O('call.gameChangeGun', ["pointer"]),
    touchGunEvent: O('call.touchGunEvent', ["pointer", "pointer", "uchar"]),
    throw:         O('call.throw',         []),
    jump:          O('call.jump',          []),
    skill:         O('call.skill',         []),
    zoom:          O('call.zoom',          ["bool"]),
    reload:        O('call.reload',        []),
    shootStart:    O('call.shootStart',    []),
    shootEnd:      O('call.shootEnd',      []),
};

const mapDataOffsets: Record<string, OffsetInfo> = {
    // Map types: 0 dom old, 17 dom new; 1 dm space, 13 dm container, 19 dm desert,
    //   23 dm apt, 26 dm river, 29 dm coloseum; 3 ctm old, 21 ctm desert,
    //   24 ctm castle, 27 ctm mountain; 14 ec new; 2 ecor, 20 ecor bridge,
    //   28 ecor ice; 4/5 maze; 11 ib; 25 spray; 12 fr; 6~8 br new, 9 br old;
    //   22 bomb; 18 town.
    // Modes: 0 domination, 1 deathmatch, 2 escort origin, 3 ctf, 4 killdevil,
    //   5 free for all, 6 br solo, 7 friendly, 8 star league, 9 ice bang,
    //   10 br duo, 11 escort, 12 offline, 13 town, 14 custom lobby, 15 bomb,
    //   16 spray painting.
    getMapType:            O('mapData.getMapType',            []),
    getMode:               O('mapData.getMode',               []),
    getRowCountSprite:     O('mapData.getRowCountSprite',     []),
    getVisibleCountSprite: O('mapData.getVisibleCountSprite', []),
};

const socketOffsets: Record<string, OffsetInfo> = {
    connect:       O('socket.connect',       ["pointer"]),
    disconnect:    O('socket.disconnect',    ["int"]),
    disconnectAll: O('socket.disconnectAll', []),
    setCodeKey:    O('socket.setCodeKey',    ["int", "pointer", "ulong", "pointer", "pointer"]),
};

const assistOffsets: Record<string, OffsetInfo> = {
    isAimAssist:                  O('assist.isAimAssist',                  []),
    AssistRequestInGameRoomUsers: O('assist.AssistRequestInGameRoomUsers', []),
    SendAimAssistOption:          O('assist.SendAimAssistOption',          ['bool']),
};

async function inj_sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function changeArgs(args:NativeFunctionArgumentType[], target:InvocationArguments){
    let _args = [];
    for(let i = 0; i < args.length; i++){
        let type = args[i]
        let tar = target[i]
        let val;
        switch (type) {
            case "bool":
                val = !!tar.toInt32();
                break;
            case "char":
            case "int16":
            case "int":
            case "long":
                val = tar.toInt32();
                break;
            case "uchar":
            case "uint16":
            case "uint":
            case "ulong":
                val = tar.toUInt32();
                break;
            case "float":
                val = tar.readFloat();
                break;
            case "double":
                val = tar.readDouble();
                break;
            case "void":
                val = tar.toString();
                break;
            case "pointer":
                val = tar.toString();
                break;
            case "size_t":
                val = tar.readUtf8String();
                break;
            case "ssize_t":
                const v = tar.readPointer();
                val = v.readUtf8String()
                break;
            default:
                val = tar;
                break;
        }
        _args.push(val)
    }
    return _args;
}

function attach(ofst:OffsetInfo){
    const pt = Module.findExportByName(libMyGame, ofst.str);
    if(pt){
        Interceptor.attach(pt, {
            onEnter: (args) => {
                const _args = changeArgs(ofst.args, args);
                console.log(`[+] ${ofst.name} (${pt.toString()}) Called:`, ..._args)
            },
            onLeave: (retval) => {
                console.log(`[-] ${ofst.name} (${pt.toString()}) Returned:`, retval, retval.toUInt32())
            }
        })
    }
}

function attachStr(str: string, fargs?: NativeFunctionArgumentType[]){
    const pt = Module.findExportByName(libMyGame, str);
    Interceptor.attach(pt, {
        onEnter: args => {
            console.log(`[+] (${pt.toString()}) Called:`, fargs ? changeArgs(fargs, args) : args[0])
        },
        onLeave: (retval) => {
            console.log(`[-] (${pt.toString()}) Returned:`, retval, retval.toUInt32())
        }
    })
}

function func(ofst: OffsetInfo): NativeFunction<any, any>{
    const pt = Module.findExportByName(libMyGame, ofst.str)
    if(pt) return new NativeFunction(pt, "bool", ofst.args)
    else return null;
}

function intercept(ofst: OffsetInfo, callbacksOrProbe: InvocationListenerCallbacks | InstructionProbeCallback) {
    Interceptor.attach(Module.findExportByName(libMyGame, ofst.str), callbacksOrProbe)
}

function isValidAddress(ptrAddr:NativePointer) {
    try {
        return Process.findRangeByAddress(ptrAddr) !== null;
    } catch (e) {
        return false;
    }
}

function i_genRandom(length: number = 9): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randIndex = Math.floor(Math.random() * chars.length);
      result += chars[randIndex];
    }
    return result;
}

class Ch{
    elec:boolean = inj_defaultConfig.elec;
    mago:boolean = inj_defaultConfig.mago;
    heal:boolean = inj_defaultConfig.heal;
    bf:boolean = inj_defaultConfig.bf;
    br:boolean = inj_defaultConfig.br;
    bh:boolean = inj_defaultConfig.bh;
    ab:boolean = inj_defaultConfig.ab;
    esp:boolean = inj_defaultConfig.esp;
    ws:boolean = inj_defaultConfig.ws;
    nr:boolean = inj_defaultConfig.nr;
    us:boolean = inj_defaultConfig.us;
    mv:boolean = inj_defaultConfig.mv;
    ld:boolean = inj_defaultConfig.ld;
    kick:boolean = inj_defaultConfig.kick;
    ccl:number = inj_defaultConfig.ccl;
    _clip:boolean = true;
    _onek:boolean = false;
    _onesk:boolean = false;
    _resp:boolean = false;

    me:string = "";
    yaw:number = 0;
    pitch:number = 0;
    campos: number[] = [0, 0, 0];

    constructor(clip: boolean, onek: boolean, onesk: boolean, resp: boolean){
        this.clip = clip;
        this.onek = onek;
        this.onesk = onesk;
        this.resp = resp;
    }

    sk(n: number){
        if(this.me && ptr(this.me) && !ptr(this.me).isNull()){
            ptr(this.me).add(eposOffsets.sk).writeU8(n);
        };
    }

    // Each setter just toggles the matching `_xaPatch` entry. Patch sites,
    // magic values, and the symbol/offset tables all live in src/offsets.ts.
    set clip(b:boolean){
        this._clip = b;
        // _xaPatch['no-clip'] is float (on=100, off=0.01); injApplyXaPatch picks the writer.
        injApplyXaPatch('no-clip', b);
    }
    set onek(b:boolean){
        this._onek = b;
        injApplyXaPatch('body-one-kill', b);
        injApplyXaPatch('head-one-kill', b);
    }
    set onesk(b:boolean){
        this._onesk = b;
        injApplyXaPatch('skill-damage', b);
    }
    set resp(b:boolean){
        this._resp = b;
        injApplyXaPatch('instant-respawn', b);
    }
}

let ch = new Ch(inj_defaultConfig.clip, inj_defaultConfig.onek, inj_defaultConfig.onesk, inj_defaultConfig.resp)
let players:Set<string> = new Set();
let eq: any, item: any, char: any, unlock: any, del:any, cg: any, medal: any,
    clancr: any, clandel: any, clanlv: any, clandesc: any, clanacc: any, claninv: any, clangrade: any, clankick: any,
    clmtcr: any, clmtst: any,
    chat: any, nick: any,
    purp: any, purt: any, puri: any, kb: any, kick: any,
    unlockAll: any;
const ls = () => {
    Array.from(players).forEach(str => {
        const pt = ptr(str);
        const uid = pt.add(eposOffsets.number).readS32();
        const name = pt.add(eposOffsets.nickname).readUtf8String();
        console.log(`[+] ${name} (${uid})`)
    })
}
const inj_all = (callback:(pt: NativePointer) => void) => {
    Array.from(players).forEach(str => callback(ptr(str)))
}
const inj_main = async () => {
    if(!Process.arch.includes("arm")) return console.log("[!] Only ARM architect can execute this script.");
    if(modl.isNull()) return console.log("[!] No Module Found.");

    console.log("[*] Initialized - Pixel Injection CLI v2.3", `(LibMyGame: ${modl}), PID: ${Process.getCurrentThreadId()}, Arch: ${Process.arch}`);
    eq = func(buyOffsets.equip);
    item = func(buyOffsets.buyItem);
    char = func(buyOffsets.buyCharacter);
    unlock = (ch:number) => {
        for(let i = 1; i <= 255; i++){item(ch, 0, i, 1)}
        for(let i = 1; i <= 255; i++){item(ch, 1, i, 1)}
        for(let i = 1; i <= 255; i++){item(ch, 2, i, 1)}
        for(let i = 1; i <= 255; i++){item(ch, 3, i, 1)}
        for(let i = 1; i <= 255; i++){item(ch, 4, i, 1)}
        for(let i = 1; i <= 127; i++){item(ch, 6, i, 1)}
        for(let i = 1; i <= 127; i++){item(ch, 7, i, 1)}
    }
    del = () => func(globalOffsets.deleteAccount)();
    cg = (amount: number) => {
        for(let i = 0; i < amount; i++){
            func(buyOffsets.buyWithClanGold)(3);
        }
    }
    medal = (id:number) => func(inGameOffsets.getMedal)(id);
    clancr = (name:string = i_genRandom(), desc:string = "", mark:number = 0, flag:number = 1) => {
        const npt = Memory.allocUtf8String(name);
        const dpt = Memory.allocUtf8String(desc);
        const nobj = Memory.alloc(Process.pageSize);
        const dobj = Memory.alloc(Process.pageSize);
        nobj.writePointer(npt);
        dobj.writePointer(dpt);
        func(clanOffsets.clanCreate)(nobj, dobj, mark, flag);
    };
    clandel = () => func(clanOffsets.clanBreakup)();
    clanlv = () => func(clanOffsets.clanLeave)();
    clandesc = (id:number, msg:string) => {
        const msgpt = Memory.allocUtf8String(msg);
        func(clanOffsets.clanChangeIntroduceMessage)(id, msgpt);
    };
    clanacc = (id:number, uid:number) => func(clanOffsets.clanAccept)(id, uid);
    claninv = (uid:number) => func(clanOffsets.clanInvite)(uid);
    clangrade = (uid:number, grade:number) => func(clanOffsets.clanChangeMemberGrade)(uid, grade);
    clankick = (uid:number) => func(clanOffsets.clanKickMember)(uid);
    clmtcr = () => func(clanOffsets.matchCreateTeam)();
    clmtst = () => func(clanOffsets.matchStartReq)();
    chat = (msg:string) => {
        const pt = Memory.allocUtf8String(msg);
        const obj = Memory.alloc(Process.pageSize);
        obj.writePointer(pt);
        func(globalOffsets.chatting)(0, obj);
    }
    nick = (name:string) => {
        const sp = Memory.allocUtf8String(name);
        func(globalOffsets.changeNickname)(1, sp, 0);
    }
    purp = func(globalOffsets.sendPurchasePass);
    purt = func(globalOffsets.sendPurchasePassTier);
    puri = func(globalOffsets.sendReqPassReward);
    kick = (id:number) => purt(id, 0);
    kb = (id:number, x:number, y:number, z:number) => {
        const pt = Memory.alloc(Process.pageSize*3);
        pt.writeFloat(x);
        pt.add(0x4).writeFloat(y);
        pt.add(0x8).writeFloat(z);
        func(globalOffsets.sendKnockBack)(id, pt);
    }
    unlockAll = () => {
        for(let i = 2; i <= 27; i++){char(i)}
        for(let i = 1; i <= 27; i++){unlock(i)}
    }

    // Debug Zone
    // ==========

    intercept(inGameOffsets.setEnableJump, {
        onEnter(args) {
            args[0] = ptr(0x1);
        },
        onLeave(retval) {
            retval.replace(1 as any);
        }
    })
    
    intercept(globalOffsets.chatting, {
        onEnter(args) {
            const msg = args[1].readPointer();
            const str = msg.readUtf8String();
            if(str.startsWith('/')){
                const cmd = str.split(' ')[0].substring(1).toLowerCase();
                const args = str.split(' ').slice(1);
                switch (cmd) {
                    case 'cc':
                        clancr();
                        setTimeout(() => {
                            clmtcr();
                            cwbots.forEach((bot) => {
                                claninv(bot);
                            })
                        }, 500);
                        break;
                    case 'cd':
                        cwbots.forEach((bot) => {
                            clankick(bot);
                        })
                        setTimeout(clandel, 500);
                        break;
                }
            }
        }
    })

    intercept(clanOffsets.clanCreate, {onLeave(retval) {if(ch.ccl){setTimeout(clandel, 400);}}})
    intercept(clanOffsets.clanBreakup, {onLeave(retval) {if(ch.ccl){ch.ccl--;setTimeout(clancr, 100);}}})

    intercept(cameraOffsets.getCameraAngleX, {
        onLeave(retval) {
            if(!retval.isNull()) {
                ch.yaw = retval.readFloat();
            } else ch.yaw = 0;
        }
    })
    intercept(cameraOffsets.getCameraAngleY, {
        onLeave(retval) {
            if(!retval.isNull()) {
                ch.pitch = retval.readFloat();
                // retval here is the cambase pointer returned by getCameraAngleY.
                ch.campos = [
                    retval.add(injAnOffset['camX']).readFloat(),
                    retval.add(injAnOffset['camY']).readFloat(),
                    retval.add(injAnOffset['camZ']).readFloat()
                ];
            } else {
                ch.pitch = 0;
                ch.campos = [0, 0, 0];
            };
        }
    })
    
    intercept(cameraOffsets.getCameraUser, {
        onLeave(retval) {
            ch.me = retval.toString();
            if(!retval || retval.isNull()) ch.me = "";
        },
    })

    setInterval(() => {
        const mypt = ptr(ch.me);
        if(!mypt || mypt.isNull()) return;
        let mynum = mypt.readS32();
        let slot = mypt.add(eposOffsets.slot).readU8();
        // func(globalOffsets.resetPacketReceive)();
        func(globalOffsets.toggleAbuseDetector)(0);
        if(ch.bf){
            func(inGameOffsets.buffOnWheelleg)(mypt);
            func(inGameOffsets.createDamageReduction)(mypt);
            func(inGameOffsets.createMoveSpeed)(mynum, mynum);
            func(inGameOffsets.createMaxBarrier)(mynum, mynum);
        }
        inj_all(async pt => {
            const num = pt.readS32(), sl = pt.add(eposOffsets.slot).readU8();
            if(ch.elec){
                if(num !== mynum && slot % 2 != sl % 2 && !excs.includes(num)) func(inGameOffsets.buffHitElectric)(pt, mynum, mynum)
            }
            if(ch.mago){
                await inj_sleep(200)
                if(num !== mynum && slot % 2 != sl % 2 && !excs.includes(num)) func(inGameOffsets.debuffSkillMagoTotem)(mynum, num)
            }
        })
    }, 400)
    setInterval(() => {
        const mypt = ptr(ch.me);
        if(!mypt || mypt.isNull()) return;
        let mynum = mypt.readS32();
        let x = mypt.add(eposOffsets.x).readFloat(), y = mypt.add(eposOffsets.y).readFloat(), z = mypt.add(eposOffsets.z).readFloat();
        let st = mypt.add(eposOffsets.state).readS32();
        if(ch.br){
            func(globalOffsets.toggleAbuseDetector)(0);
            func(inGameOffsets.barrierRecharge)(mypt);
        }
        if(ch.bh){
            inj_all(pt => {
                const num = pt.readS32();
                if(num !== mynum && !excs.includes(num)){
                    pt.add(eposOffsets.x).writeFloat(x);
                    pt.add(eposOffsets.y).writeFloat(y);
                    pt.add(eposOffsets.z).writeFloat(z + 10);
                }
            })
        }
        if(ch.ws){
            mypt.add(eposOffsets.w1c).writeFloat(0);
            mypt.add(eposOffsets.w2c).writeFloat(0);
        }
        if(ch.nr){
            if(st >= 64 && st <= 67) mypt.add(eposOffsets.timer).writeFloat(9999);
        }
        if(ch.mv){
            mypt.add(eposOffsets.dx).writeFloat(Math.min(Math.max(mypt.add(eposOffsets.dx2).readFloat()*3, -3), 3))
            mypt.add(eposOffsets.dz).writeFloat(Math.min(Math.max(mypt.add(eposOffsets.dz2).readFloat()*3, -3), 3))
        }
        if(ch.ld){
            if(mypt.add(eposOffsets.state).readS32() != 16 && mypt.add(eposOffsets.hp).readS16() > 0){
                mypt.add(eposOffsets.y).writeFloat(-999)
                mypt.add(eposOffsets.state).writeS32(3)
            }
        }
        if(ch.ab){
            if(inj_defaultConfig.ab_main && mypt.add(eposOffsets.weapon).readU8() != 0) return;
            if(inj_defaultConfig.ab_shoot && (st < 8 || st > 11)) return;
            const rad = inj_defaultConfig.ab_radius / 180 * Math.PI;
            inj_all(pt => {
                const num = pt.readS32();
                if(
                    num !== mynum && !excs.includes(num) &&
                    mypt.add(eposOffsets.slot).readU8() % 2 != pt.add(eposOffsets.slot).readU8() % 2 &&
                    pt.add(eposOffsets.state).readS32() != 16 && pt.add(eposOffsets.hp).readS16() > 0
                ){
                    let dx = pt.add(eposOffsets.x).readFloat() - ch.campos[0];
                    let dy = pt.add(eposOffsets.y).readFloat() + 4.8 - ch.campos[1];
                    let dz = pt.add(eposOffsets.z).readFloat() - ch.campos[2];
                    const yo = Math.atan2(dx, dz);
                    let ya = yo - ch.yaw;
                    while(ya > Math.PI) ya -= Math.PI * 2;
                    while(ya < -Math.PI) ya += Math.PI * 2;
                    const po = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
                    let pa = po - ch.pitch;
                    const from = Math.sqrt(ya*ya + pa*pa);
                    if(from >= rad) return;
                    func(cameraOffsets.setCameraAngleX)(yo);
                    func(cameraOffsets.setCameraAngleY)(po);
                    // const radyaw = -ya > 0 ? rad : -rad;
                    // const radpitch = -pa > 0 ? rad : -rad;
                    // const getStep = (val: number, radVal: number) =>
                    //     val > 0 ? Math.max(radVal, val) : Math.min(radVal, val);
                    // const ry = getStep(-ya, getStep(-ya, radyaw) + ya);
                    // const rp = getStep(-pa, getStep(-pa, radpitch) + pa);
                    // func(cameraOffsets.setCameraAngleX)(ch.yaw - ry * inj_defaultConfig.ab_speed/100);
                    // func(cameraOffsets.setCameraAngleY)(ch.pitch - rp * inj_defaultConfig.ab_speed/100);
                }
            })
        }
    }, 10)

    intercept(globalOffsets.getUserByUserSeq, {
        onLeave: retval => {
            players.add(retval.toString());
            players.forEach(player => {
                try{
                    const pt = ptr(player);
                    const myslot = ptr(ch.me).add(eposOffsets.slot).readU8() % 2
                    if(player !== ch.me && ch.kick) {
                        let n = pt.readS32()
                        let slot = pt.add(eposOffsets.slot).readU8() % 2
                        if(n > 0 && myslot != slot && !excs.includes(n)){
                            kick(n);
                        }
                    }
                    const n = pt.add(eposOffsets.nickname).readCString();
                    const zr1 = pt.add(eposOffsets.zr1).readFloat();
                    const zr2 = pt.add(eposOffsets.zr2).readFloat();
                    if(zr1 !== 0 || zr2 !== 0 || n === "") players.delete(player);
                } catch (e){
                    players.delete(player)
                }
            })
        }
    })
}

Java.perform(async () => {
    let callbackClass = Java.use("com.wellbia.xigncode.XigncodeClientSystem$Callback");
    var FakeCallback = Java.registerClass({
        name: "com.wellbia.xigncode.FakeCallback",
        implements: [callbackClass],
        methods: {
            OnHackDetected: function (code, message) {
                console.log("[*] Hack Detected! (Blocked)");
                console.log(code, message)
            },
            OnLog: function (logMessage) {
                console.log("[*] Xigncode Log:", logMessage);
                return;
            },
            SendPacket: function (data) {
                console.log("[*] SendPacket intercepted!");
                return 0;
            }
        }
    });
    let XigncodeClientSystem = Java.use("com.wellbia.xigncode.XigncodeClientSystem");
    XigncodeClientSystem["initialize"].implementation = function (activity:any, str:string, app:string, str3:string, callback:any) {
        var fakeCallback = FakeCallback.$new();
        if(!bypassMode) this["initialize"](activity, str, app, str3, fakeCallback)
        console.log("[*] XigncodeClientSystem.initialize", activity, str, app, str3);
        return 0;
    };
    XigncodeClientSystem["getCookie2"].implementation = function (str:string) {
        let result = this["getCookie2"](str);
        // console.log("[*] XigncodeClientSystem.getCookie2", result);
        return bypassMode ? (cookie || null) : result;
    }
    while(!modl){
        await inj_sleep(500)
        modl = Module.getBaseAddress(libMyGame)
    }
    await inj_main().catch(e => console.log("[!]", e))
})
