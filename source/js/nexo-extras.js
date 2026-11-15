/*
 * Copyright (C) 2026 Igor Toledo <contato@igor.eti.br>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
 * OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

// diagnostics: ?nexoOff=1 in the address turns every extra below off (to tell a theme script from a page issue)
(function () {
    'use strict';
    if (/[?&]nexoOff=1/.test(window.location.search)) {
        return;
    }

/*
 * Nexo theme: UI extras (shipped in build/js/theme.js of every Nexo theme).
 * OPNsense loads /ui/themes/<theme>/build/js/theme.js on every page; the default file
 * (/ui/js/theme.js) is just an empty placeholder. Nothing here changes data or calls the API.
 *
 * "Fit columns": toggle button on Tabulator tables (Live View, OPNsense grids). When enabled, each
 * column gets the width of its content (capped) and the free-text column (Label/Description)
 * takes the rest. When disabled, the page's own widths are restored. State is saved per table in
 * the browser's localStorage.
 */
(function () {
    'use strict';
    var KEY_PREFIX = 'nexo.fitColumns.';
    var MAX_WIDTH = 340;     // maximum width of a fitted column (px)
    var FREE_FIELDS = ['label', 'description', 'descr', 'comment', 'content'];   // take the remaining space

    function readFlag(id) {
        try { return localStorage.getItem(KEY_PREFIX + id) === '1'; } catch (e) { return false; }
    }
    function writeFlag(id, v) {
        try { localStorage.setItem(KEY_PREFIX + id, v ? '1' : '0'); } catch (e) { /* no storage: just not remembered */ }
    }

    // natural text width (ignores ellipsis truncation and the cell's current width)
    var range = document.createRange();
    function textWidth(el) {
        range.selectNodeContents(el);
        var w = range.getBoundingClientRect().width;
        var cs = getComputedStyle(el);
        return w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    }

    function contentWidth(table, col) {
        var max = 0;
        var header = col.getElement().querySelector('.tabulator-col-title');
        if (header) { max = textWidth(header) + 18; }   // + sort arrow
        var rows = table.getRows('visible');
        for (var i = 0; i < rows.length && i < 200; i++) {
            var cell = rows[i].getCell(col);
            if (!cell) { continue; }
            var w = textWidth(cell.getElement());
            if (w > max) { max = w; }
        }
        return Math.max(36, Math.min(window.innerWidth <= 800 ? 130 : MAX_WIDTH, Math.ceil(max + 4)));
    }

    // The table uses the "fitColumns" layout and the live update recalculates columns without a width
    // in their definition; that is why the width goes into the definition (updateDefinition), not setWidth().
    function fitColumns(table, enabled) {
        var cols = table.getColumns().filter(function (c) { return c.isVisible() && c.getField(); });
        if (!table.__nexoOrig) {
            table.__nexoOrig = {};
            cols.forEach(function (c) { table.__nexoOrig[c.getField()] = c.getDefinition().width; });
        }
        var defs = [];
        if (!enabled) {
            cols.forEach(function (c) { defs.push([c, { width: table.__nexoOrig[c.getField()] }]); });
        } else {
            var freeCol = null, used = 0;
            table.getColumns().forEach(function (c) { if (c.isVisible() && !c.getField()) { used += c.getWidth(); } });
            cols.forEach(function (c) {
                var field = c.getField().toLowerCase();
                if (!freeCol && FREE_FIELDS.indexOf(field) !== -1) { freeCol = c; return; }
                var w = contentWidth(table, c);
                used += w;
                defs.push([c, { width: w }]);
            });
            // the free-text column takes the remaining space (no horizontal scrollbar)
            if (freeCol) {
                var holder = table.element.querySelector('.tabulator-tableholder');
                var total = (holder ? holder.clientWidth : table.element.clientWidth) - 16;
                defs.push([freeCol, { width: Math.max(200, total - used) }]);
            }
        }
        // one after another: updateDefinition recreates the column
        return defs.reduce(function (p, d) {
            return p.then(function () { return d[0].updateDefinition(d[1]); }).catch(function () { /* continue */ });
        }, Promise.resolve());
    }

    function whenRowsReady(table, fn) {
        var deadline = Date.now() + 15000;
        (function wait() {
            if (table.getRows('visible').length > 0) { fn(); return; }
            if (Date.now() < deadline) { setTimeout(wait, 400); }
        })();
    }

    function createButton(table, id) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-default nexo-fit-columns';
        b.title = 'Fit columns to content (click again to restore the default)';
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<span class="fa-solid fa-arrows-left-right-to-line"></span>';
        function apply(v) {
            b.classList.toggle('active', v);
            b.setAttribute('aria-pressed', v ? 'true' : 'false');
            if (v) { whenRowsReady(table, function () { fitColumns(table, true); }); } else { fitColumns(table, false); }
        }
        b.addEventListener('click', function () {
            var v = !b.classList.contains('active');
            writeFlag(id, v);
            apply(v);
        });
        if (readFlag(id)) { apply(true); }
        return b;
    }

    function findButtonSlot(table, el) {
        // Live View: next to Refresh / Reset
        if (el.id === 'livelog-table') {
            var reset = document.getElementById('table-reset');
            return reset ? { parent: reset.parentNode, after: reset } : null;
        }
        // OPNsense grids (UIBootgrid on top of Tabulator): header action group
        var root = el.closest('.tab-pane, .content-box, .bootgrid-box, section') || document;
        var actions = root.querySelector('.actionBar .actions, .bootgrid-header .actions');
        return actions ? { parent: actions, after: null } : null;
    }

    function installButtons() {
        if (!window.Tabulator || !Tabulator.findTable) { return; }
        document.querySelectorAll('.tabulator[id]').forEach(function (el) {
            if (el.__nexoButton) { return; }
            var t = Tabulator.findTable('#' + el.id);
            if (!t || !t[0]) { return; }
            var pos = findButtonSlot(t[0], el);
            if (!pos) { return; }
            el.__nexoButton = true;
            var b = createButton(t[0], location.pathname + '#' + el.id);
            if (pos.after) { pos.parent.insertBefore(b, pos.after.nextSibling); } else { pos.parent.appendChild(b); }
        });
    }


    // ------------------------------------------------------------------------------------------
    // Grids: network data in monospace and command buttons with touch-sized targets on mobile.
    // The monospace font is ~12% wider: before applying it, widen the fixed-width columns holding
    // that data (flexible ones adjust themselves under fitColumns). The class is only added
    // afterwards, so text is never truncated. On mobile (<= 800px), widen the command column to fit
    // 36x36 buttons and only then mark the table (the 36px CSS depends on that marker).
    // ------------------------------------------------------------------------------------------
    var NETWORK_FIELDS = ['ip', 'ipaddress', 'address', 'sort_address', 'ipv4', 'ipv6', 'subnet', 'network',
        'routes', 'gateways', 'destination', 'src', 'dst', 'nat', 'external', 'target', 'tunneladdress',
        'serveraddress', 'source_net', 'destination_net', 'source.network', 'destination.network', 'port',
        'serverport', 'source_port', 'destination_port', 'source.port', 'destination.port', 'target_port',
        'local-port', 'mac', 'macaddress', 'hwaddr', 'sort_hwaddr', 'etheraddr', 'endpoint', 'gateway',
        'tunnel_addresses', 'allowed_ips', 'subnets', 'address_from', 'address_to', 'remote', 'local'];

    function safeUpdateDefinition(col, def) {
        try { return col.updateDefinition(def); } catch (e) { return Promise.resolve(); }
    }

    // apply monospace, then widen only what got truncated (idempotent: Tabulator persists column
    // widths in the browser; a fixed "x 1.12" rule would make the column grow on every visit)
    function applyMonoToGrid(table, el) {
        if (el.__nexoMono || el.id === 'livelog-table') { return; }   // Live View has its own rule
        var cols = table.getColumns().filter(function (c) {
            return NETWORK_FIELDS.indexOf((c.getField() || '').toLowerCase()) !== -1;
        });
        if (!cols.length) { el.__nexoMono = true; return; }
        if (!el.querySelector('.tabulator-row')) { return; }           // no rows yet: retry later
        el.__nexoMono = true;
        var fields = cols.map(function (c) { return c.getField(); });
        // updateDefinition recreates the column: always look up the current one by field
        var current = function (field) { try { return table.getColumn(field); } catch (e) { return null; } };
        fields.reduce(function (p, field) {
            return p.then(function () {
                var c = current(field);
                if (!c) { return; }
                var d = c.getDefinition();
                if ((' ' + (d.cssClass || '') + ' ').indexOf(' nexo-mono ') !== -1) { return; }
                return safeUpdateDefinition(c, { cssClass: ((d.cssClass || '') + ' nexo-mono').trim() });
            });
        }, Promise.resolve()).then(function () {
            return new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
        }).then(function () {
            var adjustments = [];
            fields.forEach(function (field) {
                var c = current(field);
                if (!c) { return; }
                var max = 0;
                el.querySelectorAll('.tabulator-row .tabulator-cell[tabulator-field="' + field + '"]').forEach(function (cell) {
                    if (cell.scrollWidth > max) { max = cell.scrollWidth; }
                });
                var w = c.getWidth();
                if (max > w + 1) { adjustments.push([field, { width: Math.min(max + 4, Math.ceil(w * 1.25)) }]); }
            });
            return adjustments.reduce(function (p, m) {
                return p.then(function () { var c = current(m[0]); return c ? safeUpdateDefinition(c, m[1]) : null; });
            }, Promise.resolve());
        });
    }

    // the command column usually has no "field": recognize it by the buttons in its cells
    function countColumnButtons(c) {
        var cells = [];
        try { cells = c.getCells(); } catch (e) { return 0; }
        for (var i = 0; i < cells.length && i < 5; i++) {
            var el = cells[i].getElement();
            if (el && el.querySelector('.command-edit, .command-delete, .command-copy, .command-info, .command-toggle')) {
                return el.querySelectorAll('.btn, button').length;
            }
        }
        return 0;
    }

    function widenCommandsOnMobile(table, el) {
        if (window.innerWidth > 800 || el.__nexoCmd) { return; }
        if (!el.querySelector('.tabulator-row')) { return; }    // no rows yet: retry later
        var cols = table.getColumns(), col = null, n = 0;
        for (var i = cols.length - 1; i >= 0 && !col; i--) {
            n = countColumnButtons(cols[i]);
            if (n) { col = cols[i]; }
        }
        el.__nexoCmd = true;
        if (!col) { return; }
        var width = n * 38 + 12;                                // 36px + 2px gap per button + padding
        safeUpdateDefinition(col, { width: Math.max(width, Math.round(col.getWidth())), minWidth: width }).then(function () {
            el.classList.add('nexo-cmd-touch');
        });
    }

    function adjustGrids() {
        if (!window.Tabulator || !Tabulator.findTable) { return; }
        document.querySelectorAll('.tabulator[id]').forEach(function (el) {
            var t = Tabulator.findTable('#' + el.id);
            if (!t || !t[0]) { return; }
            applyMonoToGrid(t[0], el);
            widenCommandsOnMobile(t[0], el);
        });
    }

    // compact Live View (CSS hides the labels): the original, already translated text becomes a tooltip (title)
    function addTooltips() {
        document.querySelectorAll('.filters-bar label.toggle').forEach(function (l) {
            var t = l.querySelector('.toggle-label');
            if (t && !l.title) { l.title = t.textContent.trim(); }
        });
        document.querySelectorAll('.filters-bar .filters-right > div').forEach(function (d) {
            var t = d.querySelector(':scope > label');
            if (t && !d.title) { d.title = t.textContent.trim(); }
        });
        var tpl = document.getElementById('stageTemplate');
        if (tpl && !tpl.title) { tpl.title = 'Templates'; }
    }

    function init() {
        addTooltips();
        installButtons();
        adjustGrids();
        // tables are created later (ajax / tabs): observe for up to 20 s
        var deadline = Date.now() + 20000;
        var obs = new MutationObserver(function () {
            installButtons();
            adjustGrids();
            if (Date.now() > deadline) { obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(function () { obs.disconnect(); }, 20000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/*
 * Page buttons in the top bar (desktop): the theme puts the page's button group (#service_status_container:
 * service controls, the dashboard pencil...) at the right end of the top bar, after the search box. Its
 * width changes (e.g. dashboard edit mode), so it is measured here and published as --nexo-head-btns; the
 * CSS moves the user name and the search box left by that much.
 */
(function () {
    'use strict';
    function init() {
        var c = document.getElementById('service_status_container');
        if (!c) {
            return;
        }
        // a wide filter list placed in there (Firewall > Diagnostics > States: "Select rule") covered the user name;
        // it moves down to the grid's action bar, just before the search box (the magnifier); until the grid has
        // drawn its bar, it waits at the right end of the tab row
        var relocate = function () {
            var main = document.querySelector('.page-content-main');
            if (!main) {
                return;
            }
            var box = document.getElementById('nexo-page-filter');
            if (!box && !c.querySelector('.bootstrap-select, select')) {
                return;
            }
            if (!box) {
                box = document.createElement('div');
                box.id = 'nexo-page-filter';
                box.className = 'nexo-page-filter';
            }
            while (c.firstChild) {
                box.appendChild(c.firstChild);
            }
            var search = main.querySelector('.actionBar > .search');
            if (search) {
                if (box.nextElementSibling !== search) {
                    search.parentElement.insertBefore(box, search);
                }
                return true;
            }
            if (!box.parentElement) {
                var tabs = main.querySelector('.nav-tabs');
                if (tabs) {
                    tabs.parentElement.insertBefore(box, tabs);
                } else {
                    var host = main.querySelector('.container-fluid') || main;
                    host.insertBefore(box, host.firstChild);
                }
            }
            return false;
        };
        // the grid header is drawn after the data arrives: keep looking for it for a while
        if (window.MutationObserver) {
            var mo = new MutationObserver(function () {
                if (document.getElementById('nexo-page-filter') && relocate()) {
                    mo.disconnect();
                }
            });
            mo.observe(document.body, { childList: true, subtree: true });
            setTimeout(function () { mo.disconnect(); }, 20000);
        }
        var set = function () {
            relocate();
            var w = c.offsetWidth;
            document.documentElement.style.setProperty('--nexo-head-btns', (w ? w + 8 : 0) + 'px');
        };
        set();
        if (window.ResizeObserver) {
            new ResizeObserver(set).observe(c);
        }
        new MutationObserver(set).observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/*
 * Page title in the top bar (desktop): it may run only up to the user name / status / search block, whatever the
 * length of the user name. The free width is measured here and published as --nexo-title-max (the CSS falls
 * back to a fixed reserve when this script does not run).
 */
(function () {
    'use strict';
    function init() {
        var head = document.querySelector('header.page-content-head');
        var navs = document.querySelectorAll('.page-head .navbar-right');
        if (!head || !navs.length) {
            return;
        }
        var set = function () {
            if (window.innerWidth < 992) {
                document.documentElement.style.removeProperty('--nexo-title-max');
                return;
            }
            var left = Infinity;
            for (var i = 0; i < navs.length; i++) {
                var r = navs[i].getBoundingClientRect();
                if (r.width > 0 && r.left < left) { left = r.left; }
            }
            var start = head.getBoundingClientRect().left;
            if (left !== Infinity && left > start) {
                document.documentElement.style.setProperty('--nexo-title-max', Math.max(120, Math.floor(left - start - 24)) + 'px');
            }
        };
        set();
        window.addEventListener('resize', set);
        if (window.ResizeObserver) {
            for (var i = 0; i < navs.length; i++) { new ResizeObserver(set).observe(navs[i]); }
        }
        setTimeout(set, 600);       // fonts and the status dot settle after the first paint
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/*
 * Dashboard on phones (gridstack single-column mode, .grid-stack.gs-1): dashboard.css lays the widgets out
 * as a flex column and gridstack keeps each item's row in the gs-y attribute (27.1 saves a layout per
 * column count; 26.7 derives it). gs-y is copied into style.order so that order is what the user sees.
 * In edit mode the CSS hands the layout back to gridstack; with more than one column "order" has no effect.
 */
(function () {
    'use strict';
    var pending = false;
    function sync() {
        pending = false;
        document.querySelectorAll('.grid-stack.gs-1 > .grid-stack-item').forEach(function (item) {
            var y = parseInt(item.getAttribute('gs-y'), 10);
            var order = isNaN(y) ? '' : String(y);
            if (item.style.order !== order) { item.style.order = order; }
        });
    }
    function schedule() {
        if (pending) { return; }
        pending = true;
        requestAnimationFrame(sync);
    }
    function init() {
        var grid = document.querySelector('.grid-stack');
        if (!grid) { return; }
        sync();
        new MutationObserver(schedule).observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['gs-y', 'class'] });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/*
 * (Removed 2026-11-14: a block here widened every "timestamp" column to 196px on each renderComplete and called
 * redraw(true); where fitColumns could not keep 196px (Services > Intrusion Detection > Alerts) the redraw fired
 * renderComplete again, synchronously, forever: the tab froze at 100% CPU. The content-sized layout below already
 * gives the timestamp its full width.)
 */

/*
 * Chart.js text in the theme colours. Chart.js draws on a canvas with its own defaults (#666 text, black 10%
 * grid), which CSS cannot reach: on dark themes the axis ticks, legend and title of pages such as Reporting >
 * Health came out nearly invisible. The colours are read from the page (body text and .text-muted) so they
 * follow the active theme and the light/dark switch of the *-auto themes.
 */
(function () {
    'use strict';
    function rgba(color, alpha) {
        var m = /rgba?\(([^)]+)\)/.exec(color || '');
        if (!m) { return color; }
        var p = m[1].split(',').slice(0, 3).join(',');
        return 'rgba(' + p + ',' + alpha + ')';
    }
    function colours() {
        var probe = document.createElement('span');
        probe.className = 'text-muted';
        probe.style.display = 'none';
        document.body.appendChild(probe);
        var muted = getComputedStyle(probe).color;
        probe.remove();
        var text = getComputedStyle(document.body).color;
        return { text: text, muted: muted, grid: rgba(muted, 0.18) };
    }
    // the dashboard widgets paint the "empty" part of their gauges and bars in a fixed #E5E5E5 (memory and disk
    // gauges, thermal sensor bars, disk bars): a glaring white slab on the dark themes. A plugin swaps it for a
    // faint tint of the theme's muted text colour before every draw.
    var registered = false;
    // colours() probes the DOM: the traffic graph updates every second, so the result is kept for 2 s
    var cache = null, cacheAt = 0;
    function cachedColours() {
        var now = Date.now();
        if (!cache || now - cacheAt > 2000) { cache = colours(); cacheAt = now; }
        return cache;
    }
    function emptyTint() { return rgba(cachedColours().muted, 0.22); }
    function swapEmpty(v, tint) {
        if (Array.isArray(v)) { return v.map(function (x) { return swapEmpty(x, tint); }); }
        return typeof v === 'string' && /^#e5e5e5$/i.test(v) ? tint : v;
    }
    // dark theme? (light body text); there the white slice borders of doughnuts and gauges read as outlines
    function darkTheme() {
        var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cachedColours().text);
        return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) > 140 : false;
    }
    function swapWhite(v, dark) {
        if (Array.isArray(v)) { return v.map(function (x) { return swapWhite(x, dark); }); }
        return typeof v === 'string' && /^(#fff|#ffffff|white)$/i.test(v) ? dark : v;
    }
    // 3D relief on the charts: pie / doughnut (firewall rules, interface statistics, memory and disk gauges) get a
    // drop shadow, a domed light per slice and a bevel on the rim; bars (thermal sensors) a drop shadow, a light
    // top / dark base and a bevel; lines and areas (CPU, traffic) a drop shadow and a glint along the line
    function arcPath(ctx, p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.outerRadius, p.startAngle, p.endAngle);
        if (p.innerRadius > 0) {
            ctx.arc(p.x, p.y, p.innerRadius, p.endAngle, p.startAngle, true);
        } else {
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    }
    // bars (thermal sensors, disk): a light top / dark base across each bar and a light bevel on its leading edge
    function barRelief(chart, ctx) {
        chart.data.datasets.forEach(function (ds, i) {
            var meta = chart.getDatasetMeta(i);
            if (meta.hidden) { return; }
            meta.data.forEach(function (el) {
                var p = el.getProps(['x', 'y', 'base', 'width', 'height', 'horizontal'], true);
                var x0, y0, w, h;
                if (p.horizontal) { x0 = Math.min(p.base, p.x); w = Math.abs(p.x - p.base); y0 = p.y - p.height / 2; h = p.height; }
                else { y0 = Math.min(p.base, p.y); h = Math.abs(p.base - p.y); x0 = p.x - p.width / 2; w = p.width; }
                if (!(w > 0.5 && h > 0.5)) { return; }
                var g = ctx.createLinearGradient(x0, y0, x0, y0 + h);
                g.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
                g.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
                g.addColorStop(0.55, 'rgba(0, 0, 0, 0.05)');
                g.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
                ctx.save();
                ctx.fillStyle = g;
                ctx.fillRect(x0, y0, w, h);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x0 + 0.5, y0 + 0.5);
                ctx.lineTo(x0 + w - 0.5, y0 + 0.5);
                ctx.stroke();
                ctx.restore();
            });
        });
    }
    // lines (CPU, traffic): a thin light glint riding just above each line, like light on a rounded rod
    function lineRelief(chart, ctx) {
        chart.data.datasets.forEach(function (ds, i) {
            var meta = chart.getDatasetMeta(i);
            if (meta.hidden || !meta.data || meta.data.length < 2) { return; }
            var pts = meta.data.map(function (el) { return el.getProps(['x', 'y', 'skip'], true); })
                .filter(function (q) { return !q.skip && isFinite(q.x) && isFinite(q.y); });
            if (pts.length < 2) { return; }
            ctx.save();
            ctx.beginPath();
            pts.forEach(function (q, k) { if (k) { ctx.lineTo(q.x, q.y - 1); } else { ctx.moveTo(q.x, q.y - 1); } });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.lineWidth = 1;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.restore();
        });
    }
    var relief = {
        id: 'nexoRelief3d',
        // drop shadow under every dataset: slices, bars, lines and their filled areas stand off the plate
        beforeDatasetsDraw: function (chart) {
            var t = chart.config.type;
            if (!/doughnut|pie|bar|line/.test(t)) { return; }
            if (t === 'line') { return; }   // lines: no shadow at all (see below); the glint is drawn after
            var ctx = chart.ctx;
            ctx.save();
            // (lines animate continuously in the traffic graph: any shadow there, even unblurred, cost two thirds
            // of the frame rate, measured 18 fps against 60; they only get the glint)
            ctx.shadowColor = 'rgba(0, 0, 0, ' + (t === 'line' ? '0.5' : '0.55') + ')';
            ctx.shadowBlur = t === 'line' ? 0 : 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = t === 'line' ? 3 : 5;
        },
        afterDatasetsDraw: function (chart) {
            var t = chart.config.type;
            if (!/doughnut|pie|bar|line/.test(t)) { return; }
            var ctx = chart.ctx;
            if (t === 'line') { lineRelief(chart, ctx); return; }
            ctx.restore();
            if (t === 'bar') { barRelief(chart, ctx); return; }
            chart.data.datasets.forEach(function (ds, i) {
                var meta = chart.getDatasetMeta(i);
                if (meta.hidden) { return; }
                meta.data.forEach(function (el) {
                    var p = el.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
                    if (!p.outerRadius || p.endAngle - p.startAngle < 0.001) { return; }
                    ctx.save();
                    arcPath(ctx, p);
                    ctx.clip();
                    // domed light: bright on top, dark at the bottom of the ring
                    var g = ctx.createLinearGradient(p.x, p.y - p.outerRadius, p.x, p.y + p.outerRadius);
                    g.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
                    g.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
                    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.04)');
                    g.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
                    ctx.fillStyle = g;
                    ctx.fillRect(p.x - p.outerRadius, p.y - p.outerRadius, p.outerRadius * 2, p.outerRadius * 2);
                    // radial shading across the ring width: a rounded tube rather than a flat band
                    if (p.innerRadius > 0) {
                        var r = ctx.createRadialGradient(p.x, p.y, p.innerRadius, p.x, p.y, p.outerRadius);
                        r.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
                        r.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
                        r.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
                        ctx.fillStyle = r;
                        ctx.fillRect(p.x - p.outerRadius, p.y - p.outerRadius, p.outerRadius * 2, p.outerRadius * 2);
                    }
                    ctx.restore();
                    // bevel: a thin light line on the outer rim
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.outerRadius - 1, p.startAngle, p.endAngle);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                });
            });
        }
    };
    // Reporting > Traffic and Reporting > Unbound DNS: modern lines (smooth, thin, no points, gradient area)
    // in a palette that reads on the theme, instead of the d3 palette with 50% flat fills
    var MODERN = { rxChart: 1, txChart: 1, rxTopChart: 1, txTopChart: 1, rollingChart: 1 };
    var LINE_PALETTE = ['#38bdf8', '#f97316', '#34d399', '#f472b6', '#a78bfa', '#facc15', '#fb7185', '#22d3ee',
                        '#c084fc', '#4ade80', '#fdba74'];
    var SEMANTIC = { total: '#2dd4bf', blocked: '#f97316' };
    function alpha(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function areaFill(colour) {
        return function (ctx) {
            var area = ctx.chart.chartArea;
            if (!area) { return alpha(colour, 0.18); }
            var g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, alpha(colour, 0.32));
            g.addColorStop(0.7, alpha(colour, 0.06));
            g.addColorStop(1, alpha(colour, 0));
            return g;
        };
    }
    var modernLines = {
        id: 'nexoModernLines',
        beforeUpdate: function (chart) {
            if (chart.config.type !== 'line' || !MODERN[chart.canvas && chart.canvas.id]) { return; }
            (chart.data.datasets || []).forEach(function (ds, i) {
                var key = String(ds.label || '').toLowerCase();
                var colour = ds._nexoColour || SEMANTIC[key] || LINE_PALETTE[i % LINE_PALETTE.length];
                ds._nexoColour = colour;
                ds.borderColor = colour;
                ds.backgroundColor = areaFill(colour);
                ds.fill = 'origin';
                ds.borderWidth = 2;
                ds.pointRadius = 0;
                ds.pointHoverRadius = 4;
                ds.pointHoverBackgroundColor = colour;
                ds.cubicInterpolationMode = 'monotone';
                ds.tension = 0.35;
            });
            var lg = chart.options.plugins && chart.options.plugins.legend;
            if (lg && lg.labels) { lg.labels.usePointStyle = true; lg.labels.pointStyle = 'circle'; lg.labels.boxWidth = 8; lg.labels.boxHeight = 8; lg.labels.padding = 16; }
        }
    };
    function register(C) {
        if (registered || !C.register) { return; }
        registered = true;
        C.register(modernLines);
        C.register(relief);
        C.register({
            id: 'nexoEmptySlice',
            beforeUpdate: function (chart) {
                var tint = emptyTint();
                var dark = darkTheme();
                var isArc = /doughnut|pie|polarArea/.test(chart.config.type);
                (chart.data.datasets || []).forEach(function (ds) {
                    ds.backgroundColor = swapEmpty(ds.backgroundColor, tint);
                    ds.borderColor = swapEmpty(ds.borderColor, tint);
                    if (dark && isArc) {
                        ds.borderColor = ds.borderColor === undefined ? 'rgba(0,0,0,0.45)' : swapWhite(ds.borderColor, 'rgba(0,0,0,0.45)');
                    }
                });
            }
        });
    }
    function apply() {
        var C = window.Chart;
        if (!C || !C.defaults || !document.body) { return false; }
        register(C);
        var c = colours();
        C.defaults.color = c.muted;
        C.defaults.borderColor = c.grid;
        if (C.defaults.plugins && C.defaults.plugins.title) { C.defaults.plugins.title.color = c.text; }
        var list = C.instances ? Object.keys(C.instances).map(function (k) { return C.instances[k]; }) : [];
        list.forEach(function (ch) {
            var o = ch.options || {};
            Object.keys(o.scales || {}).forEach(function (k) {
                var s = o.scales[k];
                if (s.ticks) { s.ticks.color = c.muted; }
                if (s.grid) { s.grid.color = c.grid; }
                if (s.title) { s.title.color = c.muted; }
            });
            if (o.plugins) {
                if (o.plugins.legend && o.plugins.legend.labels) { o.plugins.legend.labels.color = c.muted; }
                if (o.plugins.title) { o.plugins.title.color = c.text; }
            }
            try { ch.update('none'); } catch (e) { /* chart being destroyed */ }
        });
        return true;
    }
    // Chart.js may load after this file; charts are usually created on document ready
    function boot() {
        if (apply()) { return; }
        var n = 0, t = setInterval(function () { if (apply() || ++n > 40) { clearInterval(t); } }, 250);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
    window.addEventListener('load', apply);
    if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var later = function () { setTimeout(apply, 300); };
        if (mq.addEventListener) { mq.addEventListener('change', later); } else if (mq.addListener) { mq.addListener(later); }
    }
})();

/*
 * Tabulator grids (fitColumns): column widths from their content. OPNsense lays the columns out, then widens some to
 * fit their content without shrinking the others, so a grid could spill past its plate (System > Gateways > Log
 * File), and fitColumns shares the spare width equally, leaving short values in very wide columns (Diagnostics >
 * Services). One pass per render:
 *   - every column's need is measured from its text (cells and header); no column goes below it (capped at 220px),
 *     nor below its own minWidth; pinned (min = max) and frozen columns (buttons) keep their width;
 *   - the main column (longest text: log line, command, description) takes what is left, at least 15% of the width;
 *     spare width first lets capped columns show more, the rest goes to the main column;
 *   - on phones the columns may wrap their text down to 62px (a short word stays whole);
 *   - if the grid cannot fit without cutting content (Firewall > Aliases, 13 columns), nothing is touched and the
 *     stock layout stays (it scrolls inside its plate).
 * Rows are re-measured after a change. Layout only: no data or API involved.
 */
(function () {
    'use strict';
    var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
    var canvas = document.createElement('canvas');
    function textWidth(text, el) {
        var ctx = canvas.getContext('2d');
        var cs = getComputedStyle(el);
        ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        var w = ctx.measureText(text).width;
        var ls = parseFloat(cs.letterSpacing);
        if (ls) { w += ls * text.length; }
        if (cs.textTransform === 'uppercase') { w *= 1.12; }
        return w;
    }
    function cellNeed(el) {
        if (!el) { return 0; }
        var cs = getComputedStyle(el);
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        var w = text ? textWidth(text, el) : 0;
        // icons, checkboxes and buttons beside (or instead of) the text
        el.querySelectorAll('i, svg, input, button, .btn, img').forEach(function (k) {
            if (!k.textContent.trim()) { w += k.offsetWidth + 4; }
        });
        return w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 12;   // 12: breathing room
    }
    function need(col) {
        var head = col.getElement();
        var title = head.querySelector('.tabulator-col-title');
        var hc = head.querySelector('.tabulator-col-content') || head;
        var hcs = getComputedStyle(hc);
        var widest = title ? textWidth((title.textContent || '').trim(), title) + parseFloat(hcs.paddingLeft) +
            parseFloat(hcs.paddingRight) + 16 : 0;   // 16: the sort arrow
        col.getCells().slice(0, 60).forEach(function (c) { widest = Math.max(widest, cellNeed(c.getElement())); });
        return Math.ceil(widest);
    }
    // circuit breaker: a grid that keeps changing under us (a page that rewrites its cells on every render, a column
    // that refuses the width it is given) must not loop: more than 6 passes with changes in 8 s turn the layout off
    // for that grid until the window is resized; columns that did not take their width are left alone
    var guard = typeof WeakMap === 'function' ? new WeakMap() : null;
    function state(tb) {
        if (!guard) { return { runs: [], off: false, stubborn: {} }; }
        var st = guard.get(tb);
        if (!st) { st = { runs: [], off: false, stubborn: {} }; guard.set(tb, st); }
        return st;
    }
    function layout(tb) {
        try {
            if (!tb || !tb.options || tb.options.layout !== 'fitColumns' || !tb.element) { return; }
            var st = state(tb);
            if (st.off) { return; }
            var holder = tb.element.querySelector('.tabulator-tableholder');
            if (!holder || !holder.clientWidth || !tb.getRows().length) { return; }
            var avail = holder.clientWidth - 1;
            var cols = tb.getColumns().filter(function (c) { return c.isVisible(); });
            var fixed = 0, free = [];
            cols.forEach(function (c) {
                var d = c.getDefinition();
                if (d.frozen || (d.maxWidth && d.minWidth && d.maxWidth === d.minWidth)) { fixed += c.getWidth(); return; }
                free.push({ col: c, min: Math.max(d.minWidth || 40, 20), max: d.maxWidth || Infinity, raw: need(c) });
            });
            if (!free.length) { return; }
            var main = free.slice().sort(function (a, b) { return b.raw - a.raw; })[0];
            var room = avail - fixed;
            var mainMin = Math.min(main.max, Math.max(main.min, Math.round(avail * 0.15)));
            var floors = function (cap) {
                var t = 0;
                free.forEach(function (f) {
                    if (f === main) { return; }
                    f.w = Math.min(f.max, Math.max(f.min, Math.min(f.raw, cap)));
                    t += f.w;
                });
                return t;
            };
            var sum = floors(220);
            // phones: the columns may wrap their text down to 62px (a short word such as "Warning" stays whole)
            if (sum + mainMin > room && avail < 600) { sum = floors(62); }
            if (sum + mainMin > room) { return; }   // cannot fit without cutting content: keep the stock layout
            var mainWant = Math.min(main.max, Math.max(main.min, Math.min(main.raw, Math.round(avail * 0.30))));
            var spare = room - sum - Math.max(mainMin, Math.min(mainWant, room - sum));
            if (spare > 0) {
                // capped columns (long text) first, up to their full text, in proportion
                var wanting = free.filter(function (f) { return f !== main && f.raw > f.w && f.w < f.max; });
                var short = wanting.reduce(function (s, f) { return s + (Math.min(f.raw, f.max) - f.w); }, 0);
                if (short > 0) {
                    var k = Math.min(1, spare / short);
                    wanting.forEach(function (f) {
                        var add = Math.floor((Math.min(f.raw, f.max) - f.w) * k);
                        f.w += add; sum += add;
                    });
                }
            }
            main.w = Math.min(main.max, room - sum);
            if (main.w < mainMin) { return; }
            var changed = false;
            free.forEach(function (f) {
                var key = f.col.getField() || f.col.getDefinition().title || '';
                if (st.stubborn[key] || Math.abs(f.col.getWidth() - f.w) <= 2) { return; }
                f.col.setWidth(f.w);
                if (Math.abs(f.col.getWidth() - f.w) > 2) { st.stubborn[key] = true; }   // refused: leave it
                changed = true;
            });
            if (changed) {
                var now = Date.now();
                st.runs = st.runs.filter(function (t) { return now - t < 8000; });
                st.runs.push(now);
                if (st.runs.length > 6) { st.off = true; return; }
                setTimeout(function () {
                    tb.getRows().forEach(function (r) { try { r.normalizeHeight(); } catch (e) { /* gone */ } });
                }, 30);
            }
        } catch (e) { /* table being rebuilt */ }
    }
    function later(tb) { setTimeout(function () { layout(tb); }, 120); }
    function hook() {
        var T = window.Tabulator;
        if (!T || !T.findTable) { return; }
        document.querySelectorAll('.tabulator').forEach(function (el) {
            var tb = (T.findTable(el) || [])[0];
            if (!tb) { return; }
            if (seen && !seen.has(tb)) {
                seen.add(tb);
                ['renderComplete', 'dataProcessed', 'tableBuilt'].forEach(function (ev) {
                    try { tb.on(ev, function () { later(tb); }); } catch (e) { /* older API */ }
                });
                // the page may change column widths after the render without any table event: watch the grid's
                // width and lay it out again (a pass that changes nothing ends the cycle; the breaker caps it)
                var inner = el.querySelector('.tabulator-table');
                if (window.ResizeObserver && inner) {
                    var last = 0;
                    new ResizeObserver(function () {
                        var w = inner.scrollWidth;
                        if (Math.abs(w - last) > 2 && !state(tb).off) { last = w; later(tb); }
                    }).observe(inner);
                }
                later(tb);
            }
        });
    }
    function boot() {
        hook();
        if (window.MutationObserver) {
            var pending = null;
            new MutationObserver(function () {
                if (pending) { return; }
                pending = setTimeout(function () { pending = null; hook(); }, 250);
            }).observe(document.body, { childList: true, subtree: true });
        }
        var rt = null;
        window.addEventListener('resize', function () {
            clearTimeout(rt);
            rt = setTimeout(function () {
                var T = window.Tabulator;
                if (!T || !T.findTable) { return; }
                document.querySelectorAll('.tabulator').forEach(function (el) {
                    var tb = (T.findTable(el) || [])[0];
                    if (!tb) { return; }
                    var st = state(tb);
                    st.off = false; st.runs = []; st.stubborn = {};
                    later(tb);
                });
            }, 250);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/*
 * Key/value trees (jqTree: Diagnostics > Statistics and the like): "+" and "-" buttons next to the search box
 * expand or collapse every branch at once. All nodes are flagged and the tree is redrawn in one pass (opening
 * 4,000+ nodes one by one would take seconds). Display only: nothing is changed on the firewall.
 */
(function () {
    'use strict';
    function setAll(el, open) {
        var $t = window.jQuery(el);
        var root = $t.tree('getTree');
        if (!root) { return; }
        root.iterate(function (n) {
            if (n.children && n.children.length) { n.is_open = open; }
            return true;
        });
        $t.tree('refresh');
    }
    function button(icon, title, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-default btn-sm';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.innerHTML = '<i class="fa fa-fw ' + icon + '"></i>';
        b.addEventListener('click', onClick);
        return b;
    }
    function hook() {
        var $ = window.jQuery;
        if (!$ || !$.fn || !$.fn.tree) { return; }
        document.querySelectorAll('.treewidget').forEach(function (el) {
            if (!$(el).data('simple_widget_tree') && !el.querySelector('ul.jqtree-tree')) { return; }
            var box = el.closest('.content-box') || el.parentElement;
            var search = box && box.querySelector('.searchbox');
            if (!search || search.querySelector('.nexo-tree-tools')) { return; }
            var tools = document.createElement('div');
            tools.className = 'btn-group nexo-tree-tools';
            tools.appendChild(button('fa-plus', 'Expand all', function () { setAll(el, true); }));
            tools.appendChild(button('fa-minus', 'Collapse all', function () { setAll(el, false); }));
            search.appendChild(tools);
        });
    }
    function boot() {
        hook();
        if (window.MutationObserver) {
            var pending = null;
            new MutationObserver(function () {
                if (pending) { return; }
                pending = setTimeout(function () { pending = null; hook(); }, 300);
            }).observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/*
 * Services > Monit > Status: the status arrives as one preformatted text block (a <strong> title per service, then
 * "key   value" lines). It is shown as a tree instead: one collapsible branch per service, its status (OK / failed)
 * in the branch title, branches with a problem open, the others closed; "+" / "-" open or close them all. The
 * original block stays in the page (hidden) and the tree is rebuilt whenever the page replaces it. Display only.
 */
(function () {
    'use strict';
    var openState = {};
    function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function build(region) {
        var pre = region.querySelector('pre');
        if (!pre || !/^\s*Monit \d/.test(pre.textContent)) { return; }
        if (pre.getAttribute('data-nexo-tree') === '1') { return; }
        pre.setAttribute('data-nexo-tree', '1');
        var old = region.querySelector('.nexo-kvtree');
        if (old) { old.remove(); }
        var lines = pre.innerHTML.split('\n');
        var tree = document.createElement('div');
        tree.className = 'nexo-kvtree';
        var head = document.createElement('div');
        head.className = 'nexo-kvtree-head';
        var tools = document.createElement('span');
        tools.className = 'btn-group nexo-tree-tools';
        var summaryLine = '', sections = [], cur = null;
        lines.forEach(function (line) {
            var h = /^\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*$/.exec(line);
            if (h) {
                var tmp = document.createElement('div');
                tmp.innerHTML = h[1];
                cur = { title: tmp.textContent, rows: [] };
                sections.push(cur);
                return;
            }
            var kv = /^\s{2,}(\S(?:.*?\S)?)\s{2,}(\S[\s\S]*)$/.exec(line);
            if (cur && kv) {
                cur.rows.push([kv[1], kv[2]]);
            } else if (!cur && line.trim()) {
                summaryLine += (summaryLine ? ' ' : '') + line.trim();
            }
        });
        if (!sections.length) { return; }
        head.innerHTML = '<span class="nexo-kvtree-summary">' + summaryLine + '</span>';
        sections.forEach(function (sec) {
            var status = '', bad = false;
            sec.rows.forEach(function (r) {
                if (r[0] === 'status') {
                    var t = document.createElement('div');
                    t.innerHTML = r[1];
                    status = t.textContent.trim();
                    bad = !/^(OK|Accessible|Running)$/i.test(status) && !/success/.test(r[1]);
                }
            });
            var det = document.createElement('details');
            det.className = 'nexo-kvtree-node' + (bad ? ' nexo-kvtree-bad' : '');
            det.open = sec.title in openState ? openState[sec.title] : bad;
            det.addEventListener('toggle', function () { openState[sec.title] = det.open; });
            var m = /^(\S+)\s+'(.*)'$/.exec(sec.title);
            det.innerHTML = '<summary><span class="nexo-kvtree-kind">' + esc(m ? m[1] : '') + '</span> ' +
                '<span class="nexo-kvtree-name">' + esc(m ? m[2] : sec.title) + '</span>' +
                (status ? ' <span class="nexo-kvtree-status' + (bad ? ' bad' : '') + '">' + esc(status) + '</span>' : '') +
                '</summary><dl>' + sec.rows.map(function (r) {
                    return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
                }).join('') + '</dl>';
            tree.appendChild(det);
        });
        var mk = function (icon, title, open) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-default btn-sm';
            b.title = title;
            b.innerHTML = '<i class="fa fa-fw ' + icon + '"></i>';
            b.addEventListener('click', function () {
                tree.querySelectorAll('details').forEach(function (d) { d.open = open; });
            });
            tools.appendChild(b);
        };
        mk('fa-plus', 'Expand all', true);
        mk('fa-minus', 'Collapse all', false);
        head.appendChild(tools);
        tree.insertBefore(head, tree.firstChild);
        pre.style.display = 'none';
        pre.parentElement.insertBefore(tree, pre);
    }
    function boot() {
        var region = document.getElementById('messageregion');
        if (!region || !/\/ui\/monit\/status/.test(window.location.pathname)) { return; }
        build(region);
        if (window.MutationObserver) {
            new MutationObserver(function () { build(region); }).observe(region, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/*
 * Services > SMART: a health panel on top of the page, from the plugin's own read-only API (/api/smart/service/list,
 * then /api/smart/service/info with json=1, i.e. "smartctl -a --json"): per disk the overall verdict, model and
 * size, temperature against its limits, wear, spare, power-on hours, data written, unsafe shutdowns and media
 * errors, each tile coloured by how healthy the value is. The stock forms below are untouched.
 */
(function () {
    'use strict';
    function esc(t) { var d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
    function bytes(n) {
        var u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], i = 0;
        while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
        return (i ? n.toFixed(n < 10 ? 2 : 1) : n) + ' ' + u[i];
    }
    function tile(label, value, level, hint) {
        return '<div class="nexo-smart-tile nexo-smart-' + level + '"' + (hint ? ' title="' + esc(hint) + '"' : '') +
            '><span class="v">' + esc(value) + '</span><span class="l">' + esc(label) + '</span></div>';
    }
    function card(dev, d) {
        var h = d.nvme_smart_health_information_log || {};
        var ata = d.ata_smart_attributes ? d.ata_smart_attributes.table || [] : [];
        var attr = function (id) { var a = ata.filter(function (x) { return x.id === id; })[0]; return a ? a.raw.value : null; };
        var passed = d.smart_status ? d.smart_status.passed : null;
        var t = d.temperature || {};
        var temp = t.current;
        var tmax = d.nvme_composite_temperature_threshold ? d.nvme_composite_temperature_threshold.warning : (t.op_limit_max || 70);
        var used = h.percentage_used !== undefined ? h.percentage_used : d.endurance_used ? d.endurance_used.current_percent : null;
        var spare = h.available_spare !== undefined ? h.available_spare : d.spare_available ? d.spare_available.current_percent : null;
        var spareMin = h.available_spare_threshold !== undefined ? h.available_spare_threshold : 10;
        var hours = d.power_on_time ? d.power_on_time.hours : null;
        var written = h.data_units_written !== undefined ? h.data_units_written * 512000 : null;
        var unsafe = h.unsafe_shutdowns !== undefined ? h.unsafe_shutdowns : attr(192);
        var media = h.media_errors !== undefined ? h.media_errors : attr(5);
        var crit = h.critical_warning || 0;
        var tiles = [];
        if (temp !== undefined) {
            tiles.push(tile('temperature', temp + ' °C', temp >= tmax ? 'bad' : temp >= tmax - 15 ? 'warn' : 'ok',
                'limits: warning ' + tmax + ' °C' + (t.critical_limit_max ? ', critical ' + t.critical_limit_max + ' °C' : '')));
        }
        if (used !== null) { tiles.push(tile('wear (life used)', used + ' %', used >= 90 ? 'bad' : used >= 70 ? 'warn' : 'ok')); }
        if (spare !== null) { tiles.push(tile('spare available', spare + ' %', spare <= spareMin ? 'bad' : spare <= spareMin + 20 ? 'warn' : 'ok', 'threshold ' + spareMin + ' %')); }
        if (hours !== null) { tiles.push(tile('power-on hours', hours.toLocaleString(), 'info', Math.round(hours / 24) + ' days')); }
        if (written !== null) { tiles.push(tile('data written', bytes(written), 'info')); }
        if (unsafe !== null) { tiles.push(tile('unsafe shutdowns', unsafe, unsafe > 0 ? 'warn' : 'ok', 'power lost without a clean shutdown')); }
        if (media !== null) { tiles.push(tile('media errors', media, media > 0 ? 'bad' : 'ok', 'unrecovered data integrity errors reported by the drive')); }
        var verdict = passed === null ? 'unknown' : passed && !crit ? 'PASSED' : 'FAILED';
        var cap = d.user_capacity ? bytes(d.user_capacity.bytes) : '';
        return '<div class="nexo-smart-card"><div class="nexo-smart-head"><span class="nexo-smart-verdict ' +
            (verdict === 'PASSED' ? 'ok' : verdict === 'FAILED' ? 'bad' : 'warn') + '">' + esc(verdict) + '</span>' +
            '<b>/dev/' + esc(dev) + '</b> <span class="text-muted">' + esc([d.model_name, cap, d.firmware_version ? 'fw ' + d.firmware_version : ''].filter(Boolean).join(' · ')) +
            '</span></div><div class="nexo-smart-tiles">' + tiles.join('') + '</div></div>';
    }
    function boot() {
        if (!/^\/ui\/smart\/?$/.test(window.location.pathname) || typeof window.ajaxCall !== 'function') { return; }
        var main = document.querySelector('.page-content-main section.col-xs-12') || document.querySelector('.page-content-main');
        if (!main || document.getElementById('nexo-smart')) { return; }
        var panel = document.createElement('div');
        panel.id = 'nexo-smart';
        panel.className = 'nexo-smart';
        panel.innerHTML = '<div class="text-muted"><i class="fa fa-spinner fa-spin"></i> SMART…</div>';
        main.insertBefore(panel, main.firstChild);
        var tries = 0;
        var list = function () {
          window.ajaxCall('/api/smart/service/list', {}, function (data) {
            var devs = (data && data.devices) || [];
            if (!devs.length && ++tries < 3) { setTimeout(list, 1500); return; }   // the page may not be ready yet
            if (!devs.length) { panel.innerHTML = '<div class="text-muted">No SMART capable disk found.</div>'; return; }
            panel.innerHTML = '';
            devs.forEach(function (dev) {
                var slot = document.createElement('div');
                panel.appendChild(slot);
                window.ajaxCall('/api/smart/service/info', { device: dev, type: 'a', json: '1' }, function (r) {
                    var d = r && r.output;
                    slot.innerHTML = d && typeof d === 'object' ? card(dev, d) :
                        '<div class="text-muted">/dev/' + esc(dev) + ': no SMART data</div>';
                });
            });
          });
        };
        list();
    }
    // after the page's own setup (the CSRF header of ajaxCall is set on document ready)
    if (document.readyState === 'complete') {
        setTimeout(boot, 300);
    } else {
        window.addEventListener('load', function () { setTimeout(boot, 300); });
    }
})();

/*
 * Unbound DNS > Statistics: a panel of key figures above the raw tables (cache hit rate, recursion time in ms,
 * answers by result, query types, blocklist share), from the same read-only APIs as the page
 * (/api/unbound/diagnostics/stats, /api/unbound/overview/totals); the raw tables get readable values: seconds as
 * ms, thousands separated. Refreshed with the page's own auto refresh.
 */
(function () {
    'use strict';
    var nf = function (n) { return Number(n || 0).toLocaleString(); };
    function pct(a, b) { return b ? (a * 100 / b) : 0; }
    function esc(t) { var d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
    function kpi(label, value, sub, level) {
        return '<div class="nexo-kpi nexo-kpi-' + (level || 'info') + '"><span class="v">' + esc(value) + '</span><span class="l">' +
            esc(label) + '</span>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</div>';
    }
    function bars(title, items, total) {
        return '<div class="nexo-bars"><div class="t">' + esc(title) + '</div>' + items.map(function (it) {
            var p = pct(it[1], total);
            return '<div class="b"><span class="k">' + esc(it[0]) + '</span><span class="bar"><i style="width:' +
                p.toFixed(1) + '%;background:' + (it[2] || 'var(--kpi)') + '"></i></span><span class="n">' + nf(it[1]) +
                ' · ' + p.toFixed(1) + '%</span></div>';
        }).join('') + '</div>';
    }
    function render(panel, d, ov) {
        var D = d.data || d, t = (D.total || {}), num = t.num || {}, rec = (t.recursion || {}).time || {};
        var q = +num.queries || 0, hits = +num.cachehits || 0;
        var ans = ((D.num || {}).answer || {}).rcode || {};
        var types = ((D.num || {}).query || {}).type || {};
        var blockedPct = ov && ov.blocked ? parseFloat(ov.blocked.pcnt) : null;
        var effHit = blockedPct !== null ? pct(hits, q * (1 - blockedPct / 100)) : null;
        var avgMs = (+rec.avg || 0) * 1000, medMs = (+rec.median || 0) * 1000;
        var html = '<div class="nexo-kpis">' +
            kpi('queries', nf(q), 'since the last restart') +
            kpi('cache hit rate', pct(hits, q).toFixed(1) + ' %', effHit !== null ? effHit.toFixed(1) + ' % without blocked queries' : '',
                pct(hits, q) >= 40 ? 'ok' : 'warn') +
            kpi('recursion (median)', medMs.toFixed(1) + ' ms', 'average ' + avgMs.toFixed(1) + ' ms', medMs < 50 ? 'ok' : 'warn') +
            kpi('SERVFAIL', nf(ans.SERVFAIL), pct(+ans.SERVFAIL, q).toFixed(3) + ' % of queries', +ans.SERVFAIL ? 'warn' : 'ok') +
            (blockedPct !== null ? kpi('blocked (blocklist)', blockedPct.toFixed(1) + ' %', nf(ov.blocked.total) + ' of ' + nf(ov.total) + ' logged') : '') +
            kpi('prefetch / serve expired', nf(num.prefetch) + ' / ' + nf(num.expired), 'refreshed early / answered stale') +
            '</div><div class="nexo-bars-row">' +
            bars('answers', [['NOERROR', +ans.NOERROR, '#22C55E'], ['NXDOMAIN', +ans.NXDOMAIN, '#F59E0B'],
                ['no data', +ans.nodata, '#94A3B8'], ['SERVFAIL', +ans.SERVFAIL, '#EF4444']], q) +
            bars('query types', Object.keys(types).map(function (k) { return [k, +types[k]]; })
                .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5), q) + '</div>';
        panel.innerHTML = html;
    }
    function tidy(view) {
        view.querySelectorAll('td').forEach(function (td) {
            if (td.getAttribute('data-nexo')) { return; }
            var th = td.previousElementSibling ? td.previousElementSibling.textContent : '';
            var v = td.textContent.trim();
            // plain or scientific notation (unbound prints tiny medians as 9.66052e-07 seconds)
            if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v)) {
                td.setAttribute('data-nexo', '1');
                td.title = v;
                var secs = parseFloat(v);
                if (/^\s*now\b/i.test(th) && secs > 1e9) {
                    // epoch seconds -> local date and time
                    td.textContent = new Date(secs * 1000).toLocaleString();
                } else if (/uptime|elapsed/i.test(th)) {
                    // seconds -> 3 d 4 h 12 min (seconds only under a minute)
                    var d = Math.floor(secs / 86400), h = Math.floor(secs % 86400 / 3600), mi = Math.floor(secs % 3600 / 60);
                    td.textContent = secs < 60 ? secs.toFixed(1) + ' s' :
                        [d ? d + ' d' : '', (d || h) ? h + ' h' : '', mi + ' min'].filter(Boolean).join(' ');
                } else if (/recursion time/i.test(th)) {
                    var ms = parseFloat(v) * 1000;
                    td.textContent = ms !== 0 && Math.abs(ms) < 0.01 ? (ms * 1000).toFixed(2) + ' \u00b5s' : ms.toFixed(2) + ' ms';
                } else {
                    td.textContent = /e/i.test(v) ? String(+parseFloat(v).toPrecision(4)) : (v.indexOf('.') < 0 ? nf(v) : v);
                }
            }
        });
    }
    function boot() {
        if (!/^\/ui\/unbound\/stats/.test(window.location.pathname) || typeof window.ajaxGet !== 'function') { return; }
        var view = document.getElementById('statsView');
        if (!view) { return; }
        var panel = document.createElement('div');
        panel.className = 'nexo-dnsstats';
        // before the tables' wrapper (it lays its children out in a row)
        var host = view.closest('.table-responsive') || view.parentElement;
        host.parentElement.insertBefore(panel, host);
        var refresh = function () {
            window.ajaxGet('/api/unbound/diagnostics/stats', {}, function (d) {
                window.ajaxGet('/api/unbound/overview/totals/10', {}, function (ov) { render(panel, d, ov); });
            });
        };
        refresh();
        setInterval(function () {
            var auto = document.querySelector('input[type=checkbox]#autorefresh, #auto_refresh, input[type=checkbox]');
            if (!auto || auto.checked) { refresh(); }
        }, 10000);
        if (window.MutationObserver) {
            var queued = false;
            new MutationObserver(function () {
                if (queued) { return; }
                queued = true;
                requestAnimationFrame(function () { queued = false; tidy(view); });
            }).observe(view, { childList: true, subtree: true });
        }
        tidy(view);
    }
    if (document.readyState === 'complete') {
        setTimeout(boot, 300);
    } else {
        window.addEventListener('load', function () { setTimeout(boot, 300); });
    }
})();

/*
 * Services > VnStat: the Hourly / Daily / Monthly / Yearly tabs show the raw "vnstat" text, redrawn every 3 s.
 * Each becomes key figures (period total, average, peak, rx / tx), a bar chart of received and sent traffic per
 * period (the current period's estimate drawn hollow) and a clean table. The raw text stays in the page, hidden;
 * the view is rebuilt only when that text actually changes. Display only.
 */
(function () {
    'use strict';
    var UNIT = { B: 1, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776, PiB: 1125899906842624 };
    function toBytes(t) { var m = /([\d.]+)\s*(\w+)/.exec(t || ''); return m ? parseFloat(m[1]) * (UNIT[m[2]] || 1) : 0; }
    function fmt(b) {
        var u = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'], i = 0;
        while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
        return b.toFixed(b >= 100 || i === 0 ? 0 : b >= 10 ? 1 : 2) + ' ' + u[i];
    }
    function esc(t) { var d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
    function parse(text) {
        var rows = [], est = null, date = '', iface = '';
        text.split('\n').forEach(function (line) {
            var h = /^\s*(\S+)\s+\/\s+(hourly|daily|monthly|yearly)\s*$/.exec(line);
            if (h) { iface = h[1]; return; }
            var d = /^\s*(\d\d\/\d\d\/\d\d)\s*$/.exec(line);
            if (d) { date = d[1]; return; }
            var m = /^\s*(.+?)\s{2,}([\d.]+ \w+)\s*\|\s*([\d.]+ \w+)\s*\|\s*([\d.]+ \w+)\s*\|?\s*(.*)$/.exec(line);
            if (!m) { return; }
            var r = { label: m[1].trim(), rx: toBytes(m[2]), tx: toBytes(m[3]), total: toBytes(m[4]), rate: m[5].trim(),
                      day: date };
            if (r.label === 'estimated') { est = r; } else { rows.push(r); }
        });
        return { rows: rows, est: est, iface: iface };
    }
    function chart(rows, est) {
        var all = rows.concat(est ? [est] : []);
        var max = Math.max.apply(null, all.map(function (r) { return r.rx + r.tx; })) || 1;
        var n = all.length, W = 1000, H = 180, pad = 4, bw = (W - pad * 2) / n, gap = Math.min(6, bw * 0.25);
        var bars = all.map(function (r, i) {
            var x = pad + i * bw + gap / 2, w = Math.max(1, bw - gap);
            var hrx = (r.rx / max) * (H - 20), htx = (r.tx / max) * (H - 20);
            var cls = r === est ? ' est' : '';
            return '<g class="bar' + cls + '"><title>' + esc((r.day && r.label.indexOf(':') > 0 ? r.day + ' ' : '') + r.label) +
                ' · rx ' + fmt(r.rx) + ' · tx ' + fmt(r.tx) + ' · ' + fmt(r.total) + (r.rate ? ' · ' + r.rate : '') + '</title>' +
                '<rect class="rx" x="' + x.toFixed(1) + '" y="' + (H - hrx).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hrx.toFixed(1) + '"/>' +
                '<rect class="tx" x="' + x.toFixed(1) + '" y="' + (H - hrx - htx).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + htx.toFixed(1) + '"/></g>';
        }).join('');
        var every = Math.max(1, Math.ceil(n / 12));
        var labels = all.map(function (r, i) {
            if (i % every && i !== n - 1) { return ''; }
            return '<span style="left:' + ((pad + (i + 0.5) * bw) / W * 100).toFixed(2) + '%">' + esc(r.label) + '</span>';
        }).join('');
        return '<div class="nexo-vn-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
            [0.25, 0.5, 0.75].map(function (f) { return '<line x1="0" x2="' + W + '" y1="' + (H - f * (H - 20)).toFixed(1) + '" y2="' + (H - f * (H - 20)).toFixed(1) + '"/>'; }).join('') +
            bars + '</svg><div class="nexo-vn-x">' + labels + '</div><div class="nexo-vn-top">' + fmt(max) + '</div></div>';
    }
    function render(pre, box) {
        var p = parse(pre.textContent);
        if (!p.rows.length) { box.innerHTML = ''; pre.style.display = ''; return; }
        var rows = p.rows, tot = rows.reduce(function (a, r) { a.rx += r.rx; a.tx += r.tx; a.t += r.total; return a; }, { rx: 0, tx: 0, t: 0 });
        var peak = rows.reduce(function (a, r) { return r.total > a.total ? r : a; }, rows[0]);
        var last = rows[rows.length - 1];
        var k = function (l, v, sub, cls) {
            return '<div class="nexo-kpi' + (cls ? ' nexo-kpi-' + cls : '') + '"><span class="v">' + esc(v) + '</span><span class="l">' + esc(l) + '</span>' +
                (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</div>';
        };
        box.innerHTML = '<div class="nexo-vn-iface text-muted"><i class="fa fa-sitemap"></i> ' + esc(p.iface) + '</div>' +
            '<div class="nexo-kpis">' +
            k('current: ' + last.label, fmt(last.total), last.rate || '', 'ok') +
            (p.est ? k('estimated for the period', fmt(p.est.total), 'rx ' + fmt(p.est.rx) + ' · tx ' + fmt(p.est.tx)) : '') +
            k('total shown (' + rows.length + ')', fmt(tot.t), 'average ' + fmt(tot.t / rows.length)) +
            k('peak', fmt(peak.total), (peak.day && peak.label.indexOf(':') > 0 ? peak.day + ' ' : '') + peak.label, 'warn') +
            k('received / sent', fmt(tot.rx) + ' / ' + fmt(tot.tx), Math.round(tot.rx * 100 / (tot.t || 1)) + ' % received') +
            '</div><div class="nexo-vn-legend"><span class="rx"></span> received <span class="tx"></span> sent' +
            (p.est ? ' <span class="est"></span> estimate' : '') + '</div>' + chart(rows, p.est) +
            '<table class="table table-condensed nexo-vn-table"><thead><tr><th></th><th>received</th><th>sent</th><th>total</th><th>avg. rate</th></tr></thead><tbody>' +
            rows.slice().reverse().map(function (r) {
                return '<tr' + (r === peak ? ' class="peak"' : '') + '><td>' + esc((r.day && r.label.indexOf(':') > 0 ? r.day + ' ' : '') + r.label) +
                    '</td><td>' + fmt(r.rx) + '</td><td>' + fmt(r.tx) + '</td><td><b>' + fmt(r.total) + '</b></td><td>' + esc(r.rate) + '</td></tr>';
            }).join('') + '</tbody></table>';
        pre.style.display = 'none';
    }
    function boot() {
        if (!/^\/ui\/vnstat\//.test(window.location.pathname)) { return; }
        ['listhourly', 'listdaily', 'listmonthly', 'listyearly'].forEach(function (id) {
            var pre = document.getElementById(id);
            if (!pre) { return; }
            var box = document.createElement('div');
            box.className = 'nexo-vn';
            pre.parentElement.insertBefore(box, pre);
            var last = null;
            var update = function () {
                var t = pre.textContent;
                if (t === last) { return; }
                last = t;
                render(pre, box);
            };
            update();
            if (window.MutationObserver) { new MutationObserver(update).observe(pre, { childList: true, characterData: true, subtree: true }); }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/*
 * Side menu: pages whose third-level items are tabs of one page (Security > Q-Feeds Connect: /ui/q_feeds/#settings,
 * #feeds, #events) got every item marked active, so the tree showed three current branches. Only the item of the
 * open tab stays active (by the tab shown, or the address hash), following tab changes.
 */
(function () {
    'use strict';
    var groups = [];
    function collect() {
        var seen = [];
        document.querySelectorAll('#mainmenu a.menu-level-3-item.active').forEach(function (a) {
            var g = a.parentElement;
            if (seen.indexOf(g) < 0) { seen.push(g); }
        });
        seen.forEach(function (g) {
            var act = Array.prototype.slice.call(g.querySelectorAll('a.menu-level-3-item.active'));
            if (act.length > 1) { groups.push(act); }
        });
    }
    function pick(hash) {
        groups.forEach(function (act) {
            var keep = hash ? act.filter(function (a) { return (a.getAttribute('href') || '').split('#')[1] === hash.replace('#', ''); })[0] : null;
            keep = keep || act[0];
            act.forEach(function (a) { a.classList.toggle('active', a === keep); });
        });
    }
    function boot() {
        collect();
        if (!groups.length) { return; }
        var shown = document.querySelector('.nav-tabs > li.active > a[href^="#"]');
        pick(window.location.hash || (shown ? shown.getAttribute('href') : ''));
        window.addEventListener('hashchange', function () { pick(window.location.hash); });
        if (window.jQuery) {
            window.jQuery(document).on('shown.bs.tab', 'a[data-toggle="tab"]', function () { pick(this.getAttribute('href')); });
        }
    }
    if (document.readyState === 'complete') {
        setTimeout(boot, 200);
    } else {
        window.addEventListener('load', function () { setTimeout(boot, 200); });
    }
})();

/*
 * Dashboard CPU widget (SmoothieChart, a 259x50 canvas): a thicker line (2.2px) for the series it adds; the soft
 * glow is a CSS drop-shadow on that small canvas (main.scss). The traffic graph is left as it is: it redraws on
 * every animation frame and any per-frame effect there cost most of the frame rate.
 */
(function () {
    'use strict';
    var S = window.SmoothieChart;
    if (!S || !S.prototype || !S.prototype.addTimeSeries || S.prototype.addTimeSeries.nexo) { return; }
    var orig = S.prototype.addTimeSeries;
    var patched = function (series, opts) {
        opts = opts || {};
        if (this.canvas && /^cpu-usage/.test(this.canvas.id || '')) {
            opts.lineWidth = Math.max(opts.lineWidth || 1, 2.2);
        }
        return orig.call(this, series, opts);
    };
    patched.nexo = true;
    S.prototype.addTimeSeries = patched;
})();

/*
 * Log pages (Diagnostics > Log File of any service): "All" / "None" buttons in the header of the severity list.
 * Multiselect (exact) mode: tick or untick every severity at once. Range mode (one maximum level): "All" picks
 * Debug, the level that shows everything. The page's own change handler reloads the grid and stores the choice.
 */
(function () {
    'use strict';
    function inject(sel) {
        var $ = window.jQuery;
        var bs = sel.closest('.bootstrap-select');
        var head = bs && bs.querySelector('.popover-title');
        if (!head || head.querySelector('.nexo-sev-all')) {
            return;
        }
        var bar = document.createElement('span');
        bar.className = 'nexo-sev-all btn-group btn-group-xs';
        var make = function (label, title, onClick) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-default btn-xs';
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onClick();
                $(sel).trigger('change');
            });
            bar.appendChild(b);
        };
        if (sel.multiple) {
            make('All', 'Select all severities', function () { $(sel).selectpicker('selectAll'); });
            make('None', 'Clear all severities', function () { $(sel).selectpicker('deselectAll'); });
        } else {
            make('All', 'Show every severity (up to Debug)', function () {
                var last = sel.options[sel.options.length - 1];
                $(sel).selectpicker('val', last ? last.value : 'Debug');
            });
        }
        head.appendChild(bar);
    }
    function boot() {
        var $ = window.jQuery;
        if (!$) {
            return;
        }
        $(document).on('shown.bs.select loaded.bs.select rendered.bs.select', '#severity_filter', function () {
            inject(this);
        });
        var s = document.getElementById('severity_filter');
        if (s) { inject(s); }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/*
 * System > Firmware > Plugins: a select next to the name search to show every plugin, only the installed ones
 * or only those not installed. It only toggles a class on #pluginlist (CSS hides the rows), so it composes with
 * the page's own search and survives the list being rebuilt; the choice is remembered in the browser.
 */
(function () {
    var KEY = 'nexo.firmware.pluginsFilter';
    var MODES = [['', 'All plugins'], ['inst', 'Installed'], ['avail', 'Not installed']];
    function apply(table, mode) {
        table.classList.toggle('nexo-pl-inst', mode === 'inst');
        table.classList.toggle('nexo-pl-avail', mode === 'avail');
    }
    function inject() {
        var search = document.getElementById('plugin_search');
        var table = document.getElementById('pluginlist');
        if (!search || !table || document.getElementById('nexo-pl-filter')) {
            return;
        }
        var mode = '';
        try { mode = localStorage.getItem(KEY) || ''; } catch (e) { /* no storage */ }
        var sel = document.createElement('select');
        sel.id = 'nexo-pl-filter';
        sel.className = 'input-sm nexo-pl-filter';
        sel.setAttribute('aria-label', 'Show plugins');
        MODES.forEach(function (m) {
            var o = document.createElement('option');
            o.value = m[0];
            o.textContent = m[1];
            o.selected = m[0] === mode;
            sel.appendChild(o);
        });
        sel.addEventListener('change', function () {
            apply(table, sel.value);
            try { localStorage.setItem(KEY, sel.value); } catch (e) { /* no storage */ }
        });
        search.insertAdjacentElement('afterend', sel);
        search.parentElement.classList.add('nexo-pl-search');
        apply(table, mode);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();

})();
