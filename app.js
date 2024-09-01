setInterval(mainLoop, 500);

const tables = new Map();

function mainLoop() {
    const currTables = document.querySelectorAll('.database-table');

    currTables.forEach(t => {
        if (tables.has(t)) {
            return;
        }
        tables.set(t, prepareTable(t));        
    });

    tables.forEach(({
        table,
        headers,
        rows,
        cells,
        formulas
    }) => {

        function value(row, name) {
            const headerIndex = headers.findIndex(h => (h.innerText ?? '').indexOf(name) !== -1);
            if (headerIndex === -1) {
                return null;
            }
            return valueRc(row, headerIndex);
        }

        function valueRc(row, col) {
            const cell = cells[row][col];
            const checkbox = cell.querySelector('.checkbox');
            if (checkbox) {
                return checkbox.querySelector('.checked') ? 1 : 0;
            } else  {
                const v = (cells[row][col].innerText ?? '').replace(/\s+/g, '');
                if (isNaN(v)) {
                    return v;
                }
                return Number(v);
            }
        }

        if (formulas.length === 0) {
            return;
        }


        formulas.forEach(({ header, title, col, formula, headerOnly }) => {
            let sum = 0;
            for (let row = 0; row < rows.length; row++) {
                const cell = cells[row][col];
                if (!cell) {
                    continue;
                }
                try {
                    const result = eval(formula);
                    if (!isNaN(result)) {
                        sum += Number(result);
                    }
                    if (headerOnly) {
                        continue;
                    }
                    if (result === undefined) {
                        cell.innerText = '-'
                    } else {
                        cell.innerText = result;
                    }
                } catch (e) {
                    console.error(e);
                    cell.innerText = '#ERR'
                }
            }
            header.innerText = `${title.replace(/#SUM#/, sum)}`;
        });
    });
}

function prepareTable (table) {
    table.addEventListener('blur', (ev) => {
        console.log('blur', ev, ev.target);
    });
    table.addEventListener('click', (ev) => {
        console.log('click', ev, ev.target);
    });

    const rows = table.querySelectorAll('.table-content .row');
    const cells = Array.from(rows).map(row => Array.from(row.querySelectorAll('.table-cell')));
    const headers = Array.from(table.querySelectorAll('.header-column'));

    const formulas = [];
    let col = 0;
    for (const header of headers) {
        const text = header.innerText ?? '';
        const m = text.match(/\(\(\=(.*)\)\)/);
        const hasSum = text.match(/#SUM#/);
        const preciseHeader = header.children[0] instanceof HTMLElement ? header.children[0] : header; 
        if (m && m[1]) {
            const formula = m[1].trim().replace(/\[/g, 'value(row, "').replace(/\]/g, '")');
            formulas.push({
                header: preciseHeader,
                title: text.slice(0, m.index),
                col,
                formula,
                hasSum
            });
        } else if (hasSum) {
            formulas.push({
                header: preciseHeader,
                title: text,
                col,
                formula: `valueRc(row, ${col})`,
                hasSum,
                headerOnly: true
            });
        }
        col += 1;
    }

    return {
        table,
        headers,
        rows,
        cells,
        formulas
    };
}