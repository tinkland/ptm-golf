export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

// Verify Firebase ID token using REST API
async function verifyIdToken(idToken: string) {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!response.ok) {
      throw new Error('Token verification failed');
    }

    const data = await response.json();
    const user = data.users?.[0];

    if (!user) {
      throw new Error('User not found');
    }

    return { email: user.email, uid: user.localId };
  } catch (error) {
    console.error('Token verification error:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify token
    const user = await verifyIdToken(idToken);

    // Check if user is owner
    if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const { eventId } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    // Get event from Firestore REST API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const eventResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
      {
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      }
    );

    if (!eventResponse.ok) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventDoc = await eventResponse.json();
    const fields = eventDoc.fields;
    const rounds = fields.rounds?.arrayValue?.values || [];
    const currentRoundId = fields.currentRoundId?.stringValue;

    const currentRoundIdx = rounds.findIndex((r: any) =>
      r.mapValue?.fields?.id?.stringValue === currentRoundId
    );

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

    const nextRoundId = nextRound.mapValue?.fields?.id?.stringValue;
    const nextRoundLabel = nextRound.mapValue?.fields?.label?.stringValue;

    // Update event using PATCH
    const updateResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            currentRoundId: { stringValue: nextRoundId },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );

    if (!updateResponse.ok) {
      throw new Error('Failed to update event');
    }

    return Response.json({
      success: true,
      message: `Event progressed to ${nextRoundLabel}`,
      nextRoundId: nextRoundId,
      nextRoundLabel: nextRoundLabel,
    });
  } catch (error) {
    console.error('Progress event error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to progress event' },
      { status: 500 }
    );
  }
}
