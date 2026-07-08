// ============================================
// TEST: Defense & Copilot Router
// ============================================

const mockVerifyToken = jest.fn();
const mockRespond = jest.fn();
const mockHandleDefenseSessionInit = jest.fn();
const mockHandleDefenseSessionAnswer = jest.fn();
const mockHandleDefenseSessionClose = jest.fn();
const mockHandleCopilotSuggest = jest.fn();
const mockHandleGetCompetencyProfile = jest.fn();

jest.mock('../lambda/utils/auth-helpers', () => ({
  verifyToken: (header: any) => mockVerifyToken(header),
}));

jest.mock('../lambda/utils/response', () => ({
  respond: (status: number, body: any) => mockRespond(status, body),
}));

jest.mock('../lambda/handlers/defense', () => ({
  handleDefenseSessionInit: (args: any) => mockHandleDefenseSessionInit(args),
  handleDefenseSessionAnswer: (args: any) => mockHandleDefenseSessionAnswer(args),
  handleDefenseSessionClose: (args: any) => mockHandleDefenseSessionClose(args),
  handleCopilotSuggest: (args: any) => mockHandleCopilotSuggest(args),
  handleGetCompetencyProfile: (args: any) => mockHandleGetCompetencyProfile(args),
}));

import { handler } from '../lambda/handlers/defense-router';

describe('Defense & Copilot Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRespond.mockImplementation((status, body) => ({ statusCode: status, body: JSON.stringify(body) }));
  });

  it('returns 401 if user is unauthorized', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Invalid token'));

    const event = {
      httpMethod: 'POST',
      path: '/explore/defense/session',
      headers: { Authorization: 'Bearer invalid' },
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('routes POST /explore/defense/session to handleDefenseSessionInit', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');
    mockHandleDefenseSessionInit.mockResolvedValueOnce({ sessionId: 'session-456' });

    const event = {
      httpMethod: 'POST',
      path: '/explore/defense/session',
      headers: { Authorization: 'Bearer valid-token' },
      body: JSON.stringify({ jobId: 'job-789' }),
    };

    const result = await handler(event);
    expect(mockHandleDefenseSessionInit).toHaveBeenCalledWith({ userId: 'user-123', jobId: 'job-789' });
    expect(result.statusCode).toBe(200);
  });

  it('routes POST /explore/defense/answer to handleDefenseSessionAnswer', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');
    mockHandleDefenseSessionAnswer.mockResolvedValueOnce({ next_question: 'Why RAG?' });

    const event = {
      httpMethod: 'POST',
      path: '/explore/defense/answer',
      headers: { Authorization: 'Bearer valid-token' },
      body: JSON.stringify({ sessionId: 'session-456', userAnswer: 'Because it works' }),
    };

    const result = await handler(event);
    expect(mockHandleDefenseSessionAnswer).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionId: 'session-456',
      userAnswer: 'Because it works',
    });
    expect(result.statusCode).toBe(200);
  });

  it('routes POST /explore/defense/session/close to handleDefenseSessionClose', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');
    mockHandleDefenseSessionClose.mockResolvedValueOnce({ status: 'CLOSED' });

    const event = {
      httpMethod: 'POST',
      path: '/explore/defense/session/close',
      headers: { Authorization: 'Bearer valid-token' },
      body: JSON.stringify({ sessionId: 'session-456' }),
    };

    const result = await handler(event);
    expect(mockHandleDefenseSessionClose).toHaveBeenCalledWith({
      userId: 'user-123',
      sessionId: 'session-456',
    });
    expect(result.statusCode).toBe(200);
  });

  it('routes GET /explore/copilot/suggest to handleCopilotSuggest', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');
    mockHandleCopilotSuggest.mockResolvedValueOnce({ suggestions: [] });

    const event = {
      httpMethod: 'GET',
      path: '/explore/copilot/suggest',
      headers: { Authorization: 'Bearer valid-token' },
      queryStringParameters: { jobId: 'job-789', sessionId: 'session-456' },
    };

    const result = await handler(event);
    expect(mockHandleCopilotSuggest).toHaveBeenCalledWith({
      userId: 'user-123',
      jobId: 'job-789',
      sessionId: 'session-456',
    });
    expect(result.statusCode).toBe(200);
  });

  it('routes GET /explore/competency/profile to handleGetCompetencyProfile', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');
    mockHandleGetCompetencyProfile.mockResolvedValueOnce({ profile: {} });

    const event = {
      httpMethod: 'GET',
      path: '/explore/competency/profile',
      headers: { Authorization: 'Bearer valid-token' },
    };

    const result = await handler(event);
    expect(mockHandleGetCompetencyProfile).toHaveBeenCalledWith({ userId: 'user-123' });
    expect(result.statusCode).toBe(200);
  });

  it('returns 404 for unknown path', async () => {
    mockVerifyToken.mockResolvedValueOnce('user-123');

    const event = {
      httpMethod: 'GET',
      path: '/explore/unknown-path',
      headers: { Authorization: 'Bearer valid-token' },
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});
