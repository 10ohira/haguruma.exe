import express, { Express } from "express";
import http from "http";
import path from "path";
import { Server as IOServer } from "socket.io";

export interface ServerFacade {
  app: Express;
  server: http.Server;
  io: IOServer;
  start: (port: number) => void;
  stop: () => void;
}

export function createServer(getConfig: () => any, emit: (channel: string, ...args: any[]) => void, stateCb: (id: string, state: string, log: string) => void): ServerFacade {
  const app = express();
  const server = http.createServer(app);
  const io = new IOServer(server);

  // When compiled, __dirname is dist/core. Go up two levels to the project root, then into public.
  const publicDir = path.resolve(__dirname, "..", "..", "public");
  const routesDir = path.join(publicDir, "routes");

  app.use(express.static(publicDir));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(routesDir, 'main.html'))
  });
  app.get('/mobile', (_req, res) => {
    const cfg = getConfig();
    if(cfg && cfg['plugin-server-mobile-controller']){
      res.sendFile(path.join(routesDir, 'mobile_controller.html'))
    } else {
      res.send("Mobile controller disabled");
    }
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log("Socket connected");
    socket.on("disconnect", () => {
      // eslint-disable-next-line no-console
      console.log("Socket disconnected");
    });
    socket.on("gyro", (data) => {
      const cfg = getConfig();
      if(cfg && cfg['gyro-scope']) emit("gyro", data);
    });
    socket.on("key", (key: string) => {
      // eslint-disable-next-line no-console
      console.log("Keydown", key);
    });
  });

  function start(port: number) {
    stateCb('express', 'pending', 'Starting server');
    server.listen(port, () => {
      stateCb('express', 'active', `Started on port ${port}`);
    });
  }

  function stop() {
    stateCb('express', 'pending', 'Stopping server');
    server.close(() => {
      stateCb('express', 'error', 'Server stopped');
    });
  }

  return { app, server, io, start, stop };
}
