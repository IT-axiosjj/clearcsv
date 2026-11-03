/* ClearCSV UI. All imported values are rendered as text, never HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 50;
  const SAMPLE = '编号,项目,负责人,状态,金额,备注\r\n' +
    '0001, 官网改版 ,小林,进行中,12800, 首屏样式校对 \r\n' +
    '0002,组件库, 小周 ,已完成,6800,"按钮,表单,弹窗"\r\n' +
    '0003,数据看板,小陈,进行中,9500,"第一轮评审\n等待反馈"\r\n' +
    '0004,移动端适配,小林,待开始,4200,\r\n' +
    '0002,组件库,小周,已完成,6800,"按钮,表单,弹窗"\r\n' +
    ',,,,,\r\n' +
    '0005,文档整理,小许,已完成,1800,"更新说明中的 ""示例"""\r\n' +
    '0006,接口联调,小陈, 进行中 ,5600,保留原始编号\r\n' +
    '0007,回归检查,小周,待开始,-200,退款记为负数\r\n' +
    '0008,导出检查,小许,待开始,0,=1+1\r\n' +
    '0001,官网改版,小林,进行中,12800,首屏样式校对\r\n' +
    '0009,无障碍检查, 小林,进行中,2600, 键盘与焦点 \r\n';
  const state = { text: '', name: '', sample: false, raw: null, cleaned: null, profiles: [], view: 'clean', page: 0, generation: 0 };
  let toastTimer;
  const format = n => n.toLocaleString('zh-CN');
  const delimiterName = d => ({ ',': '逗号', '\t': 'Tab', ';': '分号', '|': '竖线' }[d]);
  const options = () => ({ trim: $('trimRule').checked, removeBlank: $('blankRule').checked, dedupe: $('dedupeRule').checked });
  const delimiter = () => $('delimiter').value === 'tab' ? '\t' : $('delimiter').value;
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function announce(message) { $('announcement').textContent = message; }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }
  function formulaTotal() {
    return state.cleaned ? state.cleaned.headers.filter(CSVCore.formulaLike).length +
      state.profiles.reduce((sum, p) => sum + p.formulaCells, 0) : 0;
  }
  function renderFormula() {
    const count = formulaTotal();
    $('formulaCount').textContent = state.cleaned ? `${count} 个字段可能被表格软件识别为公式${$('formulaRule').checked ? '，导出时将添加保护前缀。' : '；保护已关闭，导出前请核对。'}` : '等待数据。';
  }
  function renderProfile() {
    $('columnProfile').replaceChildren();
    const p = state.profiles[Number($('columnSelect').value)];
    if (!p) return;
    const box = element('div', undefined, 'profile-data');
    box.append(element('p', p.kind, 'profile-kind'));
    for (const [label, value] of [['非空值', p.total - p.missing], ['缺失值', p.missing], ['不同的非空值', p.unique]]) {
      const row = element('div', undefined, 'profile-row');
      row.append(element('span', label), element('strong', format(value)));
      box.append(row);
    }
    $('columnProfile').append(box);
  }
  function renderTable() {
    const isRaw = state.view === 'raw';
    const data = isRaw ? state.raw : state.cleaned;
    const query = $('searchInput').value.toLocaleLowerCase();
    const indices = data ? data.rows.reduce((a, row, i) => {
      if (!query || row.some(v => v.toLocaleLowerCase().includes(query))) a.push(i);
      return a;
    }, []) : [];
    state.page = Math.max(0, Math.min(state.page, Math.ceil(indices.length / PAGE_SIZE) - 1));
    const start = state.page * PAGE_SIZE;
    $('tableHead').replaceChildren();
    $('tableBody').replaceChildren();
    if (data) {
      const head = element('tr');
      const source = element('th', '源记录'); source.scope = 'col'; head.append(source);
      data.headers.forEach((h, i) => { const th = element('th', h.trim() || `第 ${i + 1} 列`); th.scope = 'col'; th.title = h; head.append(th); });
      $('tableHead').append(head);
      const fragment = document.createDocumentFragment();
      for (const index of indices.slice(start, start + PAGE_SIZE)) {
        const tr = element('tr');
        tr.append(element('td', String(isRaw ? index + 2 : state.cleaned.sourceRows[index])));
        data.rows[index].forEach((value, column) => {
          const td = element('td');
          if (!isRaw && state.cleaned.changedCells[index][column]) {
            td.classList.add('changed');
            td.title = `已修整首尾空白；原始值：${state.raw.rows[state.cleaned.sourceRows[index] - 2][column]}`;
          } else td.title = value;
          if (value === '') { td.classList.add('blank-cell'); td.append(element('span', '空值')); }
          else td.textContent = value;
          tr.append(td);
        });
        fragment.append(tr);
      }
      $('tableBody').append(fragment);
    }
    $('emptyState').hidden = indices.length !== 0;
    $('emptyState').querySelector('strong').textContent = query && data ? '没有匹配的记录' : '这里暂时没有数据';
    $('emptyState').querySelector('p').textContent = query && data ? '试试其他关键词；搜索不会改变导出的内容。' : '导入文件或使用示例开始整理。';
    $('pageInfo').textContent = `${indices.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, indices.length)} / ${format(indices.length)}`;
    $('prevPage').disabled = state.page === 0;
    $('nextPage').disabled = start + PAGE_SIZE >= indices.length;
    $('previewNote').textContent = isRaw ? '原始数据保留导入时的文本内容' : '浅蓝色表示已修整的单元格';
    $('previewSummary').textContent = data ? `${data.headers.length} 列 · ${format(data.rows.length)} 条${isRaw ? '原始' : '清理后'}记录${query ? ` · 匹配 ${format(indices.length)} 条` : ''}` : '请导入有效数据';
    for (const [id, active] of [['cleanTab', !isRaw], ['rawTab', isRaw]]) {
      $(id).classList.toggle('selected', active);
      $(id).setAttribute('aria-selected', String(active));
      $(id).tabIndex = active ? 0 : -1;
    }
    $('tablePanel').setAttribute('aria-labelledby', isRaw ? 'rawTab' : 'cleanTab');
  }
  function render() {
    const stats = state.cleaned?.stats;
    $('fileName').textContent = state.name || '尚未导入文件';
    $('sampleTag').hidden = !state.sample;
    $('detectedDelimiter').textContent = state.raw ? `已识别：${delimiterName(state.raw.delimiter)}` : '';
    for (const [id, value] of [['originalCount', stats?.original], ['outputCount', stats?.output], ['duplicatesCount', stats?.removedDuplicates], ['trimmedCount', stats?.trimmedCells], ['cleanTabCount', stats?.output], ['rawTabCount', stats?.original]]) $(id).textContent = format(value || 0);
    $('retainedNote').textContent = stats ? `移除 ${format(stats.removedBlank)} 条全空记录` : '等待有效数据';
    $('exportHeading').textContent = stats ? `已整理 ${format(stats.output)} 条记录，随时导出` : '导入有效数据后即可导出';
    $('statusPill').textContent = state.raw ? '● 已更新' : '等待数据';
    $('exportButton').disabled = $('reportButton').disabled = !state.cleaned;
    $('warnings').hidden = !state.raw?.warnings.length;
    $('warnings').textContent = state.raw?.warnings.join(' ') || '';
    const selected = $('columnSelect').value;
    $('columnSelect').replaceChildren();
    state.profiles.forEach((p, i) => { const option = element('option', `${i + 1}. ${p.name}`); option.value = String(i); $('columnSelect').append(option); });
    if (selected !== '' && state.profiles[Number(selected)]) $('columnSelect').value = selected;
    $('columnSelect').disabled = !state.raw;
    renderProfile(); renderFormula(); renderTable();
  }
  function fail(message) {
    state.raw = state.cleaned = null;
    state.profiles = [];
    $('errorMessage').textContent = message;
    $('errorMessage').hidden = false;
    render(); announce(message);
  }
  function recalculate() {
    if (!state.raw) return;
    state.cleaned = CSVCore.clean(state.raw, options());
    state.profiles = CSVCore.profile(state.cleaned.headers, state.cleaned.rows);
    state.page = 0;
    render();
    announce(`清理完成，保留 ${state.cleaned.stats.output} 条记录。`);
  }
  function load(text, name, sample = false) {
    ++state.generation;
    state.text = text; state.name = name; state.sample = sample; state.page = 0;
    $('searchInput').value = '';
    try {
      if (new TextEncoder().encode(text).length > CSVCore.MAX_CHARS) throw new Error('数据超过 5 MB，请拆分文件后重试。');
      state.raw = CSVCore.parse(text, delimiter());
      $('errorMessage').hidden = true;
      recalculate();
      return true;
    } catch (error) { fail(error.message); return false; }
  }
  async function readFile(file) {
    if (!file) return;
    const token = ++state.generation;
    state.name = file.name; state.sample = false; state.text = '';
    fail('正在读取文件…');
    try {
      if (file.size > CSVCore.MAX_CHARS) throw new Error('文件超过 5 MB，请拆分文件后重试。');
      const buffer = await file.arrayBuffer();
      if (token !== state.generation) return;
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new Error('无法按 UTF-8 解码。请将文件另存为 UTF-8 CSV 后再导入。'); }
      load(text, file.name);
    } catch (error) { if (token === state.generation) fail(error.message); }
  }
  function download(text, mime, suffix) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = (state.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'clearcsv') + suffix;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('sampleButton').addEventListener('click', () => { $('delimiter').value = 'auto'; load(SAMPLE, '项目清单.csv', true); toast('已载入合成示例，未使用真实业务数据。'); });
  $('chooseFile').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', event => { readFile(event.target.files[0]); event.target.value = ''; });
  let dragDepth = 0;
  $('dropZone').addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; $('dropZone').classList.add('dragging'); });
  $('dropZone').addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
  $('dropZone').addEventListener('dragleave', () => { if (--dragDepth <= 0) $('dropZone').classList.remove('dragging'); });
  $('dropZone').addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('dropZone').classList.remove('dragging'); readFile(event.dataTransfer.files[0]); });
  // Dropping outside the import area must not navigate away with the user's file.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  $('pasteButton').addEventListener('click', () => { $('pasteError').hidden = true; $('pasteDialog').showModal(); $('pasteText').focus(); });
  for (const id of ['closePaste', 'cancelPaste']) $(id).addEventListener('click', () => $('pasteDialog').close());
  $('applyPaste').addEventListener('click', () => {
    if (load($('pasteText').value, '粘贴数据.csv')) { $('pasteDialog').close(); toast('已载入粘贴数据。'); }
    else { $('pasteError').textContent = $('errorMessage').textContent; $('pasteError').hidden = false; }
  });
  $('delimiter').addEventListener('change', () => { if (state.text) load(state.text, state.name, state.sample); });
  for (const id of ['trimRule', 'blankRule', 'dedupeRule']) $(id).addEventListener('change', recalculate);
  $('formulaRule').addEventListener('change', renderFormula);
  $('columnSelect').addEventListener('change', renderProfile);
  $('searchInput').addEventListener('input', () => { state.page = 0; renderTable(); });
  for (const [id, view] of [['cleanTab', 'clean'], ['rawTab', 'raw']]) {
    $(id).addEventListener('click', () => { state.view = view; state.page = 0; renderTable(); });
    $(id).addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const target = event.key === 'Home' ? 'cleanTab' : event.key === 'End' ? 'rawTab' : id === 'cleanTab' ? 'rawTab' : 'cleanTab';
        $(target).click(); $(target).focus();
      }
    });
  }
  $('prevPage').addEventListener('click', () => { state.page--; renderTable(); });
  $('nextPage').addEventListener('click', () => { state.page++; renderTable(); });
  $('exportButton').addEventListener('click', () => {
    if (!state.cleaned) return;
    const output = CSVCore.serialize(state.cleaned.headers, state.cleaned.rows, { protect: $('formulaRule').checked });
    download(output.text, 'text/csv;charset=utf-8', '-clean.csv');
    toast(`已生成 ${format(state.cleaned.rows.length)} 条记录的 CSV，保护 ${output.protectedCells} 个字段。`);
  });
  $('reportButton').addEventListener('click', () => {
    if (!state.cleaned) return;
    const summary = { application: 'ClearCSV 1.0.0', generatedAt: new Date().toISOString(), syntheticSample: state.sample,
      inputDelimiter: delimiterName(state.raw.delimiter), outputDelimiter: '逗号', encoding: 'UTF-8 BOM',
      rules: options(), stats: state.cleaned.stats, columnCount: state.cleaned.headers.length,
      formulaProtection: $('formulaRule').checked, prefixedFields: $('formulaRule').checked ? formulaTotal() : 0,
      note: '摘要不含文件名、列名和单元格内容；导出全部清理结果，预览搜索不影响导出。' };
    download(JSON.stringify(summary, null, 2) + '\n', 'application/json;charset=utf-8', '-summary.json');
    toast('已生成不含单元格内容的处理摘要。');
  });
  $('helpButton').addEventListener('click', () => $('helpDialog').showModal());
  $('helpFooterButton').addEventListener('click', () => $('helpDialog').showModal());
  $('closeHelp').addEventListener('click', () => $('helpDialog').close());
  load(SAMPLE, '项目清单.csv', true);
})();
