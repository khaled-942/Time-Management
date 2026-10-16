-- Where the push_notification trigger sends new notifications (this project's send-push function)
insert into private.settings (key, value)
values ('push_function_url', 'https://lvlgezwylzopnbkzwdhg.supabase.co/functions/v1/send-push')
on conflict (key) do update set value = excluded.value;
