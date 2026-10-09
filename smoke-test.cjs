const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const storage = new Map();

function startApp() {
  const soundStats = { created: 0, closed: 0, stopped: 0 };
  class FakeAudioContext {
    constructor() { soundStats.created++; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, start() {}, stop() { soundStats.stopped++; } }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() { soundStats.closed++; return Promise.resolve(); }
  }
  class Element {
    constructor(tag = "div") {
      this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {};
      this.attributes = {}; this.value = ""; this.className = ""; this.hidden = false;
      this.style = { setProperty() {} };
      this.classList = {
        add: name => { this.className = `${this.className} ${name}`.trim(); },
        remove: name => { this.className = this.className.split(" ").filter(part => part !== name).join(" "); },
        contains: name => this.className.split(" ").includes(name),
        toggle: (name, force) => { if (force) this.classList.add(name); else this.classList.remove(name); },
      };
    }
    append(...items) { items.forEach(item => { item.parentElement = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    insertBefore(item, reference) { item.parentElement = this; this.children.splice(this.children.indexOf(reference), 0, item); }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    fire(type, values = {}) { (this.listeners[type] || []).forEach(callback => callback({ target: this, preventDefault() {}, stopPropagation() {}, ...values })); }
    click() { this.fire("click"); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes[name]; }
    setCustomValidity() {}
    reportValidity() {}
    focus() {}
    blur() { this.fire("blur"); }
    select() {}
    reset() { fields["card-title"].value = ""; fields["card-description"].value = ""; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollTo(options) { this.lastScroll = options; }
    querySelector(selector) { return selector === ".theme-icon" ? this.children[0] : null; }
    querySelectorAll(selector) {
      const matches = [];
      const className = selector.split(" ").at(-1).split(":")[0].replace(".", "");
      const visit = element => { element.children.forEach(child => {
        if (child.classList.contains(className) && (!selector.includes(":not([hidden])") || !child.hidden)) matches.push(child);
        visit(child);
      }); };
      visit(this);
      return matches;
    }
    getBoundingClientRect() { return { left: 10, right: 70, top: 10, bottom: 50, width: 60, height: 40 }; }
    getContext() { return { fillRect() {}, drawImage() {} }; }
    toDataURL() { return "data:image/jpeg;base64,QUJDRA=="; }
    closest(selector) {
      let element = this;
      const names = selector.split(",").map(part => part.trim().replace(".", ""));
      while (element) { if (names.some(name => element.classList.contains(name))) return element; element = element.parentElement; }
      return null;
    }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); }
    get lastElementChild() { return this.children.at(-1); }
  }
  const fields = new Proxy({}, { get(target, id) { return target[id] ||= new Element(String(id)); } });
  fields["theme-toggle"].append(new Element("span"));
  fields["file-menu"].hidden = true;
  const document = {
    getElementById(id) { return fields[id]; },
    createElement(tag) { return new Element(tag); },
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? { content: "" } : null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: new Element("body"), documentElement: new Element("html"),
  };
  const window = {
    innerWidth: 1000, innerHeight: 800, confirm: () => true, prompt: () => "Работа", print() {},
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), AudioContext: FakeAudioContext,
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  class FakeFileReader {
    readAsDataURL(file) { this.result = file.data; this.onload(); }
  }
  class FakeImage {
    constructor() { this.width = 1200; this.height = 800; }
    set src(value) { this._src = value; this.onload(); }
  }
  const api = vm.runInNewContext(`${source}\n;({ getWorkspace: () => workspace, getColumns: () => columns,
    boardFileText, parseWorkspaceFile, loadBoardFile, deleteCard, restoreTrash, duplicateColumn, moveCard,
    toggleCardLock, deleteColumn, playSound })`,
  { document, window, localStorage, FileReader: FakeFileReader, Image: FakeImage,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    Blob, Date, Math, setTimeout: () => 1, clearTimeout() {} });
  return { fields, api, soundStats };
}

(async () => {
  const app = startApp();
  assert.match(html, /id="background-button"[^>]*>\s*<span[^>]*>◐<\/span>\s*Фон<\/button>/,
    "the background settings have a labeled header button");
  assert.equal(app.api.getWorkspace().boards.length, 1);
  assert.equal(app.api.getColumns().length, 4);
  assert.equal(JSON.parse(storage.get("task-board-v2")).boards.length, 1, "initial state autosaves");
  assert.equal(app.api.getWorkspace().settings.sound, false, "sound starts muted");
  assert.equal(app.soundStats.created, 0, "opening the board starts no audio");
  app.fields["sound-toggle"].click();
  assert.equal(app.soundStats.created, 0, "enabling sound starts no background audio");
  app.api.playSound("create");
  assert.equal(app.soundStats.stopped, 1, "the action note has a scheduled stop");
  app.fields["sound-toggle"].click();
  assert.equal(app.soundStats.closed, 1, "muting closes the audio context");

  app.fields.board.children[0].children[1].children[0].click();
  app.fields["card-title"].value = "Первая задача";
  app.fields["card-description"].value = "Описание";
  app.fields["card-pinned"].checked = true;
  app.fields["card-pinned"].fire("change");
  app.fields["sticker-choices"].children[0].click();
  app.fields["card-form"].fire("submit");
  assert.equal(app.api.getColumns()[0].cards[0].title, "Первая задача");
  assert.equal(app.api.getColumns()[0].cards[0].pinned, true);
  assert.deepEqual(Array.from(app.api.getColumns()[0].cards[0].stickers), ["⭐"]);
  assert.equal(JSON.parse(storage.get("task-board-v2")).boards[0].columns[0].cards.length, 1,
    "card creation autosaves");
  const firstId = app.api.getColumns()[0].cards[0].id;
  const firstColumnId = app.api.getColumns()[0].id;
  const attachButton = app.fields.board.querySelectorAll(".card-attach-button")[0];
  assert.ok(attachButton, "the card has a visible attachment action");
  attachButton.click();
  app.fields["quick-attachment-file"].files = [{ name: "photo.png", type: "image/png",
    size: 5 * 1024 * 1024, data: "data:image/png;base64,QUJDRA==" }];
  app.fields["quick-attachment-file"].fire("change");
  await new Promise(setImmediate);
  assert.equal(app.api.getColumns()[0].cards[0].attachments[0].name, "photo.png",
    "the paperclip attaches an image directly to the card");
  assert.equal(app.api.getColumns()[0].cards[0].attachments[0].type, "image/jpeg",
    "the image is compressed before storage");
  assert.ok(app.fields.board.querySelectorAll(".attachment-thumb").length,
    "the card shows an image preview");
  assert.equal(JSON.parse(storage.get("task-board-v2")).boards[0].columns[0].cards[0].attachments[0].name,
    "photo.png", "the image autosaves in the browser");
  app.api.toggleCardLock(firstColumnId, firstId);
  assert.equal(app.api.moveCard(firstId, firstColumnId, { newColumn: true }), false,
    "locked cards cannot move");
  app.api.toggleCardLock(firstColumnId, firstId);
  app.fields.board.children[0].children[1].children[0].click();
  app.fields["add-checklist-item"].click();
  const checklistRow = app.fields["checklist-editor"].children[0];
  checklistRow.children[1].value = "Проверить"; checklistRow.children[1].fire("input");
  checklistRow.children[0].checked = true; checklistRow.children[0].fire("change");
  app.fields["card-large"].checked = true; app.fields["card-large"].fire("change");
  app.fields["card-form"].fire("submit");
  assert.equal(app.api.getColumns()[0].cards[0].checklist[0].text, "Проверить");
  assert.equal(app.api.getColumns()[0].cards[0].checklist[0].done, true);
  assert.equal(app.api.getColumns()[0].cards[0].large, true);
  const second = JSON.parse(JSON.stringify(app.api.getColumns()[0].cards[0]));
  second.id = "second-card"; second.title = "Вторая задача"; second.pinned = false;
  app.api.getColumns()[0].cards.push(second);
  app.api.moveCard(second.id, firstColumnId, { columnId: firstColumnId, index: 0 });
  assert.equal(app.api.getColumns()[0].cards[0].id, firstId, "pinned cards remain above ordinary cards");
  app.fields["theme-select"].value = "pastel"; app.fields["theme-select"].fire("change");
  app.fields["compact-toggle"].click(); app.fields["zoom-out"].click();
  assert.equal(app.api.getWorkspace().settings.theme, "pastel");
  assert.equal(app.api.getWorkspace().settings.compact, true);
  assert.equal(app.api.getWorkspace().settings.zoom, 90);
  app.fields["background-button"].click(); app.fields["background-options"].children[1].click();
  assert.equal(app.api.getWorkspace().boards[0].background, "dots");
  app.fields["live-background"].checked = true; app.fields["live-background"].fire("change");
  assert.equal(app.api.getWorkspace().boards[0].animated, true, "live background is enabled");
  assert.ok(app.fields["board-scroll"].classList.contains("living-background"),
    "the animated background style is applied");
  app.fields["board-background-file"].files = [{ name: "background.png", type: "image/png",
    size: 3 * 1024 * 1024, data: "data:image/png;base64,QUJDRA==" }];
  app.fields["board-background-file"].fire("change");
  await new Promise(setImmediate);
  assert.match(app.api.getWorkspace().boards[0].background, /^data:image\/jpeg;base64,/,
    "custom background image is compressed and stored");
  assert.equal(app.fields["board-scroll"].dataset.background, "custom");
  assert.equal(app.fields["custom-background-preview"].hidden, false,
    "the background dialog shows the selected image");
  app.api.getColumns()[0].cards[0].cover = "data:image/jpeg;base64,AAAA";
  app.api.getColumns()[0].cards[0].attachments.push({ id: "file-one", name: "notes.txt",
    data: "data:text/plain;base64,SGk=", type: "text/plain" });
  app.fields["board-search"].value = "не найдено"; app.fields["board-search"].fire("input");
  assert.equal(app.fields.board.children[0].children[1].children[0].hidden, true, "search hides nonmatches");
  app.fields["board-search"].value = ""; app.fields["board-search"].fire("input");
  app.fields["presentation-button"].click();
  assert.equal(app.fields["presentation-dialog"].open, true);

  app.fields["board-tabs"].children.at(-1).click();
  app.fields["board-name-field"].value = "Работа";
  app.fields["board-name-form"].fire("submit");
  assert.equal(app.api.getWorkspace().boards.length, 2, "new board is created");
  assert.equal(app.api.getWorkspace().boards[1].name, "Работа");
  app.fields["board-tabs"].children[0].click();
  assert.equal(app.api.getColumns()[0].cards[0].title, "Первая задача", "switching boards preserves cards");
  const text = app.api.boardFileText();
  assert.equal(app.api.parseWorkspaceFile(text).boards.length, 2, "TXT contains all boards");
  assert.match(app.api.parseWorkspaceFile(text).boards[0].background, /^data:image\/jpeg;base64,/,
    "TXT keeps the custom background image");
  assert.equal(app.api.parseWorkspaceFile(text).boards[0].animated, true,
    "TXT keeps the live background setting");
  const exportedFiles = app.api.parseWorkspaceFile(text).boards[0].columns[0].cards[0].attachments;
  assert.ok(exportedFiles.some(file => file.name === "notes.txt"), "TXT keeps attached files");
  assert.ok(exportedFiles.some(file => file.name === "photo.png" && file.data.startsWith("data:image/jpeg;base64,")),
    "TXT keeps attached image data");
  assert.equal(app.api.parseWorkspaceFile(text).boards[0].columns[0].cards[0].cover,
    "data:image/jpeg;base64,AAAA", "TXT keeps covers");

  const cardId = app.api.getColumns()[0].cards[0].id;
  const columnId = app.api.getColumns()[0].id;
  app.api.deleteCard(columnId, cardId);
  assert.equal(app.api.getWorkspace().trash.length, 1, "deleted cards enter trash");
  app.api.restoreTrash(app.api.getWorkspace().trash[0].id);
  assert.equal(app.api.getColumns()[0].cards[0].id, cardId, "trash restores the card");
  app.api.duplicateColumn(columnId);
  assert.equal(app.api.getColumns().length, 5, "column copy includes cards");
  assert.equal(app.api.getColumns()[1].cards[0].title, "Первая задача");
  const copiedId = app.api.getColumns()[1].id;
  app.api.deleteColumn(copiedId);
  assert.equal(app.api.getWorkspace().trash[0].type, "column", "deleted columns enter trash");
  app.api.restoreTrash(app.api.getWorkspace().trash[0].id);
  assert.equal(app.api.getColumns()[1].id, copiedId, "trash restores columns in their position");

  const reopened = startApp();
  assert.equal(reopened.api.getWorkspace().boards.length, 2, "all boards restore from localStorage");
  assert.equal(reopened.api.getColumns()[0].cards[0].title, "Первая задача");
  assert.match(reopened.api.getWorkspace().boards[0].background, /^data:image\/jpeg;base64,/,
    "custom background restores from localStorage");
  assert.equal(reopened.api.getWorkspace().boards[0].animated, true,
    "live background restores from localStorage");
  const oldFile = JSON.stringify({ format: "task-board", version: 1,
    columns: [{ name: "Старая", color: "#93c5fd", cards: [{ title: "Задача", description: "" }] }] });
  assert.equal(reopened.api.parseWorkspaceFile(oldFile).boards[0].columns[0].cards[0].title, "Задача",
    "old TXT files still load");
  assert.equal(await reopened.api.loadBoardFile({ size: text.length, text: async () => text }), true);
  assert.equal(reopened.api.getWorkspace().boards.length, 2);
  assert.equal(await reopened.api.loadBoardFile({ size: 2, text: async () => "{}" }), false);
  assert.equal(reopened.api.getWorkspace().boards.length, 2, "invalid import keeps current boards");
  console.log("Smoke test passed: autosave, boards, media export, pinning, locking, trash, themes and sound controls.");
})().catch(error => { console.error(error); process.exitCode = 1; });
