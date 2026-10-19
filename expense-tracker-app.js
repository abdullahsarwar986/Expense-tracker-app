
const balance = document.getElementById("balance");
const paidTotal = document.getElementById("paid-total");
const unpaidTotal = document.getElementById("unpaid-total");
const paidCount = document.getElementById("paid-count");
const unpaidCount = document.getElementById("unpaid-count");
const list = document.getElementById("list");
const form = document.getElementById("expense-form");
const textInput = document.getElementById("text");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("expense-date");
const statusInput = document.getElementById("status");
const paymentTypeInput = document.getElementById("payment-type");
const paidAmountInput = document.getElementById("paid-amount");
const paymentTypeGroup = document.getElementById("payment-type-group");
const paidAmountGroup = document.getElementById("paid-amount-group");
const presetInput = document.getElementById("expense-preset");
const usePresetButton = document.getElementById("use-preset");
const searchInput = document.getElementById("expense-search");

const filterMode = document.getElementById("filter-mode");
const filterDate = document.getElementById("filter-date");
const filterMonth = document.getElementById("filter-month");
const statusFilter = document.getElementById("status-filter");
const dateFilterGroup = document.getElementById("date-filter-group");
const monthFilterGroup = document.getElementById("month-filter-group");
const filteredTotal = document.getElementById("filtered-total");
const filteredPaid = document.getElementById("filtered-paid");
const filteredUnpaid = document.getElementById("filtered-unpaid");
const emptyState = document.getElementById("empty-state");
const clearFiltersButton = document.getElementById("clear-filters");

const connectSaveButton = document.getElementById("connect-save-file");
const saveStatus = document.getElementById("save-status");

const STORAGE_KEY = "transactions";
const DB_NAME = "ExpenseTrackerDB";
const STORE_NAME = "fileHandles";

let saveFileHandle = null;
let saveQueue = Promise.resolve();
let transactions = loadTransactions();

const money = value =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);

function todayLocal() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

dateInput.value = todayLocal();

function generateID() {
  return window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTransactions(data) {
  if (!Array.isArray(data)) {
    throw new Error("The JSON file must contain an array of expenses.");
  }

  return data
    .filter(item =>
      item &&
      typeof item.text === "string" &&
      item.text.trim() !== "" &&
      Number.isFinite(Number(item.amount)) &&
      Number(item.amount) > 0
    )
    .map(item => {
      const amount = Math.round(Number(item.amount) * 100) / 100;
      const oldStatus = item.status === "paid" ? "paid" : "unpaid";
      let paidAmount;

      if (Number.isFinite(Number(item.paidAmount))) {
        paidAmount = Number(item.paidAmount);
      } else {
        paidAmount = oldStatus === "paid" ? amount : 0;
      }

      paidAmount = Math.min(
        amount,
        Math.max(0, Math.round(paidAmount * 100) / 100)
      );

      return {
        id: item.id ?? generateID(),
        text: item.text.trim(),
        amount,
        paidAmount,
        date: typeof item.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ? item.date
          : todayLocal()
      };
    });
}

function loadTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return normalizeTransactions(saved);
  } catch (error) {
    console.error("Could not read saved expenses:", error);
    return [];
  }
}

function getStatus(item) {
  if (item.paidAmount >= item.amount) return "paid";
  if (item.paidAmount > 0) return "partial";
  return "unpaid";
}

function getRemaining(item) {
  return Math.max(
    0,
    Math.round((item.amount - item.paidAmount) * 100) / 100
  );
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFileHandle(handle) {
  const db = await openHandleDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, "transactionsFile");

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      const error = tx.error;
      db.close();
      reject(error);
    };
  });
}

async function getStoredFileHandle() {
  const db = await openHandleDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get("transactionsFile");

    request.onsuccess = () => {
      const result = request.result;
      db.close();
      resolve(result);
    };

    request.onerror = () => {
      const error = request.error;
      db.close();
      reject(error);
    };
  });
}

async function requestFilePermission(handle) {
  let permission = await handle.queryPermission({ mode: "readwrite" });

  if (permission !== "granted") {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }

  return permission === "granted";
}

async function readTransactionsFromFile(handle) {
  const file = await handle.getFile();
  const contents = await file.text();

  if (!contents.trim()) return [];

  return normalizeTransactions(JSON.parse(contents));
}

function mergeTransactions(primary, secondary) {
  const merged = new Map();

  primary.forEach(item => merged.set(item.id, item));
  secondary.forEach(item => merged.set(item.id, item));

  return Array.from(merged.values());
}

