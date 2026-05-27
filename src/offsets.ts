// =============================================================================
//  SINGLE SOURCE OF TRUTH FOR ALL UPDATE-SENSITIVE GAME DATA
// -----------------------------------------------------------------------------
//  When the target game (libMyGame.so) is updated, ONLY this file should need
//  to be touched. Both the Electron host (`src/index.ts`) and the Frida agents
//  (`src/scripts/agent.ts`, `src/scripts/inj.ts`) consume these tables via
//  runtime / build-time JSON placeholder substitution.
// =============================================================================

// -----------------------------------------------------------------------------
// 0) Target native library name. Update only if the APK ships a renamed .so.
// -----------------------------------------------------------------------------
export const _libName = "libMyGame.so";

// -----------------------------------------------------------------------------
// 1) Function-symbol patches (XA = eXported function patch via memory write)
// -----------------------------------------------------------------------------
//   `name`   : mangled C++ symbol exported from libMyGame.so
//   `offset` : byte offset relative to the symbol where the immediate lives
export const _xaOffset = {
    'no-recoil':       { name: "_ZN6Recoil11ShakeCameraERKf",                                                                         offset: 0x44 },
    'no-clip':         { name: "_ZN14UserMoveSystem6MoveAIERNS_13CollisionDataERN7cocos2d4Vec3ES4_fR9GameSceneR9UserInforf",          offset: -0x4 },
    'no-spread1':      { name: "_ZN20CharStatusCalculator18GetAimSpreadMovingERK9UserInfor",                                          offset: 0x10 },
    'no-spread2':      { name: "_ZN20CharStatusCalculator20GetAimSpreadShootingERK9UserInfor",                                        offset: 0x10 },
    // Spread::GetAimGapByCurState() embeds several float immediates, one per
    // (state × zoom) bucket. Patching only no-spread1/no-spread2 leaves the
    // idle / jump / per-bucket-zoom gaps untouched, so a fully-still or
    // mid-air shot still spreads. Each offset below is a distinct immediate
    // inside that single function.
    'no-spread-idle':       { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0x14C },
    'no-spread-idle-zoom':  { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0x144 },
    'no-spread-jump':       { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0x104 },
    'no-spread-jump-zoom':  { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0xDC  },
    'no-spread-move-zoom':  { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0xFC  },
    'no-spread-shoot-zoom': { name: "_ZN6Spread19GetAimGapByCurStateEv",                                                              offset: 0x124 },
    'no-reload':       { name: "_ZN20CharStatusCalculator18GetReloadSpeedRateERK9UserInfor",                                          offset: 0x10 },
    'instant-respawn': { name: "_ZNK9GameScene14GetRespawnTimeEv",                                                                    offset: 0x18 },
    'body-one-kill':   { name: "_ZN20CharStatusCalculator21GetBodyShotDamageRateERK9UserInfor",                                       offset: 0x0  },
    'head-one-kill':   { name: "_ZN20CharStatusCalculator21GetHeadShotDamageRateERK9UserInfor",                                       offset: 0x10 },
    'skill-damage':    { name: "_ZNK13CCharacterRef14GetSkillDamageEh",                                                               offset: 0x60 },
    'cooker-buff':     { name: "_ZN20CharStatusCalculator19GetCookerBuffWeightERK9UserInfor",                                         offset: 0x0  },
} as const;

