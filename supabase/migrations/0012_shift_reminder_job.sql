-- Every 10 minutes the database asks the `notify` function to send day-of reminders
-- (only to the lead scheduled for a shift starting within the hour).
-- The keys in private.push_config are created once by hand and are never stored in this repository:
--   insert into private.push_config (id, vapid_public, vapid_private, cron_secret) values (1, '<public key>', '<private key>', '<random secret>');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('hoh-shift-reminders', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://khtuqripoqqlzqdkrwym.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select cron_secret from private.push_config where id = 1)),
    body := '{"action":"reminders"}'::jsonb
  )
$job$);
