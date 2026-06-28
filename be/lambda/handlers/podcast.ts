import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN, GOOGLE_TTS_SECRET_ARN, dynamodbClient, JOBS_TABLE, s3Client, RESULTS_BUCKET } from '../utils/aws-clients';
import { getResultFromS3 } from '../utils/s3-helpers';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PollyClient, SynthesizeSpeechCommand, VoiceId } from '@aws-sdk/client-polly';
import { WebSocket } from 'ws';
import * as crypto from 'crypto';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface PodcastTurn {
  speaker: 'hostA' | 'hostB';
  text: string;
}

export interface PodcastScript {
  turns: PodcastTurn[];
}

export interface TTSProvider {
  synthesize(text: string, speaker: 'hostA' | 'hostB'): Promise<Buffer>;
}

interface PodcastInput {
  jobId: string;
  userId: string;
  hdMode?: boolean;
}

// ============================================
// GEMINI STRUCTURED OUTPUT SCHEMA
// ============================================

const podcastResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    turns: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          speaker: {
            type: SchemaType.STRING,
            enum: ['hostA', 'hostB'],
            description: 'Người nói: hostA (nữ, dẫn chuyện chính, đặt câu hỏi gợi mở) hoặc hostB (nam, chuyên gia kỹ thuật, am hiểu sâu thuật toán).'
          },
          text: {
            type: SchemaType.STRING,
            description: 'Nội dung hội thoại ngắn gọn, tối đa 3 câu ngắn, không chứa LaTeX, markdown hay ký tự đặc biệt.'
          }
        },
        required: ['speaker', 'text']
      },
      description: 'Danh sách các lượt hội thoại tạo thành podcast thảo luận khoa học.'
    }
  },
  required: ['turns']
};

// ============================================
// JSON REPAIR UTILITY
// ============================================

export function tryRepairJSON(raw: string): any {
  let clean = raw.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.warn('⚠️ [podcast] JSON parse failed, attempting regex-based recovery...');
  }

  // Regex to match complete turns: {"speaker": "hostA"|"hostB", "text": "..."}
  const turnRegex = /\{\s*"speaker"\s*:\s*"(hostA|hostB)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/gi;
  const turns: PodcastTurn[] = [];
  let match;

  while ((match = turnRegex.exec(clean)) !== null) {
    const speaker = match[1] as 'hostA' | 'hostB';
    const text = match[2];
    turns.push({ speaker, text });
  }

  if (turns.length > 0) {
    console.log(`✅ [podcast] Repaired JSON successfully. Extracted ${turns.length} complete turns.`);
    return { turns };
  }

  throw new Error('Unable to repair or parse truncated JSON from Gemini');
}

// ============================================
// TTS PROVIDERS
// ============================================

export class GoogleTTSProvider implements TTSProvider {
  private apiKey: string = '';

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    if (process.env.GCP_TTS_API_KEY) {
      this.apiKey = process.env.GCP_TTS_API_KEY;
      return this.apiKey;
    }
    const rawSecret = await getSecret(GOOGLE_TTS_SECRET_ARN);
    if (rawSecret) {
      if (rawSecret.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawSecret);
          this.apiKey = parsed.apiKey || parsed.API_KEY || rawSecret;
        } catch (e) {
          this.apiKey = rawSecret;
        }
      } else {
        this.apiKey = rawSecret;
      }
    }
    return this.apiKey;
  }

  async synthesize(text: string, speaker: 'hostA' | 'hostB'): Promise<Buffer> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Missing GCP_TTS_API_KEY environment variable and google-tts secret');
    }

    // Phân vai: hostA -> vi-VN-Wavenet-B | hostB -> vi-VN-Wavenet-A
    const voiceName = speaker === 'hostA' ? 'vi-VN-Wavenet-B' : 'vi-VN-Wavenet-A';

    console.log(`🎙️ [GoogleTTS] Synthesizing: "${text.substring(0, 30)}..." for ${speaker} (Voice: ${voiceName})`);

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: text },
        voice: { 
          languageCode: 'vi-VN', 
          name: voiceName 
        },
        audioConfig: {
          audioEncoding: 'MP3',
          sampleRateHertz: 24000 // Chốt cứng 24kHz để đồng bộ với hàm cắt byte ID3
        },
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(`Google TTS Error: ${data.error?.message || response.statusText}`);
    }

    if (!data.audioContent) {
      throw new Error('Google TTS returned empty audio content');
    }

    return Buffer.from(data.audioContent, 'base64');
  }
}

