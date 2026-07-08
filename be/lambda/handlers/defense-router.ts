// ============================================================================
// VIETAI SCHOLAR — DEFENSE & COPILOT ROUTER
// Routes dedicated requests for Thesis Defense & Research Copilot
// ============================================================================

import { verifyToken } from '../utils/auth-helpers';
import { respond } from '../utils/response';
import {
    handleDefenseSessionInit,
    handleDefenseSessionAnswer,
    handleDefenseSessionClose,
    handleCopilotSuggest,
    handleGetCompetencyProfile,
} from './defense';

export const handler = async (event: any) => {
    console.log('📨 [Defense Router] Event received:', JSON.stringify(event, null, 2));

    try {
        const { httpMethod, path, body } = event;

        let requestBody: Record<string, any> = {};
        if (body) {
            try {
                requestBody = JSON.parse(body);
            } catch {
                return respond(400, { error: 'Invalid JSON body' });
            }
        }

                const authHeader = event.headers?.Authorization || event.headers?.authorization;
        const userId = event.requestContext?.authorizer?.userId || (authHeader ? await verifyToken(authHeader).catch(() => null) : null);
        if (!userId) {
            return respond(401, { error: 'Unauthorized' });
        }

        // Extract custom config headers
        const headers = event.headers || {};
        const agentDepth = headers['x-agent-depth'] || headers['X-Agent-Depth'] || 'standard';
        const defenseIntensity = headers['x-defense-intensity'] || headers['X-Defense-Intensity'] || 'supportive';
        const translationStyle = headers['x-translation-style'] || headers['X-Translation-Style'] || 'bilingual';
        const academicRole = headers['x-academic-role'] || headers['X-Academic-Role'] || 'student';
        const academicAffiliation = headers['x-academic-affiliation'] || headers['X-Academic-Affiliation'] ? decodeURIComponent(headers['x-academic-affiliation'] || headers['X-Academic-Affiliation']) : '';

        // POST /explore/defense/session (Khởi tạo/khôi phục phiên bảo vệ)
        if (httpMethod === 'POST' && path === '/explore/defense/session') {
            try {
                const result = await handleDefenseSessionInit({ 
                    userId, 
                    jobId: requestBody.jobId,
                    academicRole,
                    defenseIntensity,
                    academicAffiliation
                });
                return respond(200, result);
            } catch (err: any) {
                console.error('❌ [Defense Router] Defense Session Init error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        // POST /explore/defense/answer (Gửi câu trả lời và chạy reasoning loop)
        if (httpMethod === 'POST' && path === '/explore/defense/answer') {
            try {
                const result = await handleDefenseSessionAnswer({
                    userId,
                    sessionId: requestBody.sessionId,
                    userAnswer: requestBody.userAnswer,
                    academicRole,
                    defenseIntensity,
                    academicAffiliation
                });
                return respond(200, result);
            } catch (err: any) {
                console.error('❌ [Defense Router] Defense Answer error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        // POST /explore/defense/session/close (Kết thúc phiên, chạy extract+update)
        if (httpMethod === 'POST' && path === '/explore/defense/session/close') {
            try {
                const result = await handleDefenseSessionClose({ userId, sessionId: requestBody.sessionId });
                return respond(200, result);
            } catch (err: any) {
                console.error('❌ [Defense Router] Defense Session Close error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        // GET /explore/copilot/suggest (Lấy gợi ý Research Copilot)
        if (httpMethod === 'GET' && path === '/explore/copilot/suggest') {
            const jobId = event.queryStringParameters?.jobId;
            const sessionId = event.queryStringParameters?.sessionId;
            try {
                const result = await handleCopilotSuggest({ userId, jobId, sessionId });
                return respond(200, result);
            } catch (err: any) {
                console.error('❌ [Defense Router] Copilot Suggest error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        // GET /explore/competency/profile (Lấy hồ sơ năng lực của học viên)
        if (httpMethod === 'GET' && path === '/explore/competency/profile') {
            try {
                const result = await handleGetCompetencyProfile({ userId });
                return respond(200, result);
            } catch (err: any) {
                console.error('❌ [Defense Router] Get Competency Profile error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        return respond(404, { error: `Not found: ${httpMethod} ${path}` });

    } catch (error) {
        console.error('❌ [Defense Router] Fatal error:', error);
        return respond(500, {
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown',
        });
    }
};
