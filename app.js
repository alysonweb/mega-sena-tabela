// app.js (COMPLETO - v10: faixa roxa maior (insetX/insetY) + alinhada)
// ✅ Ajuste do tamanho da faixa no bloco "// AJUSTE AQUI"

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


    // evita salvar no localStorage a cada tecla (reduz travadinhas)
    this.persistDebounced = (() => {
      let t = null;
      return () => {
        clearTimeout(t);
        t = setTimeout(() => this.persist(), 200);
      };
    })();
    this.gridEl = document.getElementById("grid");
    this.gridWrapEl = document.getElementById("gridWrap");
    this.overlayEl = document.getElementById("medianOverlay");

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

    this.colorByDigit = {
      0: "white",
      1: "red",
      2: "yellow",
      3: "green",
      4: "brown",
      5: "blue",
      6: "pink",
      7: "black",
      8: "gray",
      9: "orange",
    };

    window.addEventListener("resize", () => this.applyCenterHighlight());
    this.gridWrapEl?.addEventListener("scroll", () => this.applyCenterHighlight(), { passive: true });

    this.bindUI();
    this.initLegendToggle();
    this.initPrintHooks();
    this.init();
  }

  clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  setStatus(msg) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg || "";
    clearTimeout(this._statusTimer);
    if (msg) this._statusTimer = setTimeout(() => (this.statusEl.textContent = ""), 1800);
  }
  setSavedInfo(msg) { if (this.savedInfoEl) this.savedInfoEl.textContent = msg; }

  getConfig() {
    const rows = this.clamp(parseInt(this.rowsEl?.value, 10) || 5, 1, 200);
    const cols = this.clamp(parseInt(this.colsEl?.value, 10) || 11, 1, 60);
    if (this.rowsEl) this.rowsEl.value = rows;
    if (this.colsEl) this.colsEl.value = cols;
    return { rows, cols };
  }

  normalizeDigit(value) {
    const digits = String(value ?? "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    return digits[digits.length - 1]; // "10" -> "0"
  }

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

  persist() {
    const { rows, cols } = this.getConfig();
    const cells = this.getCells();
    const data = cells.map(cell => ({ v: cell.value, m: cell.dataset.marked === "1" }));

    this.storage.save({ rows, cols, data });
    this.applyCenterHighlight();
    this.setStatus("Salvo ✅");
    this.setSavedInfo("Salvo localmente");
  }

  getCells() { return [...this.gridEl.querySelectorAll(".cell")]; }

  buildGrid(rows, cols, savedData = []) {
    this.gridEl.innerHTML = "";
    this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 44px)`;

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
    input.style.caretColor = "transparent";
    if (saved.m) input.dataset.marked = "1";

    input.addEventListener("input", () => {
      input.value = this.normalizeDigit(input.value);
      this.applyColor(input);
      this.persistDebounced();
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
    const el = cells[idx];
    el.focus();
    try { el.setSelectionRange(1, 1); } catch {}
  }
  focusNext(idx) { this.focusAt(idx + 1); }
  focusPrev(idx) { this.focusAt(idx - 1); }
  focusDown(idx) { this.focusAt(idx + this.getConfig().cols); }
  focusUp(idx)   { this.focusAt(idx - this.getConfig().cols); }

  // ===== crescimento por linhas vazias =====
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
    return rows;
  }
  ensureRows(minRowsNeeded) {
    const cfg = this.getConfig();
    if (cfg.rows >= minRowsNeeded) return;

    const oldCells = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
    if (this.rowsEl) this.rowsEl.value = minRowsNeeded;

    const { rows, cols } = this.getConfig();
    this.buildGrid(rows, cols, oldCells);
  }

  // ===== overlay roxo: faixa única bonita =====
  clearOverlay() {
    if (!this.overlayEl) return;
    this.overlayEl.innerHTML = "";
  }

  getGridMetrics() {
    const style = getComputedStyle(this.gridEl);
    const gap = parseFloat(style.gap || style.columnGap || "0") || 0;

    const cell = this.gridEl.querySelector(".cell");
    const cellSize = cell ? cell.getBoundingClientRect().width : 44;

    return { gap, cellSize };
  }

  syncOverlayToGrid() {
    if (!this.overlayEl || !this.gridEl || !this.gridWrapEl) return;

    const wrapRect = this.gridWrapEl.getBoundingClientRect();
    const gridRect = this.gridEl.getBoundingClientRect();

    const left = (gridRect.left - wrapRect.left) + this.gridWrapEl.scrollLeft;
    const top  = (gridRect.top  - wrapRect.top)  + this.gridWrapEl.scrollTop;

    this.overlayEl.style.position = "absolute";
    this.overlayEl.style.left = `${left}px`;
    this.overlayEl.style.top = `${top}px`;
    this.overlayEl.style.width = `${gridRect.width}px`;
    this.overlayEl.style.height = `${gridRect.height}px`;
    this.overlayEl.style.pointerEvents = "none";
    this.overlayEl.style.zIndex = "1";
    this.overlayEl.style.overflow = "visible";
  }

  // ✅ ALTERAÇÃO MÍNIMA: não desenha mais a faixa roxa
  applyCenterHighlight() {
    // mantém o overlay “limpo” e alinhado
    this.clearOverlay();
    this.syncOverlayToGrid();

    const { cols } = this.getConfig();
    if (cols <= 0) return;

    // pega todos os dígitos preenchidos
    const digits = this.getCells()
      .map(c => c.value)
      .filter(v => v !== "")
      .map(v => Number(v))
      .filter(n => Number.isFinite(n));

    // se não tiver dígito nenhum, destaca o “meio” (2 colunas centrais)
    if (!digits.length) {
      const a = Math.max(0, Math.floor((cols - 1) / 2) - 0);
      const b = Math.min(cols - 1, a + 1);
      this.drawCenterBand(a, b);
      return;
    }

    const overall = digits.reduce((s, n) => s + n, 0) / digits.length;

    // média por coluna (ignora vazios)
    const colMeans = Array.from({ length: cols }, (_, col) => {
      const colDigits = this.getColumnDigits(col);
      if (!colDigits.length) return NaN;
      return colDigits.reduce((s, n) => s + n, 0) / colDigits.length;
    });

    // escolhe o par de colunas ADJACENTES cuja média fica mais próxima da média geral
    let bestStart = Math.max(0, Math.floor((cols - 1) / 2));
    let bestDist = Infinity;

    for (let c = 0; c < cols - 1; c++) {
      const a = colMeans[c];
      const b = colMeans[c + 1];
      const vals = [a, b].filter(x => Number.isFinite(x));
      if (!vals.length) continue;
      const pairMean = vals.reduce((s, n) => s + n, 0) / vals.length;
      const dist = Math.abs(pairMean - overall);
      if (dist < bestDist) {
        bestDist = dist;
        bestStart = c;
      }
    }

    const startCol = bestStart;
    const endCol = Math.min(cols - 1, bestStart + 1);
    this.drawCenterBand(startCol, endCol);
  }

  // ===== UI =====
  bindUI() {
    this.applyBtn?.addEventListener("click", () => {
      const { rows, cols } = this.getConfig();
      const current = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
      this.buildGrid(rows, cols, current);
      this.persist();
      this.applyCenterHighlight();
    });

    this.addRowBtn?.addEventListener("click", () => {
      const cfg = this.getConfig();
      this.ensureRows(cfg.rows + 1);
      this.persist();
      this.setStatus("Linha +1");
    });

    this.addColBtn?.addEventListener("click", () => {
      const cfg = this.getConfig();
      const oldCells = this.getCells().map(c => ({ v: c.value, m: c.dataset.marked === "1" }));
      if (this.colsEl) this.colsEl.value = cfg.cols + 1;

      const { rows, cols } = this.getConfig();
      this.buildGrid(rows, cols, oldCells);
      this.persist();
      this.setStatus("Coluna +1");
    });

    this.clearBtn?.addEventListener("click", () => {
      this.storage.clear();
      const { rows, cols } = this.getConfig();
      this.buildGrid(rows, cols, []);
      this.clearOverlay();
      this.setStatus("Limpo 🧽");
      this.setSavedInfo("Limpo");
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
    const recalcForPrint = () => {
      // força um reflow e recalcula após o layout do print aplicar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.applyCenterHighlight();
        });
      });
    };

    this.printBtn?.addEventListener("click", () => {
      const mode = this.printModeEl?.value || "table_legend";
      if (mode === "table") document.body.classList.add("print-table-only");
      else document.body.classList.remove("print-table-only");

      // ✅ recalcula a faixa com o layout final antes de imprimir
      recalcForPrint();

      // ✅ dá tempo pro navegador aplicar @media print, aí imprime
      setTimeout(() => window.print(), 120);
    });

    // ✅ quando o navegador entra no modo de impressão (Ctrl+P também)
    window.addEventListener("beforeprint", () => {
      recalcForPrint();
    });

    window.addEventListener("afterprint", () => {
      document.body.classList.remove("print-table-only");
      // ✅ volta a recalcular no layout normal
      this.applyCenterHighlight();
    });
  }

  init() {
    const saved = this.storage.load();

    if (saved?.rows && saved?.cols) {
      if (this.rowsEl) this.rowsEl.value = saved.rows;
      if (this.colsEl) this.colsEl.value = saved.cols;
      this.buildGrid(saved.rows, saved.cols, saved.data || []);
      this.setStatus("Carregado ✅");
      this.setSavedInfo("Carregado");
      this.applyCenterHighlight();
      return;
    }

    const { rows, cols } = this.getConfig();
    this.buildGrid(rows, cols, []);
    this.setSavedInfo("Novo");
    this.applyCenterHighlight();
  }
}

new MegaSenaGridApp("mega_sena_bolas_faixa_centro_roxa_v10");