async function connectSaveFile() {
  try {
    if (!window.showSaveFilePicker) {
      saveStatus.textContent =
        "File auto-save is unavailable here. Use a current version of Chrome or Edge and open the app through localhost or HTTPS.";
      return;
    }

    let handle = saveFileHandle;

    if (!handle) {
      try {
        handle = await getStoredFileHandle();
      } catch {
        handle = null;
      }
    }

    if (handle && !(await requestFilePermission(handle))) {
      handle = null;
    }

    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName: "transactions.json",
        types: [{
          description: "Expense Tracker JSON file",
          accept: { "application/json": [".json"] }
        }]
      });
    }

    if (!(await requestFilePermission(handle))) {
      saveStatus.textContent =
        "File permission was not granted. Your browser copy has not been changed.";
      return;
    }

    const fileTransactions = await readTransactionsFromFile(handle);
    transactions = mergeTransactions(fileTransactions, transactions);
    saveFileHandle = handle;

    await storeFileHandle(handle);
    persistBrowserCopy();
    render();
    await saveTransactions();

    saveStatus.textContent =
      "File connected. Expenses are being saved to your JSON file.";
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not connect save file:", error);
      saveStatus.textContent =
        "Could not connect or read that file. Choose a valid Expense Tracker JSON file or a new JSON file.";
    }
  }
}

async function restoreFileHandle() {
  try {
    const handle = await getStoredFileHandle();

    if (!handle) {
      saveStatus.textContent =
        "Browser storage is active. If browser site data was cleared, choose your existing JSON save file again.";
      return;
    }

    const permission = await handle.queryPermission({ mode: "readwrite" });

    if (permission !== "granted") {
      saveStatus.textContent =
        "Choose Documents Save File to reconnect your JSON file.";
      return;
    }

    const fileTransactions = await readTransactionsFromFile(handle);
    transactions = mergeTransactions(fileTransactions, transactions);
    saveFileHandle = handle;

    persistBrowserCopy();
    render();
    await saveTransactions();

    saveStatus.textContent = "Auto-save file reconnected.";
  } catch (error) {
    console.error("Could not restore file connection:", error);
    saveStatus.textContent =
      "Choose Documents Save File to reconnect your JSON file. Your selected JSON file remains available.";
  }
}

function persistBrowserCopy() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.error("Browser storage save failed:", error);
    saveStatus.textContent =
      "Browser storage could not save. The selected JSON file may still be available.";
  }
}

function saveTransactions() {
  persistBrowserCopy();

  if (!saveFileHandle) {
    saveStatus.textContent =
      "Saved in browser. Connect a JSON file for a separate file backup.";
    return Promise.resolve();
  }

  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const writable = await saveFileHandle.createWritable();

    try {
      await writable.write(JSON.stringify(transactions, null, 2));
      await writable.close();

      saveStatus.textContent =
        "All expenses saved to the JSON file and browser storage.";
    } catch (error) {
      try {
        await writable.abort();
      } catch {}

      throw error;
    }
  });

  return saveQueue.catch(error => {
    console.error("File auto-save failed:", error);
    saveStatus.textContent =
      "File auto-save failed. Choose Documents Save File to reconnect. Your browser copy is retained when available.";
  });
}