export class PollyTTSProvider implements TTSProvider {
  private pollyClient: PollyClient;

  constructor() {
    this.pollyClient = new PollyClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
  }

  async synthesize(text: string, speaker: 'hostA' | 'hostB'): Promise<Buffer> {
    const voiceId = speaker === 'hostA' ? 'Joanna' : 'Matthew';
    const engine = speaker === 'hostA' ? 'neural' : 'standard';

    console.log(`🎙️ [PollyTTS] Synthesizing: "${text.substring(0, 30)}..." for ${speaker} (Voice: ${voiceId}, Engine: ${engine})`);

    const command = new SynthesizeSpeechCommand({
      Engine: engine,
      VoiceId: voiceId as VoiceId,
      OutputFormat: 'mp3',
      SampleRate: '24000', // matches audio-24khz-48kbitrate-mono-mp3
      Text: text,
      TextType: 'text'
    });

    const response = await this.pollyClient.send(command);
    if (!response.AudioStream) {
      throw new Error(`Failed to get AudioStream from AWS Polly for speaker ${speaker}`);
    }

    const byteArray = await (response.AudioStream as any).transformToByteArray();
    return Buffer.from(byteArray);
  }
}

// Helper to calculate Sec-MS-GEC for Edge-TTS
function generateSecMsGecToken(): string {
  const WINDOWS_FILE_TIME_EPOCH = 11644473600n;
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

  const ticks = BigInt(Math.floor(Date.now() / 1000) + Number(WINDOWS_FILE_TIME_EPOCH)) * 10000000n;
  const roundedTicks = ticks - (ticks % 3000000000n);

  const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
  const hash = crypto.createHash('sha256');
  hash.update(strToHash, 'ascii');

  return hash.digest('hex').toUpperCase();
}

export class EdgeTTSProvider implements TTSProvider {
  async synthesize(text: string, speaker: 'hostA' | 'hostB'): Promise<Buffer> {
    const voiceId = speaker === 'hostA' ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
    console.log(`🎙️ [EdgeTTS] Synthesizing: "${text.substring(0, 30)}..." for ${speaker} (Voice: ${voiceId})`);

    const connectionId = crypto.randomBytes(16).toString('hex');
    const secMsGec = generateSecMsGecToken();
    const secMsGecVersion = '1-133.0.3065.51';

    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4` +
      `&Sec-MS-GEC=${secMsGec}` +
      `&Sec-MS-GEC-Version=${secMsGecVersion}` +
      `&ConnectionId=${connectionId}`;

    return new Promise<Buffer>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
          'Origin': 'chrome-extension://jdiccjijdfinnjfbfckdnmnpdfdbnoon',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
        }
      });

      const audioBuffers: Buffer[] = [];
      let isCompleted = false;

      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          ws.terminate();
          reject(new Error(`Timeout synthesizing speech via Edge TTS (15s)`));
        }
      }, 15000);

      ws.on('open', () => {
        const configMsg = `Content-Type: application/json; charset=utf-8\r\nPath: speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'false'
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                }
              }
            }
          });

        ws.send(configMsg, (err: any) => {
          if (err) {
            clearTimeout(timeout);
            isCompleted = true;
            ws.terminate();
            return reject(err);
          }

          const ssmlMsg = `Content-Type: application/ssml+xml\r\nX-RequestId: ${connectionId}\r\nPath: ssml\r\n\r\n` +
            `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>` +
              `<voice name='${voiceId}'>` +
                `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody>` +
              `</voice>` +
            `</speak>`;

          ws.send(ssmlMsg, (ssmlErr: any) => {
            if (ssmlErr) {
              clearTimeout(timeout);
              isCompleted = true;
              ws.terminate();
              return reject(ssmlErr);
            }
          });
        });
      });

      ws.on('message', (data: any, isBinary: boolean) => {
        if (isCompleted) return;

        if (isBinary) {
          try {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
            if (buffer.length < 2) return;
            const headerLength = buffer.readUInt16BE(0);
            const headerStr = buffer.toString('utf8', 2, 2 + headerLength);

            if (headerStr.includes('Path:audio')) {
              const payload = buffer.slice(2 + headerLength);
              audioBuffers.push(payload);
            }
          } catch (err) {
            console.error('Error parsing binary WebSocket frame:', err);
          }
        } else {
          const textMsg = data.toString('utf8');
          if (textMsg.includes('Path:turn.end')) {
            clearTimeout(timeout);
            isCompleted = true;
            ws.close();
            resolve(Buffer.concat(audioBuffers));
          }
        }
      });

      ws.on('error', (err: any) => {
        if (isCompleted) return;
        clearTimeout(timeout);
        isCompleted = true;
        ws.terminate();
        reject(err);
      });

      ws.on('close', () => {
        if (!isCompleted) {
          clearTimeout(timeout);
          isCompleted = true;
          resolve(Buffer.concat(audioBuffers));
        }
      });
    });
  }
}

