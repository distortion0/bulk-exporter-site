/* Bulk Exporter for Descript — success page.
 *
 * Shows the Paddle transaction reference saved by assets/checkout.js, if there
 * is a valid one in this browser session. Nothing here grants Pro access.
 */
(function () {
  "use strict";

  var config = window.BULK_EXPORTER_PADDLE;
  var wrapper = document.getElementById("transaction-reference");
  var output = document.getElementById("transaction-id");

  if (!config || !wrapper || !output) {
    return;
  }

  var TRANSACTION_ID = /^txn_[a-z0-9]{26}$/;
  var id = null;

  try {
    id = window.sessionStorage.getItem(config.transactionStorageKey);
  } catch (error) {
    return;
  }

  if (typeof id === "string" && TRANSACTION_ID.test(id)) {
    output.textContent = id;
    wrapper.hidden = false;
  }
})();
