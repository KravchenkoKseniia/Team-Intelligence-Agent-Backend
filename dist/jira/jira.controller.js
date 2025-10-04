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
exports.JiraController = void 0;
const common_1 = require("@nestjs/common");
const jira_service_1 = require("./jira.service");
const preview_jira_dto_1 = require("./dto/preview-jira.dto");
let JiraController = class JiraController {
    constructor(jiraService) {
        this.jiraService = jiraService;
    }
    preview(dto) {
        return this.jiraService.preview(dto);
    }
};
exports.JiraController = JiraController;
__decorate([
    (0, common_1.Post)('preview'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [preview_jira_dto_1.PreviewJiraDto]),
    __metadata("design:returntype", void 0)
], JiraController.prototype, "preview", null);
exports.JiraController = JiraController = __decorate([
    (0, common_1.Controller)('mcp/jira'),
    __metadata("design:paramtypes", [jira_service_1.JiraService])
], JiraController);
//# sourceMappingURL=jira.controller.js.map