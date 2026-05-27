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

ipcRenderer.on("draw", (event, data:DrawRect[]) => {
    const halfWidth = canvas.width / 2;
    const halfHeight = canvas.height / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAimCircle();
    const tracer = configg['esp-tracer'] || false;
    const threed = configg['esp-3d'] || false;
    const fontSize = +configg['esp-font-size'] || 16;
    const showTag = configg['esp-tag'] || false;
    const showBar = configg['esp-bar'] || false;
    const tagType = configg['esp-tag-type'] || 'both';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `${fontSize}px sans-serif`;
    for (const rect of data) {
        const value = (
            rect.isDead ? configg['esp-dead-color'] :
            rect.isMark ? configg['esp-mark-color'] :
            rect.isTeam ? configg['esp-team-color'] :
            configg['esp-color']) || 'red';
        ctx.fillStyle = value;
        ctx.strokeStyle = value;
        const upside = rect.upside.map(point => ({ x: halfWidth + point.x * halfWidth, y: halfHeight + point.y * halfHeight }));
        const downside = rect.downside.map(point => ({ x: halfWidth + point.x * halfWidth, y: halfHeight + point.y * halfHeight }));
        const Xs = [...upside.map(point => point.x), ...downside.map(point => point.x)];
        const Ys = [...upside.map(point => point.y), ...downside.map(point => point.y)];
        const minX = Math.min(...Xs), maxX = Math.max(...Xs), minY = Math.min(...Ys), maxY = Math.max(...Ys);
        const barHeight = showBar ? 10 : 0;
        if(showTag) {
            const onNumber = tagType === 'number' || tagType === 'both'
            const onNickname = tagType === 'nickname' || tagType === 'both'
            const tagText = `${onNumber ? `[${rect.number}]` : ""} ${onNickname ? rect.nickname : ""}`;
            ctx.fillText(tagText, minX + (maxX - minX) / 2, minY - barHeight);
        }
        if(showBar) {
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
        if(tracer){
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(minX + (maxX - minX) / 2, minY);
        }
        if(threed){
            const lastUpIdx = upside.length - 1;
            ctx.moveTo(upside[lastUpIdx].x, upside[lastUpIdx].y);
            for (const point of upside) {
                ctx.lineTo(point.x, point.y);
            }
            const lastDownIdx = downside.length - 1;
            ctx.moveTo(downside[lastDownIdx].x, downside[lastDownIdx].y);
            for (const point of downside) {
                ctx.lineTo(point.x, point.y);
            }
            upside.forEach((point, idx) => {
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(downside[idx].x, downside[idx].y);
            });
        } else {
            ctx.moveTo(minX, minY);
            ctx.lineTo(maxX, minY);
            ctx.lineTo(maxX, maxY);
            ctx.lineTo(minX, maxY);
            ctx.lineTo(minX, minY);
        }
        ctx.stroke();
        ctx.closePath();
    }
});

const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ipcRenderer.send("resize-layout");
};
resize();
window.addEventListener("resize", resize);
