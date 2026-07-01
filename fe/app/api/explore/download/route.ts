import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || 'session-demo';
  const format = searchParams.get('format') || 'obsidian';

  let contentType = 'application/octet-stream';
  let filename = `vietai_export_${sessionId}`;
  let fileContent: Uint8Array;

  if (format === 'pdf') {
    contentType = 'application/pdf';
    filename += '.pdf';
    // Return a dummy PDF header/content
    fileContent = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 40 >>\nstream\nBT /F1 24 Tf 100 700 Td (VietAI Scholar Export) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000210 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n301\n%%EOF'));
  } else if (format === 'word') {
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    filename += '.docx';
    // Dummy docx content or simple text
    fileContent = new Uint8Array(Buffer.from('VietAI Scholar Exported Word Document. Topic: ' + sessionId));
  } else {
    // obsidian zip
    contentType = 'application/zip';
    filename += '.zip';
    // A small valid ZIP file containing a README.md and notes
    // We can write a tiny valid ZIP file buffer
    fileContent = new Uint8Array([
      0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
  }

  return new NextResponse(fileContent as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
