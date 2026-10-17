
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

const STORAGE_KEY = "transactions";

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

function loadTransactions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return [];

    return saved
      .filter(
        item =>
          item &&
          typeof item.text === "string" &&
          Number.isFinite(Number(item.amount))
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
  } catch (error) {
    console.error("Could not read saved expenses:", error);
    return [];
  }
}

let transactions = loadTransactions();

function generateID() {
  return window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveTransactions() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(transactions)
  );
}

function addTransaction(event) {
  event.preventDefault();

  const name = textInput.value.trim();
  const value = Number(amountInput.value);
  const date = dateInput.value;

  if (
    !name ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !date
  ) {
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
  const paid = transactions.filter(
    item => item.status === "paid"
  );

  const unpaid = transactions.filter(
    item => item.status === "unpaid"
  );

  balance.textContent = money(sum(transactions));
  paidTotal.textContent = money(sum(paid));
  unpaidTotal.textContent = money(sum(unpaid));

  paidCount.textContent =
    `${paid.length} ${paid.length === 1 ? "expense" : "expenses"}`;

  unpaidCount.textContent =
    `${unpaid.length} ${unpaid.length === 1 ? "expense" : "expenses"}`;

  const filtered = getFilteredTransactions();

  const filteredPaidItems = filtered.filter(
    item => item.status === "paid"
  );

  const filteredUnpaidItems = filtered.filter(
    item => item.status === "unpaid"
  );

  filteredTotal.textContent = money(sum(filtered));
  filteredPaid.textContent = money(sum(filteredPaidItems));
  filteredUnpaid.textContent = money(sum(filteredUnpaidItems));
}

function formatDate(dateString) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}

function createButton(
  label,
  className,
  action,
  id,
  ariaLabel
) {
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

  emptyState.style.display = filtered.length
    ? "none"
    : "block";

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
        transaction.status === "paid"
          ? "status-paid"
          : "status-unpaid"
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
        transaction.status === "paid"
          ? "Mark unpaid"
          : "Mark paid",
        "toggle-btn",
        toggleStatus,
        transaction.id,
        `${
          transaction.status === "paid"
            ? "Mark unpaid"
            : "Mark paid"
        }: ${transaction.text}`
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
          status:
            item.status === "paid" ? "unpaid" : "paid"
        }
      : item
  );

  saveTransactions();
  render();
}

function deleteTransaction(id) {
  const target = transactions.find(
    item => item.id === id
  );

  if (!target) return;

  if (
    !confirm(
      `Delete "${target.text}"? This cannot be undone.`
    )
  ) {
    return;
  }

  transactions = transactions.filter(
    item => item.id !== id
  );

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

render();

