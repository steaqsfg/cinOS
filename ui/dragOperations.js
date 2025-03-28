// New file for window drag and drop operations
import { bringToFront, getOpenWindows, toggleMaximize, closeWindow } from './windowManager.js';
import { embedWindowInGroup } from './windowGroups.js';
import { updateTaskbarForGrouping, restoreTaskbarIconsOnUngroup, handleTabSwitchInTaskbar } from './groupTaskbarSync.js';
// Import snapping functions and config
import { SNAP_THRESHOLD } from '../config.js';
import { initSnapPreview, detectSnapZone, hideSnapPreview, applySnapAction } from './windowSnapping.js';
// Import grouping check/handle functions
import { checkWindowGrouping, handleWindowGrouping } from './windowGroupManager.js';

let draggedTabData = null;
let dragOverlay = null;
let potentialGroupWindows = null;
let activeDropTargetButton = null;

export function initDragOperations() {
    // Create drag overlay if it doesn't exist
    createDragOverlay();

    // Add event listeners for drag operations onto the document (for tab drags)
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
}

function createDragOverlay() {
    if (!dragOverlay) {
        dragOverlay = document.createElement('div');
        dragOverlay.className = 'drag-overlay';
        dragOverlay.style.display = 'none';
        document.body.appendChild(dragOverlay);
    }
}

