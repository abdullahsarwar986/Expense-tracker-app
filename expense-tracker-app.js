
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

const money = value =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);

function todayLocal() {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );

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
    .map(item => ({
      id: item.id ?? generateID(),
      text: item.text,
      amount: Number(item.amount),
      date:
        typeof item.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ? item.date
          : todayLocal(),
      status: item.status === "paid" ? "paid" : "unpaid"
    }));
}

function loadTransactions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return normalizeTransactions(saved);
  } catch (error) {
    console.error("Could not read saved expenses:", error);
    return [];
  }
}

let transactions = loadTransactions();

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
  let permission = await handle.queryPermission({
    mode: "readwrite"
  });

  if (permission !== "granted") {
    permission = await handle.requestPermission({
      mode: "readwrite"
    });
  }

  return permission === "granted";
}

async function connectSaveFile() {
  try {
    if (!window.showSaveFilePicker) {
      saveStatus.textContent =
        "File saving is unavailable. Open this app using Google Chrome and localhost.";
      return;
    }

    // Reuse the previously selected file when possible.
    let handle = saveFileHandle;

    if (!handle) {
      handle = await getStoredFileHandle();
    }

    if (handle) {
      const granted = await requestFilePermission(handle);

      if (!granted) {
        handle = null;
      }
    }

    // If no usable saved handle exists, ask the user to choose a file.
    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName: "transactions.json",
        types: [{
          description: "Expense Tracker JSON file",
          accept: {
            "application/json": [".json"]
          }
        }]
      });

      const granted = await requestFilePermission(handle);

      if (!granted) {
        saveStatus.textContent =
          "File permission was not granted. Browser storage remains active.";
        return;
      }
    }

    saveFileHandle = handle;

    // Save the handle so Chrome can try to restore it next time.
    await storeFileHandle(handle);

    // Merge existing file data with browser data before writing.
    // Browser entries take priority when IDs match.
    try {
      const file = await handle.getFile();
      const contents = await file.text();

      if (contents.trim()) {
        const fileData = normalizeTransactions(JSON.parse(contents));
        const merged = new Map();

        fileData.forEach(item => merged.set(item.id, item));
        transactions.forEach(item => merged.set(item.id, item));

        transactions = Array.from(merged.values());

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(transactions)
        );

        render();
      }
    } catch (error) {
      // Do not overwrite an unreadable or invalid file.
      saveFileHandle = null;
      saveStatus.textContent =
        "Could not read this JSON file. Choose a valid Expense Tracker file or a new file.";
      console.error("Could not read selected JSON file:", error);
      return;
    }

    await saveTransactions();

    saveStatus.textContent =
      "File connected. Automatic saving is enabled.";
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not connect save file:", error);

      saveStatus.textContent =
        "Could not connect file. Your browser data is still available.";
    }
  }
}

async function restoreFileHandle() {
  try {
    const handle = await getStoredFileHandle();

    if (!handle) return;

    // Check permission without prompting on page load.
    const permission = await handle.queryPermission({
      mode: "readwrite"
    });

    if (permission === "granted") {
      saveFileHandle = handle;
      saveStatus.textContent = "Auto-save file connected.";

      // Write current browser data to the connected file.
      await saveTransactions();
    } else {
      saveStatus.textContent =
        "Click Choose Documents Save File to reconnect your file.";
    }
  } catch (error) {
    console.error("Could not restore file connection:", error);
    saveStatus.textContent =
      "Browser storage is active. Reconnect your save file if needed.";
  }
}

function saveTransactions() {
  // Preserve the existing browser storage.
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(transactions)
    );
  } catch (error) {
    console.error("Browser storage save failed:", error);
    saveStatus.textContent =
      "Browser storage failed. Check available storage.";
  }

  if (!saveFileHandle) {
    if (saveStatus) {
      saveStatus.textContent =
        "Saved in browser. Connect a JSON file for file auto-save.";
    }
    return Promise.resolve();
  }

  // Queue writes in order, even after a previous write fails.
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const writable = await saveFileHandle.createWritable();

      try {
        await writable.write(
          JSON.stringify(transactions, null, 2)
        );

        await writable.close();

        saveStatus.textContent =
          "All expenses saved automatically.";
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
      "File auto-save failed. Click Choose Documents Save File to reconnect.";

    // Keep the browser copy even if file saving fails.
  });
}