// -----------------------------------------------------------------------------
// 2) Magic write values for each XA patch (per-update; ON / OFF integers)
// -----------------------------------------------------------------------------
//   `on`   : value written when the cheat is ENABLED
//   `off`  : original value (restored when DISABLED)
//   `type` : how to write the value (`s32` is the default; `f32` for floats)
export const _xaPatch = {
    'no-recoil':       { on: 505_942_016,    off: -1_124_072_416, type: 's32' as const },
    'no-clip':         { on: 100,            off: 0.01,           type: 'f32' as const },
    'no-spread1':      { on: 505_942_016,    off: -1_119_869_952, type: 's32' as const },
    'no-spread2':      { on: 505_942_016,    off: -1_119_870_976, type: 's32' as const },
    // ON = fmov s0, wzr (zero spread). OFF values are the original per-bucket
    // immediates inside Spread::GetAimGapByCurState.
    'no-spread-idle':       { on: 505_942_016, off: -1_119_871_328, type: 's32' as const },
    'no-spread-idle-zoom':  { on: 505_942_016, off: -1_119_867_232, type: 's32' as const },
    'no-spread-jump':       { on: 505_942_016, off: -1_119_868_256, type: 's32' as const },
    'no-spread-jump-zoom':  { on: 505_942_016, off: -1_119_864_160, type: 's32' as const },
    'no-spread-move-zoom':  { on: 505_942_016, off: -1_119_865_184, type: 's32' as const },
    'no-spread-shoot-zoom': { on: 505_942_016, off: -1_119_866_208, type: 's32' as const },
    'no-reload':       { on: 505_925_632,    off: -1_136_562_176, type: 's32' as const },
    'instant-respawn': { on: 505_415_680,    off: 505_415_712,    type: 's32' as const },
    'body-one-kill':   { on: 505_925_632,    off: 506_335_232,    type: 's32' as const },
    'head-one-kill':   { on: 505_925_632,    off: -1_136_594_944, type: 's32' as const },
    'skill-damage':    { on: 1_384_184_322,  off: -1_203_335_166, type: 's32' as const },
    'cooker-buff':     { on: 505_925_632,    off: 506_335_232,    type: 's32' as const },
} as const;

// -----------------------------------------------------------------------------
// 3) Static address offsets (AN = ANon-pointer base region)
// -----------------------------------------------------------------------------
export const _anOffset = {
    "camera-base": 0x0,
    "yaw":         0x0 + 0x4,
    "pitch":       0x0 + 0x0,
    "camX":        0x0 + 0xC,
    "camY":        0x0 + 0x10,
    "camZ":        0x0 + 0x14,
    "cam-distance":0x0 + 0x24,

    "position-base": 0x7ABE28,
    "x":             0x7ABE28 + 0x0,
    "y":             0x7ABE28 + 0x4,
    "z":             0x7ABE28 + 0x8,

    "cash-base":  0x2D16FC,
    "dia":        0x2D16FC + 0x0,
    "dia-total":  0x2D16FC + 0x8,
    "dia-used":   0x2D16FC + 0xC,
    "gold":       0x2D16FC + 0x10,
    "gold-total": 0x2D16FC + 0x14,
    "gold-used":  0x2D16FC + 0x18,
    "clan-gold":  0x2D16FC + 0x1C,

    "skill-base":   0x8BF075,
    "grenade-base": 0x8BEFC9,
} as const;

// -----------------------------------------------------------------------------
// 3a) Magic write values for AN-region patches (per-update like _xaPatch).
// -----------------------------------------------------------------------------
export const _anPatch = {} as const;

// -----------------------------------------------------------------------------
// 4) UserInfor (epos) struct field offsets
// -----------------------------------------------------------------------------
//   Used by both the Electron-launched Frida agent (agent.ts) and the dev
//   Frida CLI script (inj.ts). Aliases are listed together so both scripts
//   resolve them from the same table.
export const _eposOffset = {
    'number':       0x0,
    'exp':          0x4,
    'totalkill':    0x8,
    'totaldeath':   0xC,
    'totalassist':  0x10,
    'charkda':      0x14,
    'kda':          0x14,
    'kill':         0x18,
    'death':        0x1C,
    'assist':       0x20,
    'hp':           0x2C,
    'weapon':       0x2E,
    'barrier':      0x30,
    'nickname':     0x90,
    'char':         0xB5,
    'sk':           0xB5,
    'fall':         0xB7,
    'slot':         0xC8,
    'movable':      0xCA,
    'timer':        0xD0,
    'skillcool':    0xD4,
    'sc':           0xD4,
    'dc':           0xE8,
    'w1c':          0xF0,
    'w2c':          0xF4,
    'dz':           0x104,
    'dx':           0x108,
    'dz2':          0x118,
    'dx2':          0x11C,
    'state':        0x134,
    'skill':        0x135,
    'dy':           0x13C,
    'gx':           0x144,
    'gy':           0x148,
    'gz':           0x14C,
    'hookx':        0x168,
    'hooky':        0x16C,
    'hookz':        0x170,
    'hookdx':       0x174,
    'hookdy':       0x178,
    'hookdz':       0x17C,
    'kbdx':         0x18C,
    'kbdy':         0x190,
    'kbdz':         0x194,
    'zr1':          0x194,
    'x':            0x198,
    'y':            0x19C,
    'z':            0x1A0,
    'zr2':          0x1AC,
    'gc':           0x1B0,
    'ox':           0x1B4,
    'oy':           0x1B8,
    'oz':           0x1BC,
    'lastkilled':   0xE64,
    'chainedhit':   0xE68,
    'skilled':      0xE74,
    'curkda':       0xEA8,
    'maxhp':        0xEFC,
    'maxbarrier':   0xF00,
    'w1code':       0xEB6,
    'w2code':       0xEB8,
    'gcode':        0xEBA,
    'bulletusedw1': 0xEBC,
    'bulletusedw2': 0xEBE,
    'pointer':      0xF08,
} as const;