// --- Dragging Setup (Moved from windowManager.js) ---
export function setupDragging(windowElement, titleBar, windowId, desktop, taskbar, openWindows) {
    let isDragging = false;
    let dragOffsetX, dragOffsetY;
    let startX, startY;
    let lastX, lastY;
    let snapZone = null;

    // Initialize snap preview if not already done elsewhere (idempotent check might be needed)
    initSnapPreview(desktop);

    titleBar.addEventListener('mousedown', (e) => {
        // Prevent drag on controls, right-click, or maximized windows
        if (e.button !== 0 || e.target.closest('.window-controls') || windowElement.classList.contains('maximized')) return;
        // Prevent drag if the window is embedded in a group
        if (windowElement.closest('.embedded-window')) return;

        isDragging = true;
        // bringToFront(windowId); // Already handled by window mousedown listener
        dragOffsetX = e.clientX - windowElement.offsetLeft;
        dragOffsetY = e.clientY - windowElement.offsetTop;
        startX = e.clientX;
        startY = e.clientY;
        lastX = windowElement.offsetLeft;
        lastY = windowElement.offsetTop;
        windowElement.classList.add('dragging');
        desktop.style.userSelect = 'none'; // Prevent text selection during drag

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;

        const taskbarHeight = taskbar.offsetHeight;
        const titlebarHeight = titleBar.offsetHeight;
        const desktopWidth = desktop.offsetWidth;
        const desktopHeight = desktop.offsetHeight - taskbarHeight;
        const windowWidth = windowElement.offsetWidth;
        const windowHeight = windowElement.offsetHeight;

        // --- Check for potential drop targets (like the '+' button) ---
        let currentTargetButton = null;
        // Use elementsFromPoint to see through the dragged window
        const elementsUnderCursor = document.elementsFromPoint(e.clientX, e.clientY);
        let targetAddButton = null;

        // Iterate through elements under cursor to find the '+' button
        for (const element of elementsUnderCursor) {
            // Ignore the dragged window itself
            if (element === windowElement) continue;

            targetAddButton = element.closest('.add-window-tab');
            if (targetAddButton) {
                // Found a '+' button, check if it belongs to a different group window
                const targetGroupWindow = targetAddButton.closest('.window');
                // Ensure target group isn't the window being dragged (can happen if dragging a group itself)
                if (targetGroupWindow && targetGroupWindow.id !== windowId) {
                     // Check if the window being dragged is already in this target group
                     const targetGroupData = openWindows[targetGroupWindow.id];
                     if (!targetGroupData?.groupMemberIds?.includes(windowId)) {
                         currentTargetButton = targetAddButton;
                         break; // Found valid target button
                     }
                }
                // If button belongs to same window or window already in group, reset targetAddButton
                targetAddButton = null;
            }
        }


        // Update active drop target highlighting
        if (currentTargetButton && currentTargetButton !== activeDropTargetButton) {
            activeDropTargetButton?.classList.remove('drop-target-active'); // Remove from previous
            activeDropTargetButton = currentTargetButton;
            activeDropTargetButton.classList.add('drop-target-active');
        } else if (!currentTargetButton && activeDropTargetButton) {
            // Moved off a target button
            activeDropTargetButton.classList.remove('drop-target-active');
            activeDropTargetButton = null;
        }

        // --- Check for Snap Zones (only if NOT over a valid drop target button) ---
        if (!activeDropTargetButton) {
            snapZone = detectSnapZone(e, desktopWidth, desktopHeight, taskbarHeight);
        } else {
            // If hovering over add button, disable snapping
            snapZone = null;
            hideSnapPreview();
        }

        // --- Check for Window Grouping (drag onto another window) ---
        // (Only if NOT snapping and NOT hovering over a valid add button)
        if (!snapZone && !activeDropTargetButton) {
            potentialGroupWindows = checkWindowGrouping(e, windowElement, windowId, newX, newY, openWindows); // Pass event 'e'
        } else {
            // If snapping or hovering over add button, disable window-on-window grouping
            potentialGroupWindows = null;
            // Ensure highlight is removed if we move away or start snapping/targeting add button
            if (windowElement.classList.contains('group-target')) {
                 windowElement.classList.remove('group-target');
                 // Remove highlights from potential targets too
                 for (const id in openWindows) {
                     if (openWindows[id]?.element?.classList.contains('group-highlight')) {
                         openWindows[id].element.classList.remove('group-highlight');
                     }
                 }
            }
        }


        // Constrain window movement to the desktop area
        newX = Math.max(-windowWidth + 50, Math.min(newX, desktopWidth - 50)); // Allow slight offscreen for edge access
        newY = Math.max(0, Math.min(newY, desktopHeight - titlebarHeight)); // Don't go under taskbar or above top

        windowElement.style.left = `${newX}px`;
        windowElement.style.top = `${newY}px`;

        lastX = newX;
        lastY = newY;
    }

    function onMouseUp(e) {
        if (!isDragging) return;

        isDragging = false;
        windowElement.classList.remove('dragging');
        desktop.style.userSelect = ''; // Re-enable text selection
        document.removeEventListener('mousemove', onMouseMove);

        // Priority: 1. Drop onto '+' button
        if (activeDropTargetButton) {
            const groupWindowElement = activeDropTargetButton.closest('.window');
            if (groupWindowElement && groupWindowElement.id) {
                // Call addWindowToGroup for the window being dragged (windowId)
                // and the target group window (groupWindowElement.id)
                addWindowToGroup(windowId, groupWindowElement.id, openWindows);
            }
            // Clean up highlight regardless of success
            activeDropTargetButton.classList.remove('drop-target-active');
            activeDropTargetButton = null;
        }
        // 2. Handle Snapping (if not dropped on '+')
        else if (snapZone) {
            applySnapAction(windowId, snapZone, openWindows, taskbar);
            hideSnapPreview(); // Hide preview after applying snap
        }
        // 3. Handle Window Grouping (drag onto another window, if not snapped or dropped on '+')
        else if (potentialGroupWindows && potentialGroupWindows.length > 0) {
            const groupContainerId = handleWindowGrouping(windowId, potentialGroupWindows, openWindows, desktop);
            if (groupContainerId) {
                console.log(`Created window group with container ID: ${groupContainerId}`);
            }
             // Clean up grouping highlights explicitly on mouse up
             for (const id in openWindows) {
                 if (openWindows[id]?.element?.classList.contains('group-highlight')) {
                     openWindows[id].element.classList.remove('group-highlight');
                 }
             }
            windowElement.classList.remove('group-target');
            potentialGroupWindows = null; // Reset potential group
        }
        // 4. No specific action, just clean up any lingering states
        else {
             // Ensure grouping highlights are cleared if no action was taken
             if (windowElement.classList.contains('group-target')) {
                 windowElement.classList.remove('group-target');
             }
             for (const id in openWindows) {
                 if (openWindows[id]?.element?.classList.contains('group-highlight')) {
                     openWindows[id].element.classList.remove('group-highlight');
                 }
             }
        }

        // Ensure snap preview is always hidden on mouse up if it wasn't handled by snapping
        if (!snapZone) {
            hideSnapPreview();
        }

        // Reset state variables
        snapZone = null;
        potentialGroupWindows = null;
        // activeDropTargetButton is reset within its own block or here if needed
        if (activeDropTargetButton) {
             activeDropTargetButton.classList.remove('drop-target-active');
             activeDropTargetButton = null;
        }
    }
}

// --- Resizing Setup (Moved from windowManager.js) ---
export function setupResizing(windowElement, windowId, bringToFront) {
    const resizeHandles = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
    const minWidth = 250;
    const minHeight = 150;

    resizeHandles.forEach(direction => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-${direction}`;
        windowElement.appendChild(handle);

        let startX, startY, startWidth, startHeight, startTop, startLeft;

        handle.addEventListener('mousedown', (e) => {
            // Prevent resize on maximized or embedded windows
            if (windowElement.classList.contains('maximized') || windowElement.closest('.embedded-window')) return;

            e.stopPropagation(); // Prevent window drag
            bringToFront(windowId); // Bring window to front on resize start

            startX = e.clientX;
            startY = e.clientY;
            startWidth = windowElement.offsetWidth;
            startHeight = windowElement.offsetHeight;
            startTop = windowElement.offsetTop;
            startLeft = windowElement.offsetLeft;

            windowElement.classList.add('resizing');
            document.documentElement.style.cursor = getComputedStyle(handle).cursor; // Set cursor globally
            const desktop = document.getElementById('desktop'); // Get desktop element reference
            if (desktop) desktop.style.userSelect = 'none'; // Prevent text selection

            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize, { once: true });
        });

        function resize(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newTop = startTop;
            let newLeft = startLeft;

            if (direction.includes('e')) {
                newWidth = Math.max(minWidth, startWidth + dx);
            }
            if (direction.includes('w')) {
                newWidth = Math.max(minWidth, startWidth - dx);
                newLeft = startLeft + startWidth - newWidth;
            }
            if (direction.includes('s')) {
                newHeight = Math.max(minHeight, startHeight + dy);
            }
            if (direction.includes('n')) {
                newHeight = Math.max(minHeight, startHeight - dy);
                newTop = startTop + startHeight - newHeight;
            }

            // Apply styles
            windowElement.style.width = `${newWidth}px`;
            windowElement.style.height = `${newHeight}px`;
            windowElement.style.top = `${newTop}px`;
            windowElement.style.left = `${newLeft}px`;
        }

        function stopResize() {
            windowElement.classList.remove('resizing');
            document.documentElement.style.cursor = ''; // Reset global cursor
            const desktop = document.getElementById('desktop'); // Get desktop element reference
            if (desktop) desktop.style.userSelect = ''; // Re-enable text selection
            document.removeEventListener('mousemove', resize);
        }
    });
}

// --- Tab Drag/Drop Specific Logic ---
export function setupAddWindowButtonDragTarget(addButton, groupWindowId, openWindows) {
    // Make the add button a drop target FOR TABS (window drops handled by setupDragging mousemove/mouseup)
    addButton.addEventListener('dragover', (e) => {
         // Check if the dragged data is a window tab
         if (e.dataTransfer.types.includes('application/window-tab')) {
            // Check if tab is from a different group
            const draggedWindowId = e.dataTransfer.getData('application/window-tab');
            const sourceGroupWindowId = draggedTabData?.groupWindowId;
            if (sourceGroupWindowId && sourceGroupWindowId !== groupWindowId && openWindows[draggedWindowId]) {
                e.preventDefault(); // Allow drop only if it's a valid tab move
                e.stopPropagation();
                addButton.classList.add('drop-target-active');
            }
         }
    });

    addButton.addEventListener('dragleave', (e) => {
         // Only remove if leaving the button itself
         if (!addButton.contains(e.relatedTarget)) {
            addButton.classList.remove('drop-target-active');
         }
    });

    addButton.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addButton.classList.remove('drop-target-active');

        // Get the dragged window ID from the data transfer (for tabs)
        const draggedWindowId = e.dataTransfer.getData('application/window-tab');

        // Only proceed if we have a valid window ID AND it's a tab drag
        if (draggedWindowId && openWindows[draggedWindowId] && e.dataTransfer.types.includes('application/window-tab')) {
            // Find the source group of the tab
            const sourceGroupWindowId = draggedTabData?.groupWindowId;
             if (sourceGroupWindowId && sourceGroupWindowId !== groupWindowId) {
                 // Move tab between groups (detach first, then add)
                 detachWindowFromGroup(draggedWindowId, sourceGroupWindowId, null, null, true); // true to skip bringing to front
                 addWindowToGroup(draggedWindowId, groupWindowId, openWindows);
             }
        }
        // draggedTabData is cleaned up in global drop/dragend handlers
    });
}

export function setupWindowTabDragHandles(tabs, groupWindowId, openWindows, desktop) {
    tabs.forEach(tab => {
        // Ensure draggable attribute exists or add it
        if (!tab.hasAttribute('draggable')) {
             tab.setAttribute('draggable', 'true');
        }

        // Use flags to prevent adding multiple listeners
        if (tab.dataset.dragListenersAdded === 'true') return;
        tab.dataset.dragListenersAdded = 'true';


        tab.addEventListener('dragstart', (e) => {
            const windowId = tab.dataset.windowId;
            if (!windowId || !openWindows[windowId]) {
                e.preventDefault(); // Prevent drag if invalid
                return;
            }

            // Store data about the dragged tab
            draggedTabData = {
                windowId,
                groupWindowId,
                rect: tab.getBoundingClientRect()
            };

            // Set the data transfer
            e.dataTransfer.setData('application/window-tab', windowId);
            e.dataTransfer.effectAllowed = 'move';

            // Create a ghosted visual for dragging
            try {
                const ghostEl = tab.cloneNode(true);
                ghostEl.style.position = 'absolute'; // Ensure it's positioned correctly for setDragImage
                ghostEl.style.left = '-9999px'; // Move offscreen initially
                ghostEl.style.opacity = '0.5';
                document.body.appendChild(ghostEl);
                // Offset slightly so cursor isn't directly over top-left corner
                e.dataTransfer.setDragImage(ghostEl, 10, 10);
                // Clean up ghost after a short delay
                setTimeout(() => {
                    if (ghostEl.parentNode) {
                        document.body.removeChild(ghostEl);
                    }
                }, 50); // Slightly longer delay
            } catch (error) {
                 console.error("Error creating drag image:", error);
                 // Fallback: Allow drag without custom image if error occurs
            }


            // Add dragging class with a slight delay to ensure ghost is set
            setTimeout(() => tab.classList.add('dragging'), 0);

            // Show drag overlay
            if(dragOverlay) dragOverlay.style.display = 'block';
        });

        tab.addEventListener('dragend', (e) => {
             // Use setTimeout to ensure drop handler finishes first
            setTimeout(() => {
                tab.classList.remove('dragging');
                // Only clear draggedTabData if this dragend corresponds to the active drag
                if (draggedTabData && draggedTabData.windowId === tab.dataset.windowId) {
                    draggedTabData = null;
                }
                // Hide drag overlay
                if(dragOverlay) dragOverlay.style.display = 'none';
                // Clean up desktop highlight just in case
                const desktopEl = document.getElementById('desktop');
                if (desktopEl) desktopEl.classList.remove('drag-over');
            }, 0);
        });
    });
}

function handleDragOver(e) {
    // Only handle window tab drags for desktop highlighting
    if (!draggedTabData || !e.dataTransfer.types.includes('application/window-tab')) return;

    e.preventDefault(); // Necessary to allow dropping

    const desktopEl = document.getElementById('desktop');
    if (!desktopEl) return;

    // Highlight the desktop when dragging over it (outside any window/taskbar)
    // Check if the target is the desktop itself or a direct child (like a window wrapper that failed)
    const directTargetIsDesktop = e.target === desktopEl;
    // Check if drop is over taskbar
    const isOverTaskbar = e.target.closest('#taskbar');
    // Check if drop is over an interactive element like another window or start menu
    const isOverInteractive = e.target.closest('.window, #start-menu');

    // Only add drag-over class if truly over the empty desktop area
    if (directTargetIsDesktop && !isOverTaskbar && !isOverInteractive) {
        desktopEl.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move'; // Indicate valid drop target
    } else {
        desktopEl.classList.remove('drag-over');
        // If over taskbar or other areas, might indicate 'none' or default effect
        // Check if over a valid ADD button target (handled by button's dragover)
        const isOverAddButton = e.target.closest('.add-window-tab.drop-target-active');
        if (!isOverAddButton) {
            e.dataTransfer.dropEffect = 'none'; // Indicate invalid drop target on non-desktop areas
        } else {
             e.dataTransfer.dropEffect = 'move'; // Allow drop on active add button
        }
    }
}

function handleDrop(e) {
    // This handles drops OUTSIDE specific targets like '+' buttons (those have their own drop handlers)
    // Primarily for detaching tabs by dropping onto desktop/taskbar.

    // Only handle window TAB drags ending on desktop/taskbar
    if (!draggedTabData || !e.dataTransfer.types.includes('application/window-tab')) {
         // If not a tab drag, ensure overlay/highlights are cleared just in case
         if(dragOverlay) dragOverlay.style.display = 'none';
         const desktopEl = document.getElementById('desktop');
         if (desktopEl) desktopEl.classList.remove('drag-over');
         return;
    }


    e.preventDefault();
    const desktopEl = document.getElementById('desktop');
    if (desktopEl) desktopEl.classList.remove('drag-over'); // Clean up desktop highlight

    // Check if dropped DIRECTLY on desktop or taskbar (areas indicating detachment)
    const dropTarget = e.target;
    const isDropOnDesktop = dropTarget.id === 'desktop';
    // More robust check for taskbar drop
    const isDropOnTaskbarArea = dropTarget.closest('#taskbar') ||
                               (e.clientY > window.innerHeight - document.getElementById('taskbar').offsetHeight);

    // Check if dropped on a specific drop target like an add button (should be handled there)
    const isDropOnAddButton = dropTarget.closest('.add-window-tab');

    if ((isDropOnDesktop || isDropOnTaskbarArea) && !isDropOnAddButton) {
        if (draggedTabData && draggedTabData.windowId && draggedTabData.groupWindowId) {
            // Calculate position relative to viewport, adjusted for potential drag image offset
             const dragImageOffsetX = 10; // Match setDragImage offset
             const dragImageOffsetY = 10; // Match setDragImage offset
             const dropX = e.clientX - dragImageOffsetX;
             const dropY = e.clientY - dragImageOffsetY;

            detachWindowFromGroup(draggedTabData.windowId, draggedTabData.groupWindowId, dropX, dropY);
        }
    }

    // Clean up tab drag data regardless of drop target (dragend will also try)
    // Use timeout to ensure dragend runs first if needed
    setTimeout(() => {
        draggedTabData = null;
        if(dragOverlay) dragOverlay.style.display = 'none';
    }, 0);
}

function addWindowToGroup(windowId, groupWindowId, openWindows) {
    const windowData = openWindows[windowId];
    const groupData = openWindows[groupWindowId];

    if (!windowData || !groupData || !groupData.element) {
        console.error("Cannot add to group: Invalid window or group data.");
        return;
    }

    // Prevent adding if it's already in the target group
    if (groupData.groupMemberIds && groupData.groupMemberIds.includes(windowId)) {
        console.warn("Window already in this group.");
        return;
    }

    // Prevent adding a group container to another group
    if (windowData.groupMemberIds) {
         console.warn("Cannot add a group container to another group.");
         return;
    }

     // Prevent adding a window to its own group (shouldn't happen with checks, but safety)
     if (windowId === groupWindowId) {
         console.warn("Cannot add a window to itself.");
         return;
     }

    console.log(`Adding window ${windowId} to group ${groupWindowId}`);

    // --- Prepare Group Data ---
    if (!groupData.groupMemberIds) {
        groupData.groupMemberIds = [];
    }
    // Ensure no duplicates
    if (!groupData.groupMemberIds.includes(windowId)) {
         groupData.groupMemberIds.push(windowId);
    }


    // --- Prepare Window Data ---
    // Save original state if it's not already saved (i.e., not from a previous group state)
    // Ensure we capture current rendered position/size if styles aren't set
    if (!windowData.originalGroupState) {
        const currentRect = windowData.element.getBoundingClientRect();
        const currentStyle = window.getComputedStyle(windowData.element);
        windowData.originalGroupState = {
            top: windowData.element.style.top || `${windowData.element.offsetTop}px`,
            left: windowData.element.style.left || `${windowData.element.offsetLeft}px`,
            width: windowData.element.style.width || `${currentRect.width}px`,
            height: windowData.element.style.height || `${currentRect.height}px`,
            zIndex: currentStyle.zIndex || '1' // Capture current z-index
        };
    }

    // --- DOM Manipulation ---
    const groupWindow = groupData.element;
    const tabsContainer = groupWindow.querySelector('.window-group-tabs');
    const contentContainer = groupWindow.querySelector('.window-tab-content');

    if (!tabsContainer || !contentContainer) {
        console.error("Group window structure invalid.");
         // Attempt to restore window if structure is broken
         restoreWindowToDesktop(windowId, openWindows);
        return;
    }

    // Create or find the tab for this window
    let tab = tabsContainer.querySelector(`.window-tab[data-window-id="${windowId}"]`);
    if (!tab) {
        tab = document.createElement('div');
        tab.className = 'window-tab';
        tab.dataset.windowId = windowId;
        tab.innerHTML = `<span>${windowData.title}</span>`;
        // tab.setAttribute('draggable', 'true'); // Draggability set by setupWindowTabDragHandles

        // Add the tab before the add button
        const addButtonContainer = tabsContainer.querySelector('.window-tab-actions');
        if (addButtonContainer) {
            tabsContainer.insertBefore(tab, addButtonContainer);
        } else {
            tabsContainer.appendChild(tab); // Fallback if actions container not found
        }


         // Make the new tab draggable and add listeners
         // Ensure desktop reference is valid
         const desktopEl = document.getElementById('desktop');
         if (desktopEl) {
            setupWindowTabDragHandles([tab], groupWindowId, openWindows, desktopEl);
         }

         // Add click listener for tab switching (if not already added by setupWindowTabDragHandles)
         if (!tab.dataset.clickListenerAdded) {
             tab.addEventListener('click', (e) => {
                  const clickedTab = e.currentTarget;
                  const targetWindowId = clickedTab.dataset.windowId;
                  if (!targetWindowId) return;

                  // Activate this tab
                  tabsContainer.querySelectorAll('.window-tab').forEach(t => t.classList.remove('active'));
                  clickedTab.classList.add('active');

                  // Show this window, hide others in the group
                  contentContainer.querySelectorAll('.embedded-window').forEach(win => {
                      win.style.display = (win.dataset.windowId === targetWindowId) ? 'flex' : 'none';
                  });

                  // Sync taskbar title
                  handleTabSwitchInTaskbar(targetWindowId, groupWindowId, openWindows);
             });
             tab.dataset.clickListenerAdded = 'true';
         }
    }


    // Embed the window if it's not already embedded IN THIS GROUP
    let wrapper = contentContainer.querySelector(`.embedded-window[data-window-id="${windowId}"]`);
    if (!wrapper) {
        // Remove window from desktop DOM if necessary
        if (windowData.element.parentNode === document.getElementById('desktop')) {
            windowData.element.parentNode.removeChild(windowData.element);
        }
         // Check if it's somehow still in another group's content (should have been detached first)
         const currentWrapper = windowData.element.closest('.embedded-window');
         if (currentWrapper && currentWrapper.closest('.window-tab-content') !== contentContainer) {
            console.warn(`Window ${windowId} was in another group's content; removing.`);
            currentWrapper.remove(); // Remove the old wrapper
            // Note: The window element itself might still be attached to the old wrapper in memory,
            // but appending it below should move it correctly.
         }

        wrapper = embedWindowInGroup(windowData.element, contentContainer, windowId);
    }

    // --- Update States ---
    // Update taskbar (hide individual icon, mark as grouped)
    updateTaskbarForGrouping([windowId], openWindows, groupWindowId);

    // Switch to the newly added tab
    tabsContainer.querySelectorAll('.window-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    contentContainer.querySelectorAll('.embedded-window').forEach(win => {
        win.style.display = (win.dataset.windowId === windowId) ? 'flex' : 'none';
    });
    handleTabSwitchInTaskbar(windowId, groupWindowId, openWindows); // Update taskbar title

    // Bring the group window to front
    bringToFront(groupWindowId);
}

