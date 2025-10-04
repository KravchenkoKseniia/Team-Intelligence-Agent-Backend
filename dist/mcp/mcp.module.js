"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpModule = void 0;
const common_1 = require("@nestjs/common");
const mcp_client_1 = require("./mcp.client");
const mcp_types_1 = require("./mcp.types");
const mcpConfigProvider = {
    provide: mcp_types_1.MCP_CONFIG,
    useFactory: () => {
        var _a;
        const timeoutEnv = process.env.MCP_HTTP_TIMEOUT;
        const timeoutMs = timeoutEnv ? Number(timeoutEnv) : undefined;
        return {
            baseUrl: (_a = process.env.MCP_BASE_URL) !== null && _a !== void 0 ? _a : '',
            apiKey: process.env.MCP_API_KEY,
            apiKeyHeader: process.env.MCP_API_KEY_HEADER,
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
            invokePathTemplate: process.env.MCP_INVOKE_PATH_TEMPLATE,
        };
    },
};
let McpModule = class McpModule {
};
exports.McpModule = McpModule;
exports.McpModule = McpModule = __decorate([
    (0, common_1.Module)({
        providers: [
            mcpConfigProvider,
            {
                provide: mcp_types_1.MCP_CLIENT,
                useClass: mcp_client_1.HttpMcpClient,
            },
        ],
        exports: [mcp_types_1.MCP_CLIENT],
    })
], McpModule);
//# sourceMappingURL=mcp.module.js.map