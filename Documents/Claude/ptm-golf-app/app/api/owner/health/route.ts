import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apps = getApps();

    if (apps.length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : null;

      if (!serviceAccount) {
        return Response.json({
          status: 'error',
          message: 'FIREBASE_SERVICE_ACCOUNT_KEY not set',
        });
      }

      initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    const db = getFirestore();
    const testDoc = await db.collection('events').limit(1).get();

    return Response.json({
      status: 'ok',
      message: 'Firebase Admin SDK is working',
      eventCount: testDoc.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return Response.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
