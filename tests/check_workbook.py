"""Independent reader verification: run node --test tests/export.test.cjs first."""
import json
import tempfile
import zipfile
from pathlib import Path
from openpyxl import load_workbook
root = Path(tempfile.gettempdir()) / 'localization-polish-tests'
with zipfile.ZipFile(root / 'review-example.xlsx') as archive:
    assert archive.testzip() is None
sheet = load_workbook(root / 'review-example.xlsx').active
assert list(sheet.values) == [
    ('原文', '译文', '优化后译文', '修改原因'),
    ('Barbare', '野蛮人', '野蛮人', '无需修改'),
    ('Enregistrez les modifications avant de quitter.', '退出后保存更改。', '退出前保存更改。',
     '1. “退出后” → “退出前”：avant de quitter 表示退出之前，修正操作顺序误译。'),
]
assert sheet['C3'].fill.fgColor.rgb == 'FFFFF2CC'
assert sheet['C2'].fill.patternType is None
assert sheet['D3'].alignment.wrap_text
assert sheet.freeze_panes == 'A2'
assert sheet.auto_filter.ref == 'A1:D3'
assert not sheet.column_dimensions['D'].hidden
rows = json.loads((root / 'edge-cases.json').read_text())
sheet = load_workbook(root / 'edge-cases.xlsx').active
assert sheet.max_row == len(rows) + 1 and sheet.max_column == 5
for i, row in enumerate(rows, 2):
    assert sheet.cell(i, 1).value == (row['source'] if row['source'] is not None else '未提供')
    assert sheet.cell(i, 2).value == row['translation']
    assert sheet.cell(i, 3).value == row['optimized_translation']
    assert sheet.cell(i, 4).value
    assert sheet.cell(i, 2).data_type == 's'
print('PASS: independent XLSX readback, four columns, exact text, reasons, highlights and filter')
print(root / 'review-example.xlsx')
