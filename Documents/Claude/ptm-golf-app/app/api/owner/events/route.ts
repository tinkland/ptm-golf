import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

// Initialize Firebase Admin
const apps = getApps();
if (apps.length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null;

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
}

export async function GET(request: Request) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify token and get user
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    // Check if user is owner
    if (userEmail !== OWNER_EMAIL) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if Firebase Admin is initialized
    if (apps.length === 0) {
      console.error('Firebase Admin SDK not initialized - FIREBASE_SERVICE_ACCOUNT_KEY not set');
      return Response.json(
        { error: 'Firebase Admin SDK not configured on server' },
        { status: 500 }
      );
    }

    // Get all events from Firestore
    const db = getFirestore();
    const eventsSnapshot = await db.collection('events').get();

    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort by creation date (newest first)
    events.sort((a: any, b: any) => {
      const aDate = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const bDate = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return bDate.getTime() - aDate.getTime();
    });

    return Response.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    return Response.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
