setInterval(mainLoop, 500);

const CSS_PREFIX = 'tfe';

const tables = new Map();
const fields = new Map();
const filterPopovers = new Map();
const articleProperties = new Map();

/**
 * Основной цикл. Каждый интервал времени проверяем страницу на наличиее 
 * интересующих нас селекторов и "дорабатываем" интересующие нас части:
 * 1) Таблицы со значениями - в них мы начинаем обсчитывать формулы
 * 2) Диалоги настройки свойств - туда мы добавляем поле с фильтром и кнопку "Скрыть все / Показать все"
 * 3) Панельку со свойтсвами брифа/документа - в ней мы показываем только непустые свойства или те, у 
 * которых в названии прописано #show.
 * 
 * Второе чем занимается основной цикл - это собственно пересчет формул в таблицах.
 */
function mainLoop() {
    const currTables = document.querySelectorAll('.database-table');

    currTables.forEach(t => {
        if (tables.has(t)) {
            return;
        }
        console.log('prepare table');
        tables.set(t, prepareTable(t));        
    });

    const currFields = document.querySelectorAll('.visible-fields');
    currFields.forEach(f => {
        if (fields.has(f)) {
            return;
        }
        console.log('prepare fields');
        fields.set(f, prepareFields(f));        
    });

    const currPopovers = document.querySelectorAll('.add-filter__popover, .filter-sort-content__action-popover');
    currPopovers.forEach(p => {
        if (filterPopovers.has(p)) {
            return;
        }
        console.log('prepare popover');
        filterPopovers.set(p, prepareFilterPopover(p));
    })

    let currArticleProperties = document.querySelectorAll('.article-properties');
    currArticleProperties.forEach(ap => {
        const hasList = ap.querySelector('.properties-list');
        if (!hasList) {
            const toggleButton = ap.querySelector('.article-properties__toggle');
            if (toggleButton) {
                toggleButton.click();
            }    
        }
        if (articleProperties.has(ap)) {
            return;
        }
        console.log('prepare article props');
        articleProperties.set(ap, prepareArticleProperties(ap));
    });

    tables.forEach(({
        table,
        headers,
        formulas
    }) => {

        const firstHeader = table.querySelector('.table-header');
        if (!firstHeader) {
            return;
        }
        const columnMap = {};
        const firstHeaders = firstHeader.querySelectorAll('.header-column');
        firstHeaders.forEach((h, i) => {
            columnMap[h.dataset.col] = i;
        });

        table.querySelectorAll('.table-content').forEach(tableContent => {
            const headers = Array.from(tableContent.querySelectorAll('.header-column'));
            const rows = Array.from(tableContent.querySelectorAll('.row'));
            const cells = Array.from(rows).map(row => Array.from(row.querySelectorAll('.table-cell')));
    
            function valueRc(row, rawCol) {
                const col = columnMap[rawCol];
                const cell = cells[row][col];
                if (!cell) {
                    return NaN;
                }
                const checkbox = cell.querySelector('.checkbox');
                if (checkbox) {
                    return checkbox.querySelector('.checked') ? 1 : 0;
                } else  {
                    const v = (cells[row][col].innerText ?? '')
                        .replace(/\s+/g, '')
                        .replace(',', '.');
                    if (isNaN(v)) {
                        return v;
                    }
                    return Number(v);
                }
            }

            formulas.forEach(({ title, col, formula, hasSum, headerOnly }) => {
                col = columnMap[col];
                let sum = 0;
                for (let row = 0; row < rows.length; row++) {
                    const cell = cells[row][col];
                    if (!cell) {
                        continue;
                    }
                    try {
                        /**
                         * При инициализации таблицы формула при помощи
                         * простейших манипуляций конвертируется в JS-выражение.
                         * 
                         * Тут мы его просто вычисляем. 
                         * 
                         * Использование eval() - это всегда грязь, но зато быстро 
                         */
                        let result = eval(formula);
                        if (!isNaN(result)) {
                            sum += Number(result);
                            result = result.toFixed(2).replace('.00', '');
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
                const header = headers[col];
                if (header) {
                    const preciseHeader = header.children[0] instanceof HTMLElement ? header.children[0] : header; 

                    preciseHeader.innerText = `${title.replace(/#(\w+)#?/, '').replace(/\(\)/g, '')} ${hasSum ? '(' + sum.toFixed(2).replace('.00', '') + ')' : ''}`;    
                }
            });    
        })
    });
}

function prepareTable (table) {
    const firstHeader = table.querySelector('.table-header');
    const firstRow = table.querySelector('.row');
    const firstRowCells = Array.from(firstRow.querySelectorAll('.table-cell'));

    const headers = Array.from(firstHeader.querySelectorAll('.header-column'));

    const formulas = [];
    let column = 0;
    const headerNames = [];
    const headerMap = {}
    headers.forEach((h, i) => {
        const name = (h.innerText ?? '').trim().toLowerCase();
        headerMap[name] = i;
        headerNames.push(name);
        h.dataset.col = i;
    });
    for (const header of headers) {
        const text = header.innerText ?? '';
        const m = text.match(/\(\(\=(.*)\)\)/);
        const firstRowCell = firstRowCells[column];
        const hasSum = text.match(/#SUM#/) || firstRowCell?.classList.contains('database-number');
        const preciseHeader = header.children[0] instanceof HTMLElement ? header.children[0] : header; 
        if (m && m[1]) {
            // Этой штукой мы конветим формулу в JS-выражение.
            const formula = m[1].trim().replace(/\[(.*?)\]/g, function (_, name) {
                name = name.trim().toLowerCase();
                const i = headerMap[name] ?? headerNames.findIndex(hname => (hname ?? '').startsWith(name));
                return `valueRc(row, ${i})`;
            });
            formulas.push({
                header: preciseHeader,
                title: text.slice(0, m.index),
                col: column,
                formula,
                hasSum
            });
        } else if (hasSum) {
            formulas.push({
                header: preciseHeader,
                title: text,
                col: column,
                formula: `valueRc(row, ${column})`,
                hasSum,
                headerOnly: true
            });
        }
        column += 1;
    }

    return {
        table,
        headers,
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
    root.innerHTML = `<span style="flex-grow: 1;"></span>
        <button class="tfe-toggle-all" style="font-size: 12px; padding: 2px; border: solid 1px #eee; border-radius: 2px; white-space: nowrap;">Скрыть все</button>
    `;

    installFilterField(root, fieldsEl, '.visible-fields-item');

    const toggleButton = root.querySelector('.tfe-toggle-all');
    const shown = fieldsEl.querySelectorAll('.visible-fields__shown .visible-fields-item').length;
    const hidden = fieldsEl.querySelectorAll('.visible-fields__hidden .visible-fields-item').length;

    let showAll = shown > hidden;
    toggleButton.innerText = showAll ? 'Скрыть все' : 'Показать все';
    toggleButton.addEventListener('click', () => {
        showAll = !showAll;
        let values = ['title'];
        if (showAll) {
            values = Array.from(fieldsEl
                .querySelectorAll('.visible-fields-item'))
                .map(div => div.getAttribute('id'));

            values.unshift('title');
        }
        apiUpdateVisibility(values).then(() => {
            location.reload();
        })
    });

    titleEl.appendChild(root);

    return {
        titleEl
    }
}

function prepareFilterPopover(popover) {
    installFilterField(popover, popover, '.list__item');
    return {
        popover
    }
}


function prepareArticleProperties (articleProperties) {
    const root = document.createElement('div');
    root.innerHTML = `
        <div class="properties-list ${CSS_PREFIX}-visible-props"></div>
        <button style="font-size: 12px; color: #ccc; margin-left: 32px;">Показать остальные свойства...</button>
        <div class="properties-list ${CSS_PREFIX}-etc-props" style="display: none;"></div>
    `;
    const visibleProps = root.querySelector(`.${CSS_PREFIX}-visible-props`);
    const etcProps = root.querySelector(`.${CSS_PREFIX}-etc-props`);

    const moreButton = root.querySelector('button');

    articleProperties.querySelectorAll('.properties-item').forEach(item => {
        const text = item.querySelector('.properties-item__label-text').innerText;
        const isEmpty = item.querySelector('.cell-empty') || item.querySelector('.database-checkbox');
        const forceShow = text.indexOf('#show') !== -1;
        if (!isEmpty || forceShow) {
            visibleProps.appendChild(item);
        } else {
            etcProps.appendChild(item);
        }
    });

    let etcPropsVisible = false;
    moreButton.addEventListener('click', () => {
        etcPropsVisible = !etcPropsVisible;
        etcProps.style.display = etcPropsVisible ? 'block' : 'none';
        moreButton.innerText = etcPropsVisible ? 'Скрыть остальные свойства...' :'Показать остальные свойства...';
    })

    articleProperties.parentElement.insertBefore(root, articleProperties);
    if (articleProperties.parentElement.classList.contains('editor__aside-wrapper')) {
        articleProperties.parentElement.style.flexDirection = 'column';
    }
    const toggleButton = articleProperties.querySelector('.article-properties__toggle');
    if (toggleButton) {
       toggleButton.style.display = 'none'; 
    }

    return {
        root,
        articleProperties
    }
}

async function getSpaceView() {
    try {
        const parts =  location.pathname.split('/');
        const dbIndex = parts.findIndex(x => x === 'database' || x === 'article');
        const slug = parts[dbIndex] === 'article' ? 'articles' : 'spaces'; 
        let spaceId = parts[dbIndex + 1];
        let viewId = new URL(location.href).searchParams.get('viewId');

        if (!viewId) {
            const result = await fetch(`https://teamly.2gis.one/api/v1/ql/${slug}/${spaceId}/display-views`, {
                method: 'post',
                credentials: "include",
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Account-Slug': 'default'
                },
                body: JSON.stringify({
                    query: {
                        "__pagination": {
                            "page": 1,
                            "perPage": 50
                        },
                        "id": true,
                        "spaceId": true,    
                    }
                })
            }).then(r => r.json());
            viewId = result.items[0].id;
            spaceId = result.items[0].spaceId;
        }
        
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

async function apiUpdateVisibility (values) {
    const { spaceId, viewId } = await getSpaceView();
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

function installFilterField(filterContainer, rootContainer, itemSelector) {
    const el = document.createElement('div');
    el.innerHTML = `<input class="${CSS_PREFIX}-filter" style="margin: 0 16px;border: solid 1px #eee; padding: 2px; border-radius: 2px; font-size: 12px;" placeholder="Фильтр..." type="text"></input>`;
    filterContainer.insertBefore(el.firstChild, filterContainer.firstChild);

    const filterEl = filterContainer.querySelector(`.${CSS_PREFIX}-filter`);
    filterEl.addEventListener('input', ev => {
        setFilter(ev.target.value);
    });
    filterEl.focus();

    function setFilter(str) {
        if (str) {
            str = str.toLowerCase();
        }
        rootContainer
            .querySelectorAll(itemSelector)
            .forEach(item => {
                const match = !str || (item.innerText ?? '').toLowerCase().indexOf(str) !== -1;
                item.style.display = match ? 'flex' : 'none';
            })
    }
}