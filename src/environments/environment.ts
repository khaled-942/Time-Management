export const environment = {
  production: false,
  // Supabase → Project Settings → API. The publishable (anon) key is public by design; row-level security protects the data.
  supabase: {
    url: 'https://lvlgezwylzopnbkzwdhg.supabase.co',
    anonKey: 'sb_publishable_Xk9bGFrqsr8mZdlq__2iCg_4S2_BPvY',
  },
  // Public VAPID key for Web Push (the private half is the send-push Edge Function's VAPID_PRIVATE_KEY
  // secret). Push notifications stay off while it's empty.
  vapidKey: 'BJzI4hXsonMtFNigYXPTx3urOfKw9Y7Rlx8Pox8MJRTBDdb0Jkh5YHO_oGZzg6jDAIW1aCchOVm9zUgnX4O6RlU',
};
