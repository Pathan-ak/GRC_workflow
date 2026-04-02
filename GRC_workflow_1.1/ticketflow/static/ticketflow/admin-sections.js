// Enhanced drag-and-drop with section support (combines original sortable + sections)
(function() {
    'use strict';
    
    console.log("✅ TicketFlow sections script loaded");
    
    // admin-drag-drop.js is loaded via Django admin Media/template includes.
    // Avoid dynamic script injection/visual indicators to keep the admin UI clean.
    
    function findFormFieldTable() {
        // Find the FormField inline table specifically
        // Django admin creates IDs like "formfield_set-group" or similar
        const allTables = document.querySelectorAll('.inline-group table, table.tabular');
        
        for (const table of allTables) {
            // Check if this table has formfield rows (has drag-handle or section select)
            const hasFormFields = table.querySelector('tbody tr .drag-handle, tbody tr select[name$="-section"]');
            if (hasFormFields) {
                return table;
            }
        }
        
        // Fallback to any table with drag handles
        return document.querySelector('table tbody tr .drag-handle')?.closest('table');
    }
    
    function initSectionAwareDrag() {
        const table = findFormFieldTable();
        
        if (!table) {
            console.warn("⏳ Waiting for FormField inline table...");
            const tryCount = window.__tf_sections_tryCount || 0;
            window.__tf_sections_tryCount = tryCount + 1;
            if (tryCount < 20) {
                setTimeout(initSectionAwareDrag, 500);
            } else {
                console.error("❌ No FormField table found after waiting.");
            }
            return;
        }
        
        console.log("📋 Found FormField table:", table);
        
        const tbody = table.querySelector('tbody');
        if (!tbody) {
            console.warn("No tbody found in table");
            return;
        }
        
        // Make rows draggable
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const dataRows = rows.filter(row => !row.querySelector('th') && row.querySelector('input, select'));
        
        if (dataRows.length === 0) {
            console.warn("No data rows found in tbody");
            // Try again after a delay
            setTimeout(initSectionAwareDrag, 1000);
            return;
        }
        
        console.log(`Found ${dataRows.length} data rows`);
        
        dataRows.forEach((row, index) => {
            row.draggable = true;
            row.style.cursor = 'move';
            
            // Find or create drag handle
            let handle = row.querySelector('.drag-handle');
            if (!handle) {
                // Create a drag handle if it doesn't exist
                const firstCell = row.querySelector('td:first-child');
                if (firstCell && !firstCell.querySelector('.drag-handle')) {
                    handle = document.createElement('span');
                    handle.className = 'drag-handle';
                    handle.innerHTML = '⋮⋮';
                    handle.title = 'Drag to reorder';
                    handle.setAttribute('role', 'button');
                    handle.setAttribute('aria-label', 'Drag to reorder');
                    firstCell.insertBefore(handle, firstCell.firstChild);
                }
            }
            
            if (handle) {
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                });
            }
            
            // Make entire row draggable
            row.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                row.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', ''); // Required for Firefox
                row.style.opacity = '0.5';
                console.log("Drag started for row", index);
            });
            
            row.addEventListener('dragend', (e) => {
                e.stopPropagation();
                row.classList.remove('dragging');
                row.style.opacity = '1';
                updateOrder();
                console.log("Drag ended, order updated");
            });
        });
        
        // Handle drag over on tbody
        tbody.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            
            const dragging = tbody.querySelector('.dragging');
            if (!dragging) return;
            
            // Remove drag-over class from all rows
            dataRows.forEach(row => row.classList.remove('drag-over'));
            
            const after = getDragAfterElement(tbody, e.clientY);
            if (after == null) {
                tbody.appendChild(dragging);
            } else {
                tbody.insertBefore(dragging, after);
                // Add visual indicator
                if (after.previousElementSibling && after.previousElementSibling !== dragging) {
                    after.previousElementSibling.classList.add('drag-over');
                }
            }
        });
        
        tbody.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Also handle on table level
        table.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        function getDragAfterElement(container, y) {
            const rows = Array.from(container.querySelectorAll('tr:not(.dragging)'));
            const dataRows = rows.filter(row => !row.querySelector('th') && row.querySelector('input, select'));
            
            return dataRows.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset, element: child };
                }
                return closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }
        
        function updateOrder() {
            const allRows = Array.from(tbody.querySelectorAll('tr'));
            const dataRows = allRows.filter(row => !row.querySelector('th') && row.querySelector('input, select'));
            
            dataRows.forEach((tr, index) => {
                const orderInput = tr.querySelector('input[name$="-order"]');
                if (orderInput) {
                    const oldValue = orderInput.value;
                    orderInput.value = index + 1;
                    if (oldValue != orderInput.value) {
                        console.log(`Updated order for row ${index + 1} from ${oldValue} to ${orderInput.value}`);
                    }
                }
            });
        }
        
        // Keep inline rows clean: do not inject extra "Col X" badges.
        
        console.log("✅ Drag-and-drop initialized for", dataRows.length, "rows");
    }
    
    // Run after DOM ready and also after Django admin inlines are loaded
    function startInit() {
        setTimeout(initSectionAwareDrag, 1000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInit);
    } else {
        startInit();
    }
    
    // Re-initialize when inline formsets are added/removed
    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target && (
            target.classList.contains('add-row') || 
            target.classList.contains('addlink') ||
            target.closest('.add-row') ||
            target.closest('.addlink') ||
            target.classList.contains('delete')
        )) {
            setTimeout(initSectionAwareDrag, 800);
        }
    });
    
    // Also listen for Django admin inline events
    if (window.django && window.django.jQuery) {
        window.django.jQuery(document).on('formset:added', function() {
            setTimeout(initSectionAwareDrag, 500);
        });
    }
})();