function detachWindowFromGroup(windowId, groupWindowId, x, y, suppressBringToFront = false) {
    const openWindows = getOpenWindows();
    if (!windowId || !groupWindowId || !openWindows) {
        console.error("Cannot detach: Missing IDs or openWindows map.");
        return;
    }


    const windowData = openWindows[windowId];
    const groupData = openWindows[groupWindowId];

    if (!windowData || !groupData || !groupData.element) {
         console.error("Cannot detach: Invalid window or group data.");
         return;
    }

    // Check if window is actually in this group's members list
    const isMember = groupData.groupMemberIds?.includes(windowId);
    if (!isMember) {
        console.warn(`Window ${windowId} is not listed as a member of group ${groupWindowId}. Attempting removal anyway.`);
        // Proceed cautiously, maybe the list was out of sync.
    }

    console.log(`Detaching window ${windowId} from group ${groupWindowId}`);


    // --- Update Group Data ---
    if (groupData.groupMemberIds) {
        groupData.groupMemberIds = groupData.groupMemberIds.filter(id => id !== windowId);
    }

    // --- DOM Manipulation ---
    const groupWindow = groupData.element;
    const windowElement = windowData.element;
    const contentContainer = groupWindow.querySelector('.window-tab-content');
    const embeddedContainer = contentContainer?.querySelector(`.embedded-window[data-window-id="${windowId}"]`);
    const tab = groupWindow.querySelector(`.window-tab[data-window-id="${windowId}"]`);

    // Remove the tab
    if (tab && tab.parentNode) {
        tab.parentNode.removeChild(tab);
    } else if (tab) {
        console.warn(`Tab for ${windowId} found but has no parent.`);
    }

    // Move window element back to desktop
    const desktop = document.getElementById('desktop');
    if (!desktop) {
        console.error("Desktop element not found! Cannot detach window.");
        return; // Cannot proceed
    }

    // Remove from embedded container and add to desktop
    if (embeddedContainer && embeddedContainer.parentNode) {
        // Check if windowElement is actually a child before removing wrapper
        if (embeddedContainer.contains(windowElement)) {
            desktop.appendChild(windowElement); // Move element first
        } else {
             console.warn(`Window element ${windowId} not found within its wrapper.`);
             // If element isn't in wrapper, just try adding to desktop if not already there
             if (windowElement.parentNode !== desktop) {
                 desktop.appendChild(windowElement);
             }
        }
        embeddedContainer.parentNode.removeChild(embeddedContainer); // Remove the wrapper after moving element
    } else if (windowElement.parentNode !== desktop) {
        // If not in wrapper but also not on desktop, forcefully add to desktop
         console.warn(`Window ${windowId} not found in expected container or parent, adding to desktop.`);
        desktop.appendChild(windowElement);
    }


    // Restore window controls (ensure they exist first)
    const windowControls = windowElement.querySelector('.window-controls');
    if (windowControls) {
        windowControls.style.display = ''; // Use empty string to reset to CSS default
    } else {
        console.warn(`Window controls not found for ${windowId}`);
    }

    // --- Positioning & Sizing ---
     const taskbar = document.getElementById('taskbar');
     if (!taskbar) {
          console.error("Taskbar not found! Cannot calculate bounds.");
          // Position fallback
          x = x ?? 50;
          y = y ?? 50;
     } else {
         const desktopRect = desktop.getBoundingClientRect();
         const taskbarHeight = taskbar.offsetHeight;
         const titleBar = windowElement.querySelector('.title-bar');
         const titleBarHeight = titleBar?.offsetHeight || 35; // Estimate if needed

         let currentWidth = windowElement.offsetWidth;
         let currentHeight = windowElement.offsetHeight;

         // Restore original size if available
         if (windowData.originalGroupState?.width && windowData.originalGroupState?.height) {
             windowElement.style.width = windowData.originalGroupState.width;
             windowElement.style.height = windowData.originalGroupState.height;
             // Update current dimensions after applying style
             currentWidth = parseInt(windowData.originalGroupState.width);
             currentHeight = parseInt(windowData.originalGroupState.height);
         } else {
              // Ensure width/height styles are cleared if no original state, use rendered size
              windowElement.style.width = '';
              windowElement.style.height = '';
         }


         let finalX = x;
         let finalY = y;

        // If x, y provided (from drop), use them, otherwise restore original
        if (finalX == null || finalY == null) { // Check for null/undefined specifically
             if (windowData.originalGroupState?.left && windowData.originalGroupState?.top) {
                 finalX = parseInt(windowData.originalGroupState.left);
                 finalY = parseInt(windowData.originalGroupState.top);
             } else {
                 // Fallback position if no coordinates and no saved state
                 console.warn(`No drop coordinates or saved state for ${windowId}, using fallback position.`);
                 finalX = 50;
                 finalY = 50;
             }
        }

         // Constrain position within desktop bounds
         finalX = Math.max(0, Math.min(finalX, desktopRect.width - currentWidth));
         finalY = Math.max(0, Math.min(finalY, desktopRect.height - taskbarHeight - titleBarHeight)); // Keep title bar visible

         windowElement.style.left = `${finalX}px`;
         windowElement.style.top = `${finalY}px`;
     }


    // --- Update States ---
    restoreTaskbarIconsOnUngroup([windowId], openWindows);

    // Clear grouping flags
    delete windowData.isGrouped;
    delete windowData.groupParentId;
    delete windowData.originalGroupState; // Clear saved state

    // Bring window to front unless suppressed
    if (!suppressBringToFront) {
        bringToFront(windowId);
    }

    // --- Handle Empty Group ---
    // If last window in group (check remaining memberIds), close the group window
    if (groupData.groupMemberIds && groupData.groupMemberIds.length === 0) {
        console.log(`Closing empty group window ${groupWindowId}`);
        // Use a timeout to allow drop event/other updates to finish before closing
        setTimeout(() => closeWindow(groupWindowId), 0);
    }
     // If group still has members, activate the first remaining tab
     else if (groupData.groupMemberIds && groupData.groupMemberIds.length > 0) {
        // Find first remaining tab element
        const firstRemainingTabId = groupData.groupMemberIds[0];
        const firstRemainingTab = groupWindow.querySelector(`.window-tab[data-window-id="${firstRemainingTabId}"]`);
         if (firstRemainingTab) {
             // Defer click slightly to ensure DOM updates settle
             setTimeout(() => firstRemainingTab.click(), 0);
         } else {
             console.warn(`Could not find first remaining tab element for group ${groupWindowId}`);
         }
     }
}

