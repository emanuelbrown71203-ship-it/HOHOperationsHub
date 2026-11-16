-- Ratings now live in public.shift_ratings (see 0006). These two columns were never used after that.
alter table public.shift_handoffs drop column if exists rating, drop column if exists rating_comment;
