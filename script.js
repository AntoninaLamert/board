const STORAGE_KEY = "task-board-v2";
const LEGACY_STORAGE_KEY = "task-board-v1";
const STICKERS = ["⭐", "❤️", "🔥", "💡", "✅"];
const COLUMN_ICONS = ["", "📌", "📥", "⚙️", "✅", "💡", "🎨", "📚", "🏠", "💼", "🚀", "⭐"];
const PALETTE = [
  ["Красный", "#fca5a5"], ["Красный яркий", "#f87171"],
  ["Малиновый", "#f9a8d4"], ["Малиновый яркий", "#f472b6"],
  ["Оранжевый", "#fdba74"], ["Оранжевый яркий", "#fb923c"],
  ["Синий", "#93c5fd"], ["Синий яркий", "#60a5fa"],
  ["Голубой", "#67e8f9"], ["Голубой яркий", "#22d3ee"],
  ["Зелёный", "#86efac"], ["Зелёный яркий", "#4ade80"],
  ["Лазурный", "#7dd3fc"], ["Лазурный яркий", "#38bdf8"],
];
const COLORS = ["#93c5fd", "#67e8f9", "#fdba74", "#86efac", "#f9a8d4", "#7dd3fc", "#fca5a5"];
const THEME_KEY = "task-board-theme";
const board = document.getElementById("board");
const boardScroll = document.getElementById("board-scroll");
const dialog = document.getElementById("card-dialog");
const form = document.getElementById("card-form");
const titleField = document.getElementById("card-title");
const descriptionField = document.getElementById("card-description");
const dialogHint = document.getElementById("dialog-hint");
const dialogTitle = document.getElementById("dialog-title");
const submitCardButton = document.getElementById("submit-card");
const themeToggle = document.getElementById("theme-toggle");
const colorPalette = document.getElementById("color-palette");
const fileButton = document.getElementById("file-button");
const fileMenu = document.getElementById("file-menu");
const fileInput = document.getElementById("board-file");
const notice = document.getElementById("notice");

let chosenTheme = null;
try { chosenTheme = localStorage.getItem(THEME_KEY); } catch (_) { /* Storage is optional. */ }
if (!["dark", "light", "pastel", "bright", "minimal"].includes(chosenTheme)) chosenTheme = null;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
  themeToggle.title = dark ? "Включить светлую тему" : "Включить тёмную тему";
  themeToggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#000000" : "#f7f9f3";
}
applyTheme(chosenTheme ? chosenTheme === "dark" : systemTheme.matches);
themeToggle.addEventListener("click", () => {
  const dark = !document.documentElement.classList.contains("dark");
  setThemePreset(dark ? "dark" : "light");
});
systemTheme.addEventListener?.("change", event => {
  if (!chosenTheme) {
    applyTheme(event.matches);
    document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    document.getElementById("theme-select").value = event.matches ? "dark" : "light";
  }
});

function initialColumns() {
  return ["", "Принято", "В деле", "Закончено"].map((name, index) => ({
    id: makeId(),
    name,
    color: COLORS[index],
    icon: ["", "📥", "⚙️", "✅"][index],
    cards: [],
  }));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const isColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const isImageData = value => typeof value === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value);
function normalizeCard(card, columnColor) {
  if (!card || typeof card.title !== "string" || !card.title.trim() || card.title.length > 120 ||
      typeof card.description !== "string" || card.description.length > 2000) throw new Error("Повреждены данные карточки.");
  const attachments = Array.isArray(card.attachments) ? card.attachments.map(file => {
    if (!file || typeof file.name !== "string" || file.name.length > 200 ||
        typeof file.data !== "string" || !/^data:[^,]*;base64,/i.test(file.data)) throw new Error("Повреждено вложение.");
    return { id: typeof file.id === "string" ? file.id : makeId(), name: file.name, data: file.data,
      type: typeof file.type === "string" ? file.type : "application/octet-stream" };
  }) : [];
  const checklist = Array.isArray(card.checklist) ? card.checklist.map(item => {
    if (!item || typeof item.text !== "string" || item.text.length > 200) throw new Error("Повреждён чек-лист.");
    return { id: typeof item.id === "string" ? item.id : makeId(), text: item.text, done: Boolean(item.done) };
  }) : [];
  return {
    id: typeof card.id === "string" ? card.id : makeId(), title: card.title, description: card.description,
    color: isColor(card.color) ? card.color : columnColor,
    cover: isImageData(card.cover) ? card.cover : "", attachments, checklist,
    stickers: Array.isArray(card.stickers) ? card.stickers.filter(value => STICKERS.includes(value)) : [],
    pinned: Boolean(card.pinned), locked: Boolean(card.locked), large: Boolean(card.large),
  };
}
function normalizeColumn(column) {
  if (!column || typeof column.name !== "string" || column.name.length > 80 ||
      !isColor(column.color) || !Array.isArray(column.cards)) throw new Error("Повреждены данные колонки.");
  const cards = column.cards.map(card => normalizeCard(card, column.color));
  return {
    id: typeof column.id === "string" ? column.id : makeId(), name: column.name, color: column.color,
    icon: COLUMN_ICONS.includes(column.icon) ? column.icon : "", collapsed: Boolean(column.collapsed),
    cards: [...cards.filter(card => card.pinned), ...cards.filter(card => !card.pinned)],
  };
}
function normalizeWorkspace(data) {
  if (Array.isArray(data)) data = { format: "task-board", version: 1, columns: data };
  if (data?.format !== "task-board") throw new Error("Это не файл доски.");
  if (data.version === 1) {
    if (!Array.isArray(data.columns)) throw new Error("Повреждены данные доски.");
    const id = makeId();
    return { format: "task-board", version: 2, activeBoardId: id,
      boards: [{ id, name: "Моя доска", columns: data.columns.map(normalizeColumn), background: "plain", animated: false }],
      trash: [], settings: { compact: false, sound: false, zoom: 100, theme: null } };
  }
  if (data.version !== 2 || !Array.isArray(data.boards) || !data.boards.length) {
    throw new Error("Версия файла не поддерживается или данные повреждены.");
  }
  const boards = data.boards.map(item => {
    if (!item || typeof item.name !== "string" || item.name.length > 80 || !Array.isArray(item.columns)) {
      throw new Error("Повреждены данные одной из досок.");
    }
    return { id: typeof item.id === "string" ? item.id : makeId(), name: item.name,
      columns: item.columns.map(normalizeColumn),
      background: ["plain", "dots", "grid", "lavender", "mint", "sunset"].includes(item.background) || isImageData(item.background) ? item.background : "plain",
      animated: Boolean(item.animated) };
  });
  const trash = Array.isArray(data.trash) ? data.trash.map(item => {
    if (!item || !["card", "column"].includes(item.type)) throw new Error("Повреждена корзина.");
    const payload = item.type === "column" ? normalizeColumn(item.data) : normalizeCard(item.data, "#93c5fd");
    return { id: typeof item.id === "string" ? item.id : makeId(), type: item.type, data: payload,
      boardId: item.boardId, columnId: item.columnId, index: Number.isInteger(item.index) ? item.index : 0,
      deletedAt: typeof item.deletedAt === "number" ? item.deletedAt : Date.now() };
  }) : [];
  const settings = data.settings || {};
  return { format: "task-board", version: 2,
    activeBoardId: boards.some(item => item.id === data.activeBoardId) ? data.activeBoardId : boards[0].id,
    boards, trash, settings: {
      compact: Boolean(settings.compact), sound: Boolean(settings.sound),
      zoom: Number.isFinite(settings.zoom) ? Math.max(70, Math.min(130, settings.zoom)) : 100,
      theme: ["light", "dark", "pastel", "bright", "minimal"].includes(settings.theme) ? settings.theme : null,
    } };
}
function initialWorkspace() {
  const id = makeId();
  return { format: "task-board", version: 2, activeBoardId: id,
    boards: [{ id, name: "Моя доска", columns: initialColumns().map(normalizeColumn), background: "plain", animated: false }],
    trash: [], settings: { compact: false, sound: false, zoom: 100, theme: null } };
}
function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeWorkspace(JSON.parse(saved));
  } catch (_) { /* Try the previous version of local storage. */ }
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return normalizeWorkspace(JSON.parse(legacy));
  } catch (_) { /* Invalid or unavailable storage starts with a fresh board. */ }
  return initialWorkspace();
}
let workspace = loadWorkspace();
workspace.settings.sound = false;
const activeBoard = () => workspace.boards.find(item => item.id === workspace.activeBoardId) || workspace.boards[0];
let columns = activeBoard().columns;
let targetColumnId = null;
let createColumn = false;
let editingCardId = null;
let suppressCardClickUntil = 0;
let noticeTimer = null;

