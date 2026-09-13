-- Update the default category colors seeded for new signups to the new
-- Budgt brand palette (docs/BRAND_GUIDELINES.md), so a brand-new account's
-- category dots/icons match the app's own color system out of the box.
--
-- Existing users keep whatever color is already stored on their rows — this
-- only changes what `handle_new_user()` inserts for accounts created from
-- now on. Category `color` has always been plain per-row data, editable by
-- the user; this is not a data migration and touches no existing rows.
CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);

  INSERT INTO public.accounts (user_id, name, type)
  VALUES (NEW.id, 'Main', 'checking');

  INSERT INTO public.categories (user_id, name, kind, color) VALUES
    (NEW.id, 'Insurances',       'expense', '#F7B733'),
    (NEW.id, 'Personal Care',    'expense', '#FF6347'),
    (NEW.id, 'Housing',          'expense', '#9B7FE0'),
    (NEW.id, 'Entertainment',    'expense', '#F0699B'),
    (NEW.id, 'Transportation',   'expense', '#4F8FE8'),
    (NEW.id, 'Food / Groceries', 'expense', '#3FA772'),
    (NEW.id, 'Salary',           'income',  '#3FA772'),
    (NEW.id, 'Other Income',     'income',  '#F7B733');

  RETURN NEW;
END;
$$;
