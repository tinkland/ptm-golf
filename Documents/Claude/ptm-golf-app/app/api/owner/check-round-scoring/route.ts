export const dynamic = 'force-dynamic';

const OWNER_EMAIL = 'andrewtinkler@optusnet.com.au';

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

    if (!response.ok) throw new Error('Token verification failed');
    const data = await response.json();
    const user = data.users?.[0];
    if (!user) throw new Error('User not found');
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

    const user = await verifyIdToken(idToken);
    if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    const { eventId } = await request.json();
    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    // Get event to find current round
    const eventResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
      {
        headers: { 'Authorization': `Bearer ${idToken}` },
      }
    );

    if (!eventResponse.ok) {
      return Response.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventDoc = await eventResponse.json();
    const fields = eventDoc.fields;
    const currentRoundId = fields.currentRoundId?.stringValue;
    const rounds = fields.rounds?.arrayValue?.values || [];

    // Get all scores for this event
    const scoresResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/scores?pageSize=1000`,
      {
        headers: { 'Authorization': `Bearer ${idToken}` },
      }
    );

    let currentRoundScores = [];
    if (scoresResponse.ok) {
      const scoresData = await scoresResponse.json();
      const allScores = scoresData.documents || [];

      // Filter scores by eventId and currentRoundId
      currentRoundScores = allScores.filter((doc: any) => {
        const fields = doc.fields;
        const docEventId = fields.eventId?.stringValue;
        const docRoundId = fields.roundId?.stringValue;
        return docEventId === eventId && docRoundId === currentRoundId;
      });
    }

    // Count groups that have at least one score
    const groupsWithScores = new Set(
      currentRoundScores.map((doc: any) => doc.fields.groupId?.stringValue)
    ).size;

    // Get total groups from the current round (not top level)
    const currentRoundData = rounds.find((r: any) => r.mapValue?.fields?.id?.stringValue === currentRoundId);
    const totalGroups = currentRoundData?.mapValue?.fields?.groups?.arrayValue?.values?.length || 0;
    const isComplete = groupsWithScores === totalGroups && totalGroups > 0;

    return Response.json({
      currentRoundId,
      currentRoundLabel: rounds.find((r: any) =>
        r.mapValue?.fields?.id?.stringValue === currentRoundId
      )?.mapValue?.fields?.label?.stringValue || 'Unknown',
      totalRounds: rounds.length,
      scoreCount: currentRoundScores.length,
      groupsWithScores,
      totalGroups,
      isComplete,
      canProgress: groupsWithScores > 0, // Allow if at least some scoring started
      message: isComplete ? 'Round complete' : `${groupsWithScores}/${totalGroups} groups scored`,
    });
  } catch (error) {
    console.error('Check round scoring error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to check scoring' },
      { status: 500 }
    );
  }
}
