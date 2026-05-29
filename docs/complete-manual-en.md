# 🐵 はぐるま Complete Manual (so easy a monkey can follow it)

🌐 **Language:** [한국어](./완전-설명서.md) · English · [日本語](./complete-manual-ja.md)

> This single document covers **everything from install to fixing every error**.
> No jargon — just do exactly what you see.
> In a hurry? Jump straight to the **[universal fix](#-when-in-doubt-start-here-universal-reset)**.

---

## 📑 Table of Contents
1. [What this program even does (30 sec)](#1-what-this-program-even-does)
2. [One-time install (most important)](#2-one-time-install-most-important)
3. [How to connect every time you play](#3-how-to-connect-every-time-you-play)
4. [What the labels and buttons mean](#4-what-the-labels-and-buttons-mean)
5. [🚨 Error message dictionary (all of them)](#5--error-message-dictionary-all-of-them)
6. [😱 When in doubt, start here (universal reset)](#-when-in-doubt-start-here-universal-reset)
7. [FAQ](#7-faq)

---

## 1. What this program even does

It runs a **fake phone (BlueStacks)** inside your PC, and the game (MilkChoco)
runs inside that. This program (はぐるま) "attaches" to that game.

Attaching is like **crossing 4 bridges in order**. You'll see these 4 rows on screen:

```
 ① ADB   →   ② Server   →   ③ Frida   →   ④ Session
 (dial up)   (install tool) (connect tool) (attach to game)
```

- When all 4 rows turn **green**, you're done 🎉
- If a row is **red**, that step is stuck → find it in section 5.

> 💡 **99% of the time the single `Auto Connect` button finishes ①②③ for you.**
> So once section 2 (install) is done right, it's usually just one click.

---

## 2. One-time install (most important)

> ⚠️ Skip **even one** of these 5 and it will NEVER connect. Do all of them slowly.

### ✅ 2-1. Install BlueStacks
1. Search the web for **`BlueStacks 5`** → download from the official site (bluestacks.com)
2. Install and launch it

### ✅ 2-2. Turn ON "ADB" in BlueStacks ⭐⭐⭐ (most commonly forgotten)
1. Click the **gear (⚙️ Settings)** at the bottom-right of BlueStacks
2. Click **`Advanced`** in the left list
3. Turn the **`Android Debug Bridge (ADB)`** switch **ON**
4. An address appears below — usually **`127.0.0.1:5555`**. Remember it.

### ✅ 2-3. Turn ON "Root" in BlueStacks ⭐⭐⭐
Installing the tool requires admin (root) permission.
1. On the same **`Advanced`** screen
2. Turn **`Root access`** **ON**
3. ⚠️ **After changing settings, fully close and reopen BlueStacks.** (won't apply otherwise)

### ✅ 2-4. Install the game (MilkChoco)
1. Open the **Play Store** inside BlueStacks
2. Search for **`MilkChoco`** → install

### ✅ 2-5. Add an antivirus (Windows Security) exclusion ⭐⭐ (or the program will vanish)
Because this is a game-attaching tool, antivirus may **mistake it for "bad software" and delete it on its own**.
1. Search the Start menu for **`Windows Security`** → open it
2. Click **`Virus & threat protection`**
3. **`Manage settings`** → scroll down to **`Exclusions` → `Add an exclusion`**
4. Choose **`Folder`** → add the **whole folder where はぐるま is installed**
5. (If you downloaded the game tool to a separate folder, add that too)

> 💬 How to tell: if the installed program disappears after a few days, or the
> "Server" step keeps failing, antivirus almost certainly deleted it. → Add the
> exclusion above, then reinstall.

### ✅ 2-6. Install はぐるま (this program)
1. Double-click the installer you received (`はぐるま-Setup-….exe`)
2. After install, launch it → **log in with your ID and password** (no access yet? use `Request access` on the login screen)

> 🎁 The game-attaching tool (frida-server) is **already bundled inside the program.**
> You don't download it separately — it installs automatically.

---

## 3. How to connect every time you play

> Order matters. Keep it: **BlueStacks first → game → program → button.**

1. 🟦 **Launch BlueStacks.**
2. 🥛 **Run MilkChoco** inside BlueStacks. (Getting to the lobby screen is safest.)
3. ⚙️ Launch **はぐるま** and log in.
4. Click **`Initialize`** in the left menu.
5. Click the **`Auto Connect`** button at the top 👈 **this one button is all you need**
6. Watch the **ADB → Server → Frida** rows turn **green** one by one.

### Turn on game features (after Frida is green)
7. Click **`Get Cookie`** → the cookie field fills in
8. Click **`Start Agent`** → when **Session** turns green, you're ready 🎉

> 📌 Leave the serial field at its default `127.0.0.1:5555`.
> If you run multiple BlueStacks instances or the address differs, use the one from 2-2.

---

## 4. What the labels and buttons mean

### Status rows (a light shows the state)
| Row | Which step? | Green means? |
|---|---|---|
| **ADB** | PC ↔ emulator dial-up | emulator found |
| **Server** | install + run the tool on the emulator | tool is running |
| **Frida** | PC connects to that tool | connected |
| **Session** | actually attached to the game | ready to use features |

Light colors: 🟡 yellow = in progress / 🟢 green = success / 🔴 red = failed

### Buttons
| Button | What it does | Use it normally? |
|---|---|---|
| **Auto Connect** | runs ADB + Server + Frida automatically, in order | ⭐ just use this |
| Connect ADB | connect ADB only | only to inspect a stuck step |
| Connect Serial | (Wi-Fi mode) ADB connect | rarely used |
| Start Server | start the server only | ditto |
| Connect Frida | connect Frida only | ditto |
| Download / Upload Server | get/push the tool manually | special cases only (usually not needed) |
| Get Cookie | fetch the game cookie | once after connecting |
| Start Agent | attach features to the game | once after connecting |

---

## 5. 🚨 Error message dictionary (all of them)

Find the **exact red text** on screen in the lists below.

### 🔑 At login
Login uses an **ID + password**. (First time? Click **`Request access`** on the login window to request access.)

| Text on screen | Meaning | Fix |
|---|---|---|
| ID / Password | ID or password field is empty | Fill in both fields. |
| Login failed | login rejected | Wrong ID/password, or no access. Re-enter carefully. |
| HTTP 401 / 403 | authentication denied | Account not approved / no permission. Use `Request access` or contact the admin. |
| HTTP 500 etc. (HTTP + number) | server error | Our server's problem. Try again shortly. |
| network error | no internet connection | Check internet, toggle Wi-Fi, retry shortly. |
| Login error | unknown login error | Restart the program and retry. If it persists, reinstall. |

### 🟦 ① ADB row is red
| Message | Meaning | Fix |
|---|---|---|
| No emulator found. Enable ADB in BlueStacks... | emulator not found | Confirm **2-2 (turn on ADB)**. Make sure BlueStacks is running. |
| Failed to connect to adb | ADB connect failed | **Restart** BlueStacks and retry. Check the address (`127.0.0.1:5555`). |
| Failed to get ip address | couldn't get IP | (Wi-Fi mode only) Just use **`Auto Connect`** with the default serial. |

### 🟩 ② Server row is red
| Message | Meaning | Fix |
|---|---|---|
| ADB not connected | ADB isn't done first | Do ① ADB first. Press `Auto Connect` again. |
| Failed to get arch | couldn't detect device type | Restart BlueStacks and retry. |
| Cannot find frida server | bundled tool file missing | **Likely deleted by antivirus** → add exclusion (2-5) then **reinstall**. |
| Failed to deploy frida server | couldn't copy tool to emulator | Free up emulator storage, restart BlueStacks, retry. |
| Frida permissions denied | permission denied | **Root (2-3) wasn't turned on.** Turn it on and **restart BlueStacks**. |
| Frida server crashed | tool shut down | Restart BlueStacks → start over. |
| Failed to start frida server | tool failed to launch | Check root above + restart BlueStacks. |

### 🟪 ③ Frida row is red
| Message | Meaning | Fix |
|---|---|---|
| ADB not connected | ADB isn't done first | Press `Auto Connect` again. |
| Failed to connect to frida server | couldn't reach the tool | Server may have just started. **Wait ~5 sec, press `Connect Frida` again.** (`Auto Connect` retries on its own.) |
| Frida server crashed | tool shut down mid-way | Restart BlueStacks → start over. |

### 🟧 ④ Session row is red
| Message | Meaning | Fix |
|---|---|---|
| Frida not connected | Frida isn't done first | Get Frida green first, then click. |
| Failed to get cookie | couldn't fetch cookie | Make sure the **game is running (in the lobby)**, then retry. |
| Failed to start agent | couldn't attach features | Do `Get Cookie` first → then `Start Agent`. Still failing? Restart the game. If the game/program versions don't match, update both to the latest. |
| Session disposed | connection to the game dropped | Game closed or crashed. Relaunch the game and start over. |

---

## 😱 When in doubt, start here (universal reset)

**This sequence fixes about 90% of any error. Do it top to bottom.**

1. 🥛 **Fully close the MilkChoco game**
2. 🟦 **Fully close BlueStacks** (also from the taskbar/tray)
3. ⚙️ **Close はぐるま too**
4. 🟦 **Open BlueStacks again**
5. 🔍 In BlueStacks Settings → Advanced, re-check **ADB ON / Root ON** (2-2, 2-3)
6. 🥛 **Run MilkChoco → get to the lobby**
7. ⚙️ **Launch はぐるま → log in → Initialize → `Auto Connect`**
8. Still stuck?
   - **Reboot** the PC once
   - Re-check the **antivirus exclusion (2-5)** + **reinstall** the program
   - Update the program and the game to the **latest version**

---

## 7. FAQ

**Q. Do I need to lower my firewall?**
A. ❌ No. The Frida connection happens entirely inside your PC (localhost), so the firewall is irrelevant.
   The real culprit is usually **antivirus (2-5)**. A firewall prompt only appears if you use the "mobile controller" feature, and then you just click **Allow**.

**Q. Difference between `Auto Connect` and the buttons below it?**
A. `Auto Connect` presses those buttons **automatically, in order**. Normally just use this.

**Q. Do I have to download frida-server every time?**
A. ❌ No. It's bundled and installs automatically. The Download/Upload buttons are advanced and you don't need to touch them.

**Q. Once connected, does it stay connected?**
A. It drops when the game or BlueStacks closes. Just press **`Auto Connect`** again next time.

**Q. The program keeps disappearing.**
A. Antivirus is deleting it. Be sure to **add the exclusion (2-5)**.

---

🐵 **TL;DR:** Do the install (section 2) right → open BlueStacks + game → `Auto Connect` → if stuck, [universal reset](#-when-in-doubt-start-here-universal-reset). Done!