function saveColumns() {
  try {
    activeBoard().columns = columns;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch (_) {
    if (!storageWarningShown) {
      storageWarningShown = true;
      showNotice("Автосохранение недоступно: хранилище браузера заполнено или отключено. Сохраните доски в TXT.", true);
    }
    return false;
  }
}

let storageWarningShown = false;
saveColumns();
window.addEventListener("pagehide", saveColumns);

function showNotice(message, isError = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.className = isError ? "notice error" : "notice";
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
}

function closeFileMenu() {
  fileMenu.hidden = true;
  fileButton.setAttribute("aria-expanded", "false");
}

function boardFileText() {
  activeBoard().columns = columns;
  return JSON.stringify(workspace, null, 2);
}

function parseWorkspaceFile(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch (_) { throw new Error("Файл не содержит данные доски в формате JSON."); }
  return normalizeWorkspace(data);
}
function parseBoardFile(text) { return parseWorkspaceFile(text).boards[0].columns; }

function saveBoardFile() {
  try {
    const blob = new Blob([boardFileText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "doska-zadach.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showNotice("Файл доски подготовлен для скачивания.");
  } catch (_) {
    showNotice("Не удалось сохранить файл. Попробуйте ещё раз.", true);
  }
}

function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "UTF-8");
  });
}

async function loadBoardFile(file) {
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error("Файл слишком большой (максимум 50 МБ).");
    workspace = parseWorkspaceFile(await readFileText(file));
    columns = activeBoard().columns;
    saveColumns();
    applyWorkspaceSettings();
    renderBoard();
    boardScroll.scrollTo({ left: 0 });
    showNotice("Доска восстановлена из файла.");
    return true;
  } catch (error) {
    showNotice(`Не удалось загрузить доску. ${error.message || "Проверьте файл и попробуйте снова."}`, true);
    return false;
  }
}

fileButton.addEventListener("click", () => {
  fileMenu.hidden = !fileMenu.hidden;
  fileButton.setAttribute("aria-expanded", String(!fileMenu.hidden));
});
document.getElementById("save-board").addEventListener("click", () => { closeFileMenu(); saveBoardFile(); });
document.getElementById("load-board").addEventListener("click", () => {
  closeFileMenu();
  fileInput.value = "";
  fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file) await loadBoardFile(file);
  fileInput.value = "";
});
document.addEventListener("click", event => {
  if (!event.target.closest(".file-menu-wrap")) closeFileMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeFileMenu();
});

let activePalette = null;
function closePalette() { colorPalette.hidden = true; activePalette = null; }
function openPalette(kind, columnId, cardId, anchor) {
  if (activePalette?.kind === kind && activePalette.columnId === columnId && activePalette.cardId === cardId) {
    closePalette();
    return;
  }
  const column = columns.find(item => item.id === columnId);
  const card = column?.cards.find(item => item.id === cardId);
  const current = kind === "card" ? card?.color : column?.color;
  if (!current) return;
  activePalette = { kind, columnId, cardId };
  colorPalette.replaceChildren();
  const label = document.createElement("strong");
  label.textContent = kind === "card" ? "Цвет карточки" : "Цвет колонки";
  const grid = document.createElement("div");
  grid.className = "palette-grid";
  PALETTE.forEach(([name, value]) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = value;
    swatch.title = name;
    swatch.setAttribute("aria-label", name);
    swatch.setAttribute("aria-pressed", String(value.toLowerCase() === current.toLowerCase()));
    swatch.addEventListener("click", () => {
      const targetColumn = columns.find(item => item.id === columnId);
      const target = kind === "card" ? targetColumn?.cards.find(item => item.id === cardId) : targetColumn;
      if (!target) return;
      target.color = value;
      saveColumns();
      closePalette();
      renderBoard();
    });
    grid.append(swatch);
  });
  colorPalette.append(label, grid);
  colorPalette.hidden = false;
  const anchorRect = anchor.getBoundingClientRect();
  const paletteRect = colorPalette.getBoundingClientRect();
  colorPalette.style.left = `${Math.max(8, Math.min(anchorRect.left, window.innerWidth - paletteRect.width - 8))}px`;
  colorPalette.style.top = `${Math.max(8, Math.min(anchorRect.bottom + 8, window.innerHeight - paletteRect.height - 8))}px`;
}
document.addEventListener("pointerdown", event => {
  if (!colorPalette.hidden && !event.target.closest(".color-palette, .color-picker, .card-color-button")) closePalette();
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closePalette(); });
boardScroll.addEventListener("scroll", closePalette);

const trashIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4m4 3-1 13H7L6 7m4 4v5m4-5v5"/></svg>';
function deleteCard(columnId, cardId) {
  const column = columns.find(item => item.id === columnId);
  const index = column?.cards.findIndex(card => card.id === cardId) ?? -1;
  if (index < 0) return;
  const [removed] = column.cards.splice(index, 1);
  if (removed.locked) { column.cards.splice(index, 0, removed); showNotice("Сначала разблокируйте карточку.", true); return; }
  workspace.trash.unshift({ id: makeId(), type: "card", data: removed, boardId: activeBoard().id,
    columnId, index, deletedAt: Date.now() });
  saveColumns();
  renderBoard();
  showNotice("Карточка перемещена в корзину.");
}

function sortPinned(column) {
  column.cards = [...column.cards.filter(card => card.pinned), ...column.cards.filter(card => !card.pinned)];
}
function toggleCardLock(columnId, cardId) {
  const card = columns.find(item => item.id === columnId)?.cards.find(item => item.id === cardId);
  if (!card) return;
  card.locked = !card.locked;
  saveColumns(); renderBoard();
  showNotice(card.locked ? "Карточка заблокирована." : "Карточка разблокирована.");
}

