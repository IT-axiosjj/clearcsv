/* ClearCSV — original implementation, AI-assisted. No network dependencies. */
'use strict';
const CSVCore = (() => {
  const MAX_CHARS = 5 * 1024 * 1024;
  const MAX_ROWS = 50000;
  const MAX_COLUMNS = 100;
  const DELIMITERS = [',', '\t', ';', '|'];

  function records(text, delimiter, sampleLimit = Infinity) {
    if (!DELIMITERS.includes(delimiter)) throw new Error('不支持的分隔符。');
    const result = [];
    let row = [], field = '', quoted = false, closed = false, line = 1;
    const endField = () => {
      row.push(field);
      if (row.length > MAX_COLUMNS) throw new Error(`最多支持 ${MAX_COLUMNS} 列。`);
      field = '';
      closed = false;
    };
    const endRow = () => {
      endField();
      result.push(row);
      if (result.length > MAX_ROWS + 1) throw new Error(`最多支持 ${MAX_ROWS.toLocaleString()} 条数据记录。`);
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else {
          field += c;
          if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
        }
        continue;
      }
      if (c === delimiter) endField();
      else if (c === '\r' || c === '\n') {
        endRow();
        if (c === '\r' && text[i + 1] === '\n') i++;
        line++;
        if (result.length >= sampleLimit) return result;
      } else if (closed) {
        throw new Error(`第 ${line} 行：结束引号后存在非分隔符字符，请检查引号。`);
      } else if (c === '"') {
        if (field !== '') throw new Error(`第 ${line} 行：字段中间的引号需写为双引号转义，并用引号包围整个字段。`);
        quoted = true;
      } else field += c;
    }
    if (quoted) throw new Error(`第 ${line} 行：引号未闭合，请补齐结束引号。`);
    if (field !== '' || row.length || closed) endRow();
    return result;
  }

  function detectDelimiter(text) {
    let best = ',', score = -Infinity;
    for (const delimiter of DELIMITERS) {
      try {
        const sample = records(text, delimiter, 20).filter(r => r.some(v => v.trim() !== ''));
        if (!sample.length || sample[0].length <= 1) continue;
        const width = sample[0].length;
        const matching = sample.filter(r => r.length === width).length;
        const value = matching / sample.length * 100 + Math.min(width, 20);
        if (value > score) { score = value; best = delimiter; }
      } catch { /* A candidate delimiter may make quotes invalid. Try the next candidate. */ }
    }
    return best;
  }

  function parse(text, delimiter = 'auto') {
    if (typeof text !== 'string') throw new Error('请输入文本形式的 CSV 数据。');
    if (text.length > MAX_CHARS) throw new Error('文本过大，请使用不超过 5 MB 的 CSV 文件。');
    text = text.replace(/^\uFEFF/, '');
    if (text.trim() === '') throw new Error('文件为空，请加入表头和数据后重试。');
    const resolved = delimiter === 'auto' ? detectDelimiter(text) : delimiter;
    const parsed = records(text, resolved);
    const headers = parsed.shift();
    if (!headers || headers.every(h => !h.trim())) throw new Error('第一条记录必须包含表头。');
    const warnings = [];
    if (headers.some(h => !h.trim())) warnings.push('存在空表头，预览会显示列序号；导出保留原表头。');
    if (new Set(headers.map(h => h.trim())).size < headers.length) warnings.push('存在重复表头；按列位置区分，导出不会自动改名。');
    const rows = parsed.map((values, i) => {
      // A physically empty line represents a blank record, not lost columns.
      if (values.length === 1 && values[0] === '') return Array(headers.length).fill('');
      if (values.length !== headers.length) {
        throw new Error(`第 ${i + 2} 条记录有 ${values.length} 列，表头有 ${headers.length} 列。请修正列数，或手动选择正确分隔符。`);
      }
      return values;
    });
    return { headers, rows, delimiter: resolved, warnings };
  }

  function clean(dataset, options = {}) {
    const trim = options.trim !== false;
    const removeBlank = options.removeBlank !== false;
    const dedupe = options.dedupe !== false;
    const seen = new Set(), rows = [], sourceRows = [], changedCells = [];
    let removedBlank = 0, removedDuplicates = 0, trimmedCells = 0;
    dataset.rows.forEach((original, index) => {
      const changed = original.map(v => trim ? v.trim() : v);
      const flags = changed.map((v, i) => v !== original[i]);
      trimmedCells += flags.filter(Boolean).length;
      if (removeBlank && changed.every(v => v.trim() === '')) { removedBlank++; return; }
      const key = JSON.stringify(changed);
      if (dedupe && seen.has(key)) { removedDuplicates++; return; }
      seen.add(key);
      rows.push(changed);
      sourceRows.push(index + 2);
      changedCells.push(flags);
    });
    return { headers: dataset.headers.slice(), rows, sourceRows, changedCells,
      stats: { original: dataset.rows.length, output: rows.length, removedBlank, removedDuplicates, trimmedCells } };
  }

  function formulaLike(value) {
    // Keep actual negative numbers intact; prefix text that spreadsheets may evaluate.
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return false;
    return /^[\t\r\n]/.test(value) || /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(value);
  }

  function serialize(headers, rows, options = {}) {
    const delimiter = options.delimiter || ',';
    if (!DELIMITERS.includes(delimiter)) throw new Error('不支持的分隔符。');
    const protect = options.protect !== false;
    let protectedCells = 0;
    const quote = value => {
      let v = String(value);
      if (protect && formulaLike(v)) { v = "'" + v; protectedCells++; }
      return /["\r\n]/.test(v) || v.includes(delimiter) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const text = [headers, ...rows].map(row => row.map(quote).join(delimiter)).join('\r\n') + '\r\n';
    return { text: (options.bom === false ? '' : '\uFEFF') + text, protectedCells };
  }

  function profile(headers, rows) {
    return headers.map((header, i) => {
      const values = rows.map(r => r[i]);
      const nonempty = values.filter(v => v.trim() !== '');
      const numeric = nonempty.filter(v => /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v)).length;
      return { name: header.trim() || `第 ${i + 1} 列`, missing: values.length - nonempty.length,
        unique: new Set(nonempty).size, numeric, total: values.length,
        kind: !nonempty.length ? '空列' : numeric === nonempty.length ? '数值样式 · 保留文本' : numeric ? '混合内容 · 保留文本' : '文本',
        formulaCells: values.filter(formulaLike).length };
    });
  }

  return { parse, clean, serialize, profile, formulaLike, detectDelimiter, MAX_CHARS, MAX_ROWS, MAX_COLUMNS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CSVCore;
