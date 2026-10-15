// Tables as CSV files the user can open in Excel. toCsv also runs on the server (the activity log export);
// downloadCsv only in the browser.

export interface CsvColumn<T> {
    header: string;
    value: (row: T) => string | number | null | undefined;
}

function cell(value: string | number | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value);
    // Spreadsheet programs run cells that start with these as formulas; a plain number such as "-2120.00" is safe
    const formula = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text);
    const safe = formula ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
    const lines = [columns.map((c) => cell(c.header)).join(',')];
    for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
    // Byte-order mark: lets Excel read the text as UTF-8
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
    const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
