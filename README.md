# Fraud Bloom

Fraud Bloom is an Evidence First investigation-training workspace. This clean
migration rebuilds the Sky interface from structural React components while
preserving case-scoped searches, evidence pins, notes, determinations, frozen
review packages, and post-submission Luna coaching.

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

The contract suite covers the 18 investigation tools, generated training
scenarios, Payment Verification’s paired Bank Code and Destination ID lookup,
public-answer leakage, package migration, and Luna’s submission gate.

## Netlify cloud sync

The Netlify deployment exposes the server-side cloud sync function at
`/api/cloud-sync`. Configure these environment variables in the Netlify site:

- `SUPABASE_URL`: the Supabase project URL
- `SUPABASE_SECRET_KEY`: a Supabase secret key (`sb_secret_...`)
- `CLOUD_SYNC_HMAC_SECRET`: a private random value of at least 32 characters
- `CLOUD_SYNC_ALLOWED_ORIGIN`: `https://livebloom.netlify.app`

`SUPABASE_SECRET_KEY` and `CLOUD_SYNC_HMAC_SECRET` must remain server-only. Do
not prefix them with `VITE_` or expose them in browser code.
