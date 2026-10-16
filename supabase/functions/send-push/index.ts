// Pushes every new in-app notification to the recipients' devices as an OS notification, so it
// arrives even when the app is closed. Called by the push_notification trigger on notifications
// (with just the row id); devices subscribe in the app (PushService → push_subscriptions) and
// public/sw.js shows the push.
//
// Deployed with --no-verify-jwt (the database calls it). That's safe because it only takes an id:
// it re-reads the row, ignores old ones and claims each notification once ("pushed").
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== 'string') return new Response('Missing id', { status: 400 });

  // Claim it: each notification is pushed once, and only while it's fresh
  const { data: notification, error } = await supabase
    .from('notifications')
    .update({ pushed: true })
    .eq('id', id)
    .eq('pushed', false)
    .gte('createdAt', new Date(Date.now() - 5 * 60_000).toISOString())
    .select('*')
    .maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  if (!notification?.title) return new Response('Nothing to push');

  // One person, or every admin
  let recipients: string[] = [];
  if (notification.userId) {
    recipients = [notification.userId];
  } else if (notification.audience === 'admins') {
    const { data: admins } = await supabase.from('users').select('userId').eq('isAdmin', true);
    recipients = (admins ?? []).map((a) => a.userId);
  }
  // Nobody needs a push about their own action
  recipients = recipients.filter((uid) => uid && uid !== notification.createdBy);
  if (!recipients.length) return new Response('No recipients');

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .in('userId', recipients);
  if (!subscriptions?.length) return new Response('No devices');

  // Same shape the Firebase version sent, so sw.js reads `data`
  const payload = JSON.stringify({
    data: {
      title: notification.title,
      body: notification.body ?? '',
      link: notification.link ?? '/dashboard',
      tag: notification.id,
    },
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload, { TTL: 24 * 60 * 60, urgency: 'high' });
        sent++;
      } catch (e) {
        // Gone (app uninstalled, permission revoked, expired): forget the device
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else console.error('Push failed', status, (e as Error).message);
      }
    })
  );
  if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead);

  console.log('Push sent', { notification: id, recipients: recipients.length, sent, removed: dead.length });
  return new Response('OK');
});
