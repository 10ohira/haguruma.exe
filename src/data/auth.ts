import https from "https";
import http from "http";
import { URL } from "url";

export const defaultWebUrl = "https://haguruma.vercel.app";

export type LoginResult = {
    ok: boolean;
    error?: string;
    operatorId?: string;
    admin?: boolean;
};

export async function loginOperator(id: string, password: string): Promise<LoginResult> {
    const base = process.env.HAGURUMA_WEB_URL || defaultWebUrl;
    let url: URL;
    try {
        url = new URL("/api/haguruma/login", base);
    } catch {
        return { ok: false, error: `invalid HAGURUMA_WEB_URL: ${base}` };
    }
    const body = JSON.stringify({ operatorId: id, password });
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
                        resolve({ ok: true, operatorId: data.operatorId, admin: !!data.admin });
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
