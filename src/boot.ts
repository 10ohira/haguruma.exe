import { ipcRenderer } from "electron";

/**
 * anonymous.exe — boot / loading sequence.
 *
 * Replaces the old operator login. On launch the renderer shows the boot
 * overlay: the Anonymous emblem, the manifesto typed out in a terminal font,
 * and a scripted boot log. When the main process signals it is ready
 * ("enter") — after the auto-updater check, or immediately in dev — and the
 * manifesto has finished, the overlay fades and the control panel is revealed.
 */

const $ = (id: string) => document.getElementById(id);

const MANIFESTO_CHAR_MS = 26;   // typing speed per character
const LINE_GAP_MS = 190;        // pause between lines
const MIN_BOOT_MS = 3200;       // never flash past the sequence too fast

const bootStart = Date.now();
let mainReady = false;          // main process said "enter"
let manifestoDone = false;
let finished = false;

// ---- boot bar clock -------------------------------------------------------
const pad = (n: number) => n.toString().padStart(2, "0");
const tickClock = () => {
    const d = new Date();
    const el = $("boot-clock");
    if (el) el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const clockTimer = setInterval(tickClock, 1000);
tickClock();

// ---- progress + log -------------------------------------------------------
let pct = 0;
const setPct = (v: number) => {
    pct = Math.max(pct, Math.min(100, Math.round(v)));
    const bar = $("boot-progress");
    const fill = bar?.querySelector("i") as HTMLElement | null;
    if (fill) fill.style.width = `${pct}%`;
    const pe = $("boot-pct");
    if (pe) pe.textContent = `${pct}%`;
    if (pct >= 100) bar?.classList.add("done");
};

const setStatus = (s: string) => {
    const el = $("boot-status");
    if (el) el.textContent = s;
};

const logLine = (html: string) => {
    const el = $("boot-log");
    if (el) el.innerHTML = `<b>&gt;</b> ${html}`;
};

// ---- manifesto typing -----------------------------------------------------
const typeManifesto = async () => {
    const root = $("manifesto");
    if (!root) return;
    const lines = Array.from(root.querySelectorAll<HTMLElement>(".line"));
    for (const line of lines) {
        const text = line.getAttribute("data-text") || "";
        line.classList.add("show");
        const caret = document.createElement("span");
        caret.className = "caret";
        line.appendChild(caret);
        for (let i = 0; i < text.length; i++) {
            caret.insertAdjacentText("beforebegin", text[i]);
            await delay(MANIFESTO_CHAR_MS);
        }
        // leave the caret only on the final line
        if (line !== lines[lines.length - 1]) caret.remove();
        await delay(LINE_GAP_MS);
    }
    manifestoDone = true;
};

// ---- scripted boot log (runs alongside the manifesto) ---------------------
const bootScript: Array<{ at: number; pct: number; status: string; html: string }> = [
    { at: 150,  pct: 6,  status: "BOOT",   html: "mounting <b>tmpfs</b> &hellip; ok" },
    { at: 700,  pct: 18, status: "INIT",   html: "loading kernel modules &hellip; <span class=\"green\">ok</span>" },
    { at: 1300, pct: 32, status: "NET",    html: "establishing <span class=\"blue\">secure channel</span> &hellip;" },
    { at: 2100, pct: 48, status: "CRYPTO", html: "negotiating <b>tor</b> circuit &hellip; <span class=\"green\">ok</span>" },
    { at: 2900, pct: 63, status: "MODULES",html: "injecting agent runtime &hellip;" },
    { at: 3700, pct: 78, status: "MODULES",html: "unpacking control panel &hellip; <span class=\"green\">ok</span>" },
    { at: 4500, pct: 88, status: "SYNC",   html: "we are legion &hellip;" },
];
const runBootScript = () => {
    for (const step of bootScript) {
        setTimeout(() => {
            if (finished) return;
            setPct(step.pct);
            setStatus(step.status);
            logLine(step.html);
        }, step.at);
    }
};

// ---- finish ---------------------------------------------------------------
const tryFinish = async () => {
    if (finished) return;
    if (!mainReady || !manifestoDone) return;
    const elapsed = Date.now() - bootStart;
    if (elapsed < MIN_BOOT_MS) {
        setTimeout(() => void tryFinish(), MIN_BOOT_MS - elapsed);
        return;
    }
    finished = true;
    setStatus("READY");
    setPct(100);
    logLine("access granted &mdash; <span class=\"green\">welcome</span>");
    await delay(360);
    const boot = $("boot");
    if (boot) {
        boot.classList.add("boot-out");
        setTimeout(() => {
            boot.style.display = "none";
            clearInterval(clockTimer);
        }, 560);
    }
};

// ---- ipc from main --------------------------------------------------------
ipcRenderer.on("enter", () => {
    mainReady = true;
    void tryFinish();
});
// real auto-updater signals — surface them in the boot log
ipcRenderer.on("update", () => {
    setStatus("UPDATE");
    logLine("update found &mdash; <span class=\"amber\">downloading</span> &hellip;");
});
ipcRenderer.on("download", (_e, progress: number) => {
    setStatus("UPDATE");
    logLine(`downloading update &hellip; <span class=\"amber\">${Math.round(progress)}%</span>`);
});

// ---- theme toggle ---------------------------------------------------------
const applyTheme = (theme: "light" | "dark") => {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.setAttribute("data-theme", "light");
    try { localStorage.setItem("theme", theme); } catch (e) {}
};
const initTheme = () => {
    const btn = $("theme-toggle");
    btn?.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        applyTheme(current === "dark" ? "light" : "dark");
    });
};

// ---- go -------------------------------------------------------------------
const start = () => {
    initTheme();
    runBootScript();
    void typeManifesto().then(() => {
        setPct(Math.max(pct, 90));
        if (!mainReady) { setStatus("WAIT"); logLine("waiting for <span class=\"blue\">secure channel</span> &hellip;"); }
        void tryFinish();
    });
    // safety net: if "enter" never arrives (unexpected), release after a while
    setTimeout(() => { if (!mainReady) { mainReady = true; void tryFinish(); } }, 12000);
};

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
} else {
    start();
}
