import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { DEFAULT_JQL, DEFAULT_LIMIT, PreviewJiraDto } from './dto/preview-jira.dto';
import { JiraService, JIRA_SEARCH_TOOL } from './jira.service';
import { McpClient } from '../mcp/mcp.types';

describe('JiraService', () => {
  let service: JiraService;
  let mcpClient: jest.Mocked<McpClient>;

  beforeEach(() => {
    mcpClient = {
      invoke: jest.fn(),
    };
    service = new JiraService(mcpClient);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildDto = (overrides: Partial<PreviewJiraDto> = {}) => {
    const dto = new PreviewJiraDto();
    dto.jiraUrl = overrides.jiraUrl ?? 'https://demo.atlassian.net';
    dto.apiKey = overrides.apiKey ?? 'token';
    if (overrides.jql !== undefined) {
      dto.jql = overrides.jql;
    }
    if (overrides.limit !== undefined) {
      dto.limit = overrides.limit;
    }
    return dto;
  };

  it('returns preview items on success', async () => {
    const dto = buildDto();
    const invokeResponse = {
      issues: [
        { id: '100', key: 'PRJ-1', fields: { summary: 'Test summary' } },
        { id: '101', key: 'PRJ-2', fields: { summary: undefined } },
      ],
    };
    mcpClient.invoke.mockResolvedValue(invokeResponse);

    const result = await service.preview(dto);

    expect(mcpClient.invoke).toHaveBeenCalledWith(JIRA_SEARCH_TOOL, {
      jiraUrl: dto.jiraUrl,
      apiKey: dto.apiKey,
      jql: DEFAULT_JQL,
      limit: DEFAULT_LIMIT,
    });
    expect(result).toEqual({
      ok: true,
      source: 'mcp:jira',
      count: 2,
      items: [
        { id: '100', key: 'PRJ-1', summary: 'Test summary', status: '' },
        { id: '101', key: 'PRJ-2', summary: '', status: '' },
      ],
    });
  });

  it('returns empty preview when no issues found', async () => {
    const dto = buildDto({ limit: 2 });
    mcpClient.invoke.mockResolvedValue({ issues: [] });

    const result = await service.preview(dto);

    expect(result).toEqual({
      ok: true,
      source: 'mcp:jira',
      count: 0,
      items: [],
    });
  });

  it('maps MCP errors to HTTP exceptions', async () => {
    const dto = buildDto();
    mcpClient.invoke.mockRejectedValueOnce({ status: 401, message: 'Unauthorized' });
    await expect(service.preview(dto)).rejects.toBeInstanceOf(UnauthorizedException);

    mcpClient.invoke.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(service.preview(dto)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