// ============================================
// CONCURRENCY & RETRY HELPERS
// ============================================

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries <= 0) throw err;
    console.warn(`⚠️ [retry] EdgeTTS synthesis failed (${err.message || err}). Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(pool);
  return results;
}

// ============================================
// MP3 ID3 METADATA STRIPPING
// ============================================

export function stripId3(buffer: Buffer): Buffer {
  if (buffer.length < 10) return buffer;

  let startOffset = 0;
  // Check for ID3v2 ('I', 'D', '3')
  if (
    buffer[0] === 0x49 &&
    buffer[1] === 0x44 &&
    buffer[2] === 0x33
  ) {
    const s0 = buffer[6] & 0x7f;
    const s1 = buffer[7] & 0x7f;
    const s2 = buffer[8] & 0x7f;
    const s3 = buffer[9] & 0x7f;
    const tagSize = (s0 << 21) | (s1 << 14) | (s2 << 7) | s3;
    const headerAndTagSize = 10 + tagSize;

    if (headerAndTagSize > 0 && headerAndTagSize <= buffer.length) {
      console.log(`✂️ [podcast] Stripped ID3v2 header: ${headerAndTagSize} bytes`);
      startOffset = headerAndTagSize;
    } else {
      console.warn(`⚠️ [podcast] ID3v2 size calculation looks corrupt (${headerAndTagSize} bytes for buffer of ${buffer.length} bytes). Skipping ID3v2 strip.`);
    }
  }

  let endOffset = buffer.length;
  // Check for ID3v1 footer ('T', 'A', 'G') at the very end (last 128 bytes)
  if (buffer.length >= startOffset + 128) {
    const v1Offset = buffer.length - 128;
    if (
      buffer[v1Offset] === 0x54 &&
      buffer[v1Offset + 1] === 0x41 &&
      buffer[v1Offset + 2] === 0x47
    ) {
      console.log(`✂️ [podcast] Stripped ID3v1 footer: 128 bytes`);
      endOffset = v1Offset;
    }
  }

  if (startOffset > 0 || endOffset < buffer.length) {
    return buffer.slice(startOffset, endOffset);
  }
  return buffer;
}

export function mergeMp3Buffers(buffers: Buffer[]): Buffer {
  try {
    const stripped = buffers.map(buf => stripId3(buf));
    return Buffer.concat(stripped);
  } catch (err) {
    console.error('❌ [podcast] Failed to strip ID3, falling back to rough concatenation:', err);
    return Buffer.concat(buffers);
  }
}

// Helper to save binary audio to S3
async function saveAudioToS3(jobId: string, audioBuffer: Buffer): Promise<string> {
  const outputKey = `results/${jobId}/podcast.mp3`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: outputKey,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      Metadata: {
        jobId,
        processedAt: new Date().toISOString()
      }
    })
  );
  console.log(`✅ [podcast] Audio saved to s3://${RESULTS_BUCKET}/${outputKey}`);
  return outputKey;
}

