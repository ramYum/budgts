-- Reseed handle_new_user() with the household's real category set
-- (from the user's working spreadsheet). Budgets are set at this top level;
-- the specific merchant / bill (Rent, Fuel, Uber, ...) goes in the
-- transaction description, not a sub-category.
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
    (NEW.id, 'Housing',                'expense', '#8b5cf6'),
    (NEW.id, 'Food / Groceries',       'expense', '#22c55e'),
    (NEW.id, 'Transportation',         'expense', '#3b82f6'),
    (NEW.id, 'Date / Entertainment',   'expense', '#f97316'),
    (NEW.id, 'Personal Care / Others', 'expense', '#ec4899'),
    (NEW.id, 'Salary',                 'income',  '#16a34a'),
    (NEW.id, 'Other Income',           'income',  '#65a30d');

  RETURN NEW;
END;
$$;
