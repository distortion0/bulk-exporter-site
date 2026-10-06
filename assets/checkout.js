/* Bulk Exporter for Descript — Paddle checkout for the landing page.
 *
 * Loaded (deferred) after assets/paddle-config.js and Paddle.js. The "Buy Pro"
 * button stays disabled until Paddle has been initialized; every failure is
 * shown in the #checkout-status element instead of being swallowed.
 *
 * A completed checkout only stores the Paddle transaction ID for the success
 * page. It never grants Pro access: payment is not entitlement verification.
 */
(function () {
  "use strict";

  var config = window.BULK_EXPORTER_PADDLE;
  var button = document.getElementById("buy-pro");
  var status = document.getElementById("checkout-status");
  var modeNote = document.getElementById("checkout-mode");

  if (!button || !status) {
    return;
  }

  var TOKEN_PREFIX = { sandbox: "test_", production: "live_" };
  var PRICE_ID = /^pri_[a-z0-9]{26}$/;
  var TRANSACTION_ID = /^txn_[a-z0-9]{26}$/;

  function setStatus(message, isError) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function fail(message) {
    button.disabled = true;
    setStatus(message, true);
  }

  function errorDetail(error) {
    var detail = error && (error.detail || error.message);
    return typeof detail === "string" && detail.length > 0 && detail.length <= 160 ? " (" + detail + ")" : "";
  }

  /* Returns a message describing the first configuration problem, or null. */
  function configProblem() {
    if (!config || typeof config !== "object") {
      return "Checkout is not configured: assets/paddle-config.js did not load.";
    }
    var prefix = TOKEN_PREFIX[config.environment];
    if (!prefix) {
      return "Checkout is not configured: environment must be \"sandbox\" or \"production\".";
    }
    if (typeof config.clientToken !== "string" || config.clientToken.indexOf(prefix) !== 0) {
      return "Checkout is not configured: a " + config.environment + " client-side token (" + prefix + "…) is required.";
    }
    if (!PRICE_ID.test(config.priceId)) {
      return "Checkout is not configured: invalid price ID.";
    }
    return null;
  }

  /* Stores a validated transaction ID for success.html. Ignores anything else. */
  function rememberTransaction(data) {
    var id = data && (data.transaction_id || data.id);
    if (typeof id !== "string" || !TRANSACTION_ID.test(id)) {
      return;
    }
    try {
      window.sessionStorage.setItem(config.transactionStorageKey, id);
    } catch (error) {
      /* Storage unavailable: the success page simply shows no reference. */
    }
  }

  function onPaddleEvent(event) {
    if (!event || typeof event.name !== "string") {
      return;
    }
    switch (event.name) {
      case "checkout.loaded":
        setStatus("");
        break;
      case "checkout.completed":
        rememberTransaction(event.data);
        setStatus("Payment completed. Taking you to the confirmation page…");
        break;
      case "checkout.payment.failed":
        setStatus("Payment failed. Please try again or use a different payment method.", true);
        break;
      case "checkout.error":
        setStatus("Checkout error" + errorDetail(event.error) + ". Please try again.", true);
        break;
    }
  }

  function openCheckout() {
    var Paddle = window.Paddle;
    if (!Paddle || Paddle.Initialized !== true) {
      fail("Checkout is not ready. Please refresh the page and try again.");
      return;
    }
    setStatus("");
    try {
      Paddle.Checkout.open({
        items: [{
          priceId: config.priceId,
          quantity: 1
        }],
        settings: {
          displayMode: "overlay",
          variant: "one-page",
          successUrl: new URL(config.successPage, window.location.href).href
        }
      });
    } catch (error) {
      setStatus("Checkout couldn't be opened" + errorDetail(error) + ".", true);
    }
  }

  function initialize() {
    var problem = configProblem();
    if (problem) {
      fail(problem);
      return;
    }

    var Paddle = window.Paddle;
    if (!Paddle || typeof Paddle.Initialize !== "function") {
      fail("Checkout couldn't load (Paddle.js is unavailable). Please refresh the page or try again later.");
      return;
    }

    try {
      Paddle.Environment.set(config.environment);
      Paddle.Initialize({
        token: config.clientToken,
        eventCallback: onPaddleEvent
      });
    } catch (error) {
      fail("Checkout couldn't be initialized" + errorDetail(error) + ".");
      return;
    }

    if (Paddle.Initialized !== true) {
      fail("Checkout couldn't be initialized.");
      return;
    }

    if (modeNote) {
      modeNote.hidden = config.environment !== "sandbox";
    }
    button.addEventListener("click", openCheckout);
    button.disabled = false;
    setStatus("");
  }

  initialize();
})();