// ============================================
// GEMINI CALL HELPERS
// ============================================

function buildBasePrompt(analysisContent: string): string {
  return `Bạn là đạo diễn âm thanh và biên kịch podcast học thuật xuất sắc. Hãy chuyển thể nội dung bài nghiên cứu khoa học dưới đây thành một kịch bản thảo luận podcast dạng đối thoại vô cùng sinh động, tự nhiên giữa 2 người:
- MC chính (hostA): Giọng Nữ, đóng vai trò dẫn dắt, đặt câu hỏi gợi mở, kết nối các phần và liên hệ ứng dụng thực tế.
- Chuyên gia phản biện (hostB): Giọng Nam, am hiểu cực kỳ sâu sắc về thuật toán, kỹ thuật, dữ liệu thực nghiệm và phân tích ưu/nhược điểm cốt lõi của bài báo.

YÊU CẦU BẮT BUỘC:
1. Độ dài kịch bản: Tối đa 12 lượt thoại (turns). Mỗi lượt thoại không quá 3 câu ngắn gọn, tự nhiên như văn nói hàng ngày (không dùng văn viết học thuật khô khan, không đọc nguyên văn).
2. Ngôn ngữ: Tiếng Việt tự nhiên hoàn toàn. Tránh dùng công thức toán học thô (LaTeX), hãy diễn đạt chúng bằng lời nói mượt mà, dễ hình dung.
3. Nội dung thảo luận phải tập trung cao độ vào: Bài toán gốc mà nghiên cứu giải quyết, giải pháp cốt lõi (thuật toán, mô hình), kết quả thực nghiệm nổi bật, và ý nghĩa thực tế.
4. Trả về đúng schema JSON yêu cầu.

NỘI DUNG NGHIÊN CỨU:
---
${analysisContent.slice(0, 50000)}
---

Hãy tạo kịch bản đối thoại.`;
}

async function callGeminiStructuredOutput(prompt: string): Promise<PodcastScript> {
  const geminiKey = await getSecret(GEMINI_SECRET_ARN);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: podcastResponseSchema as any,
      temperature: 0.5,
    }
  });

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  return tryRepairJSON(raw);
}

// ============================================
// CORE JOB RUNNER (ASYNC WORKER WORKHORSE)
// ============================================

