setInterval(mainLoop, 500);

const tables = new Map();
const fields = new Map();

function mainLoop() {
    const currTables = document.querySelectorAll('.database-table');

    currTables.forEach(t => {
        if (tables.has(t)) {
            return;
        }
        tables.set(t, prepareTable(t));        
    });

    const currFields = document.querySelectorAll('.visible-fields');
    currFields.forEach(f => {
        if (fields.has(f)) {
            return;
        }
        fields.set(f, prepareFields(f));        
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

    const rows = table.querySelectorAll('.table-content__row');
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

function prepareFields(fieldsEl) {
    const titleEl = fieldsEl.parentElement.previousElementSibling; // .querySelector('.visible-fields__title');

    titleEl.style.display = 'flex';
    titleEl.style.alignItems = 'center';

    const root = document.createElement('div');
    root.style.flexGrow = '1';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.paddingRight = '16px';
    root.innerHTML = `<input class="tfe-filter" style="margin: 0 16px;border: solid 1px #eee; padding: 2px; border-radius: 2px; font-size: 12px;" placeholder="Фильтр..." type="text">
        <span style="flex-grow: 1;"></span>
        <button class="tfe-toggle-all">Скрыть все</button>
    `;

    const toggleButton = root.querySelector('.tfe-toggle-all');
    let showAll = true;
    toggleButton.addEventListener('click', () => {
        showAll = !showAll;
        let values = [];
        if (showAll) {
            values = Array.from(fieldsEl
                .querySelectorAll('.visible-fields-item'))
                .map(div => div.getAttribute('id')
                .filter(x => x !== 'title'));
        }
        toggleButton.innerText = showAll ? 'Скрыть все' : 'Показат все';
        apiUpdateVisibility(values).then(() => {
            console.log('call ok');
            location.reload();
        })
    });

    const filterEl = root.querySelector('.tfe-filter');
    filterEl.addEventListener('input', ev => {
        setFilter(ev.target.value);
    })
    // filterEl.addEventListener('blur', () => {
    //     setTimeout(() => {
    //         setFilter(null);
    //     })
    // });

    titleEl.appendChild(root);
    filterEl.focus();

    function setFilter(str) {
        if (str) {
            str = str.toLowerCase();
        }
        fieldsEl
            .querySelectorAll('.visible-fields-item')
            .forEach(item => {
                const match = !str || (item.innerText ?? '').toLowerCase().indexOf(str) !== -1;
                item.style.display = match ? 'flex' : 'none';
            })
    }

    return {
        titleEl
    }
}

function getSpaceView() {
    try {
        const parts =  location.pathname.split('/');
        const dbIndex = parts.findIndex(x => x === 'database');
        const spaceId = parts[dbIndex + 1];
        const viewId = new URL(location.href).searchParams.get('viewId');
        
        if (typeof spaceId === 'string' && typeof viewId === 'string') {
            return { spaceId, viewId }
        } else {
            return {}
        }
    } catch (er) {
        console.log(er);
        return {};
    }
}

function apiUpdateVisibility (values) {
    const { spaceId, viewId } = getSpaceView();
    if (!spaceId) {
        console.error('Failed to obtain credentials');
        return;
    }
    return fetch('https://teamly.2gis.one/api/v1/wiki/properties/command/execute', {
        method: 'post',
        credentials: "include",
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Account-Slug': 'default'
        },
        body: JSON.stringify({
            "code": "display_view_update",
            "payload": {
                "entity": {
                    spaceId,
                    viewId
                },
                "settingsOperations": [
                    // {
                    //     "path": "__layout",
                    //     "method": "update",
                    //     "code": "propertySort",
                    //     "value": values
                    // },
                    {
                        "path": "__displayProperties",
                        "method": "update",
                        "code": "fields",
                        "value": values
                    }
                ]
            },
            "internal": false
        })
    })
}