// -----------------------------------------------------------------------------
// 5) Mangled C++ symbols, grouped by logical category
// -----------------------------------------------------------------------------
//   These are the only strings that change when libMyGame.so is rebuilt.
//   Both agent.ts and inj.ts resolve every Module.findExportByName / NativeFunction
//   target through this table — never inline a mangled name in a script file.
export const _symbols = {
    // ---- SystemPacketSend buy / shop ----
    'buy.buyWithGold':                      "_ZN16SystemPacketSend11BuyWithGoldEh",
    'buy.buyCharacter':                     "_ZN16SystemPacketSend12BuyCharacterEh",
    'buy.buyBoost':                         "_ZN16SystemPacketSend8BuyBoostEh",
    'buy.buyWithClanGold':                  "_ZN16SystemPacketSend15BuyWithClanGoldEh",
    'buy.buyResetKillDeathRatio':           "_ZN16SystemPacketSend22BuyResetKillDeathRatioEh",
    'buy.buyItem':                          "_ZN16SystemPacketSend7BuyItemEhhth",
    'buy.buyRandomOption':                  "_ZN16SystemPacketSend15BuyRandomOptionEhhhh",
    'buy.buyToyItem':                       "_ZN16SystemPacketSend10BuyToyItemEjhi",
    'buy.equip':                            "_ZN16SystemPacketSend5EquipEhhh",
    'buy.equipShort':                       "_ZN16SystemPacketSend5EquipEhht", // agent.ts uses this overload
    'buy.getRewardClassPackage':            "_ZN16SystemPacketSend12ClassPackage23GetRewardInClassPackageEhhmhhhh",

    // ---- In-game logic / packets ----
    'ingame.hitUser':                       "_ZN16SystemPacketSend7HitUserERK9UserInforhS2_RKN7cocos2d4Vec3Esf",
    'ingame.electricDebuffToUser':          "_ZN9GameScene25ElectricDebuffToUserSkillER9UserInforR5CBuff",
    'ingame.buffHitElectric':               "_ZN16SystemPacketSend15BuffHitElectricERK9UserInforjj",
    'ingame.buffHitElectricAi':             "_ZN16SystemPacketSend21BuffHitElectricAIUserERK9UserInforjj",
    'ingame.buffHitElectricOff':            "_ZN19SystemOfflinePacket15BuffHitElectricERK9UserInforjj",
    'ingame.debuffSkillMagoTotem':          "_ZN16SystemPacketSend20DeBuffSkillMagoTotemEjj",
    'ingame.updateHookSkill':               "_ZN9GameScene15UpdateHookSkillEP9UserInfor",
    'ingame.updateMedicSkill':              "_ZN9GameScene16UpdateMedicSkillEP9UserInfor",
    'ingame.ironSetActivation':             "_ZN5Skill4Iron13SetActivationER9UserInforb",
    'ingame.setEnableJump':                 "_ZN5Cloud8CharData13SetEnableJumpEb",
    'ingame.medicSelfHeal':                 "_ZN19SystemOfflinePacket20ProcessMedicSelfHealERK9UserInfor",
    'ingame.buffOnWheelleg':                "_ZN16SystemPacketSend14BuffOnWheellegERK9UserInfor",
    'ingame.buffMagoTotem':                 "_ZN16SystemPacketSend18BuffSkillMagoTotemEjRKSt4listIjSaIjEE",
    'ingame.timeOverRespawn':               "_ZN16SystemPacketSend22TimeOverRespawnWaitingERK9UserInfor",
    'ingame.changeMissionCount':            "_ZN16SystemPacketSend22SendChangeMissionCountEjmjt",
    'ingame.completeGameData':              "_ZN16SystemPacketSend20SendCompleteGameDataEi",
    'ingame.MoveAi':                        "_ZN14UserMoveSystem6MoveAIERNS_13CollisionDataERN7cocos2d4Vec3ES4_fR9GameSceneR9UserInforf",
    'ingame.getMySkillCoolTime':            "_ZN5Skill18GetMySkillCoolTimeEv",
    'ingame.getMaxSkill':                   "_ZN5Skill16GetMaxSkillCountEh",
    'ingame.getCurSkill':                   "_ZN5Skill16GetCurSkillCountEv",
    'ingame.makeSkillAvailable':            "_ZN9GameScene18MakeSkillAvailableEv",
    'ingame.getSkillInvokeTime':            "_ZN20CharStatusCalculator18GetSkillInvokeTimeEh",
    'ingame.skillOff':                      "_ZN16SystemPacketSend8SkillOffERK9UserInfor",
    'ingame.isSkillManyTimes':              "_ZN5Skill16IsSkillManyTimesEh",
    'ingame.calculateSpeed':                "_ZN14UserMoveSystem14CalculateSpeedERfR9GameSceneR9UserInforf",
    'ingame.createMoveSpeed':               "_ZN16SystemPacketSend19CreateMoveSpeedBuffEjj",
    'ingame.createMaxBarrier':              "_ZN16SystemPacketSend20CreateMaxBarrierBuffEjj",
    'ingame.createDamageReduction':         "_ZN16SystemPacketSend25CreateDamagereductionBuffERK9UserInfor",
    'ingame.barrierRecharge':               "_ZN16SystemPacketSend15BarrierRechargeERK9UserInfor",
    'ingame.createChooChoo':                "_ZN16SystemPacketSend18CreateChooChooBuffERK9UserInfor",
    'ingame.getRespawnTime':                "_ZNK9GameScene14GetRespawnTimeEv",
    'ingame.wheellegSpeedUpBuffApplyBuff':  "_ZN20CWheellegSpeedUpBuff9ApplyBuffEP9UserInfor",
    'ingame.checkRemainedBullet':           "_ZN10UtilWeapon19CheckRemainedBulletERK9UserInfor",
    'ingame.getMedal':                      "_ZN9GameScene8GetMedalEh",
    'ingame.canHeal':                       "_ZN9GameScene7CanHealEP9UserInforS1_",
    'ingame.gameSceneInit':                 "_ZN9GameScene4initEv",

    // ---- CharStatusCalculator ----
    'charStatus.getMaxHP':                  "_ZN20CharStatusCalculator8GetMaxHPERK9UserInforh",
    'charStatus.getMaxBarrier':             "_ZN20CharStatusCalculator13GetMaxBarrierERK9UserInfor",
    'charStatus.getShootDelay':             "_ZN20CharStatusCalculator13GetShootDelayERK9UserInfor",
    'charStatus.getReloadSpeed':            "_ZN20CharStatusCalculator18GetReloadSpeedRateERK9UserInfor",
    'charStatus.getMoveSpeed':              "_ZN20CharStatusCalculator12GetMoveSpeedER9UserInfor",
    'charStatus.getSkillDamage':            "_ZN20CharStatusCalculator14GetSkillDamageERK9UserInfor",
    'charStatus.getSkillCooltime':          "_ZN20CharStatusCalculator16GetSkillCoolTimeERK9UserInfor",
    'charStatus.getShotgunBullet':          "_ZN20CharStatusCalculator16GetShotGunBulletERK9UserInfor",
    'charStatus.getBodyshotDamage':         "_ZN20CharStatusCalculator21GetBodyShotDamageRateERK9UserInfor",
    'charStatus.getHeadshotDamage':         "_ZN20CharStatusCalculator21GetHeadShotDamageRateERK9UserInfor",
    'charStatus.cookerBuffWeight':          "_ZN20CharStatusCalculator19GetCookerBuffWeightERK9UserInfor",

    // ---- CCharacterRef ----
    'charRef.getJumpSpeed':                 "_ZNK13CCharacterRef12GetJumpSpeedEh",
    'charRef.getMoveSpeed':                 "_ZNK13CCharacterRef12GetMoveSpeedEh",
    'charRef.getMaxBarrier':                "_ZNK13CCharacterRef13GetMaxBarrierEh",
    'charRef.getSkillDamage':               "_ZNK13CCharacterRef14GetSkillDamageEh",
    'charRef.getSkillCooltime':             "_ZNK13CCharacterRef16GetSkillCoolTimeEh",
    'charRef.getBarrierRecovery':           "_ZNK13CCharacterRef18GetBarrierRecoveryEh",

    // ---- Clan ----
    'clan.matchEndGame':                    "_ZN16SystemPacketSend16ClanMatchEndGameEjhj",
    'clan.matchStartReq':                   "_ZN16SystemPacketSend21ClanMatchStartRequestEv",
    'clan.matchReqReady':                   "_ZN16SystemPacketSend17ClanMatchReqReadyEv",
    'clan.matchCreateTeam':                 "_ZN16SystemPacketSend19ClanMatchCreateTeamEv",
    'clan.reqInfoEndMatch':                 "_ZN16SystemPacketSend30ClanRequestInformationEndMatchEj",
    'clan.clanBreakup':                     "_ZN16SystemPacketSend11ClanBreakupEv",
    'clan.clanCreate':                      "_ZN16SystemPacketSend10ClanCreateERKSsS1_hh",
    'clan.clanLeave':                       "_ZN16SystemPacketSend9ClanLeaveEv",
    'clan.clanAccept':                      "_ZN16SystemPacketSend27ClanAcceptWaitingUserToJoinEjj",
    'clan.clanInvite':                      "_ZN16SystemPacketSend14ClanInviteUserEj",
    'clan.clanChangeMemberGrade':           "_ZN16SystemPacketSend21ClanChangeMemberGradeEjh",
    'clan.clanChangeIntroduceMessage':      "_ZN16SystemPacketSend26ClanChangeIntroduceMessageEjPKc",
    'clan.clanRequestInformation':          "_ZN16SystemPacketSend22ClanRequestInformationEj",
    'clan.clanKickMember':                  "_ZN16SystemPacketSend14ClanKickMemberEj",

    // ---- Cloud (CharData / GameData / NetData) ----
    'cloud.getSkillTime':                   "_ZN5Cloud8CharData12GetSkillTimeEv",
    'cloud.getSkillElapsed':                "_ZN5Cloud8CharData19GetSkillElapsedTimeEv",
    'cloud.isSkillAvailable':               "_ZN5Cloud8CharData16IsSkillAvailableEv",
    'cloud.getSendContribPacketTime':       "_ZN5Cloud8GameData24GetSendContribPacketTimeEv",
    'cloud.setSendContribPacketTime':       "_ZN5Cloud8GameData24SetSendContribPacketTimeEf",
    'cloud.getIsVisibleSnail':              "_ZN5Cloud8GameData17GetIsVisibleSnailEv",
    'cloud.setIsVisibleSnail':              "_ZN5Cloud8GameData17SetIsVisibleSnailEb",
    'cloud.getAbusingDetector':             "_ZN5Cloud7NetData18GetAbusingDetectorEv",
    'cloud.getIsTest':                      "_ZN5Cloud8GameData9GetIsTestEv",
    'cloud.getIsTutorial':                  "_ZN5Cloud8GameData13GetIsTutorialEv",

    // ---- Global / lobby / packets ----
    'global.updatePacketReceiveTime':       "_ZN16SystemPacketSend23UpdatePacketReceiveTimeEf",
    'global.requestLogin':                  "_ZN16SystemPacketSend12RequestLoginEiRKSsS1_",
    'global.onReceive':                     "_ZN10LobbyScene9OnReceiveEiPKci",
    'global.testDeleteAccount':             "_ZN16SystemPacketSend17TestDeleteAccountEv",
    'global.deleteAccount':                 "_ZN16SystemPacketSend20RequestDeleteAccountEv",
    'global.chatting':                      "_ZN16SystemPacketSend8ChattingEhOSs",
    'global.getUserByOrder':                "_ZN15UserInfoManager14GetUserByOrderEh",
    'global.getUserByUserSeq':              "_ZN15UserInfoManager16GetUserByUserSeqEj",
    'global.resetPacketReceive':            "_ZN16SystemPacketSend22ResetPacketReceiveTimeEv",
    'global.sendPacket':                    "_ZN16SystemPacketSend10SendPacketEv",
    'global.addPacketData':                 "_ZN16SystemPacketSend13AddPacketDataIhEEvRKT_",
    'global.getTCPSocketManager':           "_ZN5Cloud7NetData19GetTCPSocketManagerEv",
    'global.changeNickname':                "_ZN16SystemPacketSend14ChangeNicknameEhPKch",
    'global.connectToGameServer':           "_ZN19SystemPacketReceive19ConnectToGameServerEv",
    'global.setPSAuthCode':                 "_ZN19SystemPacketReceive13SetPSAuthCodeEv",
    'global.toggleAbuseDetector':           "_ZN9GameScene21ToggleAbusingDetectorEb",
    'global.abuseDetectorOnSkill':          "_ZN15AbusingDetector10OnUseSkillERK14InGameNotiInfo",
    'global.sendPurchasePass':              "_ZN16SystemPacketSend16SendPurchasePassEjh",
    'global.sendPurchasePassTier':          "_ZN16SystemPacketSend20SendPurchasePassTierEjh",
    'global.purchaseHeroPackage':           "_ZN12UtilPurchase19PurchaseHeroPackageEih",
    'global.receiveReward':                 "_ZN12UIMilChoPass13ReceiveRewardEh",
    'global.sendReqPassReward':             "_ZN16SystemPacketSend17SendReqPassRewardEjjhhh",
    'global.sendReqUserPassData':           "_ZN16SystemPacketSend19SendReqUserPassDataEj",
    'global.sendKnockBack':                 "_ZN16SystemPacketSend13SendKnockBackEjN7cocos2d4Vec3E",
    'global.changeTeam':                    "_ZN16SystemPacketSend10ChangeTeamEv",
    'global.reportClanMark':                "_ZN16SystemPacketSend14ReportClanMarkEjj",
    'global.reportHackingUser':             "_ZN16SystemPacketSend17ReportHackingUserEjjh",
    'global.sendReqDailyBonus':             "_ZN16SystemPacketSend17SendReqDailyBonusEh",

    // ---- FMatch (custom-room admin / kick) ----
    //   Not present in older libMyGame.so builds. agent.ts must use
    //   findExportByName so the lookup degrades to a no-op if the symbol is
    //   missing, instead of failing the whole agent init.
    'fmatch.kickUserSlot':                  "_ZN16SystemPacketSend18FMatchKickUserSlotEh",

    // ---- Camera (Cloud::CameraData) ----
    'camera.getCamera':                     "_ZN5Cloud10CameraData9GetCameraEv",
    'camera.getCameraAngleX':               "_ZN5Cloud10CameraData15GetCameraAngleXEv",
    'camera.setCameraAngleX':               "_ZN5Cloud10CameraData15SetCameraAngleXEf",
    'camera.getCameraAngleY':               "_ZN5Cloud10CameraData15GetCameraAngleYEv",
    'camera.setCameraAngleY':               "_ZN5Cloud10CameraData15SetCameraAngleYEf",
    'camera.getCameraZoom':                 "_ZN5Cloud10CameraData13GetCameraZoomEv",
    'camera.setCameraZoom':                 "_ZN5Cloud10CameraData13SetCameraZoomEf",
    'camera.getCameraDistanceZ':            "_ZN5Cloud10CameraData18GetCameraDistanceZEv",
    'camera.getCameraDistanceY':            "_ZN5Cloud10CameraData18GetCameraDistanceYEv",
    'camera.getCameraRay':                  "_ZN5Cloud10CameraData12GetCameraRayEv",
    'camera.setCameraRayOrigin':            "_ZN5Cloud10CameraData18SetCameraRayOriginERKN7cocos2d4Vec3E",
    'camera.getCameraUser':                 "_ZN5Cloud10CameraData24GetCameraUserInformationEv",

    // ---- GameScene call stubs ----
    'call.changeGun':                       "_ZN9GameScene13CallChangeGunEh",
    'call.gameChangeGun':                   "_ZN9GameScene12ChangeWeaponEP9UserInfor",
    'call.touchGunEvent':                   "_ZN9GameScene13touchGunEventEPN7cocos2d3RefENS0_2ui6Widget14TouchEventTypeEh",
    'call.throw':                           "_ZN9GameScene9CallThrowEv",
    'call.jump':                            "_ZN9GameScene8CallJumpEv",
    'call.skill':                           "_ZN9GameScene9CallSkillEv",
    'call.zoom':                            "_ZN9GameScene8CallZoomEb",
    'call.reload':                          "_ZN9GameScene10CallReloadEv",
    'call.shootStart':                      "_ZN9GameScene14CallShootStartEv",
    'call.shootEnd':                        "_ZN9GameScene12CallShootEndEv",

    // ---- Map data (Cloud::MapData) ----
    'mapData.getMapType':                   "_ZN5Cloud7MapData10GetMapTypeEv",
    'mapData.getMode':                      "_ZN5Cloud7MapData7GetModeEv",
    'mapData.getRowCountSprite':            "_ZN5Cloud7MapData20GetMapRowCountSpriteEv",
    'mapData.getVisibleCountSprite':        "_ZN5Cloud7MapData24GetMapVisibleCountSpriteEv",

    // ---- Socket (TCPSocketManager) ----
    'socket.connect':                       "_ZN16TCPSocketManager7connectEP13SocketAddress",
    'socket.disconnect':                    "_ZN16TCPSocketManager10disconnectEi",
    'socket.disconnectAll':                 "_ZN16TCPSocketManager13disconnectAllEv",
    'socket.setCodeKey':                    "_ZN16TCPSocketManager10setCodeKeyEiPSsmRKSsS2_",

    // ---- Aim assist ----
    'assist.isAimAssist':                   "_ZNK9GameScene11IsAimAssistEv",
    'assist.AssistRequestInGameRoomUsers':  "_ZN16SystemPacketSend28AssistRequestInGameRoomUsersEv",
    'assist.SendAimAssistOption':           "_ZN16SystemPacketSend19SendAimAssistOptionEb",

    // ---- Rewarded ads (Paradiso::AdManager + SystemPacketSend) ----
    // Single-click ad-reward path: skip the actual ad playback by directly
    // sending the shop-AD reward packet (and firing the in-client reward
    // callback so any local UI / counter stays consistent).
    'ad.adsRequestShopADReward':            "_ZN16SystemPacketSend22AdsRequestShopADRewardEh",
    'ad.onRewarded':                        "_ZN8Paradiso9AdManager10OnRewardedEv",
    // Always-on `IsAvailable*` bypasses for daily / per-ad limits.
    'ad.isAvailableAds':                    "_ZNK8Paradiso9AdManager14IsAvailableAdsEv",
    'ad.isAvailableCount':                  "_ZNK8Paradiso9AdManager16IsAvailableCountEv",
    'ad.isAvailableTime':                   "_ZNK8Paradiso9AdManager15IsAvailableTimeEv",
    'ad.isAvailableInitCycle':              "_ZNK8Paradiso9AdManager20IsAvailableInitCycleEv",
    'ad.isAvailableShopADCount':            "_ZNK8Paradiso9AdManager22IsAvailableShopADCountEh",
    'ad.isAvailableShopADTime':             "_ZNK8Paradiso9AdManager21IsAvailableShopADTimeEh",
    'ad.isAvailableShopADInitCycle':        "_ZNK8Paradiso9AdManager26IsAvailableShopADInitCycleEh",
    'ad.isAvailableCountBattleRoyal':       "_ZNK8Paradiso9AdManager27IsAvailableCountBattleRoyalEv",
    'ad.isAvailableTimeBattleRoyal':        "_ZNK8Paradiso9AdManager26IsAvailableTimeBattleRoyalEv",
    'ad.isAvailableInitCycleBattleRoyal':   "_ZNK8Paradiso9AdManager31IsAvailableInitCycleBattleRoyalEv",
} as const;

