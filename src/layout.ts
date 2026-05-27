import { ipcRenderer } from "electron"

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let configg:Config = ipcRenderer.sendSync("get-config");
ipcRenderer.on("init-config", (event, config:Config) => {configg = config;});

canvas.style.outlineColor = configg['esp-color'] || 'red';

let aimCircle:{radius:number;color:string;active:boolean}|null = null;
let aimCircleClearAt = 0;
const AIM_CIRCLE_TIMEOUT = 200;

ipcRenderer.on("config", (event, id:string, value:any) => {
    configg[id] = value;
    if(id === 'esp-color') {
        canvas.style.outlineColor = value;
    };
});

ipcRenderer.on("clear", (event) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

ipcRenderer.on("aim-circle", (event, data:{radius:number;color:string;active:boolean}) => {
    aimCircle = data;
    aimCircleClearAt = Date.now() + AIM_CIRCLE_TIMEOUT;
    if(!configg['esp']){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawAimCircle();
    }
});

const drawAimCircle = () => {
    if(!aimCircle || aimCircle.radius <= 0) return;
    if(Date.now() > aimCircleClearAt){ aimCircle = null; return; }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.save();
    ctx.strokeStyle = aimCircle.color;
    ctx.lineWidth = aimCircle.active ? 2 : 1;
    ctx.globalAlpha = aimCircle.active ? 1 : 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, aimCircle.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
};

// Reusable scratch arrays so the hot-path draw avoids per-rect allocations.
const scratchUpX: number[] = [];
const scratchUpY: number[] = [];
const scratchDnX: number[] = [];
const scratchDnY: number[] = [];

ipcRenderer.on("draw", (event, data:DrawRect[]) => {
    const w = canvas.width;
    const h = canvas.height;
    const halfWidth = w / 2;
    const halfHeight = h / 2;
    ctx.clearRect(0, 0, w, h);
    drawAimCircle();
    const tracer = configg['esp-tracer'] || false;
    const threed = configg['esp-3d'] || false;
    const fontSize = +configg['esp-font-size'] || 16;
    const showTag = configg['esp-tag'] || false;
    const showBar = configg['esp-bar'] || false;
    const tagType = configg['esp-tag-type'] || 'both';
    const onNumber = showTag && (tagType === 'number' || tagType === 'both');
    const onNickname = showTag && (tagType === 'nickname' || tagType === 'both');
    const colorDefault = configg['esp-color'] || 'red';
    const colorTeam = configg['esp-team-color'] || colorDefault;
    const colorMark = configg['esp-mark-color'] || colorDefault;
    const colorDead = configg['esp-dead-color'] || colorDefault;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `${fontSize}px sans-serif`;
    for (let r = 0; r < data.length; r++) {
        const rect = data[r];
        const value = rect.isDead ? colorDead
            : rect.isMark ? colorMark
            : rect.isTeam ? colorTeam
            : colorDefault;
        ctx.fillStyle = value;
        ctx.strokeStyle = value;

        const up = rect.upside;
        const dn = rect.downside;
        const upLen = up.length;
        const dnLen = dn.length;

        // Project + compute bbox in a single pass; no spreads, no temp arrays.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        if (threed) {
            scratchUpX.length = upLen; scratchUpY.length = upLen;
            scratchDnX.length = dnLen; scratchDnY.length = dnLen;
            for (let i = 0; i < upLen; i++) {
                const px = halfWidth + up[i].x * halfWidth;
                const py = halfHeight + up[i].y * halfHeight;
                scratchUpX[i] = px; scratchUpY[i] = py;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
            }
            for (let i = 0; i < dnLen; i++) {
                const px = halfWidth + dn[i].x * halfWidth;
                const py = halfHeight + dn[i].y * halfHeight;
                scratchDnX[i] = px; scratchDnY[i] = py;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
            }
        } else {
            for (let i = 0; i < upLen; i++) {
                const px = halfWidth + up[i].x * halfWidth;
                const py = halfHeight + up[i].y * halfHeight;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
            }
            for (let i = 0; i < dnLen; i++) {
                const px = halfWidth + dn[i].x * halfWidth;
                const py = halfHeight + dn[i].y * halfHeight;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
            }
        }

        const barHeight = showBar ? 10 : 0;
        if (showTag) {
            const tagText = `${onNumber ? `[${rect.number}]` : ""} ${onNickname ? rect.nickname : ""}`;
            ctx.fillText(tagText, minX + (maxX - minX) / 2, minY - barHeight);
        }
        if (showBar) {
            const hpPerc = rect.hp / rect.total;
            const barPerc = rect.barrier / rect.total;
            const barWidth = maxX - minX;
            const barY = minY - barHeight;
            const hpWidth = barWidth * hpPerc;
            const barrerWidth = barWidth * barPerc;
            ctx.strokeRect(minX, barY, barWidth, barHeight);
            ctx.fillRect(minX, barY, hpWidth, barHeight);
            ctx.globalAlpha = 0.8;
            ctx.fillRect(minX + hpWidth, barY, barrerWidth, barHeight);
            ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        if (tracer) {
            ctx.moveTo(halfWidth, 0);
            ctx.lineTo(minX + (maxX - minX) / 2, minY);
        }
        if (threed) {
            ctx.moveTo(scratchUpX[upLen - 1], scratchUpY[upLen - 1]);
            for (let i = 0; i < upLen; i++) ctx.lineTo(scratchUpX[i], scratchUpY[i]);
            ctx.moveTo(scratchDnX[dnLen - 1], scratchDnY[dnLen - 1]);
            for (let i = 0; i < dnLen; i++) ctx.lineTo(scratchDnX[i], scratchDnY[i]);
            const verts = upLen < dnLen ? upLen : dnLen;
            for (let i = 0; i < verts; i++) {
                ctx.moveTo(scratchUpX[i], scratchUpY[i]);
                ctx.lineTo(scratchDnX[i], scratchDnY[i]);
            }
        } else {
            ctx.moveTo(minX, minY);
            ctx.lineTo(maxX, minY);
            ctx.lineTo(maxX, maxY);
            ctx.lineTo(minX, maxY);
            ctx.lineTo(minX, minY);
        }
        ctx.stroke();
    }
});

const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ipcRenderer.send("resize-layout");
};
resize();
window.addEventListener("resize", resize);
