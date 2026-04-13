/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearchInput = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const chatInput = document.getElementById("userInput");

/* Replace this with your deployed Cloudflare Worker URL */
const CLOUDFLARE_WORKER_URL = "https://loreal-worker.efxdy.workers.dev/";

const SELECTED_PRODUCTS_STORAGE_KEY = "loreal-selected-products";
const CONVERSATION_HISTORY_STORAGE_KEY = "loreal-conversation-history";
const GENERATED_ROUTINE_STORAGE_KEY = "loreal-generated-routine";

const ROUTINE_SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are a L'Oréal product-aware routine builder chatbot. Only answer about the generated routine, the selected products, or related topics like skincare, haircare, makeup, fragrance, and similar L'Oréal products. If the user asks something outside that scope, politely redirect them back to the routine or product advice.",
};

let allProducts = [];
let selectedProducts = [];
let conversationHistory = [];
let generatedRoutine = "";
let currentCategory = "";
let productSearchTerm = "";

/* Show initial placeholders */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Choose a category or search by keyword to browse products, then click a card to add it to your routine.
  </div>
`;

selectedProductsList.innerHTML = `
  <div class="selected-empty-state">
    Your selected products will appear here.
  </div>
`;

chatWindow.innerHTML = `
  <div class="chat-placeholder">
    Generate a routine to start the conversation.
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

function getStoredValue(key, fallbackValue) {
  const storedValue = localStorage.getItem(key);

  if (!storedValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(storedValue);
  } catch (error) {
    return fallbackValue;
  }
}

function saveSelectedProducts() {
  const selectedProductIds = selectedProducts.map((product) => product.id);
  localStorage.setItem(
    SELECTED_PRODUCTS_STORAGE_KEY,
    JSON.stringify(selectedProductIds),
  );
}

function saveConversationHistory() {
  localStorage.setItem(
    CONVERSATION_HISTORY_STORAGE_KEY,
    JSON.stringify(conversationHistory),
  );
  localStorage.setItem(
    GENERATED_ROUTINE_STORAGE_KEY,
    JSON.stringify(generatedRoutine),
  );
}

function loadSavedSelection() {
  const savedSelectedIds = getStoredValue(SELECTED_PRODUCTS_STORAGE_KEY, []);
  selectedProducts = allProducts.filter((product) =>
    savedSelectedIds.includes(product.id),
  );
}

function loadSavedConversation() {
  conversationHistory = getStoredValue(CONVERSATION_HISTORY_STORAGE_KEY, []);
  generatedRoutine = getStoredValue(GENERATED_ROUTINE_STORAGE_KEY, "");

  if (!generatedRoutine) {
    const lastAssistantMessage = [...conversationHistory]
      .reverse()
      .find((message) => message.role === "assistant");

    generatedRoutine = lastAssistantMessage ? lastAssistantMessage.content : "";
  }
}

function formatCategoryLabel(category) {
  return category
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeText(value) {
  return value.toLowerCase().trim();
}

function getDefaultDirection() {
  const rtlLanguages = ["ar", "he", "fa", "ur"];
  const browserLanguage = (navigator.language || "en").toLowerCase();

  return rtlLanguages.some((languageCode) =>
    browserLanguage.startsWith(languageCode),
  )
    ? "rtl"
    : "ltr";
}

function applyPageDirection(direction) {
  const safeDirection = direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", safeDirection);
}

function getProductSearchLinks(product) {
  const encodedQuery = encodeURIComponent(`${product.brand} ${product.name}`);

  return {
    webSearch: `https://www.google.com/search?q=${encodedQuery}`,
    reviews: `https://www.bing.com/search?q=${encodedQuery}%20review`,
  };
}

function getProductCitationsMarkup(product) {
  const links = getProductSearchLinks(product);

  return `
    <div class="product-citations" aria-label="Web citations for ${product.name}">
      <a
        class="product-citation-link"
        href="${links.webSearch}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Source: Google Search
      </a>
      <a
        class="product-citation-link"
        href="${links.reviews}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Source: Bing Reviews Search
      </a>
    </div>
  `;
}

function getChatResponseCitations() {
  const maxCitations = 6;
  const citations = [];
  const seenUrls = new Set();

  selectedProducts.forEach((product) => {
    const links = getProductSearchLinks(product);

    const productLinks = [
      {
        label: `${product.brand} ${product.name} - Google Search`,
        url: links.webSearch,
      },
      {
        label: `${product.brand} ${product.name} - Bing Reviews`,
        url: links.reviews,
      },
    ];

    productLinks.forEach((link) => {
      if (citations.length >= maxCitations || seenUrls.has(link.url)) {
        return;
      }

      seenUrls.add(link.url);
      citations.push(link);
    });
  });

  return citations;
}

function createChatCitationsElement(citations) {
  const citationsContainer = document.createElement("div");
  citationsContainer.className = "chat-citations";

  const heading = document.createElement("p");
  heading.className = "chat-citations-title";
  heading.textContent = "Sources";
  citationsContainer.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "chat-citations-list";

  citations.forEach((citation) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.className = "chat-citation-link";
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.label;

    listItem.appendChild(link);
    list.appendChild(listItem);
  });

  citationsContainer.appendChild(list);
  return citationsContainer;
}

