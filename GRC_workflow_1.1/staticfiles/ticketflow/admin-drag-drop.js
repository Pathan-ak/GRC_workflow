// Unified drag-and-drop for Form Tabs, Sections, and Fields
// This script injects drag handles and enables drag-and-drop functionality
console.log("🔧 Admin drag-and-drop script STARTING to load...");

(function() {
    'use strict';
    
    console.log("✅ Admin drag-and-drop script loaded");
    
    // Inject drag handles into table cells
    function injectDragHandles(table, dragHandleClass, inputPattern) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return false;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const dataRows = rows.filter(row => 
            !row.querySelector('th') && 
            row.querySelector(`input[name^="${inputPattern}"]`) &&
            !row.classList.contains('empty-form')
        );
        
        if (dataRows.length === 0) return false;
        
        // Get the header row to find the first data column
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return false;
        
        const headers = Array.from(headerRow.querySelectorAll('th'));
        // Find the first column after the "original" column (which is always first)
        // The first data column should be the second column (index 1)
        const firstDataColumnIndex = 1;
        
        // Keep header labels unchanged (no injected "Drag" text).
        
        // Inject drag handles into each data row
        dataRows.forEach((row, index) => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length > firstDataColumnIndex) {
                const firstDataCell = cells[firstDataColumnIndex];
                // Check if drag handle already exists
                if (!firstDataCell.querySelector(dragHandleClass)) {
                    const dragHandle = document.createElement('span');
                    dragHandle.className = dragHandleClass.replace('.', '');
                    dragHandle.innerHTML = '⋮⋮';
                    dragHandle.title = 'Drag to reorder';
                    dragHandle.style.cssText = 'cursor: grab; font-size: 18px; color: #417690; padding: 5px 10px; display: inline-block; vertical-align: middle;';
                    firstDataCell.insertBefore(dragHandle, firstDataCell.firstChild);
                }
            }
        });
        
        console.log(`✅ Injected drag handles for ${dataRows.length} rows in ${inputPattern} table`);
        return true;
    }
    
    // Generic drag-and-drop initialization
    function initDragDrop(orderFieldName, dragHandleClass, inputPattern) {
        // Find table by checking for specific input patterns
        const allTables = document.querySelectorAll('.inline-group table, table.tabular');
        let targetTable = null;
        
        console.log(`🔍 Looking for table with input pattern: ${inputPattern}`);
        for (const table of allTables) {
            const firstRow = table.querySelector('tbody tr');
            if (!firstRow) continue;
            
            if (firstRow.querySelector(`input[name^="${inputPattern}"]`)) {
                targetTable = table;
                console.log(`✅ Found target table for ${inputPattern}`);
                break;
            }
        }
        
        if (!targetTable) {
            console.log(`❌ No target table found for input pattern: ${inputPattern}`);
            return false;
        }
        
        // Inject drag handles first
        if (!injectDragHandles(targetTable, dragHandleClass, inputPattern)) {
            console.log(`❌ Failed to inject drag handles for ${inputPattern}`);
            return false;
        }
        
        const tbody = targetTable.querySelector('tbody');
        if (!tbody) {
            return false;
        }
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const dataRows = rows.filter(row => 
            !row.querySelector('th') && 
            row.querySelector(`input[name^="${inputPattern}"]`) &&
            !row.classList.contains('empty-form')
        );
        
        if (dataRows.length === 0) {
            return false;
        }
        
        console.log(`Found ${dataRows.length} draggable rows for ${orderFieldName}`);
        
        // Make rows draggable
        dataRows.forEach((row, index) => {
            row.draggable = true;
            row.style.cursor = 'move';
            
            // Find drag handle
            let handle = row.querySelector(dragHandleClass);
            if (handle) {
                handle.style.cursor = 'grab';
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });
            }
            
            // Drag start - HIGHLY OPTIMIZED
            row.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                row.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', '');
                // Use CSS class for opacity (defined in CSS file)
                row.style.opacity = '0.5';
                // Skip adding drag-target class - not needed for performance
            });
            
            // Drag end - OPTIMIZED
            row.addEventListener('dragend', (e) => {
                e.stopPropagation();
                row.classList.remove('dragging');
                row.style.opacity = '1';
                // Remove visual feedback - batch operation
                const dragOverRows = tbody.querySelectorAll('.drag-over, .drag-target');
                dragOverRows.forEach(r => {
                    r.classList.remove('drag-target', 'drag-over');
                });
                // Update order immediately
                updateOrder(tbody, orderFieldName);
            });
        });
        
        // Handle drag over - HIGHLY OPTIMIZED for performance
        let lastDragOverTarget = null;
        let lastHighlightedRow = null;
        let dragOverThrottle = null;
        let lastY = -1;
        
        tbody.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            
            const dragging = tbody.querySelector('.dragging');
            if (!dragging) return;
            
            // Skip if mouse hasn't moved significantly (reduce calculations)
            const currentY = e.clientY;
            if (Math.abs(currentY - lastY) < 5) {
                return;
            }
            lastY = currentY;
            
            // Throttle DOM updates aggressively
            if (dragOverThrottle) {
                return;
            }
            
            dragOverThrottle = requestAnimationFrame(() => {
                // Find insertion point
                const after = getDragAfterElement(tbody, currentY, dataRows);
                
                // Only update DOM if position actually changed
                if (after !== lastDragOverTarget) {
                    // Remove highlight from previous row (only if exists)
                    if (lastHighlightedRow) {
                        lastHighlightedRow.classList.remove('drag-over');
                        lastHighlightedRow = null;
                    }
                    
                    if (after == null) {
                        // Moving to end
                        const lastRow = dataRows[dataRows.length - 1];
                        if (lastRow !== dragging && dragging.nextSibling !== null) {
                            tbody.appendChild(dragging);
                            lastRow.classList.add('drag-over');
                            lastHighlightedRow = lastRow;
                        }
                    } else {
                        // Moving before a specific element
                        const targetRow = after.previousElementSibling && after.previousElementSibling !== dragging 
                            ? after.previousElementSibling 
                            : after;
                        
                        if (targetRow !== dragging && dragging.nextSibling !== after) {
                            tbody.insertBefore(dragging, after);
                            targetRow.classList.add('drag-over');
                            lastHighlightedRow = targetRow;
                        }
                    }
                    
                    lastDragOverTarget = after;
                }
                
                dragOverThrottle = null;
            });
        });
        
        // Handle drop
        tbody.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        return true;
    }
    
    // Helper: Find insertion point - HIGHLY OPTIMIZED
    function getDragAfterElement(container, y, dataRows) {
        // Use binary search-like approach for better performance
        let closest = null;
        let closestOffset = Number.NEGATIVE_INFINITY;
        
        // Only check rows that are likely candidates (skip if too far)
        for (let i = 0; i < dataRows.length; i++) {
            const child = dataRows[i];
            if (child.classList.contains('dragging')) {
                continue;
            }
            
            // Quick check - get bounding rect once
            const rect = child.getBoundingClientRect();
            const midPoint = rect.top + rect.height / 2;
            
            // Only process if mouse is above this element
            if (y < midPoint) {
                const offset = y - midPoint;
                if (offset > closestOffset) {
                    closestOffset = offset;
                    closest = child;
                }
            }
        }
        
        return closest;
    }
    
    // Update order fields
    function updateOrder(tbody, orderFieldName) {
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        const dataRows = allRows.filter(row => 
            !row.querySelector('th') && 
            row.querySelector('input, select') &&
            !row.classList.contains('empty-form')
        );
        
        dataRows.forEach((row, index) => {
            const orderInput = row.querySelector(`input[name$="-${orderFieldName}"]`);
            if (orderInput) {
                const oldValue = orderInput.value;
                orderInput.value = index + 1;
                if (oldValue != orderInput.value) {
                    console.log(`Updated ${orderFieldName} for row ${index + 1} from ${oldValue} to ${orderInput.value}`);
                    // Trigger change event for Django admin
                    orderInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
    }
    
    // Initialize Form Tabs drag-and-drop
    function initTabsDrag() {
        console.log('🔧 Attempting to initialize Form Tabs drag-and-drop...');
        const result = initDragDrop('order', '.drag-handle-tab', 'tabs-');
        if (result) {
            console.log('✅ Form Tabs drag-and-drop initialized');
            return true;
        } else {
            console.log('❌ Form Tabs drag-and-drop initialization failed');
            return false;
        }
    }
    
    // Initialize Form Sections drag-and-drop
    function initSectionsDrag() {
        console.log('🔧 Attempting to initialize Form Sections drag-and-drop...');
        const result = initDragDrop('order', '.drag-handle-section', 'sections-');
        if (result) {
            console.log('✅ Form Sections drag-and-drop initialized');
            return true;
        } else {
            console.log('❌ Form Sections drag-and-drop initialization failed');
            return false;
        }
    }
    
    // Initialize Form Fields drag-and-drop (enhance existing)
    function initFieldsDrag() {
        // Only initialize if admin-sections.js hasn't already done it
        const allTables = document.querySelectorAll('.inline-group table, table.tabular');
        for (const table of allTables) {
            const firstRow = table.querySelector('tbody tr');
            if (firstRow && firstRow.querySelector('input[name^="fields-"]')) {
                // Check if already initialized by admin-sections.js
                const rows = table.querySelectorAll('tbody tr');
                const hasDrag = Array.from(rows).some(row => row.draggable);
                
                if (!hasDrag) {
                    console.log('🔧 Initializing Form Fields drag-and-drop...');
                    if (initDragDrop('order', '.drag-handle', 'fields-')) {
                        console.log('✅ Form Fields drag-and-drop initialized');
                        return true;
                    }
                } else {
                    console.log('✅ Form Fields drag-and-drop already initialized by admin-sections.js');
                    return true;
                }
                break;
            }
        }
        return false;
    }
    
    // Initialize all drag-and-drop
    function initAll() {
        console.log('🔧 Initializing drag-and-drop...');
        setTimeout(() => {
            console.log('🔧 Starting drag-and-drop initialization...');
            const tabsResult = initTabsDrag();
            const sectionsResult = initSectionsDrag();
            const fieldsResult = initFieldsDrag();
            console.log('🔧 Initialization results:', {
                tabs: tabsResult,
                sections: sectionsResult,
                fields: fieldsResult
            });
        }, 1000);
    }
    
    // Run on DOM ready - with multiple attempts
    function tryInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initAll, 500);
                setTimeout(initAll, 1500);
                setTimeout(initAll, 2500);
            });
        } else {
            setTimeout(initAll, 500);
            setTimeout(initAll, 1500);
            setTimeout(initAll, 2500);
        }
    }
    
    tryInit();
    
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
            setTimeout(initAll, 800);
        }
    });
    
    // Listen for Django admin inline events
    if (window.django && window.django.jQuery) {
        window.django.jQuery(document).on('formset:added', function() {
            setTimeout(initAll, 500);
        });
    }
    
    // MutationObserver for dynamic changes
    const observer = new MutationObserver(function(mutations) {
        let shouldReinit = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
                shouldReinit = true;
            }
        });
        if (shouldReinit) {
            setTimeout(initAll, 500);
        }
    });
    
    const formContainer = document.querySelector('.inline-group') || document.querySelector('#content');
    if (formContainer) {
        observer.observe(formContainer, {
            childList: true,
            subtree: true
        });
    }
})();
