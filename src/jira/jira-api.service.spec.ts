import {
  BadGatewayException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { JiraApiService } from './jira-api.service';
import { PreviewJiraDirectDto } from './dto/preview-jira-direct.dto';
import { ListJiraProjectsDto } from './dto/list-jira-projects.dto';
import { ExportJiraIssuesDto } from './dto/export-jira-issues.dto';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

const mkdirMock = mkdir as unknown as jest.Mock;
const writeFileMock = writeFile as unknown as jest.Mock;

const EXPORT_FIELDS = [
  'id',
  'key',
  'summary',
  'status',
  'assignee',
  'creator',
  'reporter',
  'priority',
  'issuetype',
  'created',
  'updated',
  'description',
];

const buildDto = (overrides: Partial<PreviewJiraDirectDto> = {}) => {
  const dto = new PreviewJiraDirectDto();
  dto.jiraUrl = overrides.jiraUrl ?? 'https://demo.atlassian.net';
  dto.email = overrides.email ?? 'user@example.com';
  dto.apiKey = overrides.apiKey ?? 'token';
  if (overrides.jql !== undefined) {
    dto.jql = overrides.jql;
  }
  if (overrides.limit !== undefined) {
    dto.limit = overrides.limit;
  }
  return dto;
};

const buildProjectsDto = (overrides: Partial<ListJiraProjectsDto> = {}) => {
  const dto = new ListJiraProjectsDto();
  dto.jiraUrl = overrides.jiraUrl ?? 'https://demo.atlassian.net';
  dto.email = overrides.email ?? 'user@example.com';
  dto.apiKey = overrides.apiKey ?? 'token';
  if (overrides.startAt !== undefined) {
    dto.startAt = overrides.startAt;
  }
  if (overrides.limit !== undefined) {
    dto.limit = overrides.limit;
  }
  return dto;
};

const buildExportDto = (overrides: Partial<ExportJiraIssuesDto> = {}) => {
  const dto = new ExportJiraIssuesDto();
  dto.jiraUrl = overrides.jiraUrl ?? 'https://demo.atlassian.net';
  dto.email = overrides.email ?? 'user@example.com';
  dto.apiKey = overrides.apiKey ?? 'token';
  if (overrides.limit !== undefined) {
    dto.limit = overrides.limit;
  }
  if (overrides.issueBatchSize !== undefined) {
    dto.issueBatchSize = overrides.issueBatchSize;
  }
  if (overrides.projectBatchSize !== undefined) {
    dto.projectBatchSize = overrides.projectBatchSize;
  }
  return dto;
};

describe('JiraApiService', () => {
  let service: JiraApiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new JiraApiService();
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns items on successful Jira response', async () => {
    const dto = buildDto({ limit: 2, jql: 'project = DEMO' });
    const jsonMock = jest.fn().mockResolvedValue({
      issues: [
        { id: '1', key: 'DEMO-1', fields: { summary: 'Summary 1', status: { name: 'To Do' } } },
        { id: '2', key: 'DEMO-2', fields: { summary: 'Summary 2', status: { name: 'In Progress' } } },
        { id: '3', key: 'DEMO-3', fields: { summary: 'Summary 3', status: { name: 'Done' } } },
      ],
    });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jsonMock,
    });

    const result = await service.preview(dto);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.atlassian.net/rest/api/3/search/jql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          queries: [
            {
              jql: dto.jql,
              query: dto.jql,
              startAt: 0,
              maxResults: dto.limit,
              fields: ['id', 'key', 'summary', 'status'],
            },
          ],
          fields: ['id', 'key', 'summary', 'status'],
        }),
      }),
    );
    expect(result).toEqual({
      count: 2,
      items: [
        { id: '1', key: 'DEMO-1', summary: 'Summary 1', status: 'To Do' },
        { id: '2', key: 'DEMO-2', summary: 'Summary 2', status: 'In Progress' },
      ],
    });
  });

  it('throws unauthorized for 401 status', async () => {
    const dto = buildDto();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Unauthorized' }),
    });

    await expect(service.preview(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws forbidden for 403 status', async () => {
    const dto = buildDto();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({ message: 'Forbidden' }),
    });

    await expect(service.preview(dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('wraps fetch errors in BadGatewayException', async () => {
    const dto = buildDto();
    fetchMock.mockRejectedValue(new Error('Network error'));

    await expect(service.preview(dto)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('returns projects on successful search', async () => {
    const dto = buildProjectsDto({ startAt: 5, limit: 2 });
    const projectsPayload = {
      values: [
        { id: '10000', key: 'DEMO', name: 'Demo project' },
        { id: '10001', key: 'OPS', name: 'Operations' },
      ],
      total: 10,
      isLast: false,
    };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(projectsPayload),
    });

    const result = await service.listProjects(dto);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.atlassian.net/rest/api/3/project/search?startAt=5&maxResults=2',
      expect.objectContaining({
        method: 'GET',
      }),
    );

    expect(result).toEqual({
      ok: true,
      source: 'jira:api',
      count: 2,
      total: 10,
      startAt: 5,
      limit: 2,
      isLast: false,
      projects: projectsPayload.values,
    });
  });

  it('throws unauthorized for listProjects when Jira returns 401', async () => {
    const dto = buildProjectsDto();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Unauthorized' }),
    });

    await expect(service.listProjects(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('exports project issues, respects limits, and writes export file', async () => {
    const dto = buildExportDto({ limit: 3, issueBatchSize: 2, projectBatchSize: 2 });

    const projectsPayload = {
      values: [
        { id: '10000', key: 'DEMO', name: 'Demo project' },
        { id: '10001', key: 'OPS', name: 'Operations' },
      ],
      total: 2,
      isLast: true,
      startAt: 0,
    };

    const demoIssuesPayload = {
      issues: [
        { id: '1', key: 'DEMO-1', fields: { summary: 'Summary 1' } },
        { id: '2', key: 'DEMO-2', fields: { summary: 'Summary 2' } },
      ],
      total: 2,
      startAt: 0,
      maxResults: 2,
    };

    const opsIssuesPayload = {
      issues: [{ id: '3', key: 'OPS-1', fields: { summary: 'Summary 3' } }],
      total: 1,
      startAt: 0,
      maxResults: 1,
    };

    const fetchResponses = [
      { ok: true, status: 200, json: jest.fn().mockResolvedValue(projectsPayload) },
      { ok: true, status: 200, json: jest.fn().mockResolvedValue(demoIssuesPayload) },
      { ok: true, status: 200, json: jest.fn().mockResolvedValue(opsIssuesPayload) },
    ];

    fetchResponses.forEach((response) => fetchMock.mockResolvedValueOnce(response));

    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(123456);

    const result = await service.exportProjectIssues(dto);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://demo.atlassian.net/rest/api/3/project/search?startAt=0&maxResults=2',
      expect.objectContaining({ method: 'GET' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://demo.atlassian.net/rest/api/3/search/jql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          queries: [
            {
              jql: 'project = "DEMO" ORDER BY updated DESC',
              query: 'project = "DEMO" ORDER BY updated DESC',
              startAt: 0,
              maxResults: 2,
              fields: EXPORT_FIELDS,
            },
          ],
          fields: EXPORT_FIELDS,
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://demo.atlassian.net/rest/api/3/search/jql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          queries: [
            {
              jql: 'project = "OPS" ORDER BY updated DESC',
              query: 'project = "OPS" ORDER BY updated DESC',
              startAt: 0,
              maxResults: 1,
              fields: EXPORT_FIELDS,
            },
          ],
          fields: EXPORT_FIELDS,
        }),
      }),
    );

    expect(mkdirMock).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('jira-issues-123456.json'),
      expect.any(String),
      'utf8',
    );

    expect(result).toEqual({
      ok: true,
      source: 'jira:api',
      issueCount: 3,
      projectCount: 2,
      limit: 3,
      truncated: false,
      file: expect.stringContaining('jira-issues-123456.json'),
    });

    const fileContents = writeFileMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(fileContents);
    expect(parsed.issueCount).toBe(3);
    expect(parsed.projectCount).toBe(2);
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0].issues).toHaveLength(2);
    expect(parsed.projects[1].issues).toHaveLength(1);
    expect(parsed.limit).toBe(3);

    dateSpy.mockRestore();
  });
});