function addTransaction(event) {
  event.preventDefault();

  const name = textInput.value.trim();
  const value = Number(amountInput.value);
  const date = dateInput.value;

  if (!name || !Number.isFinite(value) || value <= 0 || !date) {
    alert(
      "Please enter an expense name, a valid positive amount, and a date."
    );
    return;
  }

  transactions.push({
    id: generateID(),
    text: name,
    amount: Math.round(value * 100) / 100,
    date,
    status: statusInput.value === "paid" ? "paid" : "unpaid"
  });

  saveTransactions();

  form.reset();
  dateInput.value = todayLocal();
  statusInput.value = "unpaid";

  render();
  textInput.focus();
}

function getFilteredTransactions() {
  const mode = filterMode.value;
  const status = statusFilter.value;

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

      if (status !== "all" && item.status !== status) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function sum(items) {
  return items.reduce(
    (total, item) => total + item.amount,
    0
  );
}

function updateSummary() {
  const paid = transactions.filter(item => item.status === "paid");
  const unpaid = transactions.filter(item => item.status === "unpaid");

  balance.textContent = money(sum(transactions));
  paidTotal.textContent = money(sum(paid));
  unpaidTotal.textContent = money(sum(unpaid));

  paidCount.textContent =
    `${paid.length} ${paid.length === 1 ? "expense" : "expenses"}`;

  unpaidCount.textContent =
    `${unpaid.length} ${unpaid.length === 1 ? "expense" : "expenses"}`;

  const filtered = getFilteredTransactions();
  const filteredPaidItems = filtered.filter(item => item.status === "paid");
  const filteredUnpaidItems = filtered.filter(item => item.status === "unpaid");

  filteredTotal.textContent = money(sum(filtered));
  filteredPaid.textContent = money(sum(filteredPaidItems));
  filteredUnpaid.textContent = money(sum(filteredUnpaidItems));
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
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

    const badge = document.createElement("span");
    badge.className =
      `status-badge ${
        transaction.status === "paid" ? "status-paid" : "status-unpaid"
      }`;
    badge.textContent = transaction.status;

    meta.append(date, badge);
    main.append(name, meta);

    const side = document.createElement("div");
    side.className = "expense-side";

    const amount = document.createElement("p");
    amount.className = "expense-amount";
    amount.textContent = money(transaction.amount);

    const actions = document.createElement("div");
    actions.className = "expense-actions";

    actions.append(
      createButton(
        transaction.status === "paid" ? "Mark unpaid" : "Mark paid",
        "toggle-btn",
        toggleStatus,
        transaction.id,
        `${transaction.status === "paid" ? "Mark unpaid" : "Mark paid"}: ${transaction.text}`
      ),
      createButton(
        "Delete",
        "delete-btn",
        deleteTransaction,
        transaction.id,
        `Delete ${transaction.text}`
      )
    );

    side.append(amount, actions);
    item.append(main, side);
    list.append(item);
  });
}

function toggleStatus(id) {
  transactions = transactions.map(item =>
    item.id === id
      ? {
          ...item,
          status: item.status === "paid" ? "unpaid" : "paid"
        }
      : item
  );

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

function render() {
  updateFilterVisibility();
  updateSummary();
  renderList();
}

filterMode.addEventListener("change", render);
filterDate.addEventListener("change", render);
filterMonth.addEventListener("change", render);
statusFilter.addEventListener("change", render);

clearFiltersButton.addEventListener("click", () => {
  filterMode.value = "all";
  filterDate.value = "";
  filterMonth.value = "";
  statusFilter.value = "all";

  render();
});

form.addEventListener("submit", addTransaction);
connectSaveButton.addEventListener("click", connectSaveFile);

render();
restoreFileHandle();