function makeCard(cardData, columnId) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.cardId = cardData.id;
  card.style.setProperty("--card-color", cardData.color);
  if (cardData.large) card.classList.add("large-card");
  if (cardData.cover) card.classList.add("has-cover");
  if (cardData.stickers.length || cardData.checklist.length || cardData.attachments.length) card.classList.add("has-meta");
  if (cardData.attachments.length) card.classList.add("has-attachment");
  if (cardData.locked) card.classList.add("locked-card");
  if (cardData.pinned) card.classList.add("pinned-card");
  card.tabIndex = 0;
  card.title = "Нажмите, чтобы редактировать карточку";
  card.setAttribute("aria-label", `Редактировать карточку ${cardData.title}`);
  if (cardData.cover) {
    const cover = document.createElement("img");
    cover.className = "card-cover";
    cover.src = cardData.cover;
    cover.alt = "";
    card.append(cover);
  }
  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = cardData.title;
  const heading = document.createElement("div");
  heading.className = "card-heading";
  const colorButton = document.createElement("button");
  colorButton.type = "button";
  colorButton.className = "card-color-button";
  colorButton.setAttribute("aria-label", `Цвет карточки ${cardData.title}`);
  colorButton.title = "Выбрать цвет карточки";
  colorButton.disabled = cardData.locked;
  colorButton.addEventListener("click", event => { event.stopPropagation(); openPalette("card", columnId, cardData.id, colorButton); });
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-card-icon";
  deleteButton.innerHTML = trashIcon;
  deleteButton.title = "Удалить карточку";
  deleteButton.setAttribute("aria-label", `Удалить карточку ${cardData.title}`);
  deleteButton.disabled = cardData.locked;
  deleteButton.addEventListener("click", event => { event.stopPropagation(); deleteCard(columnId, cardData.id); });
  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "card-drag-handle";
  dragHandle.title = "Перетащить карточку (также доступны клавиши со стрелками)";
  dragHandle.setAttribute("aria-label", `Перетащить карточку ${cardData.title}; клавиши со стрелками меняют положение`);
  dragHandle.textContent = "👆";
  dragHandle.disabled = cardData.locked;
  dragHandle.addEventListener("keydown", event => handleCardKeydown(event, cardData.id, columnId));
  dragHandle.addEventListener("click", event => event.stopPropagation());
  const lockButton = document.createElement("button");
  lockButton.type = "button";
  lockButton.className = "card-lock-button";
  lockButton.textContent = cardData.locked ? "🔒" : "🔓";
  lockButton.title = cardData.locked ? "Разблокировать карточку" : "Заблокировать карточку";
  lockButton.setAttribute("aria-label", lockButton.title);
  lockButton.addEventListener("click", event => { event.stopPropagation(); toggleCardLock(columnId, cardData.id); });
  const attachButton = document.createElement("button");
  attachButton.type = "button";
  attachButton.className = "card-attach-button";
  attachButton.textContent = "📎";
  attachButton.title = "Прикрепить изображение или файл";
  attachButton.setAttribute("aria-label", `Прикрепить изображение или файл к карточке ${cardData.title}`);
  attachButton.disabled = cardData.locked;
  attachButton.addEventListener("click", event => {
    event.stopPropagation();
    openQuickAttachmentPicker(columnId, cardData.id);
  });
  if (cardData.pinned) {
    const pin = document.createElement("span"); pin.className = "card-pin"; pin.textContent = "📌";
    pin.title = "Закреплена"; heading.append(pin);
  }
  heading.append(deleteButton, title, attachButton, lockButton, dragHandle);
  card.append(colorButton, heading);
  if (cardData.description) {
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = cardData.description;
    card.append(description);
  }
  if (cardData.stickers.length || cardData.checklist.length || cardData.attachments.length) {
    const meta = document.createElement("div"); meta.className = "card-meta";
    if (cardData.stickers.length) {
      const stickers = document.createElement("span"); stickers.className = "card-stickers"; stickers.textContent = cardData.stickers.join(" "); meta.append(stickers);
    }
    if (cardData.checklist.length) {
      const progress = document.createElement("span"); progress.className = "card-checklist-progress";
      progress.textContent = `☑ ${cardData.checklist.filter(item => item.done).length}/${cardData.checklist.length}`;
      meta.append(progress);
    }
    if (cardData.attachments.length) {
      const firstImage = cardData.attachments.find(file => file.type.startsWith("image/"));
      if (firstImage) { const thumb = document.createElement("img"); thumb.className = "attachment-thumb"; thumb.src = firstImage.data; thumb.alt = `Превью: ${firstImage.name}`; meta.append(thumb); }
      const count = document.createElement("span"); count.className = "attachment-count";
      count.textContent = `📎 ${cardData.attachments.length}`; meta.append(count);
    }
    card.append(meta);
  }
  card.addEventListener("click", () => {
    if (Date.now() < suppressCardClickUntil) return;
    if (cardData.locked) showNotice("Карточка заблокирована. Нажмите на замок, чтобы изменить её.");
    else openEditCardForm(columnId, cardData.id);
  });
  card.addEventListener("keydown", event => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (cardData.locked) showNotice("Сначала разблокируйте карточку.");
      else openEditCardForm(columnId, cardData.id);
    }
  });
  return card;
}

function makeAddTile(label, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `add-tile ${extraClass}`.trim();
  button.innerHTML = '<span class="add-symbol" aria-hidden="true">+</span>';
  const text = document.createElement("span");
  text.textContent = label;
  button.append(text);
  button.addEventListener("click", onClick);
  return button;
}

function renderBoard() {
  closePalette();
  renderTabs();
  applyBoardAppearance();
  board.replaceChildren();
  columns.forEach(columnData => {
    const column = document.createElement("section");
    column.className = "column";
    if (columnData.collapsed) column.classList.add("collapsed-column");
    column.style.setProperty("--column-color", columnData.color);
    column.dataset.columnId = columnData.id;

    const header = document.createElement("div");
    header.className = "column-header";
    const icon = document.createElement("select");
    icon.className = "column-icon-select";
    icon.setAttribute("aria-label", `Иконка колонки ${columnData.name || "без названия"}`);
    COLUMN_ICONS.forEach(value => {
      const option = document.createElement("option"); option.value = value;
      option.textContent = value || "·"; icon.append(option);
    });
    icon.value = columnData.icon;
    icon.addEventListener("change", () => { columnData.icon = icon.value; saveColumns(); });
    const name = document.createElement("input");
    name.className = "column-title";
    name.type = "text";
    name.maxLength = 80;
    name.value = columnData.name;
    name.placeholder = "Без названия";
    name.setAttribute("aria-label", "Название колонки");
    name.readOnly = true;
    name.title = "Двойной клик — изменить название";
    let originalName = columnData.name;
    const startNameEdit = () => {
      if (!name.readOnly) return;
      originalName = columnData.name;
      name.readOnly = false;
      name.classList.add("editing");
      name.focus();
      name.select();
    };
    name.addEventListener("input", () => {
      if (name.readOnly) return;
      columnData.name = name.value;
      saveColumns();
    });
    const finishNameEdit = (cancel = false) => {
      if (name.readOnly) return;
      name.value = cancel ? originalName : name.value.trim();
      columnData.name = name.value;
      saveColumns();
      name.readOnly = true;
      name.classList.remove("editing");
    };
    name.addEventListener("dblclick", startNameEdit);
    let lastTitleTap = 0;
    name.addEventListener("pointerup", event => {
      if (event.pointerType === "mouse" || !name.readOnly) return;
      const now = Date.now();
      if (now - lastTitleTap < 350) { startNameEdit(); lastTitleTap = 0; }
      else lastTitleTap = now;
    });
    name.addEventListener("keydown", event => {
      if (event.key === "F2" && name.readOnly) { event.preventDefault(); startNameEdit(); }
      else if (event.key === "Enter" && !name.readOnly) { event.preventDefault(); finishNameEdit(); name.blur(); }
      else if (event.key === "Escape" && !name.readOnly) { event.preventDefault(); finishNameEdit(true); name.blur(); }
    });
    name.addEventListener("blur", () => finishNameEdit());

    const color = document.createElement("button");
    color.className = "color-picker";
    color.type = "button";
    color.style.backgroundColor = columnData.color;
    color.title = "Цвет колонки";
    color.setAttribute("aria-label", `Цвет колонки ${columnData.name || "без названия"}`);
    color.addEventListener("click", () => openPalette("column", columnData.id, null, color));
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "column-drag-handle";
    dragHandle.title = "Перетащить колонку (также доступны стрелки влево и вправо)";
    dragHandle.setAttribute("aria-label", `Перетащить колонку ${columnData.name || "без названия"}; стрелки влево и вправо меняют положение`);
    dragHandle.textContent = "👆";
    dragHandle.addEventListener("keydown", event => handleColumnKeydown(event, columnData.id));
    const deleteColumnButton = document.createElement("button");
    deleteColumnButton.type = "button";
    deleteColumnButton.className = "delete-column";
    deleteColumnButton.innerHTML = trashIcon;
    deleteColumnButton.title = "Удалить колонку";
    deleteColumnButton.setAttribute("aria-label", `Удалить колонку ${columnData.name || "без названия"}`);
    deleteColumnButton.addEventListener("click", () => deleteColumn(columnData.id));
    const duplicateColumnButton = document.createElement("button");
    duplicateColumnButton.type = "button";
    duplicateColumnButton.className = "column-action";
    duplicateColumnButton.textContent = "⧉";
    duplicateColumnButton.title = "Копировать колонку";
    duplicateColumnButton.setAttribute("aria-label", duplicateColumnButton.title);
    duplicateColumnButton.addEventListener("click", () => duplicateColumn(columnData.id));
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "column-action";
    collapseButton.textContent = columnData.collapsed ? "›" : "‹";
    collapseButton.title = columnData.collapsed ? "Развернуть колонку" : "Свернуть колонку";
    collapseButton.setAttribute("aria-label", collapseButton.title);
    collapseButton.addEventListener("click", () => { columnData.collapsed = !columnData.collapsed; saveColumns(); renderBoard(); });
    const tools = document.createElement("div");
    tools.className = "column-tools";
    tools.append(deleteColumnButton, duplicateColumnButton, collapseButton, color);
    header.append(icon, name, dragHandle, tools);
    const count = document.createElement("span");
    count.className = "column-count";
    count.textContent = String(columnData.cards.length);
    const collapsedLabel = document.createElement("span");
    collapsedLabel.className = "collapsed-label";
    collapsedLabel.textContent = `${columnData.icon} ${columnData.name || "Без названия"}`;
    header.append(count, collapsedLabel);

    const cards = document.createElement("div");
    cards.className = "cards";
    columnData.cards.forEach(cardData => {
      const element = makeCard(cardData, columnData.id);
      const query = document.getElementById("board-search").value.trim().toLocaleLowerCase("ru");
      if (query && !`${cardData.title} ${cardData.description}`.toLocaleLowerCase("ru").includes(query)) element.hidden = true;
      cards.append(element);
    });
    cards.append(makeAddTile("Добавить карточку", () => openCardForm(columnData.id, false)));
    const isEmptySpot = event => event.target === column || event.target === cards;
    column.addEventListener("dblclick", event => {
      if (isEmptySpot(event) && !dialog.open) openCardForm(columnData.id, false);
    });
    let lastEmptyTap = 0;
    let emptyTapStart = null;
    column.addEventListener("pointerdown", event => {
      emptyTapStart = isEmptySpot(event) ? { x: event.clientX, y: event.clientY } : null;
    });
    column.addEventListener("pointerup", event => {
      if (event.pointerType === "mouse" || !isEmptySpot(event) || dialog.open || !emptyTapStart ||
          Math.hypot(event.clientX - emptyTapStart.x, event.clientY - emptyTapStart.y) > 8) return;
      const now = Date.now();
      if (now - lastEmptyTap < 350) { openCardForm(columnData.id, false); lastEmptyTap = 0; }
      else lastEmptyTap = now;
    });
    column.append(header, cards);
    board.append(column);
  });
  board.append(makeAddTile("Добавить карточку в новую колонку", () => openCardForm(null, true), "new-column-tile"));
}

