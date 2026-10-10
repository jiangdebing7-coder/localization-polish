"use strict";

function countLiteral(text, token) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(token, offset)) !== -1) {
    count += 1;
    offset += token.length;
  }
  return count;
}

cindy.onHostMessage(async function (msg) {
  if (msg.type !== "tool-call") return;
  if (msg.tool === "export_review_xlsx") { await exportReview(msg); return; }
  if (msg.tool !== "check_protected_tokens") {
    await cindy.send({type:"tool-result",callId:msg.callId,ok:false,errorCode:"UNSUPPORTED_TOOL",message:"请使用清单中声明的 export_review_xlsx 或 check_protected_tokens 工具。"});
    return;
  }
  const args = msg.args || {};
  if (typeof args.source !== "string" || typeof args.translation !== "string" ||
      args.source.length > 100000 || args.translation.length > 100000 ||
      !Array.isArray(args.tokens) || args.tokens.length < 1 || args.tokens.length > 64 ||
      args.tokens.some(token => typeof token !== "string" || token.length < 1 || token.length > 512) ||
      new Set(args.tokens).size !== args.tokens.length) {
    await cindy.send({type:"tool-result",callId:msg.callId,ok:false,errorCode:"INVALID_INPUT",message:"请提供不超过 100000 字符的原文和润色文本，以及 1 至 64 个不重复的非空保护片段，每个最多 512 字符。"});
    return;
  }
  const checks = args.tokens.map(token => {
    const sourceCount = countLiteral(args.source, token);
    const translationCount = countLiteral(args.translation, token);
    const status = sourceCount === 0 ? "not_in_source" :
      translationCount < sourceCount ? "missing" :
      translationCount > sourceCount ? "extra" : "same_count";
    return {token, sourceCount, translationCount, status};
  });
  await cindy.send({type:"tool-result",callId:msg.callId,ok:true,result:{
    checks,
    issues:checks.filter(item => item.status !== "same_count"),
    scope:"仅比较指定片段的逐字出现次数；未检查语义、模板语法、标签嵌套、顺序或未指定片段。"
  }});
});

