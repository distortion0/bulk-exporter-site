/* Bulk Exporter for Descript — success page.
 *
 * Claims the Pro license key for the Paddle transaction that assets/checkout.js
 * saved in sessionStorage for this browser session. The licensing API answers
 * "license_not_found" until Paddle's webhook has been processed, so the page
 * polls it with bounded backoff and gives up after about 90 seconds.
 *
 * The key is only displayed. It is never logged or stored by this page.
 */
(function () {
  "use strict";

  var config = window.BULK_EXPORTER_PADDLE;
  var status = document.getElementById("license-status");
  var message = document.getElementById("license-message");
  var result = document.getElementById("license-result");
  var keyField = document.getElementById("license-key");
  var copyButton = document.getElementById("license-copy");
  var retryRow = document.getElementById("license-retry");
  var retryButton = document.getElementById("license-retry-button");

  if (!status || !message || !result || !keyField || !copyButton || !retryRow || !retryButton) {
    return;
  }

  var TRANSACTION_ID = /^txn_[a-z0-9]{26}$/;
  /* The format the licensing backend generates: Crockford base32 (no I, L, O or U). */
  var LICENSE_KEY = /^BEXP(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;

  var RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]; /* then the last delay, repeatedly */
  var JITTER = 0.2;
  var SLOW_AFTER_MS = 10000;
  var GIVE_UP_AFTER_MS = 90000;
  var COPIED_FOR_MS = 2000;

  var MESSAGES = {
    preparing: "Preparing your license…",
    slow: "Still preparing your license — payment confirmations can take a moment.",
    ready: "Your license key is ready.",
    reference: "We couldn't find your purchase reference. If you just completed a purchase, return to the original checkout tab. Otherwise, contact support.",
    inactive: "This purchase's license is no longer active. If you think this is a mistake, contact support.",
    unavailable: "We couldn't retrieve your license because the licensing service is currently unavailable. Please try again later or contact support.",
    failed: "We couldn't retrieve your license right now. Please try again later or contact support.",
    timeout: "Your license is taking longer than usual. Your payment went through; this page will keep working — try again in a minute, or contact support with your Paddle receipt."
  };

  /* state: "loading" (spinner), "error" (red) or "" (plain). */
  function show(text, state) {
    message.textContent = text;
    status.classList.toggle("is-loading", state === "loading");
    status.classList.toggle("is-error", state === "error");
  }

  /* --- Transaction reference (same mechanism as before: saved by checkout.js) --- */

  function savedTransactionId() {
    var id = null;
    try {
      id = window.sessionStorage.getItem(config.transactionStorageKey);
    } catch (error) {
      return null;
    }
    return typeof id === "string" && TRANSACTION_ID.test(id) ? id : null;
  }

  /* --- Claim --- */

  function claimUrl(transactionId) {
    var url = new URL(String(config.licensingBaseUrl).replace(/\/+$/, "") + "/licenses/claim");
    url.searchParams.set("transaction_id", transactionId);
    return url.href;
  }

  function isLicense(body) {
    return body !== null && typeof body === "object" &&
      typeof body.licenseKey === "string" && LICENSE_KEY.test(body.licenseKey) &&
      body.status === "active";
  }

  /* What one response means for the page: { key }, { retry: true } or { error: <MESSAGES key> }. */
  function outcome(httpStatus, body) {
    var code = body !== null && typeof body === "object" && typeof body.error === "string" ? body.error : "";
    if (httpStatus === 200) {
      return isLicense(body) ? { key: body.licenseKey } : { error: "failed" };
    }
    if (httpStatus === 404 && code === "license_not_found") {
      return { retry: true }; /* webhook not processed yet */
    }
    if (httpStatus === 404 && code === "not_found") {
      return { error: "unavailable" }; /* the claim endpoint itself is missing */
    }
    if (httpStatus === 403 && code === "license_not_active") {
      return { error: "inactive" };
    }
    if (httpStatus === 400 && code === "invalid_transaction_id") {
      return { error: "reference" };
    }
    return { error: "failed" };
  }

  function interpret(response) {
    if (response.status >= 500) {
      return { retry: true };
    }
    return response.json().then(
      function (body) { return outcome(response.status, body); },
      function () { return outcome(response.status, null); }
    );
  }

  var current = null; /* the single polling run in flight, if any */

  function stopClaim() {
    if (!current) {
      return;
    }
    clearTimeout(current.timer);
    clearTimeout(current.slowTimer);
    current.controller.abort();
    current = null;
  }

  function showKey(key) {
    keyField.textContent = key;
    show(MESSAGES.ready, "");
    result.hidden = false;
  }

  function startClaim(transactionId) {
    var run = { controller: new AbortController(), timer: 0, slowTimer: 0 };
    var startedAt = Date.now();
    var retries = 0;
    var url;

    stopClaim();
    try {
      url = claimUrl(transactionId);
    } catch (error) {
      show(MESSAGES.unavailable, "error");
      return;
    }

    current = run;
    result.hidden = true;
    retryRow.hidden = true;
    show(MESSAGES.preparing, "loading");
    run.slowTimer = setTimeout(function () {
      if (current === run) {
        show(MESSAGES.slow, "loading");
      }
    }, SLOW_AFTER_MS);

    function finish(what) {
      stopClaim();
      if (what.key) {
        showKey(what.key);
      } else if (what.timeout) {
        show(MESSAGES.timeout, "");
        retryRow.hidden = false;
      } else {
        show(MESSAGES[what.error], "error");
      }
    }

    function retryLater() {
      var base = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)];
      var delay = Math.round(base * (1 + JITTER * (2 * Math.random() - 1)));
      retries += 1;
      if (Date.now() - startedAt + delay > GIVE_UP_AFTER_MS) {
        finish({ timeout: true });
        return;
      }
      run.timer = setTimeout(attempt, delay);
    }

    function attempt() {
      fetch(url, { signal: run.controller.signal })
        .then(interpret)
        .then(function (what) {
          if (current !== run) {
            return; /* superseded or stopped meanwhile */
          }
          if (what.retry) {
            retryLater();
          } else {
            finish(what);
          }
        }, function () {
          if (current === run) {
            retryLater(); /* network failure; an aborted run is no longer current */
          }
        });
    }

    attempt();
  }

  /* --- Copy --- */

  var copiedTimer = 0;

  function copied() {
    copyButton.textContent = "Copied";
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(function () {
      copyButton.textContent = "Copy";
    }, COPIED_FOR_MS);
  }

  /* Selects the key, then copies the selection. If even that fails the key
   * stays selected, so Ctrl/Cmd+C still works. */
  function copyFallback() {
    var selection = window.getSelection();
    if (!selection) {
      return;
    }
    var range = document.createRange();
    range.selectNodeContents(keyField);
    selection.removeAllRanges();
    selection.addRange(range);
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    if (ok) {
      copied();
    }
  }

  function copyKey() {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(keyField.textContent).then(copied, copyFallback);
    } else {
      copyFallback();
    }
  }

  /* --- Start --- */

  function initialize() {
    if (!config || typeof config.licensingBaseUrl !== "string" ||
        typeof window.fetch !== "function" || typeof window.AbortController !== "function") {
      show(MESSAGES.unavailable, "error");
      return;
    }

    var transactionId = savedTransactionId();
    if (!transactionId) {
      show(MESSAGES.reference, "error");
      return;
    }

    copyButton.addEventListener("click", copyKey);
    retryButton.addEventListener("click", function () {
      startClaim(transactionId);
    });
    var interrupted = false;
    window.addEventListener("pagehide", function () {
      interrupted = current !== null; /* polling cut short by leaving the page */
      stopClaim();
    });
    /* Restored from the back/forward cache while polling: pick up again. */
    window.addEventListener("pageshow", function (event) {
      if (event.persisted && interrupted) {
        startClaim(transactionId);
      }
    });
    startClaim(transactionId);
  }

  initialize();
})();
