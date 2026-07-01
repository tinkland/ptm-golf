export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

export async function GET(request: Request) {
  try {
    // Dynamically import Firebase Admin to avoid ESM issues on Vercel
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');

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

    // Debug logging
    console.log('Owner check:', {
      userEmail: userEmail,
      userEmailLength: userEmail?.length,
      ownerEmail: OWNER_EMAIL,
      ownerEmailLength: OWNER_EMAIL.length,
      match: userEmail === OWNER_EMAIL,
      userEmailLower: userEmail?.toLowerCase(),
      ownerEmailLower: OWNER_EMAIL.toLowerCase(),
      matchLower: userEmail?.toLowerCase() === OWNER_EMAIL.toLowerCase(),
    });

    // Check if user is owner (case-insensitive)
    if (userEmail?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      console.warn(`Access denied: User ${userEmail} is not owner ${OWNER_EMAIL}`);
      return Response.json({
        error: 'Access denied',
        message: `Owner dashboard requires login as ${OWNER_EMAIL}`,
        currentUser: userEmail,
      }, { status: 403 });
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
