# ClaimMyDelay — Deployment Setup

This site is built as static HTML/CSS/JS files plus one serverless function for payment delivery. Everything is real, working code — but a few pieces require accounts and credentials only you can create. This file lists exactly what's left.

## 1. Domain
Every file currently uses `https://claimmydelay.vercel.app` as a placeholder in canonical tags, Open Graph tags, robots.txt, and sitemap.xml.
**Find-and-replace `claimmydelay.vercel.app` with your real domain across every file before going live.**

## 2. Hosting
Deploy the static files (everything except `/api/`) to Vercel, Netlify, or Cloudflare Pages — all have generous free tiers suitable for this. The `/api/paddle-webhook.js` function is written in Vercel/Netlify serverless function format; if using Vercel, it works as-is in `/api/`. If using Netlify, move it to `/netlify/functions/` and adjust the export syntax slightly (Netlify uses `exports.handler` instead of `export default`).

## 3. Payment — Paddle
Stripe isn't available for Pakistan-registered businesses, so this site uses **Paddle** (a Merchant of Record — they handle checkout, international tax/VAT, and payout to you via bank transfer/Payoneer/Wise).

Steps:
1. Create a Paddle account at paddle.com and complete their verification process.
2. Create one product: "Flight Compensation Claim Letter," priced at $10, one-time.
3. Get your **Vendor ID** and the product's **Price ID** from the Paddle dashboard.
4. In `/claim-letter.html`, replace `YOUR_PADDLE_VENDOR_ID` and `YOUR_PADDLE_PRICE_ID` with your real values.
5. In the Paddle dashboard, set the webhook endpoint to `https://yourdomain.com/api/paddle-webhook` for the `transaction.completed` event.
6. Get your webhook secret from Paddle and set it as the `PADDLE_WEBHOOK_SECRET` environment variable on your hosting provider.

## 4. Email delivery — Resend
The webhook function emails the generated PDF using Resend (resend.com), a simple transactional email API. You can swap this for SendGrid/Postmark/etc. with minor code changes if you prefer.

Steps:
1. Create a free Resend account, verify your sending domain (the same domain from step 1).
2. Get your API key and set it as the `RESEND_API_KEY` environment variable on your hosting provider.
3. Update the `from:` address in `/api/paddle-webhook.js` to use your verified domain.

## 5. Install dependencies for the serverless function
The webhook function needs one npm package:
```
npm install pdf-lib
```
Run this in the project root before deploying, so it's included in your `package.json` / `node_modules`.

## 6. Google AdSense
Ad unit code is already placed on every content page (sidebar/footer/mid-content slots, never inside factual content blocks).
1. Apply for AdSense at adsense.google.com once the site is live with real content (required — they review live sites, not pre-launch ones).
2. Once approved, replace `ca-pub-XXXXXXXXXXXXXXXX` (your publisher ID) and the placeholder `data-ad-slot` values across all files with your real values from the AdSense dashboard.
3. Ads will not display until approval is granted — this is a Google requirement, not something that can be pre-activated.

## 7. Sitemap maintenance
`sitemap.xml` currently lists only the pages built so far. **Every new page added must be added to sitemap.xml**, or search engines may not discover it efficiently. This should be updated each time a new airline/comparison/awareness page goes live.

## 8. Affiliate links (compare-companies.html)
The comparison table on `/compare-companies.html` currently has `href="#"` placeholder links for each company. To monetize these:
1. Sign up for each claims company's affiliate/partner program directly — AirHelp, Flightright, MYFLYRIGHT, EUclaim, Skycop all have affiliate programs (search "[company name] affiliate program").
2. Replace each `href="#" rel="sponsored nofollow"` with your real affiliate tracking URL for that company.
3. Affiliate income from these links is separate from and complementary to the $10 DIY form revenue — it monetizes the segment that chooses full-service.

## What's fully done, no further action needed
- All page content, copy, and sourced facts
- Eligibility checker logic (tested against 8 scenarios)
- Claim letter template and generation logic
- All on-page SEO: titles, meta descriptions, canonical tags, Open Graph tags, schema markup
- robots.txt
- The serverless webhook code itself (just needs the account credentials above to activate)