function restoreWindowToDesktop(windowId, openWindows) {
     const windowData = openWindows[windowId];
     if (!windowData || !windowData.element) return;

      const desktop = document.getElementById('desktop');
      if (!desktop) {
          console.error("Desktop element not found! Cannot restore window.");
          return;
      }

     // Ensure it's on the desktop
     if (windowData.element.parentNode !== desktop) {
         // Check if it's in an embedded wrapper and remove first
         const wrapper = windowData.element.closest('.embedded-window');
         if (wrapper && wrapper.parentNode) {
             wrapper.parentNode.removeChild(wrapper);
         }
         desktop.appendChild(windowData.element);
     }

     // Restore position/size if possible
     if (windowData.originalGroupState) {
         windowData.element.style.top = windowData.originalGroupState.top;
         windowData.element.style.left = windowData.originalGroupState.left;
         windowData.element.style.width = windowData.originalGroupState.width;
         windowData.element.style.height = windowData.originalGroupState.height;
     } else {
          // Minimal fallback if no state
          windowData.element.style.top = '50px';
          windowData.element.style.left = '50px';
          windowData.element.style.width = '';
          windowData.element.style.height = '';
     }

     // Restore taskbar
     restoreTaskbarIconsOnUngroup([windowId], openWindows);

     // Clear flags
     delete windowData.isGrouped;
     delete windowData.groupParentId;
     delete windowData.originalGroupState;

     // Restore controls
     const controls = windowData.element.querySelector('.window-controls');
     if(controls) controls.style.display = '';

     bringToFront(windowId);
}