// Fixed-shape review exporter. All workbook cells are strings, never formulas.
const REVIEW_HEADERS = ['原文', '译文', '优化后译文', '修改原因'];
function reviewError(message) { throw new Error(message); }
function reviewText(value, label, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 32767)
    reviewError(label + '必须是有效文本，单元格不能超过 32767 字符。');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value))
    reviewError(label + '包含 Excel 不支持的控制字符，请确认输入后处理，不会自动删除。');
  // Reject unpaired UTF-16 surrogates instead of silently changing user text.
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reviewError(label + '包含无效 Unicode。');
    } else if (n >= 0xdc00 && n <= 0xdfff) reviewError(label + '包含无效 Unicode。');
  }
  return value;
}
function prepareReview(args) {
  if (!args || !Array.isArray(args.rows) || !Number.isInteger(args.expected_rows) ||
      args.expected_rows < 1 || args.expected_rows > 1000 || args.rows.length !== args.expected_rows)
    reviewError('rows 必须与从输入核实的 expected_rows 一致，每批 1–1000 条；不能遗漏未修改行。');
  if (JSON.stringify(args).length > 4000000) reviewError('本批数据过大，请按原行序分批。');
  const includeId = args.rows.some(row => row && row.id !== undefined);
  let changed = 0;
  const data = args.rows.map((row, index) => {
    const label = '第 ' + (index + 1) + ' 条：';
    if (!row || typeof row !== 'object') reviewError(label + '记录无效。');
    const source = row.source === null ? '未提供' : reviewText(row.source, label + '原文', true);
    const translation = reviewText(row.translation, label + '修改前译文');
    const optimized = reviewText(row.optimized_translation, label + '优化后译文');
    if (!Array.isArray(row.changes) || row.changes.length > 100) reviewError(label + '必须提供 changes 数组（未修改时为空数组）。');
    let reason;
    if (translation === optimized) {
      if (row.changes.length) reviewError(label + '译文未变化，不能填写虚构的修改点。');
      reason = '无需修改';
    } else {
      if (!row.changes.length) reviewError(label + '译文已改变，必须提供逐项改前、改后措辞及原因。');
      let reconstructed = translation;
      const explanations = row.changes.map((change, n) => {
        if (!change || typeof change !== 'object') reviewError(label + '修改点无效。');
        const before = reviewText(change.before, label + '修改前措辞');
        const after = reviewText(change.after, label + '修改后措辞', true);
        const why = reviewText(change.reason, label + '修改原因');
        const generic = why.replace(/[\s，。；：、,.!！?？:;]/g, '');
        if (['更自然','已优化','优化表达','调整语序','统一风格','修改译文','润色','无需修改','同上'].includes(generic))
          reviewError(label + '原因过于笼统，请解释本项具体变化。');
        if (before === after) reviewError(label + '修改前后措辞相同。');
        const at = reconstructed.indexOf(before);
        if (at < 0) reviewError(label + '修改前措辞不在当前译文中，原因与实际改动不符。');
        if (reconstructed.indexOf(before, at + 1) >= 0)
          reviewError(label + '修改前措辞出现多次，请引用更完整的上下文或整句。');
        reconstructed = reconstructed.slice(0, at) + after + reconstructed.slice(at + before.length);
        return (n + 1) + '. “' + before + '” → “' + after + '”：' + why;
      });
      if (reconstructed !== optimized) reviewError(label + '修改点未覆盖全部变化，或优化后译文与所列修改不一致。');
      reason = explanations.join('\n');
      changed++;
    }
    if (row.note !== undefined) reason += '\n待确认：' + reviewText(row.note, label + '待确认事项');
    if (row.source === null) reason += '\n未提供原文，无法核验原文准确性或漏译。';
    reviewText(reason, label + '完整修改原因');
    const result = [source, translation, optimized, reason];
    if (includeId) result.push(row.id === undefined ? '' : reviewText(row.id, label + 'ID', true));
    return result;
  });
  return {headers: includeId ? REVIEW_HEADERS.concat('ID') : REVIEW_HEADERS.slice(), data, changed};
}
function xmlText(value) {
  return value.replace(/_x[0-9a-fA-F]{4}_/g, m => '_x005F_' + m.slice(1))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;');
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStored(files) {
  const encoder = new TextEncoder(), entries = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = encoder.encode(name), bytes = encoder.encode(text), crc = crc32(bytes);
    const local = new Uint8Array(30 + filename.length + bytes.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true);
    l.setUint16(26, filename.length, true); local.set(filename, 30); local.set(bytes, 30 + filename.length);
    const directory = new Uint8Array(46 + filename.length), d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
    d.setUint16(14, 33, true); d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true);
    d.setUint32(24, bytes.length, true); d.setUint16(28, filename.length, true); d.setUint32(42, offset, true);
    directory.set(filename, 46); entries.push(local); central.push(directory); offset += local.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const all = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const bytes of entries.concat(central, [end])) { all.set(bytes, cursor); cursor += bytes.length; }
  return all;
}
function reviewWorkbook(review) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const last = String.fromCharCode(64 + review.headers.length), end = review.data.length + 1;
  const strings = [];
  const rows = [review.headers].concat(review.data).map((values, i) => {
    const cells = values.map((value, j) => {
      const changedCell = i > 0 && j === 2 && review.data[i - 1][1] !== value;
      const style = i === 0 ? 1 : changedCell ? 2 : 0;
      const stringIndex = strings.push('<si><t xml:space="preserve">' + xmlText(value) + '</t></si>') - 1;
      return '<c r="' + String.fromCharCode(65 + j) + (i + 1) + '" s="' + style + '" t="s"><v>' + stringIndex + '</v></c>';
    }).join('');
    return '<row r="' + (i + 1) + '">' + cells + '</row>';
  }).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="逐条验收" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/styles.xml': '<styleSheet xmlns="' + ns + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245A81"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="' + ns + '"><dimension ref="A1:' + last + end + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="3" width="48" customWidth="1"/><col min="4" max="4" width="72" customWidth="1"/>' + (review.headers.length === 5 ? '<col min="5" max="5" width="20" customWidth="1"/>' : '') + '</cols><sheetData>' + rows + '</sheetData><autoFilter ref="A1:' + last + end + '"/></worksheet>'
  };
  files['xl/sharedStrings.xml'] = '<sst xmlns="' + ns + '" count="' + strings.length + '" uniqueCount="' + strings.length + '">' + strings.join('') + '</sst>';
  const bytes = zipStored(files);
  if (bytes.length > 16 * 1024 * 1024) reviewError('生成文件超过 16MB，请分批交付。');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {content: btoa(binary), bytes: bytes.length};
}
async function exportReview(msg) {
  let review, workbook;
  try { review = prepareReview(msg.args); workbook = reviewWorkbook(review); }
  catch (error) {
    await cindy.send({type:'tool-result', callId:msg.callId, ok:false, errorCode:'INVALID_REVIEW', message:error.message});
    return;
  }
  const path = 'localization-review-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.xlsx';
  try {
    const result = await cindy.fs({op:'write', root:'workdir', callId:msg.callId, path, encoding:'base64', content:workbook.content});
    if (!result || result.ok !== true) throw new Error(result && result.message || '宿主未确认文件写入成功。');
    if (result.bytes !== undefined && result.bytes !== workbook.bytes) throw new Error('写入字节数不一致，请勿交付此文件。');
    await cindy.send({type:'tool-result',callId:msg.callId,ok:true,result:{
      path, rows:review.data.length, changed:review.changed, unchanged:review.data.length-review.changed,
      columns:review.headers, scope:'已校验四列、逐条原因及修改点完整覆盖；已修改的 C 列单元格以黄色标记。未判断翻译质量，未读取原始文件核对基线。',
      next_step:'使用文件读取工具回读此工作目录文件，按原始输入核对行数、原文、原译及原因，再提供下载链接。不得另行生成两列或三列文件替换此成果。'
    }});
  } catch (error) {
    await cindy.send({type:'tool-result',callId:msg.callId,ok:false,errorCode:'EXPORT_FAILED',message:error.message});
  }
}