function openCardForm(columnId, newColumn) {
  if (dialog.open) return;
  targetColumnId = columnId;
  createColumn = newColumn;
  editingCardId = null;
  form.reset();
  titleField.setCustomValidity("");
  dialogTitle.textContent = "Новая карточка";
  dialogHint.textContent = newColumn ? "Карточка появится в новой колонке справа." : "Карточка появится в выбранной колонке.";
  submitCardButton.textContent = "Создать";
  resetCardDraft(null);
  dialog.showModal();
  titleField.focus();
}

function openEditCardForm(columnId, cardId) {
  const card = columns.find(column => column.id === columnId)?.cards.find(item => item.id === cardId);
  if (!card) return;
  if (card.locked) { showNotice("Сначала разблокируйте карточку."); return; }
  targetColumnId = columnId;
  createColumn = false;
  editingCardId = cardId;
  form.reset();
  titleField.setCustomValidity("");
  titleField.value = card.title;
  descriptionField.value = card.description;
  dialogTitle.textContent = "Редактировать карточку";
  dialogHint.textContent = "Измените название или описание карточки.";
  submitCardButton.textContent = "Сохранить";
  resetCardDraft(card);
  dialog.showModal();
  titleField.focus();
}

function closeCardForm() {
  dialog.close();
  form.reset();
  cardDraft = null;
  titleField.setCustomValidity("");
  targetColumnId = null;
  createColumn = false;
  editingCardId = null;
}

function deleteColumn(columnId) {
  const index = columns.findIndex(column => column.id === columnId);
  if (index < 0) return;
  const column = columns[index];
  if (column.cards.length > 0 && !window.confirm(
    `Переместить колонку «${column.name || "Без названия"}» и её карточки (${column.cards.length}) в корзину?`
  )) return;
  columns.splice(index, 1);
  workspace.trash.unshift({ id: makeId(), type: "column", data: column, boardId: activeBoard().id,
    index, deletedAt: Date.now() });
  saveColumns();
  renderBoard();
  showNotice("Колонка перемещена в корзину.");
}

function duplicateColumn(columnId) {
  const index = columns.findIndex(item => item.id === columnId);
  if (index < 0) return;
  const duplicate = JSON.parse(JSON.stringify(columns[index]));
  duplicate.id = makeId();
  duplicate.name = (duplicate.name ? `${duplicate.name} — копия` : "Копия").slice(0, 80);
  duplicate.cards.forEach(card => { card.id = makeId(); card.attachments.forEach(file => { file.id = makeId(); });
    card.checklist.forEach(item => { item.id = makeId(); }); });
  duplicate.collapsed = false;
  columns.splice(index + 1, 0, duplicate);
  saveColumns(); renderBoard(); playSound("create");
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const title = titleField.value.trim();
  if (!title) { titleField.setCustomValidity("Введите название карточки"); titleField.reportValidity(); return; }
  const description = descriptionField.value.trim();
  if (editingCardId) {
    const card = columns.find(column => column.id === targetColumnId)?.cards.find(item => item.id === editingCardId);
    if (!card) return;
    const wasComplete = card.checklist.length > 0 && card.checklist.every(item => item.done);
    card.title = title;
    card.description = description;
    Object.assign(card, cardDraft);
    const nowComplete = card.checklist.length > 0 && card.checklist.every(item => item.done);
    sortPinned(columns.find(column => column.id === targetColumnId));
    saveColumns();
    closeCardForm();
    renderBoard();
    if (!wasComplete && nowComplete) playSound("complete");
    return;
  }
  let destination;
  if (createColumn) {
    destination = { id: makeId(), name: "", color: COLORS[columns.length % COLORS.length], icon: "", collapsed: false, cards: [] };
    columns.push(destination);
  } else {
    destination = columns.find(column => column.id === targetColumnId);
  }
  if (!destination) return;
  const card = { id: makeId(), title, description, color: cardDraft.color || destination.color,
    cover: cardDraft.cover, attachments: cardDraft.attachments, checklist: cardDraft.checklist,
    stickers: cardDraft.stickers, pinned: cardDraft.pinned, locked: cardDraft.locked, large: cardDraft.large };
  const wasNewColumn = createColumn;
  destination.cards.push(card);
  sortPinned(destination);
  saveColumns();
  closeCardForm();
  renderBoard();
  if (wasNewColumn) boardScroll.scrollTo({ left: boardScroll.scrollWidth, behavior: "smooth" });
  playSound("create");
});

titleField.addEventListener("input", () => titleField.setCustomValidity(""));
document.getElementById("cancel-card").addEventListener("click", closeCardForm);
document.getElementById("close-dialog").addEventListener("click", closeCardForm);
dialog.addEventListener("cancel", event => { event.preventDefault(); closeCardForm(); });
dialog.addEventListener("click", event => { if (event.target === dialog) closeCardForm(); });

let dragState = null;

function animateReflow(elements, change) {
  const before = new Map(elements.map(element => [element, element.getBoundingClientRect()]));
  elements.forEach(element => element.getAnimations().forEach(animation => animation.cancel()));
  change();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  elements.forEach(element => {
    if (!element.isConnected) return;
    const oldRect = before.get(element);
    const newRect = element.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 180, easing: "cubic-bezier(.2, .7, .2, 1)" }
      );
    }
  });
}

function beginDrag(state) {
  const source = state.element;
  const rect = source.getBoundingClientRect();
  boardScroll.setPointerCapture(state.pointerId);
  const placeholder = document.createElement("div");
  placeholder.className = state.kind === "card" ? "card-placeholder" : "column-placeholder";
  placeholder.style.height = `${rect.height}px`;
  if (state.kind === "column") {
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.flexBasis = `${rect.width}px`;
  }
  source.parentElement.insertBefore(placeholder, source);

  const ghost = source.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);
  if (state.kind === "card") {
    const trail = document.createElement("div");
    trail.className = "drag-trail";
    trail.style.left = `${rect.left + rect.width / 2}px`;
    trail.style.top = `${rect.top + rect.height / 2}px`;
    document.body.append(trail);
    state.trail = trail;
  }
  source.remove();

  state.active = true;
  state.placeholder = placeholder;
  state.ghost = ghost;
  state.offsetX = state.startX - rect.left;
  state.offsetY = state.startY - rect.top;
  document.body.classList.add("is-dragging");
  state.frame = requestAnimationFrame(autoScrollDuringDrag);
}

function positionGhost(state, x, y) {
  state.ghost.style.left = `${x - state.offsetX}px`;
  state.ghost.style.top = `${y - state.offsetY}px`;
  if (state.trail) { state.trail.style.left = `${x}px`; state.trail.style.top = `${y}px`; }
}

function cardElements() {
  return [...board.querySelectorAll(".cards .card")];
}

