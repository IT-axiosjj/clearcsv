const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('RFC-style quoted delimiter, escaped quotes and embedded CRLF survive export', () => {
  const input = 'id,note\r\n001,"hello, world"\r\n002,"line 1\r\nline ""2"""\r\n';
  const data = C.parse(input);
  assert.deepEqual(data.rows, [['001','hello, world'],['002','line 1\r\nline "2"']]);
  const roundTrip = C.parse(C.serialize(data.headers, data.rows, { protect: false }).text);
  assert.deepEqual(roundTrip.rows, data.rows);
});
test('UTF-8 BOM is accepted without changing the first header', () => {
  assert.deepEqual(C.parse('\uFEFF姓名,编号\n小林,0007').headers, ['姓名','编号']);
});
test('a trailing delimiter preserves the empty final cell', () => {
  assert.deepEqual(C.parse('a,b,c\n1,2,').rows, [['1','2','']]);
});
test('a final newline does not invent an extra record', () => {
  assert.equal(C.parse('a,b\n1,2\n').rows.length, 1);
});
test('CR-only line endings are accepted', () => {
  assert.deepEqual(C.parse('a,b\r1,2\r').rows, [['1','2']]);
});
test('blank physical records are preserved for the cleanup rule', () => {
  const data = C.parse('a,b\n1,2\n\n3,4');
  assert.deepEqual(data.rows[1],['','']);
  assert.equal(C.clean(data).stats.removedBlank, 1);
});
test('tab dialect detection ignores commas inside quoted values', () => {
  const data = C.parse('id\tnote\n001\t"a,b,c"');
  assert.equal(data.delimiter,'\t');
  assert.deepEqual(data.rows,[['001','a,b,c']]);
});
test('semicolon and pipe dialects are detected', () => {
  assert.equal(C.parse('a;b\n1;2').delimiter,';');
  assert.equal(C.parse('a|b\n1|2').delimiter,'|');
});
test('manual delimiter wins over autodetection', () => {
  assert.deepEqual(C.parse('a,b\n1,2',';').rows,[['1,2']]);
});
test('quoted single-column CSV can contain separators', () => {
  assert.deepEqual(C.parse('name\n"a,b"').rows,[['a,b']]);
});
test('unclosed quotes block parsing rather than silently truncating', () => {
  assert.throws(() => C.parse('a,b\n1,"broken',','),/引号未闭合/);
});
test('unescaped middle quotes and trailing junk are rejected', () => {
  assert.throws(() => C.parse('a,b\n1,a"b',','),/字段中间/);
  assert.throws(() => C.parse('a,b\n1,"x"y',','),/结束引号/);
});
test('ragged records are rejected with the record number', () => {
  assert.throws(() => C.parse('a,b\n1,2,3',','),/第 2 条记录有 3 列/);
  assert.throws(() => C.parse('a,b\n1',','),/第 2 条记录有 1 列/);
});
test('empty inputs and empty headers fail visibly', () => {
  assert.throws(() => C.parse('  \n'),/文件为空/);
  assert.throws(() => C.parse(',\n1,2'),/表头/);
});
test('duplicate and empty headers are preserved with warnings', () => {
  const data=C.parse('a,a,\n1,2,3');
  assert.equal(data.warnings.length,2);
  assert.deepEqual(data.headers,['a','a','']);
});
test('cleanup runs trim before exact full-row deduplication', () => {
  const data=C.parse('code,name\n001, 小林 \n001,小林\n002,\n,');
  const result=C.clean(data);
  assert.deepEqual(result.rows,[['001','小林'],['002','']]);
  assert.deepEqual(result.sourceRows,[2,4]);
  assert.deepEqual(result.stats,{original:4,output:2,removedBlank:1,removedDuplicates:1,trimmedCells:1});
  assert.deepEqual(result.changedCells,[[false,true],[false,false]]);
});
test('turning off cleanup restores duplicates, blank lines and whitespace', () => {
  const data=C.parse('a,b\n x ,1\n x ,1\n,');
  assert.deepEqual(C.clean(data,{trim:false,removeBlank:false,dedupe:false}).rows,data.rows);
});
test('cleanup never mutates the source data', () => {
  const data=C.parse('a,b\n x ,001\n x ,001');
  const before=JSON.stringify(data);
  C.clean(data);
  assert.equal(JSON.stringify(data),before);
});
test('leading zeroes, long integers, dates and text are never type-coerced', () => {
  const data=C.parse('id,big,date,amount\n0001,12345678901234567890,2026-11-03,1.20');
  assert.deepEqual(C.clean(data).rows,data.rows);
});
test('row identity cannot collide through delimiters embedded in cells', () => {
  const data={headers:['a','b'],rows:[['a,b','c'],['a','b,c']]};
  assert.equal(C.clean(data).rows.length,2);
});
test('formula protection covers dangerous headers and values, including leading whitespace', () => {
  const result=C.serialize(['=1+1','note'],[[' @SUM(A1)','+cmd'],['-2','-x']]);
  assert.equal(result.protectedCells,4);
  const data=C.parse(result.text);
  assert.equal(data.headers[0],"'=1+1");
  assert.deepEqual(data.rows,[["' @SUM(A1)","'+cmd"],['-2',"'-x"]]);
});
test('formula protection can be disabled for exact value round-trips', () => {
  const values=[['=1+1','\ttext'],['@x','-x']];
  assert.deepEqual(C.parse(C.serialize(['a','b'],values,{protect:false}).text).rows,values);
});
test('empty and duplicate metrics remain column-specific', () => {
  const p=C.profile(['code','name'],[['001','小林'],['001',''],['','小林']]);
  assert.deepEqual(p.map(x=>[x.missing,x.unique]),[[1,1],[1,1]]);
  assert.equal(p[0].kind,'数值样式 · 保留文本');
});
test('data strings resembling HTML are preserved as data', () => {
  const payload='<img src=x onerror=alert(1)>';
  assert.equal(C.parse('note\n'+payload).rows[0][0],payload);
});
test('multi-dialect serialization and parsing are reversible', () => {
  const rows=[['a,b','x\ty'],['a;b','a|b'],['"quoted"','line\nbreak'],['','尾行']];
  for(const delimiter of [',','\t',';','|']) {
    const out=C.serialize(['left','right'],rows,{delimiter,protect:false,bom:false});
    assert.deepEqual(C.parse(out.text,delimiter).rows,rows);
  }
});
test('resource bounds reject excessive rows and columns', () => {
  assert.throws(()=>C.parse('h\n'+'v\n'.repeat(C.MAX_ROWS+1),','),/条数据记录/);
  assert.throws(()=>C.parse(Array(C.MAX_COLUMNS+1).fill('h').join(','),','),/最多支持 100 列/);
});
