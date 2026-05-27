import https from "https";
import http from "http";
import { URL } from "url";

export const defaultWebUrl = "https://pixel-code-web.vercel.app";

export type LoginResult = {
    ok: boolean;
    error?: string;
    pixelId?: string;
    admin?: boolean;
};

export async function loginPixel(id: string, password: string): Promise<LoginResult> {
    const base = process.env.PIXEL_WEB_URL || defaultWebUrl;
    let url: URL;
    try {
        url = new URL("/api/pixel/login", base);
    } catch {
        return { ok: false, error: `invalid PIXEL_WEB_URL: ${base}` };
    }
    const body = JSON.stringify({ id, password });
    const transport = url.protocol === "http:" ? http : https;
    return new Promise<LoginResult>((resolve) => {
        const req = transport.request(
            url,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(body).toString()
                },
                timeout: 10000
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (c: Buffer) => chunks.push(c));
                res.on("end", () => {
                    const text = Buffer.concat(chunks).toString("utf8");
                    let data: any = {};
                    try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
                    const code = res.statusCode || 0;
                    if (code >= 200 && code < 300 && data?.ok) {
                        resolve({ ok: true, pixelId: data.pixelId, admin: !!data.admin });
                    } else {
                        resolve({ ok: false, error: data?.error || `HTTP ${code || "error"}` });
                    }
                });
            }
        );
        req.on("error", (e: any) => resolve({ ok: false, error: e?.message || "network error" }));
        req.on("timeout", () => { req.destroy(new Error("request timed out")); });
        req.write(body);
        req.end();
    });
}