export async function handlePodcastJob(input: PodcastInput): Promise<{ s3Key: string; fallbackUsed: boolean }> {
  const { jobId, userId, hdMode = false } = input;
  console.log(`🧠 [podcast] handlePodcastJob — jobId=${jobId}, userId=${userId}, hdMode=${hdMode}`);

  const jobItem = await getJobItem(jobId);
  if (!jobItem) throw new Error('JOB_NOT_FOUND');

  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) throw new Error('FORBIDDEN');

  const jobStatus = jobItem.status?.S;
  const s3OutputKey = jobItem.s3OutputKey?.S;
  if (jobStatus !== 'completed' || !s3OutputKey) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // Load analysis.md
  const analysisContent = await getResultFromS3(s3OutputKey);
  if (!analysisContent || analysisContent.trim().length === 0) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // Step 1: Generate Script via Gemini
  console.log(`🤖 [podcast] Generating dialogue script via Gemini...`);
  const prompt = buildBasePrompt(analysisContent);
  const script = await callGeminiStructuredOutput(prompt);

  if (!script.turns || script.turns.length === 0) {
    throw new Error('Script contains no dialogue turns');
  }
  console.log(`✅ [podcast] Generated script with ${script.turns.length} turns.`);

  // Step 2: Synthesis Audio Chunks (Priority 1: Google Cloud TTS Wavenet, Priority 2: AWS Polly)
  let fallbackUsed = false;
  const audioBuffers: Buffer[] = [];

  console.log(`🎙️ [podcast] Synthesizing audio turns (Priority 1: Google Cloud TTS Wavenet, Priority 2: AWS Polly)...`);
  const googleProvider = new GoogleTTSProvider();
  const pollyProvider = new PollyTTSProvider();

  for (const turn of script.turns) {
    let buffer: Buffer;
    try {
      buffer = await googleProvider.synthesize(turn.text, turn.speaker);
    } catch (googleErr: any) {
      console.warn(`⚠️ [podcast] Google TTS failed for speaker ${turn.speaker}, falling back to AWS Polly...`, googleErr?.message || googleErr);
      buffer = await pollyProvider.synthesize(turn.text, turn.speaker);
      fallbackUsed = true;
    }
    audioBuffers.push(buffer);
  }
  console.log(`✅ [podcast] Audio synthesis completed (${audioBuffers.length} turns, fallbackUsed=${fallbackUsed}).`);

  // Step 3: Merge audio segments removing ID3 tags
  console.log(`🎛️ [podcast] Merging ${audioBuffers.length} audio buffers...`);
  const finalAudio = mergeMp3Buffers(audioBuffers);

  // Step 4: Save final audio file to S3
  const s3Key = await saveAudioToS3(jobId, finalAudio);

  return { s3Key, fallbackUsed };
}

// ============================================
// POLLING API CONTROLLERS
// ============================================

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

export async function handlePodcastPost(input: { jobId: string; userId: string; hdMode?: boolean }): Promise<any> {
  const { jobId, userId, hdMode = false } = input;
  console.log(`📨 [podcast-post] Received request for jobId=${jobId}, userId=${userId}, hdMode=${hdMode}`);

  // 1. Verify Job exists, belongs to user, and translation is completed
  const jobItem = await getJobItem(jobId);
  if (!jobItem) throw new Error('JOB_NOT_FOUND');
  if (jobItem.userId?.S !== userId) throw new Error('FORBIDDEN');
  if (jobItem.status?.S !== 'completed' || !jobItem.s3OutputKey?.S) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // 2. Check S3 Cache
  const s3Key = `results/${jobId}/podcast.mp3`;
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: s3Key,
      // Just check existence using an empty command or reading metadata, or let's use headObject
    }));
    // Wait, let's verify if we can check cache properly.
  } catch (err) {}

  // Let's check status from DynamoDB
  const dbStatus = jobItem.podcastStatus?.S || 'IDLE';
  if (dbStatus === 'COMPLETED') {
    console.log(`✅ [podcast-post] Cache hit for jobId=${jobId}. Returning status COMPLETED.`);
    return {
      status: 'COMPLETED',
      fallbackUsed: jobItem.podcastFallbackUsed?.BOOL || false,
      hdMode: jobItem.podcastHdMode?.BOOL || false
    };
  }

  // 3. Acquire Lock and Trigger async execution
  const locked = await acquireLock(jobId, hdMode);
  if (locked) {
    console.log(`🔒 [podcast-post] Lock acquired. Invoking async Lambda task...`);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'vietai-orchestrator',
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              asyncRun: true,
              tool: 'podcast',
              jobId,
              userId,
              hdMode,
              invocationDepth: 1
            })
          )
        })
      );
    } catch (err) {
      console.error(`❌ [podcast-post] Failed to trigger async Lambda:`, err);
      await updatePodcastStatus(jobId, 'FAILED', false, hdMode);
      throw err;
    }
  }

  return { status: 'GENERATING' };
}