function columnElements() {
  return [...board.children].filter(element => element.classList.contains("column") || element.classList.contains("new-column-tile"));
}

function updateCardTarget(state, x, y) {
  const area = boardScroll.getBoundingClientRect();
  board.querySelectorAll(".drop-target-column").forEach(element => element.classList.remove("drop-target-column"));
  const newColumnTile = board.querySelector(".new-column-tile");
  const tileRect = newColumnTile.getBoundingClientRect();
  const insideHeight = y >= area.top - 30 && y <= area.bottom + 30;
  const overNewColumn = insideHeight && x >= tileRect.left && x <= tileRect.right;

  if (overNewColumn) {
    if (state.placeholder.isConnected) {
      animateReflow(cardElements(), () => state.placeholder.remove());
    }
    newColumnTile.classList.add("drop-target");
    state.target = { newColumn: true };
    return;
  }
  newColumnTile.classList.remove("drop-target");

  const columnsOnBoard = [...board.querySelectorAll(".column")];
  if (!columnsOnBoard.length) { state.target = null; return; }
  const firstRect = columnsOnBoard[0].getBoundingClientRect();
  const lastRect = columnsOnBoard[columnsOnBoard.length - 1].getBoundingClientRect();
  if (!insideHeight || x < firstRect.left - 24 || x > lastRect.right + 24) {
    state.target = null;
    return;
  }
  const destination = columnsOnBoard.reduce((nearest, column) => {
    const rect = column.getBoundingClientRect();
    const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    return distance < nearest.distance ? { column, distance } : nearest;
  }, { column: null, distance: Infinity }).column;
  if (destination.classList.contains("collapsed-column")) destination.classList.add("drop-target-column");
  const cards = destination.querySelector(".cards");
  const cardsRect = cards.getBoundingClientRect();
  const existingCards = [...cards.querySelectorAll(".card:not([hidden])")];
  const nextCard = destination.classList.contains("collapsed-column") ? null :
    existingCards.find(card => y < cardsRect.top + card.offsetTop + card.offsetHeight / 2);
  let reference = nextCard || cards.querySelector(".add-tile");
  const movingCard = columns.find(item => item.id === state.columnId)?.cards.find(item => item.id === state.cardId);
  const destinationData = columns.find(item => item.id === destination.dataset.columnId);
  const firstUnpinned = [...cards.querySelectorAll(".card")].find(element =>
    !destinationData?.cards.find(item => item.id === element.dataset.cardId)?.pinned);
  const referencePinned = destinationData?.cards.find(item => item.id === reference?.dataset.cardId)?.pinned;
  if ((movingCard?.pinned && !referencePinned) || (!movingCard?.pinned && referencePinned)) {
    reference = firstUnpinned || cards.querySelector(".add-tile");
  }
  if (state.placeholder.parentElement !== cards || state.placeholder.nextSibling !== reference) {
    animateReflow(cardElements(), () => cards.insertBefore(state.placeholder, reference));
  }
  const children = [...cards.children];
  state.target = { columnId: destination.dataset.columnId, index: children
    .slice(0, children.indexOf(state.placeholder))
    .filter(element => element.classList.contains("card")).length };
}

function updateColumnTarget(state, x, y) {
  const area = boardScroll.getBoundingClientRect();
  if (y < area.top - 40 || y > area.bottom + 40 || x < area.left - 60 || x > area.right + 60) {
    state.target = null;
    return;
  }
  const remainingColumns = [...board.querySelectorAll(".column")];
  const boardLeft = board.getBoundingClientRect().left;
  const nextColumn = remainingColumns.find(column => x < boardLeft + column.offsetLeft + column.offsetWidth / 2);
  const reference = nextColumn || board.querySelector(".new-column-tile");
  if (state.placeholder.nextSibling !== reference) {
    animateReflow(columnElements(), () => board.insertBefore(state.placeholder, reference));
  }
  const children = [...board.children];
  state.target = { index: children
    .slice(0, children.indexOf(state.placeholder))
    .filter(element => element.classList.contains("column")).length };
}

function updateDragTarget(state, x, y) {
  state.x = x;
  state.y = y;
  positionGhost(state, x, y);
  if (state.kind === "card") updateCardTarget(state, x, y);
  else updateColumnTarget(state, x, y);
}

function autoScrollDuringDrag() {
  const state = dragState;
  if (!state?.active) return;
  const rect = boardScroll.getBoundingClientRect();
  let horizontal = 0;
  if (state.x < rect.left + 56) horizontal = -Math.min(18, (rect.left + 56 - state.x) / 3);
  if (state.x > rect.right - 56) horizontal = Math.min(18, (state.x - rect.right + 56) / 3);
  const oldScrollLeft = boardScroll.scrollLeft;
  if (horizontal) boardScroll.scrollLeft += horizontal;

  let vertical = 0;
  if (state.y < rect.top + 55) vertical = -Math.min(13, (rect.top + 55 - state.y) / 4);
  if (state.y > rect.bottom - 55) vertical = Math.min(13, (state.y - rect.bottom + 55) / 4);
  const oldScrollTop = boardScroll.scrollTop;
  if (vertical) boardScroll.scrollTop += vertical;
  if (boardScroll.scrollLeft !== oldScrollLeft || boardScroll.scrollTop !== oldScrollTop) updateDragTarget(state, state.x, state.y);
  state.frame = requestAnimationFrame(autoScrollDuringDrag);
}

function moveCard(cardId, sourceColumnId, target) {
  const source = columns.find(column => column.id === sourceColumnId);
  const cardIndex = source?.cards.findIndex(card => card.id === cardId) ?? -1;
  if (cardIndex < 0) return false;
  if (source.cards[cardIndex].locked) return false;
  const [card] = source.cards.splice(cardIndex, 1);
  if (target.newColumn) {
    columns.push({ id: makeId(), name: "", color: COLORS[columns.length % COLORS.length], icon: "", collapsed: false, cards: [card] });
  } else {
    const destination = columns.find(column => column.id === target.columnId);
    if (!destination) { source.cards.splice(cardIndex, 0, card); return false; }
    destination.cards.splice(target.index, 0, card);
    sortPinned(destination);
  }
  return true;
}

function moveColumn(columnId, targetIndex) {
  const sourceIndex = columns.findIndex(column => column.id === columnId);
  if (sourceIndex < 0) return false;
  const [column] = columns.splice(sourceIndex, 1);
  columns.splice(targetIndex, 0, column);
  return true;
}

function handleCardKeydown(event, cardId, columnId) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const sourceIndex = columns.findIndex(column => column.id === columnId);
  const source = columns[sourceIndex];
  if (!source) return;
  const cardIndex = source.cards.findIndex(card => card.id === cardId);
  if (cardIndex < 0) return;
  if (source.cards[cardIndex].locked) return;
  let target;
  if (event.key === "ArrowUp") target = cardIndex > 0 ? { columnId, index: cardIndex - 1 } : null;
  if (event.key === "ArrowDown") target = cardIndex < source.cards.length - 1 ? { columnId, index: cardIndex + 1 } : null;
  if (event.key === "ArrowLeft") target = sourceIndex > 0
    ? { columnId: columns[sourceIndex - 1].id, index: columns[sourceIndex - 1].cards.length } : null;
  if (event.key === "ArrowRight") target = sourceIndex < columns.length - 1
    ? { columnId: columns[sourceIndex + 1].id, index: columns[sourceIndex + 1].cards.length }
    : { newColumn: true };
  if (!target || !moveCard(cardId, columnId, target)) return;
  saveColumns();
  renderBoard();
  playSound(target.newColumn || columns.find(column => column.id === target.columnId)?.name === "Закончено" ? "complete" : "move");
  const moved = [...board.querySelectorAll(".card")].find(card => card.dataset.cardId === cardId);
  moved?.querySelector(".card-drag-handle")?.focus();
  if (target.newColumn) boardScroll.scrollTo({ left: boardScroll.scrollWidth, behavior: "smooth" });
}

function handleColumnKeydown(event, columnId) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const sourceIndex = columns.findIndex(column => column.id === columnId);
  const targetIndex = sourceIndex + (event.key === "ArrowLeft" ? -1 : 1);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= columns.length) return;
  moveColumn(columnId, targetIndex);
  saveColumns();
  renderBoard();
  const moved = [...board.querySelectorAll(".column")].find(column => column.dataset.columnId === columnId);
  moved?.querySelector(".column-drag-handle")?.focus();
}

