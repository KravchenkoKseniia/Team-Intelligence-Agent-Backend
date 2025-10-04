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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JiraService = exports.JIRA_SEARCH_TOOL = void 0;
const common_1 = require("@nestjs/common");
const mcp_types_1 = require("../mcp/mcp.types");
const preview_jira_dto_1 = require("./dto/preview-jira.dto");
exports.JIRA_SEARCH_TOOL = 'jira.search';
const LOG_PREFIX = '[MCP:Jira]';
const MAX_LOG_LENGTH = 1000000;
const MCP_TIMEOUT_MS = 25000;
class McpTimeoutError extends Error {
    constructor() {
        super('MCP request timed out');
    }
}
let JiraService = class JiraService {
    constructor(mcpClient) {
        this.mcpClient = mcpClient;
    }
    async preview(dto) {
        var _a, _b;
        const jql = ((_a = dto.jql) === null || _a === void 0 ? void 0 : _a.trim()) || preview_jira_dto_1.DEFAULT_JQL;
        const limit = (_b = dto.limit) !== null && _b !== void 0 ? _b : preview_jira_dto_1.DEFAULT_LIMIT;
        const args = {
            jiraUrl: dto.jiraUrl,
            apiKey: dto.apiKey,
            jql,
            limit,
        };
        const response = await this.invokeWithTimeout(exports.JIRA_SEARCH_TOOL, args).catch((error) => this.handleMcpError(error));
        this.logRawResponse(response);
        const issues = Array.isArray(response === null || response === void 0 ? void 0 : response.issues)
            ? response.issues.slice(0, limit)
            : [];
        const items = issues.map((issue) => {
            var _a, _b;
            return ({
                id: issue.id,
                key: issue.key,
                summary: (_b = (_a = issue.fields) === null || _a === void 0 ? void 0 : _a.summary) !== null && _b !== void 0 ? _b : '',
            });
        });
        return {
            ok: true,
            source: 'mcp:jira',
            count: items.length,
            items,
        };
    }
    async invokeWithTimeout(toolName, args) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new McpTimeoutError());
            }, MCP_TIMEOUT_MS);
            this.mcpClient
                .invoke(toolName, args)
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    handleMcpError(error) {
        if (error instanceof common_1.HttpException) {
            throw error;
        }
        if (error instanceof McpTimeoutError) {
            throw new common_1.BadGatewayException('MCP request timed out');
        }
        const status = this.extractStatus(error);
        if (status === common_1.HttpStatus.UNAUTHORIZED) {
            throw new common_1.UnauthorizedException('Invalid Jira credentials');
        }
        if (status === common_1.HttpStatus.FORBIDDEN) {
            throw new common_1.ForbiddenException('Access to Jira resource is forbidden');
        }
        throw new common_1.BadGatewayException('Failed to reach MCP Jira integration');
    }
    extractStatus(error) {
        var _a;
        if (typeof error === 'object' && error !== null) {
            const maybeStatus = (_a = error.status) !== null && _a !== void 0 ? _a : error.statusCode;
            if (typeof maybeStatus === 'number') {
                return maybeStatus;
            }
        }
        return undefined;
    }
    logRawResponse(response) {
        var _a;
        try {
            const serialized = (_a = JSON.stringify(response !== null && response !== void 0 ? response : null)) !== null && _a !== void 0 ? _a : 'null';
            const truncated = serialized.length > MAX_LOG_LENGTH
                ? `${serialized.slice(0, MAX_LOG_LENGTH)}…`
                : serialized;
            console.log(`${LOG_PREFIX} Raw response:`, truncated);
        }
        catch (serializationError) {
            console.warn(`${LOG_PREFIX} Failed to serialize MCP response`, serializationError);
        }
    }
};
exports.JiraService = JiraService;
exports.JiraService = JiraService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(mcp_types_1.MCP_CLIENT)),
    __metadata("design:paramtypes", [Object])
], JiraService);
//# sourceMappingURL=jira.service.js.map