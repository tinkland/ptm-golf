import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apps = getApps();
let db: any;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null;

  if (serviceAccount && apps.length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  if (apps.length > 0) {
    db = getFirestore();
  }
} catch (err) {
  console.warn('Firebase Admin not configured:', err);
}

export async function POST(request: Request) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    if (!db) {
      return Response.json({ error: 'Firebase not configured' }, { status: 500 });
    }

    // Delete all collections related to this event
    const collectionsToDelete = [
      { collection: 'events', docId: eventId },
      { collection: 'games', docId: eventId },
      { collection: 'scores', docId: eventId },
      { collection: 'signatures', docId: eventId },
    ];

    for (const { collection, docId } of collectionsToDelete) {
      try {
        const ref = db.collection(collection).doc(docId);

        // Get the document to see if it's a collection or document
        const doc = await ref.get();

        if (doc.exists) {
          // Check if it has subcollections
          const subcollections = await ref.listCollections();

          // Delete all subcollections first
          for (const subcol of subcollections) {
            const snapshot = await subcol.get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          // Delete the document itself
          await ref.delete();
        }
      } catch (err) {
        console.warn(`Could not delete ${collection}/${docId}:`, err);
      }
    }

    return Response.json({ success: true, message: `Event ${eventId} deleted from Firebase` });
  } catch (error) {
    console.error('Delete event error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