function finishDrag(cancel = false) {
  const state = dragState;
  if (!state) return;
  dragState = null;
  if (state.frame) cancelAnimationFrame(state.frame);
  if (!state.active) return;
  suppressCardClickUntil = Date.now() + 250;

  const target = cancel ? null : state.target;
  const newColumn = state.kind === "card" && target?.newColumn;
  state.ghost.remove();
  state.trail?.remove();
  state.placeholder.remove();
  board.querySelector(".new-column-tile")?.classList.remove("drop-target");
  board.querySelectorAll(".drop-target-column").forEach(element => element.classList.remove("drop-target-column"));
  document.body.classList.remove("is-dragging");
  const changed = target && (state.kind === "card"
    ? moveCard(state.cardId, state.columnId, target)
    : moveColumn(state.columnId, target.index));
  if (changed) { saveColumns(); playSound(newColumn || columns.find(column => column.id === target?.columnId)?.name === "Закончено" ? "complete" : "move"); }
  renderBoard();
  if (changed && newColumn) boardScroll.scrollTo({ left: boardScroll.scrollWidth, behavior: "smooth" });
}

board.addEventListener("pointerdown", event => {
  if (dragState || event.button !== 0 || event.isPrimary === false || dialog.open) return;
  if (event.target.closest(".card-color-button, .delete-card-icon, .card-lock-button, .card-attach-button, .color-picker, .delete-column, .column-action, .column-icon-select, .column-title")) return;
  const handle = event.target.closest(".column-drag-handle");
  const card = handle ? null : event.target.closest(".card");
  if (!handle && !card) return;
  if (card?.classList.contains("locked-card")) return;
  if (event.pointerType === "touch" && card && !event.target.closest(".card-drag-handle")) return;
  const column = (handle || card).closest(".column");
  dragState = {
    kind: handle ? "column" : "card",
    element: handle ? column : card,
    columnId: column.dataset.columnId,
    cardId: card?.dataset.cardId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    active: false,
  };
});

window.addEventListener("pointermove", event => {
  const state = dragState;
  if (!state || event.pointerId !== state.pointerId) return;
  if (!state.active) {
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (distance < (event.pointerType === "touch" ? 8 : 5)) return;
    beginDrag(state);
  }
  updateDragTarget(state, event.clientX, event.clientY);
  event.preventDefault();
});

window.addEventListener("pointerup", event => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (dragState.active) updateDragTarget(dragState, event.clientX, event.clientY);
  finishDrag();
});
window.addEventListener("pointercancel", event => {
  if (dragState?.pointerId === event.pointerId) finishDrag(true);
});
window.addEventListener("blur", () => finishDrag(true));
boardScroll.addEventListener("lostpointercapture", event => {
  if (dragState?.pointerId === event.pointerId) finishDrag(true);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && dragState?.active) { event.preventDefault(); finishDrag(true); }
});

let cardDraft = null;
const coverInput = document.getElementById("card-cover");
const coverPreview = document.getElementById("cover-preview");
const attachmentInput = document.getElementById("card-attachments");
const quickAttachmentInput = document.getElementById("quick-attachment-file");
let quickAttachmentTarget = null;
const stickerChoices = document.getElementById("sticker-choices");
const checklistEditor = document.getElementById("checklist-editor");
const attachmentEditor = document.getElementById("attachment-editor");

function resetCardDraft(card) {
  cardDraft = {
    color: card?.color || "", cover: card?.cover || "",
    attachments: card ? JSON.parse(JSON.stringify(card.attachments)) : [],
    checklist: card ? JSON.parse(JSON.stringify(card.checklist)) : [],
    stickers: card ? [...card.stickers] : [],
    pinned: Boolean(card?.pinned), locked: Boolean(card?.locked), large: Boolean(card?.large),
  };
  document.getElementById("card-pinned").checked = cardDraft.pinned;
  document.getElementById("card-locked").checked = cardDraft.locked;
  document.getElementById("card-large").checked = cardDraft.large;
  document.getElementById("duplicate-card").hidden = !card;
  updateCoverPreview(); renderStickerChoices(); renderChecklistEditor(); renderAttachmentEditor();
}
function updateCoverPreview() {
  coverPreview.hidden = !cardDraft?.cover;
  if (cardDraft?.cover) coverPreview.src = cardDraft.cover;
  else coverPreview.removeAttribute("src");
  document.getElementById("remove-cover").disabled = !cardDraft?.cover;
}
function renderStickerChoices() {
  stickerChoices.replaceChildren();
  STICKERS.forEach(sticker => {
    const button = document.createElement("button"); button.type = "button"; button.className = "sticker-choice";
    button.textContent = sticker; button.title = `Стикер ${sticker}`;
    button.setAttribute("aria-pressed", String(cardDraft.stickers.includes(sticker)));
    button.addEventListener("click", () => {
      cardDraft.stickers = cardDraft.stickers.includes(sticker)
        ? cardDraft.stickers.filter(value => value !== sticker) : [...cardDraft.stickers, sticker];
      renderStickerChoices();
    });
    stickerChoices.append(button);
  });
}
function renderChecklistEditor() {
  checklistEditor.replaceChildren();
  cardDraft.checklist.forEach((item, index) => {
    const row = document.createElement("div"); row.className = "checklist-row";
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = item.done;
    check.setAttribute("aria-label", `Выполнено: ${item.text || "пункт"}`);
    check.addEventListener("change", () => { item.done = check.checked; });
    const textField = document.createElement("input"); textField.type = "text"; textField.maxLength = 200;
    textField.value = item.text; textField.placeholder = "Пункт списка";
    textField.setAttribute("aria-label", `Пункт чек-листа ${index + 1}`);
    textField.addEventListener("input", () => { item.text = textField.value; });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "mini-delete";
    remove.textContent = "×"; remove.title = "Удалить пункт"; remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => { cardDraft.checklist.splice(index, 1); renderChecklistEditor(); });
    row.append(check, textField, remove); checklistEditor.append(row);
  });
}
function renderAttachmentEditor() {
  attachmentEditor.replaceChildren();
  cardDraft.attachments.forEach((file, index) => {
    const row = document.createElement("div"); row.className = "attachment-row";
    if (file.type.startsWith("image/")) {
      const preview = document.createElement("img"); preview.className = "attachment-editor-thumb";
      preview.src = file.data; preview.alt = `Превью: ${file.name}`; row.append(preview);
    }
    const link = document.createElement("a"); link.href = file.data; link.download = file.name;
    link.textContent = `📎 ${file.name}`; link.title = "Скачать вложение";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "mini-delete";
    remove.textContent = "×"; remove.title = "Убрать вложение"; remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => { cardDraft.attachments.splice(index, 1); renderAttachmentEditor(); });
    row.append(link, remove); attachmentEditor.append(row);
  });
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}
function resizeImage(data, maxSide) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (_) { reject(new Error("Не удалось обработать изображение.")); }
    };
    image.onerror = () => reject(new Error("Изображение повреждено."));
    image.src = data;
  });
}
function accentFromImage(data) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = 24; canvas.height = 24;
        const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let red = 0, green = 0, blue = 0, total = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          const weight = .2 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
          red += r * weight; green += g * weight; blue += b * weight; total += weight;
        }
        const light = value => Math.round(value / total * .58 + 255 * .42).toString(16).padStart(2, "0");
        resolve(`#${light(red)}${light(green)}${light(blue)}`);
      } catch (_) {
        resolve("#93c5fd");
      }
    };
    image.onerror = () => resolve("#93c5fd"); image.src = data;
  });
}
coverInput.addEventListener("change", async () => {
  const file = coverInput.files?.[0]; coverInput.value = "";
  if (!file || !cardDraft) return;
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    showNotice("Выберите изображение размером до 8 МБ.", true); return;
  }
  const draft = cardDraft;
  try {
    const data = await resizeImage(await readAsDataURL(file), 1200);
    if (draft !== cardDraft) return;
    const accent = await accentFromImage(data);
    if (draft !== cardDraft) return;
    draft.cover = data; draft.color = accent;
    updateCoverPreview(); showNotice("Обложка добавлена, цвет подобран из изображения.");
  } catch (error) { showNotice(error.message, true); }
});
document.getElementById("remove-cover").addEventListener("click", () => { if (cardDraft) { cardDraft.cover = ""; updateCoverPreview(); } });
async function addAttachmentFiles(files, attachments, isCurrent, onAdded) {
  let added = 0;
  for (const file of files) {
    if (!isCurrent()) break;
    const isImage = file.type.startsWith("image/");
    const limit = isImage ? 15 * 1024 * 1024 : 2 * 1024 * 1024;
    if (file.size > limit) {
      showNotice(`Файл «${file.name}» больше ${isImage ? 15 : 2} МБ.`, true); continue;
    }
    try {
      let data = await readAsDataURL(file);
      let type = file.type || "application/octet-stream";
      if (isImage) { data = await resizeImage(data, 800); type = "image/jpeg"; }
      if (!isCurrent()) break;
      if (attachments.reduce((sum, item) => sum + item.data.length, 0) + data.length > 3_500_000) {
        showNotice("Для одной карточки доступно до 3,5 МБ вложений.", true); break;
      }
      attachments.push({ id: makeId(), name: file.name.slice(0, 200), data, type });
      added++;
      onAdded();
    } catch (error) { showNotice(error.message, true); }
  }
  return added;
}
attachmentInput.addEventListener("change", async () => {
  const files = [...(attachmentInput.files || [])]; attachmentInput.value = "";
  const draft = cardDraft;
  if (!draft) return;
  await addAttachmentFiles(files, draft.attachments, () => draft === cardDraft, renderAttachmentEditor);
});
function openQuickAttachmentPicker(columnId, cardId) {
  quickAttachmentTarget = { boardId: activeBoard().id, columnId, cardId };
  quickAttachmentInput.value = "";
  quickAttachmentInput.click();
}
quickAttachmentInput.addEventListener("change", async () => {
  const files = [...(quickAttachmentInput.files || [])]; quickAttachmentInput.value = "";
  const target = quickAttachmentTarget; quickAttachmentTarget = null;
  if (!files.length || !target) return;
  const findCard = () => workspace.boards.find(item => item.id === target.boardId)
    ?.columns.find(item => item.id === target.columnId)?.cards.find(item => item.id === target.cardId);
  const card = findCard();
  if (!card || card.locked) { showNotice("Сначала разблокируйте карточку.", true); return; }
  const added = await addAttachmentFiles(files, card.attachments, () => findCard() === card && !card.locked, () => {
    saveColumns(); renderBoard();
  });
  if (added) showNotice(`Прикреплено файлов: ${added}. Изображение видно на плитке карточки.`);
});
["card-pinned", "card-locked", "card-large"].forEach(id => {
  document.getElementById(id).addEventListener("change", event => {
    if (cardDraft) cardDraft[id.slice(5)] = event.target.checked;
  });
});
document.getElementById("add-checklist-item").addEventListener("click", () => {
  if (!cardDraft) return;
  cardDraft.checklist.push({ id: makeId(), text: "", done: false }); renderChecklistEditor();
  checklistEditor.lastElementChild?.querySelector('input[type="text"]')?.focus();
});
document.getElementById("duplicate-card").addEventListener("click", () => {
  const column = columns.find(item => item.id === targetColumnId);
  const source = column?.cards.find(item => item.id === editingCardId);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = makeId(); copy.title = `${source.title} — копия`.slice(0, 120); copy.locked = false;
  copy.checklist.forEach(item => { item.id = makeId(); });
  copy.attachments.forEach(item => { item.id = makeId(); });
  column.cards.splice(column.cards.indexOf(source) + 1, 0, copy); sortPinned(column);
  saveColumns(); closeCardForm(); renderBoard(); playSound("create");
});

