-- ForgeFit Supply: release stock held by abandoned checkouts every hour.
--
-- Checkout reserves stock while the shopper pays (0004). Stripe's "session expired" webhook
-- normally puts it back, and the API also sweeps stale orders whenever a new checkout
-- starts, but a missed webhook on a quiet shop could hold stock for days. This schedules
-- release_stale_orders() hourly with pg_cron, which Supabase provides.
--
-- Safe to run again: cron.schedule() updates the job when one with this name exists.
-- On a Postgres without pg_cron it only prints a notice and changes nothing.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron isn''t available: stale orders are still released on each new checkout.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Minute 7 of every hour, off the top of the hour when other scheduled jobs pile up.
  -- Cancels pending orders older than 2 hours (Stripe sessions expire after 30 minutes).
  perform cron.schedule(
    'release-stale-orders',
    '7 * * * *',
    'select public.release_stale_orders()'
  );
end;
$$;

-- To check it:   select jobname, schedule, active from cron.job;
-- Recent runs:   select status, return_message, start_time from cron.job_run_details
--                order by start_time desc limit 5;
-- To remove it:  select cron.unschedule('release-stale-orders');
