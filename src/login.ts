import { ipcRenderer } from "electron";

const $ = (id: string) => document.getElementById(id);

const loginLabel = (): string => {
    const lang = (navigator?.language || "en").slice(0, 2).toLowerCase();
    const map: { [k: string]: string } = { en: "Login", ko: "로그인", ja: "ログイン", zh: "登录" };
    return map[lang] || "Login";
};

const showApp = () => {
    $("selector-dev-mode")?.classList.remove("hide");
    $("selector-console")?.classList.remove("hide");
    $("selector-finder")?.classList.remove("hide");
    document.querySelectorAll<HTMLElement>('[class*="hide"]').forEach((el) => {
        if (el.classList.contains("selector")) el.classList.remove("hide");
    });
    $("login")?.classList.add("hide");
    $("app")?.classList.remove("hide");
};

const submitLogin = async () => {
    const idEl = $("login-id") as HTMLInputElement | null;
    const pwEl = $("login-pw") as HTMLInputElement | null;
    const errEl = $("logerr");
    const btn = $("logbtn") as HTMLButtonElement | null;
    if (!idEl || !pwEl || !errEl || !btn) return;
    const id = idEl.value.trim();
    const password = pwEl.value;
    errEl.textContent = "";
    if (!id || !password) {
        errEl.textContent = "ID / Password";
        return;
    }
    btn.disabled = true;
    try {
        const result: { ok: boolean; error?: string } = await ipcRenderer.invoke("auth:login", { id, password });
        if (result?.ok) {
            showApp();
        } else {
            errEl.textContent = result?.error || "Login failed";
        }
    } catch (e: any) {
        errEl.textContent = e?.message || "Login error";
    } finally {
        btn.disabled = false;
    }
};

const renderLoginForm = () => {
    const form = $("logform");
    if (!form) return;
    form.innerHTML = '' +
        '<input id="login-id" type="text" placeholder="ID" autocomplete="username" spellcheck="false" class="w-full text-center">' +
        '<input id="login-pw" type="password" placeholder="Password" autocomplete="current-password" class="w-full text-center">' +
        '<button id="logbtn" class="w-full"></button>' +
        '<p id="logerr" class="w-full text-center"></p>' +
        '<a id="loglink" href="#" class="w-full text-center">Request access</a>';
    const btn = $("logbtn");
    if (btn) btn.textContent = loginLabel();
    const onKey = (e: Event) => { if ((e as KeyboardEvent).key === "Enter") void submitLogin(); };
    $("login-id")?.addEventListener("keydown", onKey);
    $("login-pw")?.addEventListener("keydown", onKey);
    btn?.addEventListener("click", () => void submitLogin());
    $("loglink")?.addEventListener("click", (e) => {
        e.preventDefault();
        ipcRenderer.send("open-web");
    });
};

ipcRenderer.on("updater-done", () => {
    $("updp")?.classList.add("hide");
    $("updbar")?.classList.add("hide");
    $("logform")?.classList.remove("hide");
    renderLoginForm();
    setTimeout(() => ($("login-id") as HTMLInputElement | null)?.focus(), 0);
});

const setIcon = () => {
    const img = document.querySelector<HTMLImageElement>("#login img");
    if (img) img.src = "./favicon.ico";
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setIcon);
} else {
    setIcon();
}
