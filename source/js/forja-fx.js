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

/*
 * Forja theme: specular reflection that follows the cursor over metal plates.
 * Only writes the pointer position, relative to the element under it, into the CSS custom
 * properties --fx-x / --fx-y; the look is in src/stylesheets/pages/_forja.scss.
 * Two levels at once: the control (button, field, menu item, tab) and the plate around it
 * (widget, content box, panel). No-op on touch-only devices.
 */
(function () {
    'use strict';
    if (!window.matchMedia || window.matchMedia('(hover: none)').matches) {
        return;
    }
    var CONTROLS = '.btn, .form-control, textarea, input[type="text"], input[type="password"], input[type="number"],' +
        ' input[type="email"], input[type="search"], input[type="url"], input[type="tel"],' +
        ' #mainmenu .list-group-item, .nav-tabs > li > a';
    var PLATES = '.grid-stack-item-content, .content-box';
    var ctrl = null, plate = null, x = 0, y = 0, queued = false;

    function place(el) {
        if (!el || !el.isConnected) {
            return;
        }
        var r = el.getBoundingClientRect();
        el.style.setProperty('--fx-x', Math.round(x - r.left) + 'px');
        el.style.setProperty('--fx-y', Math.round(y - r.top) + 'px');
    }

    function frame() {
        queued = false;
        place(ctrl);
        place(plate);
    }

    document.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') {
            return;
        }
        var t = e.target && e.target.closest ? e.target : null;
        ctrl = t ? t.closest(CONTROLS) : null;
        plate = t ? t.closest(PLATES) : null;
        x = e.clientX;
        y = e.clientY;
        if ((ctrl || plate) && !queued) {
            queued = true;
            window.requestAnimationFrame(frame);
        }
    }, { passive: true });
})();
