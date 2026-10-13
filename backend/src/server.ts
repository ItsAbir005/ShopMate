import "./instrument";
import http from "http";
import app from "./app";
import { initSocket } from "./config/socket";
import { printEnvChecklist } from "./utils/envChecklist";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

// Print startup environment checklist
printEnvChecklist();

// Create HTTP server from Express app (required for Socket.io)
const httpServer = http.createServer(app);

// Attach Socket.io to the HTTP server
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔌 Socket.io ready on ws://localhost:${PORT}`);
});
