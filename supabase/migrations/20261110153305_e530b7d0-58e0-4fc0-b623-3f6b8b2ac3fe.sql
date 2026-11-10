REVOKE ALL ON FUNCTION public.handle_new_dex_sub_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

CREATE OR REPLACE FUNCTION public.create_data_order(p_user_id uuid, p_plan_id uuid, p_phone text)
RETURNS public.data_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.data_plans%ROWTYPE; v_order public.data_orders%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_phone !~ '^0[0-9]{10}$' THEN RAISE EXCEPTION 'Enter a valid 11-digit Nigerian phone number'; END IF;
  SELECT * INTO v_plan FROM public.data_plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This plan is unavailable'; END IF;
  PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  UPDATE public.wallets SET balance = balance - v_plan.price WHERE user_id = p_user_id AND balance >= v_plan.price;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.data_orders (user_id, plan_id, network, data_amount, validity, phone, amount)
  VALUES (p_user_id, v_plan.id, v_plan.network, v_plan.data_amount, v_plan.validity, p_phone, v_plan.price) RETURNING * INTO v_order;
  INSERT INTO public.wallet_transactions (user_id, amount, direction, reference_type, reference_id, description)
  VALUES (p_user_id, v_plan.price, 'debit', 'data_order', v_order.id, v_plan.network || ' ' || v_plan.data_amount || ' data');
  RETURN v_order;
END; $$;
REVOKE ALL ON FUNCTION public.create_data_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_data_order(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_data_order(p_user_id uuid, p_order_id uuid)
RETURNS public.data_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.data_orders%ROWTYPE;
BEGIN
  UPDATE public.data_orders SET status = 'successful'
  WHERE id = p_order_id AND user_id = p_user_id AND status = 'pending' RETURNING * INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending order not found'; END IF;
  RETURN v_order;
END; $$;
REVOKE ALL ON FUNCTION public.complete_data_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_data_order(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_funding_request(p_user_id uuid, p_amount numeric, p_method text)
RETURNS public.fundings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_funding public.fundings%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_amount <= 0 OR p_amount > 10000000 THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  IF p_method NOT IN ('bank_transfer', 'card') THEN RAISE EXCEPTION 'Invalid funding method'; END IF;
  INSERT INTO public.fundings (user_id, amount, method) VALUES (p_user_id, p_amount, p_method) RETURNING * INTO v_funding;
  RETURN v_funding;
END; $$;
REVOKE ALL ON FUNCTION public.create_funding_request(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_funding_request(uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_funding(p_admin_id uuid, p_funding_id uuid, p_decision text)
RETURNS public.fundings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_funding public.fundings%ROWTYPE;
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_admin_id AND role = 'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid funding decision'; END IF;
  SELECT * INTO v_funding FROM public.fundings WHERE id = p_funding_id FOR UPDATE;
  IF NOT FOUND OR v_funding.status <> 'pending' THEN RAISE EXCEPTION 'Pending funding request not found'; END IF;
  UPDATE public.fundings SET status = p_decision, reviewed_by = p_admin_id, reviewed_at = now() WHERE id = p_funding_id RETURNING * INTO v_funding;
  IF p_decision = 'approved' THEN
    UPDATE public.wallets SET balance = balance + v_funding.amount WHERE user_id = v_funding.user_id;
    INSERT INTO public.wallet_transactions (user_id, amount, direction, reference_type, reference_id, description)
    VALUES (v_funding.user_id, v_funding.amount, 'credit', 'funding', v_funding.id, 'Wallet funding approved');
  END IF;
  RETURN v_funding;
END; $$;
REVOKE ALL ON FUNCTION public.review_funding(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_funding(uuid, uuid, text) TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.data_plans FROM authenticated;