const tabs = document.getElementById("board-tabs");
const boardNameDialog = document.getElementById("board-name-dialog");
let boardNameTargetId = null;
const themeSelect = document.getElementById("theme-select");
const boardSearch = document.getElementById("board-search");
const backgroundDialog = document.getElementById("background-dialog");
const trashDialog = document.getElementById("trash-dialog");
const presentationDialog = document.getElementById("presentation-dialog");
const backgroundPresets = [
  ["plain", "Обычный"], ["dots", "Точки"], ["grid", "Сетка"],
  ["lavender", "Лаванда"], ["mint", "Мята"], ["sunset", "Закат"],
];
const activeSounds = new Set();
function stopSounds() {
  activeSounds.forEach(({ oscillator, context }) => {
    try { oscillator.stop(); } catch (_) { /* A finished note has already stopped. */ }
    try { context.close().catch(() => {}); } catch (_) { /* The context is already closed. */ }
  });
  activeSounds.clear();
}
function playSound(kind) {
  if (!workspace.settings.sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(kind === "complete" ? 650 : kind === "create" ? 520 : 420, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "complete" ? 840 : 610, context.currentTime + .08);
    gain.gain.setValueAtTime(.015, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .09);
    oscillator.connect(gain); gain.connect(context.destination);
    const entry = { oscillator, context };
    activeSounds.add(entry);
    oscillator.onended = () => {
      activeSounds.delete(entry);
      try { context.close().catch(() => {}); } catch (_) { /* The context is already closed. */ }
    };
    oscillator.start(); oscillator.stop(context.currentTime + .09);
  } catch (_) { /* Sound is optional. */ }
}
function setThemePreset(theme, persist = true) {
  if (!["light", "dark", "pastel", "bright", "minimal"].includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
  applyTheme(theme === "dark");
  document.querySelector('meta[name="theme-color"]').content = {
    light: "#f7f9f3", dark: "#000000", pastel: "#f8f4fb", bright: "#fff8e8", minimal: "#f5f5f5",
  }[theme];
  if (persist) {
    chosenTheme = theme;
    workspace.settings.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* Workspace save reports storage errors. */ }
    saveColumns();
  }
}
function applyWorkspaceSettings() {
  const selected = workspace.settings.theme || chosenTheme || (systemTheme.matches ? "dark" : "light");
  setThemePreset(selected, false);
  document.body.classList.toggle("compact-mode", workspace.settings.compact);
  document.getElementById("compact-toggle").setAttribute("aria-pressed", String(workspace.settings.compact));
  document.getElementById("sound-toggle").setAttribute("aria-pressed", String(workspace.settings.sound));
  document.getElementById("sound-toggle").setAttribute("aria-label", workspace.settings.sound ? "Выключить звуки" : "Включить звуки");
  document.documentElement.style.setProperty("--board-scale", String(workspace.settings.zoom / 100));
  document.getElementById("zoom-value").textContent = `${workspace.settings.zoom}%`;
}
function renderTabs() {
  tabs.replaceChildren();
  workspace.boards.forEach(item => {
    const tab = document.createElement("button"); tab.type = "button";
    tab.className = "board-tab"; tab.role = "tab";
    tab.textContent = item.name || "Без названия";
    tab.setAttribute("aria-selected", String(item.id === workspace.activeBoardId));
    tab.title = "Двойной клик — переименовать доску";
    tab.addEventListener("click", () => {
      if (item.id === workspace.activeBoardId) return;
      workspace.activeBoardId = item.id; columns = item.columns;
      saveColumns(); renderBoard(); boardScroll.scrollTo({ left: 0, top: 0 });
    });
    tab.addEventListener("dblclick", () => {
      openBoardNameDialog(item.id);
    });
    tabs.append(tab);
  });
  const add = document.createElement("button"); add.type = "button"; add.className = "add-board-tab";
  add.textContent = "+"; add.title = "Новая доска"; add.setAttribute("aria-label", "Создать доску");
  add.addEventListener("click", () => openBoardNameDialog(null));
  tabs.append(add);
}
function openBoardNameDialog(boardId) {
  boardNameTargetId = boardId;
  document.getElementById("board-name-title").textContent = boardId ? "Название доски" : "Новая доска";
  document.getElementById("board-name-field").value = boardId
    ? workspace.boards.find(item => item.id === boardId)?.name || "" : "Новая доска";
  boardNameDialog.showModal();
  document.getElementById("board-name-field").focus();
}
document.getElementById("board-name-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("board-name-field").value.trim().slice(0, 80) || "Без названия";
  if (boardNameTargetId) {
    const item = workspace.boards.find(board => board.id === boardNameTargetId);
    if (item) item.name = name;
  } else {
    const item = { id: makeId(), name, columns: initialColumns().map(normalizeColumn), background: "plain", animated: false };
    workspace.boards.push(item); workspace.activeBoardId = item.id; columns = item.columns;
  }
  boardNameDialog.close(); boardNameTargetId = null;
  saveColumns(); renderBoard(); boardScroll.scrollTo({ left: 0, top: 0 });
});
function applyBoardAppearance() {
  const current = activeBoard();
  boardScroll.dataset.background = isImageData(current.background) ? "custom" : current.background;
  boardScroll.style.backgroundImage = isImageData(current.background) ? `url("${current.background}")` : "";
  boardScroll.classList.toggle("living-background", current.animated);
  document.getElementById("background-button").classList.toggle("has-custom-background", current.background !== "plain" || current.animated);
}
themeSelect.addEventListener("change", () => setThemePreset(themeSelect.value));
function applySearch() {
  const query = boardSearch.value.trim().toLocaleLowerCase("ru");
  board.querySelectorAll(".card").forEach(element => {
    const column = columns.find(item => item.id === element.closest(".column")?.dataset.columnId);
    const card = column?.cards.find(item => item.id === element.dataset.cardId);
    element.hidden = Boolean(query && card && !`${card.title} ${card.description}`.toLocaleLowerCase("ru").includes(query));
  });
}
boardSearch.addEventListener("input", applySearch);
document.getElementById("compact-toggle").addEventListener("click", () => {
  workspace.settings.compact = !workspace.settings.compact;
  applyWorkspaceSettings(); saveColumns();
});
document.getElementById("sound-toggle").addEventListener("click", () => {
  workspace.settings.sound = !workspace.settings.sound;
  if (!workspace.settings.sound) stopSounds();
  applyWorkspaceSettings(); saveColumns();
});
window.addEventListener("pagehide", stopSounds);
function changeZoom(delta) {
  workspace.settings.zoom = Math.max(70, Math.min(130, workspace.settings.zoom + delta));
  applyWorkspaceSettings(); saveColumns();
}
document.getElementById("zoom-out").addEventListener("click", () => changeZoom(-10));
document.getElementById("zoom-in").addEventListener("click", () => changeZoom(10));
function renderBackgroundOptions() {
  const options = document.getElementById("background-options"); options.replaceChildren();
  backgroundPresets.forEach(([value, name]) => {
    const button = document.createElement("button"); button.type = "button";
    button.className = `background-choice background-${value}`; button.textContent = name;
    button.setAttribute("aria-pressed", String(activeBoard().background === value));
    button.addEventListener("click", () => {
      activeBoard().background = value; saveColumns(); applyBoardAppearance(); renderBackgroundOptions();
    });
    options.append(button);
  });
  const customPreview = document.getElementById("custom-background-preview");
  const previewImage = document.getElementById("background-preview-image");
  customPreview.hidden = !isImageData(activeBoard().background);
  if (!customPreview.hidden) previewImage.src = activeBoard().background;
  else previewImage.removeAttribute("src");
  document.getElementById("live-background").checked = activeBoard().animated;
}
document.getElementById("background-button").addEventListener("click", () => {
  renderBackgroundOptions(); backgroundDialog.showModal();
});
document.getElementById("board-background-file").addEventListener("change", async event => {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
    showNotice("Выберите изображение размером до 15 МБ.", true); return;
  }
  const targetBoardId = activeBoard().id;
  try {
    const data = await resizeImage(await readAsDataURL(file), 1600);
    const target = workspace.boards.find(item => item.id === targetBoardId);
    if (!target) return;
    target.background = data;
    const saved = saveColumns(); applyBoardAppearance(); renderBackgroundOptions();
    if (saved) showNotice("Фоновое изображение загружено и сохранено.");
  } catch (error) { showNotice(error.message, true); }
});
document.getElementById("live-background").addEventListener("change", event => {
  activeBoard().animated = event.target.checked; saveColumns(); applyBoardAppearance();
});
function renderTrash() {
  const list = document.getElementById("trash-list"); list.replaceChildren();
  if (!workspace.trash.length) { const empty = document.createElement("p"); empty.textContent = "Корзина пуста"; list.append(empty); return; }
  workspace.trash.forEach(item => {
    const row = document.createElement("div"); row.className = "trash-row";
    const title = document.createElement("span");
    title.textContent = `${item.type === "card" ? "Карточка" : "Колонка"}: ${item.data.title || item.data.name || "Без названия"}`;
    const restore = document.createElement("button"); restore.type = "button"; restore.className = "button button-secondary";
    restore.textContent = "Восстановить"; restore.addEventListener("click", () => restoreTrash(item.id));
    const discard = document.createElement("button"); discard.type = "button"; discard.className = "mini-delete";
    discard.textContent = "×"; discard.title = "Удалить навсегда"; discard.setAttribute("aria-label", discard.title);
    discard.addEventListener("click", () => {
      if (!window.confirm("Удалить этот элемент навсегда?")) return;
      workspace.trash = workspace.trash.filter(entry => entry.id !== item.id); saveColumns(); renderTrash();
    });
    row.append(title, restore, discard); list.append(row);
  });
}
function restoreTrash(id) {
  const index = workspace.trash.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = workspace.trash.splice(index, 1);
  const destinationBoard = workspace.boards.find(board => board.id === item.boardId) || activeBoard();
  if (item.type === "column") destinationBoard.columns.splice(Math.min(item.index, destinationBoard.columns.length), 0, item.data);
  else {
    let destinationColumn = destinationBoard.columns.find(column => column.id === item.columnId);
    if (!destinationColumn) {
      destinationColumn = { id: makeId(), name: "Восстановлено", color: COLORS[0], icon: "", collapsed: false, cards: [] };
      destinationBoard.columns.push(destinationColumn);
    }
    destinationColumn.cards.splice(Math.min(item.index, destinationColumn.cards.length), 0, item.data);
    sortPinned(destinationColumn);
  }
  saveColumns(); renderTrash(); renderBoard(); showNotice("Элемент восстановлен из корзины.");
}
document.getElementById("trash-button").addEventListener("click", () => { renderTrash(); trashDialog.showModal(); });
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => {
  document.getElementById(button.dataset.closeDialog).close();
}));
let presentationIndex = 0;
function presentationCards() { return columns.flatMap(column => column.cards.map(card => ({ card, column }))); }
function renderPresentation() {
  const entries = presentationCards();
  const content = document.getElementById("presentation-content"); content.replaceChildren();
  if (!entries.length) { content.textContent = "На этой доске пока нет карточек."; return; }
  presentationIndex = (presentationIndex + entries.length) % entries.length;
  const { card, column } = entries[presentationIndex];
  const counter = document.createElement("span"); counter.className = "presentation-counter";
  counter.textContent = `${presentationIndex + 1} / ${entries.length} · ${column.icon} ${column.name || "Без названия"}`;
  content.append(counter);
  if (card.cover) { const image = document.createElement("img"); image.src = card.cover; image.alt = "Обложка"; content.append(image); }
  const title = document.createElement("h2"); title.textContent = card.title; content.append(title);
  const description = document.createElement("p"); description.textContent = card.description; content.append(description);
  if (card.stickers.length) { const stickers = document.createElement("div"); stickers.textContent = card.stickers.join(" "); content.append(stickers); }
  if (card.checklist.length) {
    const list = document.createElement("ul");
    card.checklist.forEach(item => { const li = document.createElement("li"); li.textContent = `${item.done ? "☑" : "☐"} ${item.text}`; list.append(li); });
    content.append(list);
  }
  card.attachments.forEach(file => {
    if (file.type.startsWith("image/")) { const image = document.createElement("img"); image.src = file.data; image.alt = file.name; image.className = "presentation-attachment"; content.append(image); }
    else { const link = document.createElement("a"); link.href = file.data; link.download = file.name; link.textContent = `📎 ${file.name}`; content.append(link); }
  });
}
document.getElementById("presentation-button").addEventListener("click", () => {
  presentationIndex = 0; renderPresentation(); presentationDialog.showModal();
});
document.getElementById("presentation-prev").addEventListener("click", () => { presentationIndex--; renderPresentation(); });
document.getElementById("presentation-next").addEventListener("click", () => { presentationIndex++; renderPresentation(); });
document.addEventListener("keydown", event => {
  if (!presentationDialog.open) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault(); presentationIndex += event.key === "ArrowRight" ? 1 : -1; renderPresentation();
  }
});
document.getElementById("print-button").addEventListener("click", () => window.print());

applyWorkspaceSettings();
renderBoard();
