/*
 * Light/dark switcher for the *-auto themes, based on the theme.js of the stock opnsense-auto theme (Deciso B.V.).
 *
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

/* Template for the theme.js of the *-auto themes: build.sh replaces __THEME__ with the theme family (nexo, nexo-sec). */
(function() {
    function getThemeName() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? '__THEME__-dark' : '__THEME__';
    }

    function switchLinks(theme_name) {
        let links = document.getElementsByTagName('link');
        for (let i = 0; i < links.length; i++) {
            if (links[i].href && links[i].href.indexOf('/ui/themes/') !== -1) {
                links[i].href = links[i].href.replace(/\/ui\/themes\/[^\/]+\//, '/ui/themes/' + theme_name + '/');
            }
        }
    }

    function switchImages(theme_name) {
        let imgs = document.getElementsByTagName('img');
        for (let i = 0; i < imgs.length; i++) {
            if (imgs[i].src && imgs[i].src.indexOf('/ui/themes/') !== -1) {
                imgs[i].src = imgs[i].src.replace(/\/ui\/themes\/[^\/]+\//, '/ui/themes/' + theme_name + '/');
            }
        }
    }

    function themeSwitcher() {
        let theme_name = getThemeName();
        switchLinks(theme_name);
        switchImages(theme_name);
        window.dispatchEvent(new Event('resize'));
    }

    if (window.matchMedia) {
        /* write out during <head/> construction */
        document.write(
            '<style>html{visibility:hidden}</style>'
        );
        switchLinks(getThemeName());

        document.addEventListener('DOMContentLoaded', function() {
            let theme_name = getThemeName();
            switchLinks(theme_name);
            switchImages(theme_name);
            window.dispatchEvent(new Event('resize'));
        });
        window.addEventListener("load", () => {
            document.querySelector("html").style.visibility = "visible";
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeSwitcher);
    }
})();
