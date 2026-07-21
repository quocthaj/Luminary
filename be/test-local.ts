import { handler } from './lambda/index';

const payload = {
  httpMethod: "POST",
  path: "/assistant/chat",
  requestContext: {
    authorizer: {
      userId: "test-user-123"
    }
  },
  body: JSON.stringify({ message: "Tìm bài báo về RAG trong y tế", context: { currentPage: "library" } }),
  headers: {}
};

async function run() {
  try {
    const result = await handler(payload as any);
    console.log("Status:", result?.statusCode);
    console.log("Body:", result?.body);
  } catch (error) {
    console.error(error);
  }
}

run();
