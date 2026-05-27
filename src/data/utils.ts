import { BrowserWindow } from "electron";
import path from "path";

// window creation
export const createWindow = (id:string, w:number, h:number, show:boolean = true, moreOpts:Electron.BrowserWindowConstructorOptions = {}, callback?:() => void) => {
    const win = new BrowserWindow({
        width: w,
        height: h,
        webPreferences: {
            preload:path.join(__dirname, '/../', 'preload.js'),
            nodeIntegration:true,
            contextIsolation:false
        },
        show: false,
        autoHideMenuBar: true,
        titleBarOverlay: false,
        icon: `public/favicon.ico`,
        ...moreOpts
    });

    win.loadFile(`public/${id}.html`);
    win.once("ready-to-show", () => {
        if(show) win.show();
        if(callback) callback();
    });
    return win;
};