function addTransaction(event) {
  event.preventDefault();

  const name = textInput.value.trim();
  const amount = Number(amountInput.value);
  const date = dateInput.value;
  const status = statusInput.value;
  const paymentType = paymentTypeInput.value;
  let paidAmount = 0;

  if (!name || !Number.isFinite(amount) || amount <= 0 || !date) {
    alert("Please enter an expense name, a valid positive amount, and a date.");
    return;
  }

  if (status === "paid") {
    if (paymentType === "full") {
      paidAmount = amount;
    } else {
      paidAmount = Number(paidAmountInput.value);

      if (
        !Number.isFinite(paidAmount) ||
        paidAmount <= 0 ||
        paidAmount >= amount
      ) {
        alert(
          "For a partial payment, enter an amount greater than zero and less than the total expense."
        );
        return;
      }
    }
  }

  transactions.push({
    id: generateID(),
    text: name,
    amount: Math.round(amount * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    date
  });

  saveTransactions();
  form.reset();
  dateInput.value = todayLocal();
  statusInput.value = "unpaid";
  paymentTypeInput.value = "full";

  updatePaymentFields();
  render();
  textInput.focus();
}

function getFilteredTransactions() {
  const mode = filterMode.value;
  const status = statusFilter.value;
  const search = searchInput.value.trim().toLowerCase();

  return transactions
    .filter(item => {
      if (mode === "date" && item.date !== filterDate.value) {
        return false;
      }

      if (
        mode === "month" &&
        item.date.slice(0, 7) !== filterMonth.value
      ) {
        return false;
      }

      const itemStatus = getStatus(item);

      if (status !== "all" && itemStatus !== status) {
        return false;
      }

      if (search && !item.text.toLowerCase().includes(search)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function sum(items, selector = item => item.amount) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function updateSummary() {
  const fullyPaid = transactions.filter(
    item => getStatus(item) === "paid"
  );

  const withBalance = transactions.filter(
    item => getRemaining(item) > 0
  );

  balance.textContent = money(sum(transactions));

  paidTotal.textContent = money(
    sum(transactions, item => item.paidAmount)
  );

  unpaidTotal.textContent = money(
    sum(transactions, getRemaining)
  );

  paidCount.textContent =
    `${fullyPaid.length} ${fullyPaid.length === 1 ? "expense" : "expenses"} fully paid`;

  unpaidCount.textContent =
    `${withBalance.length} ${withBalance.length === 1 ? "expense" : "expenses"} with a balance`;

  const filtered = getFilteredTransactions();

  filteredTotal.textContent = money(sum(filtered));

  filteredPaid.textContent = money(
    sum(filtered, item => item.paidAmount)
  );

  filteredUnpaid.textContent = money(
    sum(filtered, getRemaining)
  );
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function createButton(label, className, action, id, ariaLabel) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.className = `small-btn ${className}`;
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", () => action(id));

  return button;
}

function renderList() {
  list.replaceChildren();

  const filtered = getFilteredTransactions();
  emptyState.style.display = filtered.length ? "none" : "block";

  filtered.forEach(transaction => {
    const item = document.createElement("li");
    item.className = "expense-item";

    const main = document.createElement("div");
    main.className = "expense-main";

    const name = document.createElement("p");
    name.className = "expense-name";
    name.textContent = transaction.text;

    const meta = document.createElement("div");
    meta.className = "expense-meta";

    const date = document.createElement("span");
    date.textContent = `Date: ${formatDate(transaction.date)}`;

    const status = getStatus(transaction);
    const badge = document.createElement("span");

    badge.className =
      `status-badge ${status === "paid" ? "status-paid" : status === "partial" ? "status-partial" : "status-unpaid"}`;

    badge.textContent =
      status === "paid"
        ? "Fully paid"
        : status === "partial"
          ? "Partially paid"
          : "Unpaid";

    meta.append(date, badge);
    main.append(name, meta);

    const side = document.createElement("div");
    side.className = "expense-side";

    const amount = document.createElement("p");
    amount.className = "expense-amount";
    amount.textContent = money(transaction.amount);

    const balanceText = document.createElement("p");
    balanceText.className = "expense-balance";
    balanceText.textContent =
      `Paid ${money(transaction.paidAmount)} · Remaining ${money(getRemaining(transaction))}`;

    const actions = document.createElement("div");
    actions.className = "expense-actions";

    actions.append(
      createButton(
        "Add payment",
        "toggle-btn",
        addPayment,
        transaction.id,
        `Add payment for ${transaction.text}`
      ),
      createButton(
        "Delete",
        "delete-btn",
        deleteTransaction,
        transaction.id,
        `Delete ${transaction.text}`
      )
    );

    side.append(amount, balanceText, actions);
    item.append(main, side);
    list.append(item);
  });
}

function addPayment(id) {
  const target = transactions.find(item => item.id === id);

  if (!target) return;

  const remaining = getRemaining(target);

  if (remaining <= 0) {
    alert("This expense is already fully paid.");
    return;
  }

  const entered = prompt(
    `Remaining balance: ${money(remaining)}\nEnter the additional amount paid:`,
    remaining.toFixed(2)
  );

  if (entered === null) return;

  const payment = Number(entered);

  if (
    !Number.isFinite(payment) ||
    payment <= 0 ||
    payment > remaining
  ) {
    alert(
      `Enter an amount greater than zero and no more than ${money(remaining)}.`
    );
    return;
  }

  target.paidAmount = Math.round(
    (target.paidAmount + payment) * 100
  ) / 100;

  saveTransactions();
  render();
}

function deleteTransaction(id) {
  const target = transactions.find(item => item.id === id);

  if (!target) return;

  if (!confirm(`Delete "${target.text}"? This cannot be undone.`)) {
    return;
  }

  transactions = transactions.filter(item => item.id !== id);

  saveTransactions();
  render();
}

function updateFilterVisibility() {
  dateFilterGroup.hidden = filterMode.value !== "date";
  monthFilterGroup.hidden = filterMode.value !== "month";
}

function updatePaymentFields() {
  const paidSelected = statusInput.value === "paid";

  paymentTypeGroup.hidden = !paidSelected;

  paidAmountGroup.hidden =
    !paidSelected || paymentTypeInput.value !== "partial";

  paidAmountInput.required =
    paidSelected && paymentTypeInput.value === "partial";
}

function render() {
  updateFilterVisibility();
  updatePaymentFields();
  updateSummary();
  renderList();
}

statusInput.addEventListener("change", updatePaymentFields);
paymentTypeInput.addEventListener("change", updatePaymentFields);

usePresetButton.addEventListener("click", () => {
  if (!presetInput.value) {
    alert("Choose a common expense first.");
    return;
  }

  textInput.value = presetInput.value;
  textInput.focus();
});

filterMode.addEventListener("change", render);
filterDate.addEventListener("change", render);
filterMonth.addEventListener("change", render);
statusFilter.addEventListener("change", render);
searchInput.addEventListener("input", render);

clearFiltersButton.addEventListener("click", () => {
  filterMode.value = "all";
  filterDate.value = "";
  filterMonth.value = "";
  statusFilter.value = "all";
  searchInput.value = "";

  render();
});

form.addEventListener("submit", addTransaction);
connectSaveButton.addEventListener("click", connectSaveFile);

render();
restoreFileHandle();



