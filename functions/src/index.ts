import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

// Must match the Firestore database location (Firebase console → Firestore → the location
// shown at the top): nam5 → us-central1, eur3 → europe-west1, otherwise the same region.
const REGION = 'us-central1';

// Office time zone: decides which calendar day it is for the monthly report reminder
const TIME_ZONE = 'Africa/Cairo';

// Production reports are due on the 30th (the last day in shorter months); matches the app
const REPORT_DUE_DAY = 30;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

/**
 * Reminds every active person to export their production report on the day it's due. Runs on
 * the last days of each month and only acts on the due day. The notification is pushed to their
 * devices by sendPush like any other.
 */
export const productionReportReminder = onSchedule(
  { schedule: '0 10 28-31 * *', timeZone: TIME_ZONE, region: REGION },
  async () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date())
      .reduce<Record<string, number>>((all, p) => (p.type === 'literal' ? all : { ...all, [p.type]: Number(p.value) }), {});
    const lastDay = new Date(parts.year, parts.month, 0).getDate();
    if (parts.day !== Math.min(REPORT_DUE_DAY, lastDay)) return;

    const db = getFirestore();
    const users = await db.collection('users').get();
    const recipients = users.docs.filter((d) => d.get('active') !== false).map((d) => d.id);
    const label = `${MONTHS[parts.month - 1]} ${parts.year}`;

    // Batches hold up to 500 writes
    for (let i = 0; i < recipients.length; i += 500) {
      const batch = db.batch();
      for (const userId of recipients.slice(i, i + 500)) {
        batch.set(db.collection('notifications').doc(), {
          userId,
          audience: '',
          title: 'Production report due today',
          body: `Export your ${label} production report (Word and Excel) from the dashboard.`,
          link: '/dashboard',
          icon: 'pi pi-file-word',
          createdAt: FieldValue.serverTimestamp(),
          createdBy: 'system',
          readBy: [],
        });
      }
      await batch.commit();
    }
    logger.info('Production report reminders sent', { month: label, recipients: recipients.length });
  }
);
