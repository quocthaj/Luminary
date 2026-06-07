import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

// Helper to base64url encode buffers/arrays (Edge compatible)
function base64url(arr: Uint8Array | ArrayBuffer): string {
  const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Helper to sign standard HS256 JWT using Web Crypto API
async function signJwt(payload: any, secret: string): Promise<string> {
  try {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encoder = new TextEncoder();
    
    const headerStr = base64url(encoder.encode(JSON.stringify(header)));
    const payloadStr = base64url(encoder.encode(JSON.stringify(payload)));
    const partialToken = `${headerStr}.${payloadStr}`;
    
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(partialToken);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureStr = base64url(signatureBuffer);
    
    return `${partialToken}.${signatureStr}`;
  } catch (err) {
    console.error('Error signing JWT:', err);
    return '';
  }
}

// Helper to verify HMAC signature for OTP (Edge compatible)
async function verifyHmac(message: string, signatureWithExpiry: string, secret: string): Promise<boolean> {
  try {
    const parts = signatureWithExpiry.split('.');
    if (parts.length !== 2) return false;
    const [hash, expiryStr] = parts;
    const expiry = parseInt(expiryStr, 10);
    
    // Check expiration
    if (Date.now() > expiry) {
      console.warn('OTP verification failed: Signature expired');
      return false;
    }

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(`${message}.${expiry}`);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedHash = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return calculatedHash === hash;
  } catch (err) {
    console.error('Error verifying HMAC signature:', err);
    return false;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      name: 'Email OTP',
      credentials: {
        email: { label: 'Email', type: 'email' },
        otp: { label: 'OTP', type: 'text' },
        signature: { label: 'Signature', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp || !credentials?.signature) {
          return null;
        }

        const email = credentials.email as string;
        const otp = credentials.otp as string;
        const signature = credentials.signature as string;
        const secret = process.env.AUTH_SECRET;

        if (!secret) {
          console.error('AUTH_SECRET is not configured');
          return null;
        }

        // Verify OTP signature
        const isValid = await verifyHmac(email + ':' + otp, signature, secret);
        if (!isValid) {
          return null;
        }

        // Return user session object
        return {
          id: email, // Use email as unique identifier for stateless OTP
          email: email,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        // Generate custom stateless JWT signed with AUTH_SECRET using HS256
        const secret = process.env.AUTH_SECRET || '';
        const payload = {
          sub: user.id,
          email: user.email,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
        };
        token.accessToken = await signJwt(payload, secret);
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}