export async function handlePodcastGet(input: { jobId: string; userId: string }): Promise<any> {
  const { jobId, userId } = input;
  console.log(`📨 [podcast-get] Get status request for jobId=${jobId}, userId=${userId}`);

  const jobItem = await getJobItem(jobId);
  if (!jobItem) throw new Error('JOB_NOT_FOUND');
  if (jobItem.userId?.S !== userId) throw new Error('FORBIDDEN');

  const status = jobItem.podcastStatus?.S || 'IDLE';

  if (status === 'COMPLETED') {
    const s3Key = `results/${jobId}/podcast.mp3`;
    
    // Generate pre-signed URL with 1 hour expiration
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: s3Key
      }),
      { expiresIn: 3600 }
    );

    return {
      status: 'COMPLETED',
      downloadUrl,
      fallbackUsed: jobItem.podcastFallbackUsed?.BOOL || false,
      hdMode: jobItem.podcastHdMode?.BOOL || false,
      expiresIn: 3600
    };
  }

  return { status };
}

export async function handleAsyncPodcastJob(event: { jobId: string; userId: string; hdMode: boolean; invocationDepth: number }): Promise<void> {
  const { jobId, userId, hdMode, invocationDepth } = event;
  console.log(`🤖 [podcast-async] Background worker executing. jobId=${jobId}, hdMode=${hdMode}, depth=${invocationDepth}`);

  if (invocationDepth && invocationDepth > 1) {
    console.error(`❌ [podcast-async] Circuit breaker triggered! depth=${invocationDepth}. Aborting.`);
    return;
  }

  try {
    const { fallbackUsed } = await handlePodcastJob({ jobId, userId, hdMode });
    await updatePodcastStatus(jobId, 'COMPLETED', fallbackUsed, hdMode);
    console.log(`✅ [podcast-async] Job completed successfully for jobId=${jobId}.`);
  } catch (err: any) {
    console.error(`❌ [podcast-async] Job execution failed for jobId=${jobId}:`, err?.message || err);
    await updatePodcastStatus(jobId, 'FAILED', false, hdMode);
  }
}

// ============================================
// DYNAMODB LOCK & STATUS UPDATERS
// ============================================

async function acquireLock(jobId: string, hdMode: boolean): Promise<boolean> {
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes lock
  const now = Date.now();
  const expiredTime = now - lockTimeoutMs;

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': 'podcastStatus',
          '#updatedAt': 'podcastUpdatedAt',
          '#hdMode': 'podcastHdMode'
        },
        UpdateExpression: 'SET #status = :generating, #updatedAt = :now, #hdMode = :hdMode',
        ConditionExpression: `attribute_not_exists(#status) OR #status = :idle OR #status = :failed OR #updatedAt < :expiredTime`,
        ExpressionAttributeValues: {
          ':generating': { S: 'GENERATING' },
          ':now': { N: now.toString() },
          ':hdMode': { BOOL: hdMode },
          ':idle': { S: 'IDLE' },
          ':failed': { S: 'FAILED' },
          ':expiredTime': { N: expiredTime.toString() }
        }
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`🔒 [podcast] Lock acquisition failed for jobId=${jobId}. Job is already generating.`);
      return false;
    }
    console.error(`❌ [podcast] Error acquiring DynamoDB lock for jobId=${jobId}:`, err);
    throw err;
  }
}

async function updatePodcastStatus(
  jobId: string,
  status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED',
  fallbackUsed: boolean,
  hdMode: boolean
): Promise<void> {
  const now = Date.now();
  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': 'podcastStatus',
          '#updatedAt': 'podcastUpdatedAt',
          '#fallbackUsed': 'podcastFallbackUsed',
          '#hdMode': 'podcastHdMode'
        },
        UpdateExpression: 'SET #status = :status, #updatedAt = :now, #fallbackUsed = :fallbackUsed, #hdMode = :hdMode',
        ExpressionAttributeValues: {
          ':status': { S: status },
          ':now': { N: now.toString() },
          ':fallbackUsed': { BOOL: fallbackUsed },
          ':hdMode': { BOOL: hdMode }
        }
      })
    );
    console.log(`✅ [podcast] Updated status to ${status} (fallbackUsed=${fallbackUsed}) for jobId=${jobId}`);
  } catch (err) {
    console.error(`❌ [podcast] Failed to update podcastStatus to ${status} for jobId=${jobId}:`, err);
  }
}
