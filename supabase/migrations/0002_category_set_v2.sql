-- Default expense categories updated to the household's chosen six:
-- Insurances, Personal Care, Housing, Entertainment, Transportation,
-- Food / Groceries. Income seed unchanged. (No real users yet, so this only
-- affects future signups.)
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
    (NEW.id, 'Insurances',       'expense', '#14b8a6'),
    (NEW.id, 'Personal Care',    'expense', '#ec4899'),
    (NEW.id, 'Housing',          'expense', '#8b5cf6'),
    (NEW.id, 'Entertainment',    'expense', '#f97316'),
    (NEW.id, 'Transportation',   'expense', '#3b82f6'),
    (NEW.id, 'Food / Groceries', 'expense', '#22c55e'),
    (NEW.id, 'Salary',           'income',  '#16a34a'),
    (NEW.id, 'Other Income',     'income',  '#65a30d');

  RETURN NEW;
END;
$$;
