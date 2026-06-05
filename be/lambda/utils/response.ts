// ============================================
// HELPER: Standardized HTTP response
// ============================================

export function respond(statusCode: number, body: object) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(body),
    };
}
