// Lightweight admin layout refresh helper.
// Keeps page clean (no debug overlays / injected banners).
(function () {
    "use strict";

    function removeInlineMetadataNoise() {
        // Remove Django inline "original object label" snippets that overlap controls.
        var rows = document.querySelectorAll(".inline-group table.tabular tbody tr");
        rows.forEach(function (row) {
            // Ignore template/empty rows
            if (row.classList.contains("empty-form")) return;

            var tds = row.querySelectorAll("td");
            tds.forEach(function (td, idx) {
                // Only touch first few cells where drag/name selectors live
                if (idx > 2) return;

                var hasInteractive =
                    td.querySelector("input, select, textarea") ||
                    td.querySelector(".drag-handle, .drag-handle-tab, .drag-handle-section");
                if (!hasInteractive) return;

                td.querySelectorAll(".readonly, .inline_label, .original, p").forEach(function (el) {
                    el.remove();
                });
            });
        });
    }

    function reinitDragAndDrop() {
        try {
            if (typeof window.initTabsDrag === "function") window.initTabsDrag();
            if (typeof window.initSectionsDrag === "function") window.initSectionsDrag();
            if (typeof window.initFieldsDrag === "function") window.initFieldsDrag();
        } catch (e) {
            console.warn("TicketFlow admin reinit skipped:", e);
        }
    }

    function scheduleReinit(delay) {
        window.setTimeout(function () {
            removeInlineMetadataNoise();
            reinitDragAndDrop();
        }, delay);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            scheduleReinit(350);
            scheduleReinit(900);
        });
    } else {
        scheduleReinit(350);
        scheduleReinit(900);
    }

    if (window.django && window.django.jQuery) {
        window.django.jQuery(document).on("formset:added", function () {
            scheduleReinit(250);
        });
    }

    document.addEventListener("click", function (e) {
        var t = e.target;
        if (
            t &&
            (t.classList.contains("add-row") ||
                t.classList.contains("addlink") ||
                t.closest(".add-row") ||
                t.closest(".addlink"))
        ) {
            scheduleReinit(400);
        }
    });
})();
