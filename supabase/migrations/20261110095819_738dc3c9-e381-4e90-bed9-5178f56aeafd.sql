CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
CREATE POLICY "Profiles are visible to their owner and admins" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallets are visible to their owner and admins" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.data_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN ('MTN', 'Airtel', 'Glo', '9mobile')),
  data_amount text NOT NULL,
  validity text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, data_amount, validity)
);
GRANT SELECT ON public.data_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.data_plans TO authenticated;
GRANT ALL ON public.data_plans TO service_role;
ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active data plans are public" ON public.data_plans FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage data plans" ON public.data_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.data_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.data_plans(id),
  network text NOT NULL,
  data_amount text NOT NULL,
  validity text NOT NULL,
  phone text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_orders TO authenticated;
GRANT ALL ON public.data_orders TO service_role;
ALTER TABLE public.data_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Orders are visible to their owner and admins" ON public.data_orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.fundings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('bank_transfer', 'card')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fundings TO authenticated;
GRANT ALL ON public.fundings TO service_role;
ALTER TABLE public.fundings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Funding requests are visible to their owner and admins" ON public.fundings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  reference_type text NOT NULL CHECK (reference_type IN ('data_order', 'funding')),
  reference_id uuid NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallet activity is visible to its owner and admins" ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER data_plans_updated_at BEFORE UPDATE ON public.data_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER data_orders_updated_at BEFORE UPDATE ON public.data_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fundings_updated_at BEFORE UPDATE ON public.fundings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wallet_transactions_updated_at BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_dex_sub_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), COALESCE(NEW.raw_user_meta_data ->> 'phone', ''));
  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(COALESCE(NEW.email, '')) = 'lawalaremu53@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_dex_sub AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_dex_sub_user();

CREATE OR REPLACE FUNCTION public.create_data_order(p_plan_id uuid, p_phone text)
RETURNS public.data_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.data_plans%ROWTYPE;
  v_order public.data_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_phone !~ '^0[0-9]{10}$' THEN RAISE EXCEPTION 'Enter a valid 11-digit Nigerian phone number'; END IF;
  SELECT * INTO v_plan FROM public.data_plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This plan is unavailable'; END IF;
  PERFORM 1 FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  UPDATE public.wallets SET balance = balance - v_plan.price WHERE user_id = v_user_id AND balance >= v_plan.price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.data_orders (user_id, plan_id, network, data_amount, validity, phone, amount)
  VALUES (v_user_id, v_plan.id, v_plan.network, v_plan.data_amount, v_plan.validity, p_phone, v_plan.price) RETURNING * INTO v_order;
  INSERT INTO public.wallet_transactions (user_id, amount, direction, reference_type, reference_id, description)
  VALUES (v_user_id, v_plan.price, 'debit', 'data_order', v_order.id, v_plan.network || ' ' || v_plan.data_amount || ' data');
  RETURN v_order;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_data_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_data_order(p_order_id uuid)
RETURNS public.data_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.data_orders%ROWTYPE;
BEGIN
  UPDATE public.data_orders SET status = 'successful'
  WHERE id = p_order_id AND user_id = auth.uid() AND status = 'pending'
  RETURNING * INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending order not found'; END IF;
  RETURN v_order;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_data_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_funding_request(p_amount numeric, p_method text)
RETURNS public.fundings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_funding public.fundings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_amount <= 0 OR p_amount > 10000000 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  IF p_method NOT IN ('bank_transfer', 'card') THEN RAISE EXCEPTION 'Invalid funding method'; END IF;
  INSERT INTO public.fundings (user_id, amount, method) VALUES (auth.uid(), p_amount, p_method) RETURNING * INTO v_funding;
  RETURN v_funding;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_funding_request(numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_funding(p_funding_id uuid, p_decision text)
RETURNS public.fundings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_funding public.fundings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid funding decision'; END IF;
  SELECT * INTO v_funding FROM public.fundings WHERE id = p_funding_id FOR UPDATE;
  IF NOT FOUND OR v_funding.status <> 'pending' THEN RAISE EXCEPTION 'Pending funding request not found'; END IF;
  UPDATE public.fundings SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_funding_id RETURNING * INTO v_funding;
  IF p_decision = 'approved' THEN
    UPDATE public.wallets SET balance = balance + v_funding.amount WHERE user_id = v_funding.user_id;
    INSERT INTO public.wallet_transactions (user_id, amount, direction, reference_type, reference_id, description)
    VALUES (v_funding.user_id, v_funding.amount, 'credit', 'funding', v_funding.id, 'Wallet funding approved');
  END IF;
  RETURN v_funding;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_funding(uuid, text) TO authenticated;

INSERT INTO public.data_plans (network, data_amount, validity, price) VALUES
  ('MTN', '1GB', '30 days', 320), ('MTN', '2GB', '30 days', 640), ('MTN', '5GB', '30 days', 1550), ('MTN', '10GB', '30 days', 3050),
  ('Airtel', '1GB', '30 days', 320), ('Airtel', '2GB', '30 days', 640), ('Airtel', '5GB', '30 days', 1550), ('Airtel', '10GB', '30 days', 3050),
  ('Glo', '1GB', '30 days', 320), ('Glo', '2GB', '30 days', 640), ('Glo', '5GB', '30 days', 1550), ('Glo', '10GB', '30 days', 3050),
  ('9mobile', '1GB', '30 days', 320), ('9mobile', '2GB', '30 days', 640), ('9mobile', '5GB', '30 days', 1550), ('9mobile', '10GB', '30 days', 3050);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'lawalaremu53@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;