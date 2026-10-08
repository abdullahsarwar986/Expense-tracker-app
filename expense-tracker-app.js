const balance = document.getElementById('balance');
const list = document.getElementById('list');
const form = document.getElementById('expense-form');
const text = document.getElementById('text');
const amount = document.getElementById('amount');

// Get saved transactions from Local Storage
let transactions = localStorage.getItem('transactions') !== null
    ? JSON.parse(localStorage.getItem('transactions'))
    : [];

// Add a new expense
function addTransaction(e) {
    e.preventDefault();

    const expenseName = text.value.trim();
    const expenseAmount = parseFloat(amount.value);

    // Validate input
    if (expenseName === '' || isNaN(expenseAmount) || expenseAmount <= 0) {
        alert('Please enter a valid expense name and amount.');
        return;
    }

    const transaction = {
        id: generateID(),
        text: expenseName,
        amount: expenseAmount
    };

    // Add transaction to array
    transactions.push(transaction);

    // Update screen
    addTransactionDOM(transaction);
    updateValues();

    // Save to Local Storage
    updateLocalStorage();

    // Clear form
    text.value = '';
    amount.value = '';
}

// Generate unique ID
function generateID() {
    return Math.floor(Math.random() * 100000000);
}

// Add transaction to the page
function addTransactionDOM(transaction) {
    const item = document.createElement('li');

    const expenseName = document.createElement('span');
    expenseName.textContent = transaction.text;

    const expenseAmount = document.createElement('span');
    expenseAmount.textContent = `$${transaction.amount.toFixed(2)}`;

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'delete-btn';

    deleteButton.addEventListener('click', function () {
        removeTransaction(transaction.id);
    });

    item.appendChild(expenseName);
    item.appendChild(expenseAmount);
    item.appendChild(deleteButton);

    list.appendChild(item);
}

// Calculate and update total balance
function updateValues() {
    const total = transactions.reduce(
        (acc, item) => acc + item.amount,
        0
    );

    balance.innerText = `$${total.toFixed(2)}`;
}

// Delete transaction
function removeTransaction(id) {
    transactions = transactions.filter(
        transaction => transaction.id !== id
    );

    updateLocalStorage();
    init();
}

// Save transactions to Local Storage
function updateLocalStorage() {
    localStorage.setItem(
        'transactions',
        JSON.stringify(transactions)
    );
}


function init() {
    list.innerHTML = '';

    transactions.forEach(addTransactionDOM);

    updateValues();
}

init();


form.addEventListener('submit', addTransaction);