function getVisibleProducts() {
  const normalizedSearchTerm = normalizeText(productSearchTerm);
  const categoryFilteredProducts = currentCategory
    ? allProducts.filter((product) => product.category === currentCategory)
    : allProducts;

  if (!normalizedSearchTerm) {
    return categoryFilteredProducts;
  }

  return categoryFilteredProducts.filter((product) => {
    const searchableText = `${product.name} ${product.brand} ${product.category} ${product.description}`;
    return normalizeText(searchableText).includes(normalizedSearchTerm);
  });
}

function getSelectedProductPayload() {
  return selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
    citations: getProductSearchLinks(product),
  }));
}

function setEmptyProductsState(message) {
  productsContainer.innerHTML = `
    <div class="placeholder-message">
      ${message}
    </div>
  `;
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  const hasSearchTerm = Boolean(normalizeText(productSearchTerm));

  if (!currentCategory && !hasSearchTerm) {
    setEmptyProductsState(
      "Choose a category or search by keyword to browse products, then click a card to add it to your routine.",
    );
    return;
  }

  if (!visibleProducts.length) {
    if (currentCategory && hasSearchTerm) {
      setEmptyProductsState(
        `No products found in ${formatCategoryLabel(
          currentCategory,
        )} matching \"${productSearchTerm}\".`,
      );
      return;
    }

    if (currentCategory) {
      setEmptyProductsState("No products found for this category.");
      return;
    }

    setEmptyProductsState(`No products found matching \"${productSearchTerm}\".`);
    return;
  }

  productsContainer.innerHTML = visibleProducts
    .map((product) => {
      const isSelected = selectedProducts.some(
        (selectedProduct) => selectedProduct.id === product.id,
      );

      return `
        <article
          class="product-card ${isSelected ? "is-selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
          aria-label="${isSelected ? "Remove" : "Select"} ${product.name} by ${product.brand}. ${product.description}"
        >
          <img src="${product.image}" alt="${product.name} by ${product.brand}" />
          <div class="product-info">
            <div class="product-meta">
              <span class="product-brand">${product.brand}</span>
              <span class="product-category">${formatCategoryLabel(
                product.category,
              )}</span>
            </div>
            <h3>${product.name}</h3>
            <p class="product-description">${product.description}</p>
            ${getProductCitationsMarkup(product)}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSelectedProducts() {
  if (!selectedProducts.length) {
    selectedProductsList.innerHTML = `
      <div class="selected-empty-state">
        No products selected yet. Click a product card to add it here.
      </div>
    `;
    generateRoutineButton.disabled = true;
    generateRoutineButton.setAttribute("aria-disabled", "true");
    return;
  }

  generateRoutineButton.disabled = false;
  generateRoutineButton.removeAttribute("aria-disabled");

  selectedProductsList.innerHTML = `
    <div class="selected-products-toolbar">
      <p>${selectedProducts.length} selected product${
        selectedProducts.length === 1 ? "" : "s"
      }</p>
      <button type="button" class="clear-selected-btn" data-action="clear-selected">
        Clear all
      </button>
    </div>
    <div class="selected-products-items">
      ${selectedProducts
        .map(
          (product) => `
            <article class="selected-product-card">
              <div class="selected-product-copy">
                <div class="selected-product-meta">
                  <span class="selected-product-brand">${product.brand}</span>
                  <span class="selected-product-category">${formatCategoryLabel(
                    product.category,
                  )}</span>
                </div>
                <h3>${product.name}</h3>
                <p class="selected-product-description">${product.description}</p>
                ${getProductCitationsMarkup(product)}
              </div>
              <button
                type="button"
                class="remove-selected-btn"
                data-remove-id="${product.id}"
              >
                Remove
              </button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderChatWindow(statusMessage = "") {
  if (!conversationHistory.length) {
    chatWindow.innerHTML = `
      <div class="chat-placeholder">
        Generate a routine to start the conversation.
      </div>
    `;
    return;
  }

  chatWindow.innerHTML = "";

  conversationHistory.forEach((message) => {
    const messageBubble = document.createElement("div");
    messageBubble.className = `chat-message chat-message--${message.role}`;

    const messageText = document.createElement("p");
    messageText.className = "chat-message-text";
    messageText.textContent = message.content;
    messageBubble.appendChild(messageText);

    if (
      message.role === "assistant" &&
      Array.isArray(message.citations) &&
      message.citations.length
    ) {
      const citationsElement = createChatCitationsElement(message.citations);
      messageBubble.appendChild(citationsElement);
    }

    chatWindow.appendChild(messageBubble);
  });

  if (statusMessage) {
    const statusBubble = document.createElement("div");
    statusBubble.className = "chat-message chat-message--status";
    statusBubble.textContent = statusMessage;
    chatWindow.appendChild(statusBubble);
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function syncSelectionState() {
  saveSelectedProducts();
  renderSelectedProducts();
  renderProducts();
}

function toggleProductSelection(productId) {
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  const isAlreadySelected = selectedProducts.some(
    (selectedProduct) => selectedProduct.id === productId,
  );

  if (isAlreadySelected) {
    selectedProducts = selectedProducts.filter(
      (selectedProduct) => selectedProduct.id !== productId,
    );
  } else {
    selectedProducts = [...selectedProducts, product];
  }

  syncSelectionState();
}

function clearSelectedProducts() {
  selectedProducts = [];
  syncSelectionState();
}

function buildRoutinePrompt() {
  const selectedProductPayload = getSelectedProductPayload();

  return `Create a personalized L'Oréal routine using these selected products. Return a clear AM / PM routine, explain the order of use, and keep the response practical and friendly. Use this JSON data for each selected product:\n${JSON.stringify(
    selectedProductPayload,
    null,
    2,
  )}`;
}

async function sendToWorker(messages, mode) {
  if (CLOUDFLARE_WORKER_URL.includes("your-worker-name")) {
    return "Add your Cloudflare Worker URL in script.js to connect this chatbot to OpenAI.";
  }

  const response = await fetch(CLOUDFLARE_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode,
      messages,
      selectedProducts: getSelectedProductPayload(),
      conversationHistory,
      generatedRoutine,
    }),
  });

  if (!response.ok) {
    throw new Error("Worker request failed");
  }

  const data = await response.json();

  return (
    data.reply ||
    data.choices?.[0]?.message?.content ||
    data.message ||
    "No response found."
  );
}

function buildWorkerMessages(historySnapshot, userMessage) {
  return [
    ROUTINE_SYSTEM_MESSAGE,
    ...historySnapshot,
    {
      role: "user",
      content: userMessage,
    },
  ];
}

productsContainer.addEventListener("click", (event) => {
  if (event.target.closest(".product-citation-link")) {
    return;
  }

  const productCard = event.target.closest("[data-product-id]");

  if (!productCard) {
    return;
  }

  toggleProductSelection(Number(productCard.dataset.productId));
});

productsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const productCard = event.target.closest("[data-product-id]");

  if (!productCard) {
    return;
  }

  event.preventDefault();
  toggleProductSelection(Number(productCard.dataset.productId));
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  const clearButton = event.target.closest("[data-action='clear-selected']");

  if (removeButton) {
    const productId = Number(removeButton.dataset.removeId);
    toggleProductSelection(productId);
    return;
  }

  if (clearButton) {
    clearSelectedProducts();
  }
});

categoryFilter.addEventListener("change", (event) => {
  currentCategory = event.target.value;
  renderProducts();
});

productSearchInput.addEventListener("input", (event) => {
  productSearchTerm = event.target.value;
  renderProducts();
});

generateRoutineButton.addEventListener("click", async () => {
  if (!selectedProducts.length) {
    conversationHistory = [
      {
        role: "assistant",
        content: "Select at least one product before generating a routine.",
      },
    ];
    renderChatWindow();
    return;
  }

  const routinePrompt = buildRoutinePrompt();
  renderChatWindow("Generating your routine...");

  try {
    const assistantReply = await sendToWorker(
      buildWorkerMessages([], routinePrompt),
      "generate-routine",
    );

    generatedRoutine = assistantReply;
    conversationHistory = [
      {
        role: "assistant",
        content: assistantReply,
        citations: getChatResponseCitations(),
      },
    ];
    saveConversationHistory();
    renderChatWindow();
  } catch (error) {
    conversationHistory = [
      {
        role: "assistant",
        content: "Could not connect to the Cloudflare Worker.",
      },
    ];
    renderChatWindow();
  }
});

/* Chat form submission handler */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = chatInput.value.trim();

  if (!userMessage) {
    return;
  }

  if (!generatedRoutine) {
    conversationHistory = [
      {
        role: "assistant",
        content:
          "Generate a routine first, then ask follow-up questions about that routine or related L'Oréal product topics.",
      },
    ];
    renderChatWindow();
    chatInput.value = "";
    return;
  }

  conversationHistory = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];
  saveConversationHistory();
  renderChatWindow("Thinking...");

  try {
    const assistantReply = await sendToWorker(
      buildWorkerMessages(conversationHistory.slice(0, -1), userMessage),
      "follow-up",
    );

    conversationHistory = [
      ...conversationHistory,
      {
        role: "assistant",
        content: assistantReply,
        citations: getChatResponseCitations(),
      },
    ];
    saveConversationHistory();
    renderChatWindow();
  } catch (error) {
    conversationHistory = [
      ...conversationHistory,
      {
        role: "assistant",
        content: "Could not connect to the Cloudflare Worker.",
      },
    ];
    saveConversationHistory();
    renderChatWindow();
  }

  chatInput.value = "";
});

async function initializeApp() {
  applyPageDirection(getDefaultDirection());

  allProducts = await loadProducts();
  loadSavedSelection();
  loadSavedConversation();
  renderSelectedProducts();
  renderProducts();
  renderChatWindow();
}

initializeApp();
