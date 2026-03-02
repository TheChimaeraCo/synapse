# Stripe Tax Read

Read-only Stripe reporting module for monthly tax summaries.

## Tools
- `stripe-tax-read.list_charges_by_date`
  - Inputs: `start_date`, `end_date`, optional `limit`, optional `api_key`
  - Returns normalized Stripe charges with pagination support.
- `stripe-tax-read.january_summary`
  - Inputs: `year`, optional `api_key`
  - Returns January totals: gross, refunds, fees, net, and charge count.
- `stripe-tax-read.export_month_csv`
  - Inputs: `start_date`, `end_date`, optional `api_key`
  - Returns CSV data (or stores large CSV in module store `exports`).

## Auth
- Preferred: pass a restricted read-only key as `api_key`.
- Fallback: if runtime exposes `STRIPE_SECRET_KEY`, handlers use it automatically.

## Notes
- Amounts in raw rows are Stripe cents.
- Summary fields include both cents and dollar strings.
- Multi-currency months are returned with a per-currency breakdown.
