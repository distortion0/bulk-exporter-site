/* Paddle and licensing configuration — the single place to switch the site from sandbox to live.
 *
 * This file is served publicly. Only a Paddle CLIENT-SIDE token (test_… / live_…)
 * belongs here. Never put a Paddle API key (pdl_…), a webhook secret or any
 * other secret in it. The licensing API needs no key from the browser.
 */
window.BULK_EXPORTER_PADDLE = Object.freeze({
  /* "sandbox" or "production". Must match the token prefix below. */
  environment: "sandbox",

  /* Paddle client-side token for the environment above.
   * Sandbox tokens start with "test_", live tokens with "live_".
   * Created under Paddle > Developer tools > Authentication > Client-side tokens. */
  clientToken: "test_06896744f566c7c2622fb863571",

  /* Price to sell: Bulk Exporter Pro, USD 9.99, one-time payment (sandbox price). */
  priceId: "pri_01m48d2hmqth90n6f9q7077gyd",

  /* Page Paddle redirects to after a completed checkout, relative to the site root. */
  successPage: "success.html",

  /* sessionStorage key used to pass the Paddle transaction ID to the success page. */
  transactionStorageKey: "bulkExporter.lastTransactionId",

  /* Licensing API for the environment above (origin only, no path). success.html
   * calls GET {licensingBaseUrl}/licenses/claim to fetch the key for a completed
   * transaction. Swap in the production URL together with the live token and price. */
  licensingBaseUrl: "https://bulk-exporter-licensing-sandbox.distortion0.workers.dev"
});
