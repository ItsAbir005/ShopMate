"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./instrument");
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const socket_1 = require("./config/socket");
const envChecklist_1 = require("./utils/envChecklist");
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
// Print startup environment checklist
(0, envChecklist_1.printEnvChecklist)();
// Create HTTP server from Express app (required for Socket.io)
const httpServer = http_1.default.createServer(app_1.default);
// Attach Socket.io to the HTTP server
(0, socket_1.initSocket)(httpServer);
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.io ready on ws://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map