// Convenience type for consumers that don't care about the literal types
export type Symbols = typeof _symbols;
export type EposOffset = typeof _eposOffset;
export type XaOffset = typeof _xaOffset;
export type AnOffset = typeof _anOffset;
export type XaPatch = typeof _xaPatch;
export type AnPatch = typeof _anPatch;

// =============================================================================
//  Collision validation
// -----------------------------------------------------------------------------
//  Two names mapping to the same byte offset is almost always a bug — one of
//  the entries silently reads the wrong field's bytes. The few legitimate
//  cases are explicitly allowlisted below:
//
//    1) Pure aliases — the same logical field exposed under a second name so
//       agent.ts and inj.ts can use their preferred spelling without diverging
//       the source-of-truth table.
//    2) Base/first-field pairs in `_anOffset` — `*-base` is the struct's start
//       address, and the first field inside that struct sits at +0x0, so they
//       resolve to the same numeric offset by design.
//
//  Anything else is a real collision and will throw at module load. That makes
//  layout drift (game update added/moved a field but the table missed a sister
//  entry) impossible to ship silently.
// =============================================================================

const _eposIntentionalAliases: ReadonlyArray<ReadonlySet<string>> = [
    new Set(['charkda', 'kda']),       // float — different scripts call it differently
    new Set(['char', 'sk']),            // byte
    new Set(['skillcool', 'sc']),       // float
    new Set(['kbdz', 'zr1']),           // knockback-z reused as "is being knocked" flag
];

