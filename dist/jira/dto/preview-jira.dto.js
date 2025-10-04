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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewJiraDto = exports.DEFAULT_LIMIT = exports.DEFAULT_JQL = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.DEFAULT_JQL = 'order by created desc';
exports.DEFAULT_LIMIT = 3;
class PreviewJiraDto {
    constructor() {
        this.jql = exports.DEFAULT_JQL;
        this.limit = exports.DEFAULT_LIMIT;
    }
}
exports.PreviewJiraDto = PreviewJiraDto;
__decorate([
    (0, class_validator_1.IsUrl)({ require_tld: true, require_protocol: true }),
    __metadata("design:type", String)
], PreviewJiraDto.prototype, "jiraUrl", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 2048),
    __metadata("design:type", String)
], PreviewJiraDto.prototype, "apiKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 5000),
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value : exports.DEFAULT_JQL)),
    __metadata("design:type", String)
], PreviewJiraDto.prototype, "jql", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? exports.DEFAULT_LIMIT : parsed;
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], PreviewJiraDto.prototype, "limit", void 0);
//# sourceMappingURL=preview-jira.dto.js.map