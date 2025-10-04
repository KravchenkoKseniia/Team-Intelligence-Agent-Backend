"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LocalMcpClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalMcpClient = void 0;
const common_1 = require("@nestjs/common");
let LocalMcpClient = LocalMcpClient_1 = class LocalMcpClient {
    constructor() {
        this.logger = new common_1.Logger(LocalMcpClient_1.name);
    }
    async invoke(toolName, _args) {
        this.logger.warn(`LocalMcpClient invoked without implementation for tool "${toolName}"`);
        throw new Error('Local MCP client is not implemented. Provide a concrete MCP integration.');
    }
};
exports.LocalMcpClient = LocalMcpClient;
exports.LocalMcpClient = LocalMcpClient = LocalMcpClient_1 = __decorate([
    (0, common_1.Injectable)()
], LocalMcpClient);
//# sourceMappingURL=mcp.client.js.map