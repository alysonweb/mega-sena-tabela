class StorageRepo {
  constructor(key) { this.key = key; }
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  save(payload) { localStorage.setItem(this.key, JSON.stringify(payload)); }
  clear() { localStorage.removeItem(this.key); }
}

class MegaSenaGridApp {
  constructor(storageKey) {
    this.storage = new StorageRepo(storageKey);

    // UI
    this.gridEl = document.getElementById("grid");
    this.rowsEl = document.getElementById("rows");
    this.colsEl = document.getElementById("cols");

    this.applyBtn = document.getElementById("apply");
    this.addRowBtn = document.getElementById("addRow");
    this.addColBtn = document.getElementById("addCol");
    this.clearBtn = document.getElementById("clear");

    this.printBtn = document.getElementById("print");
    this.printModeEl = document.getElementById("printMode");
    this.statusEl = document.getElementById("status");
    this.savedInfoEl = document.getElementById("savedInfo");

    // Paste
    this.pasteInputEl = document.getElementById("pasteInput");
    this.fillFromPasteBtn = document.getElementById("fillFromPaste");
    this.extractModeEl = document.getElementById("extractMode");
    this.includeDateEl = document.getElementById("includeDate");
    this.appendModeEl = document.getElementById("appendMode");

    this.colorByDigit = {
      0: "white", 1: "red", 2: "yellow", 3: "green", 4: "brown",
      5: "blue", 6: "pink", 7: "black", 8: "gray", 9: "orange",
    };

    this.bindUI();
    this.initLegendToggle();
    this.initPrintHooks();
    this.init();
  }

  /* ===== Utils ===== */
  clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  setStatus(msg) {
    this.statusEl.textContent = msg || "";
    clearTimeout(this._statusTimer);
    if (msg) this._statusTimer = setTimeout(() => (this.statusEl.textContent = ""), 1800);
  }

  setSavedInfo(msg) {
    if (this.savedInfoEl) this.savedInfoEl.textContent = msg;
  }

  getConfig() {
    const rows = this.clamp(parseInt(this.rowsEl.value, 10) || 5, 1, 200);
    const cols = this.clamp(parseInt(this.colsEl.value, 10) || 11, 1, 60);
    this.rowsEl.value = rows;
    this.colsEl.value = cols;
    return { rows, cols };
  }

