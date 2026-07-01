export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

export async function POST(request: Request) {
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

    // Check if user is owner
    if (userEmail !== OWNER_EMAIL) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const { eventId } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    const db = getFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data() as any;
    const rounds = eventData.rounds || [];
    const currentRoundId = eventData.currentRoundId;
    const currentRoundIdx = rounds.findIndex((r: any) => r.id === currentRoundId);

    // Check if there's a next round
    if (currentRoundIdx < 0 || currentRoundIdx >= rounds.length - 1) {
      return Response.json(
        { error: 'Cannot progress - already on final round or invalid state' },
        { status: 400 }
      );
    }

    const nextRound = rounds[currentRoundIdx + 1];
    if (!nextRound) {
      return Response.json(
        { error: 'No next round available' },
        { status: 400 }
      );
    }

    // Update event to progress to next round
    await eventRef.update({
      currentRoundId: nextRound.id,
      updatedAt: new Date(),
    });

    return Response.json({
      success: true,
      message: `Event progressed to ${nextRound.label}`,
      nextRoundId: nextRound.id,
      nextRoundLabel: nextRound.label,
    });
  } catch (error) {
    console.error('Progress event error:', error);
    return Response.json(
      { error: 'Failed to progress event' },
      { status: 500 }
    );
  }
}
