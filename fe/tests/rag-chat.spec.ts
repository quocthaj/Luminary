import { test, expect } from '@playwright/test';

test.describe('RAG Chat API & Mock Proxy Flow', () => {
  test('should require authentication for the API route', async ({ request }) => {
    // Calling the API route without session should result in 401 Unauthorized
    const response = await request.post('/api/chat/job-123', {
      data: { message: 'Giải thích đoạn 1' }
    });
    expect(response.status()).toBe(401);
  });

  test('should return mock answer in test/playwright mode for mock- jobs', async ({ request }) => {
    // Calling with a mock- job ID and the bypass header should return 200 with the mock response
    const response = await request.post('/api/chat/mock-job-123', {
      headers: {
        'x-playwright-test': 'true'
      },
      data: { message: 'Giải thích đoạn 1' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.answer).toContain('Đây là câu trả lời thử nghiệm');
    expect(body.answer).toContain('Giải thích đoạn 1');
  });

  test('should return 400 bad request if message is empty', async ({ request }) => {
    const response = await request.post('/api/chat/mock-job-123', {
      headers: {
        'x-playwright-test': 'true'
      },
      data: { message: '' }
    });
    expect(response.status()).toBe(400);
  });
});
