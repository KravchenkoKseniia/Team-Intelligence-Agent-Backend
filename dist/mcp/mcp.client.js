"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var HttpMcpClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpMcpClient = void 0;
const common_1 = require("@nestjs/common");
const mcp_types_1 = require("./mcp.types");
class McpHttpError extends Error {
    constructor(message, status, response) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = 'McpHttpError';
    }
}
let HttpMcpClient = HttpMcpClient_1 = class HttpMcpClient {
    constructor(config) {
        var _a, _b, _c, _d;
        this.logger = new common_1.Logger(HttpMcpClient_1.name);
        this.baseUrl = ((_a = config.baseUrl) !== null && _a !== void 0 ? _a : '').trim().replace(/\/+$/, '');
        this.apiKey = config.apiKey;
        this.apiKeyHeader = (_b = config.apiKeyHeader) === null || _b === void 0 ? void 0 : _b.trim();
        this.timeoutMs = (_c = config.timeoutMs) !== null && _c !== void 0 ? _c : 30000;
        this.invokePathTemplate = (_d = config.invokePathTemplate) === null || _d === void 0 ? void 0 : _d.trim();
        if (!this.baseUrl) {
            this.logger.warn('MCP base URL is not configured. MCP calls will fail until it is set.');
        }
    }
    async invoke(toolName, args) {
        var _a;
        if (!toolName) {
            throw new Error('toolName is required for MCP invocation');
        }
        if (!this.baseUrl) {
            const error = new Error('MCP base URL is not configured');
            error.status = 500;
            throw error;
        }
        const { url, body } = this.buildRequest(toolName, args);
        const headers = this.buildHeaders(toolName);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const payload = await this.parseResponse(response);
            if (!response.ok) {
                throw new McpHttpError(this.errorMessage(response.status, payload), response.status, payload);
            }
            return ((_a = this.extractResult(payload)) !== null && _a !== void 0 ? _a : undefined);
        }
        catch (error) {
            if (this.isAbortError(error)) {
                throw new McpHttpError(`MCP request aborted after ${this.timeoutMs}ms`, 504);
            }
            if (error instanceof McpHttpError) {
                throw error;
            }
            this.logger.error(`Unexpected MCP error for tool "${toolName}": ${error}`);
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    buildRequest(toolName, args) {
        if (this.invokePathTemplate) {
            const path = this.invokePathTemplate.replace('{toolName}', encodeURIComponent(toolName));
            const url = this.createUrl(path);
            return { url, body: args };
        }
        return {
            url: this.baseUrl,
            body: {
                tool: toolName,
                arguments: args,
            },
        };
    }
    buildHeaders(toolName) {
        const headers = {
            'Content-Type': 'application/json',
            'X-MCP-Tool': toolName,
        };
        if (this.apiKey) {
            if (this.apiKeyHeader && this.apiKeyHeader.toLowerCase() !== 'authorization') {
                headers[this.apiKeyHeader] = this.apiKey;
            }
            else {
                headers.Authorization = /^Bearer\s/i.test(this.apiKey)
                    ? this.apiKey
                    : `Bearer ${this.apiKey}`;
            }
        }
        return headers;
    }
    createUrl(path) {
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
        return new URL(normalizedPath, `${base}`).toString();
    }
    async parseResponse(response) {
        const text = await response.text();
        if (!text) {
            return null;
        }
        try {
            return JSON.parse(text);
        }
        catch (error) {
            throw new McpHttpError('Failed to parse MCP response as JSON', response.status || 500, text);
        }
    }
    extractResult(payload) {
        if (payload && typeof payload === 'object') {
            const maybeRecord = payload;
            if ('result' in maybeRecord) {
                return maybeRecord.result;
            }
            if ('data' in maybeRecord) {
                return maybeRecord.data;
            }
        }
        return payload;
    }
    errorMessage(status, payload) {
        if (payload && typeof payload === 'object') {
            const message = payload.message;
            if (message) {
                return message;
            }
        }
        return `MCP gateway responded with status ${status}`;
    }
    isAbortError(error) {
        return (!!error &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'AbortError');
    }
};
exports.HttpMcpClient = HttpMcpClient;
exports.HttpMcpClient = HttpMcpClient = HttpMcpClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(mcp_types_1.MCP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], HttpMcpClient);
//# sourceMappingURL=mcp.client.js.map