  normalizeDigit(value) {
    const digits = String(value || "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    return digits[digits.length - 1]; // sempre 1 dígito
  }

  /* ===== Coloring ===== */
  applyColor(input) {
    const marked = input.dataset.marked === "1";
    input.className = "cell";
    if (marked) input.classList.add("marked");

    const v = input.value;
    if (v === "") return;

    const d = parseInt(v, 10);
    if (!Number.isInteger(d) || d < 0 || d > 9) return;

    const colorClass = this.colorByDigit[d];
    if (colorClass) input.classList.add(colorClass);
  }

  /* ===== Persistence ===== */
  persist() {
    const { rows, cols } = this.getConfig();
    const cells = this.getCells();

    const data = cells.map(cell => ({
      v: cell.value,
      m: cell.dataset.marked === "1",
    }));

    this.storage.save({ rows, cols, data });
    this.setStatus("Salvo ✅");
    this.setSavedInfo("Salvo localmente");
  }

  /* ===== Grid ===== */
  getCells() {
    return [...this.gridEl.querySelectorAll(".cell")];
  }

  buildGrid(rows, cols, savedData = []) {
    this.gridEl.innerHTML = "";
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(42px, 1fr))`;

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cellSaved = savedData[i] || { v: "", m: false };
      this.gridEl.appendChild(this.createCell(i, cellSaved));
    }
  }

  createCell(index, saved) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cell";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = 1;
    input.placeholder = " ";
    input.value = saved.v || "";
    input.dataset.index = String(index);

    if (saved.m) input.dataset.marked = "1";

    input.addEventListener("input", () => {
      input.value = this.normalizeDigit(input.value);
      this.applyColor(input);
      this.persist();
      if (input.value !== "") this.focusNext(index);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && input.value === "") {
        e.preventDefault();
        this.focusPrev(index);
        return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); this.focusNext(index); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); this.focusPrev(index); }
      if (e.key === "ArrowDown")  { e.preventDefault(); this.focusDown(index); }
      if (e.key === "ArrowUp")    { e.preventDefault(); this.focusUp(index); }
    });

    input.addEventListener("dblclick", () => {
      const isMarked = input.dataset.marked === "1";
      input.dataset.marked = isMarked ? "0" : "1";
      this.applyColor(input);
      this.persist();
    });

    input.addEventListener("blur", () => {
      input.value = this.normalizeDigit(input.value);
      this.applyColor(input);
      this.persist();
    });

    this.applyColor(input);
    return input;
  }

  focusAt(idx) {
    const cells = this.getCells();
    if (idx < 0 || idx >= cells.length) return;
    cells[idx].focus();
    try { cells[idx].setSelectionRange(1, 1); } catch {}
  }
  focusNext(idx) { this.focusAt(idx + 1); }
  focusPrev(idx) { this.focusAt(idx - 1); }
  focusDown(idx) { this.focusAt(idx + this.getConfig().cols); }
  focusUp(idx)   { this.focusAt(idx - this.getConfig().cols); }

  /* ===== Helpers de linha/coluna ===== */
  isRowEmpty(rowIndex) {
    const { cols } = this.getConfig();
    const cells = this.getCells();
    const start = rowIndex * cols;
    for (let c = 0; c < cols; c++) {
      if ((cells[start + c]?.value || "") !== "") return false;
    }
    return true;
  }

  findFirstEmptyRow() {
    const { rows } = this.getConfig();
    for (let r = 0; r < rows; r++) {
      if (this.isRowEmpty(r)) return r;
    }
    return rows; // nenhuma vazia -> seria "nova" linha
  }

  ensureRows(minRowsNeeded) {
    const cfg = this.getConfig();
    if (cfg.rows >= minRowsNeeded) return;

    // aumenta input e reconstrói preservando dados
    const oldCells = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
    this.rowsEl.value = minRowsNeeded;
    const { rows, cols } = this.getConfig();
    this.buildGrid(rows, cols, oldCells);
  }

  ensureCols(minColsNeeded) {
    const cfg = this.getConfig();
    if (cfg.cols >= minColsNeeded) return;

    const oldCells = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
    this.colsEl.value = minColsNeeded;
    const { rows, cols } = this.getConfig();
    this.buildGrid(rows, cols, oldCells);
  }

  /* ===== Paste -> Extração por LINHAS com quebra ===== */
  extractDigitsFromLine(line, mode, includeDate) {
    let t = String(line || "");

    if (!includeDate) {
      t = t.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ");
    }

    if (mode === "last") {
      const matches = t.match(/\d[\d\.\,]*/g) || [];
      const out = [];
      for (const m of matches) {
        const onlyDigits = m.replace(/[^0-9]/g, "");
        if (!onlyDigits) continue;
        out.push(onlyDigits[onlyDigits.length - 1]);
      }
      return out;
    }

    // all
    return (t.match(/\d/g) || []);
  }

  fillFromPasteByRows(text) {
    const { cols } = this.getConfig();
    const mode = this.extractModeEl.value || "all";
    const includeDate = !!this.includeDateEl.checked;
    const append = !!this.appendModeEl.checked;

    // pega linhas não vazias
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      this.setStatus("Cole pelo menos 1 linha");
      return;
    }

    // transforma cada linha em uma lista de dígitos
    const lineDigits = lines.map(l => this.extractDigitsFromLine(l, mode, includeDate))
                            .filter(arr => arr.length > 0);

    if (lineDigits.length === 0) {
      this.setStatus("Nenhum dígito encontrado");
      return;
    }

    // Calcula quantas linhas de grid serão necessárias com quebra por colunas
    // Cada linha colada pode ocupar 1 ou mais linhas do grid (wrap)
    const rowsNeededForPaste = lineDigits.reduce((sum, arr) => sum + Math.ceil(arr.length / cols), 0);

    // Decide onde começar
    let startRow = 0;
    if (append) startRow = this.findFirstEmptyRow();

    const requiredTotalRows = startRow + rowsNeededForPaste;

    // auto-aumenta linhas se precisar
    this.ensureRows(requiredTotalRows);

    // agora com grid certo, preenche
    const cells = this.getCells();
    const { cols: colsNow } = this.getConfig();

    let currentRow = startRow;
    let filledCount = 0;

    for (const digitsArr of lineDigits) {
      let idx = 0;

      while (idx < digitsArr.length) {
        // garante que existe essa linha
        // (ensureRows já fez, mas por segurança)
        const rowStart = currentRow * colsNow;

        for (let c = 0; c < colsNow && idx < digitsArr.length; c++) {
          const d = digitsArr[idx++];
          const cell = cells[rowStart + c];
          if (!cell) break;

          cell.value = this.normalizeDigit(d);
          this.applyColor(cell);
          filledCount++;
        }

        currentRow++; // wrap sempre desce linha quando enche colunas ou termina o bloco
      }
    }

    this.persist();
    this.setStatus(`Preenchido: ${filledCount} dígitos (${lineDigits.length} linhas coladas)`);
    this.focusAt(startRow * colsNow);
  }

  /* ===== UI ===== */
  bindUI() {
    this.applyBtn.addEventListener("click", () => {
      const { rows, cols } = this.getConfig();
      const current = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
      this.buildGrid(rows, cols, current);
      this.persist();
    });

    this.addRowBtn.addEventListener("click", () => {
      const cfg = this.getConfig();
      this.ensureRows(cfg.rows + 1);
      this.persist();
      this.setStatus("Linha adicionada");
    });

    this.addColBtn.addEventListener("click", () => {
      const cfg = this.getConfig();
      this.ensureCols(cfg.cols + 1);
      this.persist();
      this.setStatus("Coluna adicionada");
    });

    this.clearBtn.addEventListener("click", () => {
      this.storage.clear();
      const { rows, cols } = this.getConfig();
      this.buildGrid(rows, cols, []);
      this.setStatus("Limpo 🧽");
      this.setSavedInfo("Limpo");
    });

    this.fillFromPasteBtn.addEventListener("click", () => {
      this.fillFromPasteByRows(this.pasteInputEl.value || "");
    });
  }

  initLegendToggle() {
    const btn = document.getElementById("toggleLegend");
    const body = document.getElementById("legendBody");
    if (!btn || !body) return;

    btn.addEventListener("click", () => {
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      btn.textContent = hidden ? "Ocultar" : "Mostrar";
    });
  }

  initPrintHooks() {
    this.printBtn.addEventListener("click", () => {
      const mode = this.printModeEl?.value || "table_legend";
      if (mode === "table") document.body.classList.add("print-table-only");
      else document.body.classList.remove("print-table-only");
      window.print();
    });

    window.addEventListener("afterprint", () => {
      document.body.classList.remove("print-table-only");
    });
  }

  init() {
    const saved = this.storage.load();

    if (saved?.rows && saved?.cols) {
      this.rowsEl.value = saved.rows;
      this.colsEl.value = saved.cols;
      this.buildGrid(saved.rows, saved.cols, saved.data || []);
      this.setStatus("Carregado ✅");
      this.setSavedInfo("Carregado");
      return;
    }

    const { rows, cols } = this.getConfig();
    this.buildGrid(rows, cols, []);
    this.setSavedInfo("Novo");
  }
}

// Boot
new MegaSenaGridApp("mega_sena_digits_row_fill_v2");
