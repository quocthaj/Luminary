import { NextResponse } from 'next/server';

async function generateHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error('AUTH_SECRET is not configured');
      return NextResponse.json({ error: 'Lỗi cấu hình server.' }, { status: 500 });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set 5 minutes expiration
    const expires = Date.now() + 5 * 60 * 1000;

    // Create HMAC signature over: email:otp + expires
    const message = `${email}:${otp}`;
    const hash = await generateHmac(`${message}.${expires}`, secret);
    const signature = `${hash}.${expires}`;

    // Print OTP to terminal console for development/test convenience
    console.log('\n=======================================');
    console.log(`🔑 [OTP DEV BYPASS] User: ${email}`);
    console.log(`🔑 [OTP DEV BYPASS] Code: ${otp}`);
    console.log(`🔑 [OTP DEV BYPASS] Expires at: ${new Date(expires).toLocaleTimeString()}`);
    console.log('=======================================\n');

    // Return signature to client (stateless OTP verification)
    return NextResponse.json({ 
      success: true, 
      signature,
      // If we are in dev/test, also return it to UI so test runners can read it!
      // In production, we would only log it or send email, but to prevent blocking testing,
      // let's send it in response only if a test header/flag is set or we are running in localhost/test
      devOtp: process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_TEST_MODE === 'true' ? otp : undefined
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return NextResponse.json({ error: 'Lỗi trong quá trình gửi OTP.' }, { status: 500 });
  }
}