const _anIntentionalAliases: ReadonlyArray<ReadonlySet<string>> = [
    new Set(['camera-base', 'pitch']),         // pitch is the first field of the camera struct
    new Set(['position-base', 'x']),           // x is the first field of the position struct
    new Set(['cash-base', 'dia']),             // dia is the first field of the cash struct
];

function assertNoUnexpectedCollisions(
    table: Readonly<Record<string, number>>,
    aliases: ReadonlyArray<ReadonlySet<string>>,
    label: string,
): void {
    const byOffset = new Map<number, string[]>();
    for (const [name, offset] of Object.entries(table)) {
        const bucket = byOffset.get(offset);
        if (bucket) bucket.push(name);
        else byOffset.set(offset, [name]);
    }
    const problems: string[] = [];
    for (const [offset, names] of byOffset) {
        if (names.length < 2) continue;
        const nameSet = new Set(names);
        const covered = aliases.some(allowed =>
            allowed.size === nameSet.size && [...allowed].every(n => nameSet.has(n))
        );
        if (!covered) {
            problems.push(`  0x${offset.toString(16).toUpperCase()}: ${names.join(', ')}`);
        }
    }
    if (problems.length) {
        throw new Error(
            `[offsets] Unexpected collision(s) in ${label}:\n${problems.join('\n')}\n` +
            `Fix the offset value(s) OR, if the overlap is intentional, ` +
            `add the name set to the matching *IntentionalAliases list in src/offsets.ts.`,
        );
    }
}

assertNoUnexpectedCollisions(_eposOffset, _eposIntentionalAliases, '_eposOffset');
assertNoUnexpectedCollisions(_anOffset, _anIntentionalAliases, '_anOffset');
