import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();

// Must match the Firestore database location (Firebase console → Firestore → the location
// shown at the top): nam5 → us-central1, eur3 → europe-west1, otherwise the same region.
const REGION = 'us-central1';

// Tokens FCM reports as gone (app uninstalled, permission revoked, expired); they're deleted
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

interface AppNotification {
  userId: string; // '' for admin notifications
  audience: 'admins' | '';
  title: string;
  body: string;
  link?: string;
  createdBy: string;
}

/**
 * Every in-app notification is also pushed to the recipients' devices as an OS notification,
 * so it arrives even when the app is closed. Devices register in users/{uid}/pushTokens
 * (PushService in the app); public/sw.js shows the push.
 */
export const sendPush = onDocumentCreated({ document: 'notifications/{id}', region: REGION }, async (event) => {
  const notification = event.data?.data() as AppNotification | undefined;
  if (!notification?.title) return;
  const db = getFirestore();

  // One person, or every admin
  let recipients: string[] = [];
  if (notification.userId) {
    recipients = [notification.userId];
  } else if (notification.audience === 'admins') {
    const admins = await db.collection('users').where('isAdmin', '==', true).get();
    recipients = admins.docs.map((d) => d.id);
  }
  // Nobody needs a push about their own action
  recipients = recipients.filter((uid) => uid && uid !== notification.createdBy);
  if (!recipients.length) return;

  const tokenDocs = (
    await Promise.all(recipients.map((uid) => db.collection(`users/${uid}/pushTokens`).get()))
  ).flatMap((snapshot) => snapshot.docs);
  if (!tokenDocs.length) return;

  // Data-only, so sw.js decides how it looks (and Angular's worker doesn't show it a second time)
  const response = await getMessaging().sendEachForMulticast({
    tokens: tokenDocs.map((d) => d.id),
    data: {
      title: notification.title,
      body: notification.body ?? '',
      link: notification.link ?? '/dashboard',
      tag: event.params.id,
    },
    webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
  });

  const dead = response.responses
    .map((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? tokenDocs[i] : null))
    .filter((d): d is NonNullable<typeof d> => d !== null);
  await Promise.all(dead.map((d) => d.ref.delete()));

  logger.info('Push sent', {
    notification: event.params.id,
    recipients: recipients.length,
    sent: response.successCount,
    failed: response.failureCount,
    removedTokens: dead.length,
  });
});
