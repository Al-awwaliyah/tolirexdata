-- IyanjuPay-compatible provider selectors require exam and ISP provider option types.
-- Earlier schema only permitted network/operator/cable_provider/meter_type, causing
-- Topupmate sync RPC calls for exam_provider and internet_provider to fail silently.
alter table public.provider_service_options
  drop constraint if exists provider_service_options_option_type_check;

alter table public.provider_service_options
  add constraint provider_service_options_option_type_check
  check (option_type in (
    'network',
    'operator',
    'cable_provider',
    'meter_type',
    'exam_provider',
    'internet_provider'
  ));

comment on column public.provider_service_options.option_type is
  'Supplier-derived selector type: mobile network, electricity operator, cable provider, exam provider, internet provider or meter type.';
