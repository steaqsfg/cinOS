// ui/windowManager.js - Handles window creation, management, and interactions

import { WINDOW_DEFAULTS, ANIMATION_SPEED } from '../config.js';
import { createTaskbarIcon, removeTaskbarIcon, updateTaskbarIconState } from './taskbar.js';
import { restoreTaskbarIconsOnUngroup } from './groupTaskbarSync.js';
import { setupDragging, setupResizing } from './dragOperations.js'; 
import { updateTaskbarForGrouping } from './groupTaskbarSync.js';
import { checkWindowGrouping, handleWindowGrouping } from './windowGroupManager.js';
import { initSnapPreview, detectSnapZone, hideSnapPreview, applySnapAction } from './windowSnapping.js';

const desktop = document.getElementById('desktop');
const taskbar = document.getElementById('taskbar');
const windowTemplate = document.getElementById('window-template');

let highestZIndex = 100; // Start window z-index well above desktop icons
let openWindows = {}; // { id: { element, title, taskbarIconId, isMinimized, originalState, isFolderView?, folderData? } }
let activeWindowId = null;
let potentialGroupWindows = null; // For tracking potential window grouping

// --- Exported Functions ---

export function getOpenWindows() {
    return openWindows;
}

export function getActiveWindowId() {
    return activeWindowId;
}

export function updateWallpaper(backgroundStyle) {
    // Apply with animation frame to ensure smooth transition
    requestAnimationFrame(() => {
        desktop.style.background = backgroundStyle;
        // Optionally store in a CSS variable if preferred for cascading
        document.documentElement.style.setProperty('--current-wallpaper', backgroundStyle);
    });
}

export function bringToFront(windowId) {
    if (!openWindows[windowId]) return;

    const windowData = openWindows[windowId];
    const isCurrentlyActive = activeWindowId === windowId;

    // If the window is already active and not minimized, do nothing extra for z-index/focus
    if (isCurrentlyActive && !windowData.isMinimized) {
        return;
    }

    // --- Z-Index Update ---
    // Only increase z-index if it's not already the highest non-minimized window
    let needsZIndexUpdate = true;
    if (!isCurrentlyActive) { // If activating a different window
        let currentTopZ = 0;
        for (const id in openWindows) {
            if (!openWindows[id].isMinimized) {
                currentTopZ = Math.max(currentTopZ, parseInt(openWindows[id].element.style.zIndex || 0));
            }
        }
         if (parseInt(windowData.element.style.zIndex || 0) === currentTopZ) {
             needsZIndexUpdate = false; // It's already visually on top
         }
    }

    if (needsZIndexUpdate) {
        highestZIndex++;
        windowData.element.style.zIndex = highestZIndex;
    }


    // --- Focus Styling Update ---
    if (!isCurrentlyActive) {
        // Remove focus from previously active window (if any)
        if (activeWindowId && openWindows[activeWindowId]) {
            openWindows[activeWindowId].element.classList.remove('focused');
            updateTaskbarIconState(openWindows[activeWindowId].taskbarIconId, 'inactive');
        }
        // Apply focus to the new window
        windowData.element.classList.add('focused');
        updateTaskbarIconState(windowData.taskbarIconId, 'active');
        activeWindowId = windowId;
    }

    // --- Restore if Minimized ---
    if (windowData.isMinimized) {
        windowData.element.classList.remove('window-hidden');
        windowData.isMinimized = false;
        updateTaskbarIconState(windowData.taskbarIconId, 'active'); // Ensure active after restore
         // Re-apply focus class explicitly after restoring animations might interfere
         windowData.element.classList.add('focused');
    }
}

export function createWindow(
    title = WINDOW_DEFAULTS.title,
    contentHTML = WINDOW_DEFAULTS.content,
    options = {} // Allow passing width/height/etc.
) {
    const windowId = `window-${Date.now()}`;
    const taskbarIconId = `tbicon-${windowId}`;
    const windowClone = windowTemplate.content.cloneNode(true);
    const windowElement = windowClone.querySelector('.window');
    const titleBar = windowElement.querySelector('.title-bar');
    const titleElement = windowElement.querySelector('.title');
    const contentElement = windowElement.querySelector('.content');
    const closeButton = windowElement.querySelector('.close');
    const minimizeButton = windowElement.querySelector('.minimize');
    const maximizeButton = windowElement.querySelector('.maximize');

    windowElement.id = windowId;
    titleElement.textContent = title;
    contentElement.innerHTML = contentHTML; // Set content immediately

    // Apply custom options or defaults
    const initialWidth = options.width || WINDOW_DEFAULTS.width;
    const initialHeight = options.height || WINDOW_DEFAULTS.height;
    const initialTop = options.top || WINDOW_DEFAULTS.top;
    const initialLeft = options.left || WINDOW_DEFAULTS.left;

    // Initial state & position
    windowElement.style.opacity = '0';
    windowElement.style.transform = 'scale(0.95)';
    const openCount = Object.keys(openWindows).length;
    const offset = (openCount % 10) * 25; // Cascade new windows
    windowElement.style.top = `${initialTop + offset}px`;
    windowElement.style.left = `${initialLeft + offset}px`;
    windowElement.style.width = `${initialWidth}px`;
    windowElement.style.height = `${initialHeight}px`;
    windowElement.style.zIndex = highestZIndex + 1; // Start above current highest

    // Store window info BEFORE creating taskbar icon
    openWindows[windowId] = {
        element: windowElement,
        title: title,
        taskbarIconId: taskbarIconId,
        isMinimized: false,
        originalState: null,
        isClosed: false // Add isClosed flag
        // Folder-specific properties might be added by folderView logic if needed
    };

    // Create Taskbar Icon via Taskbar Module
    createTaskbarIcon(taskbarIconId, windowId, title);

    // Bring window to front on click/drag start
    windowElement.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.window-controls')) {
             bringToFront(windowId);
        }
    }, true);

    // Setup Dragging and Resizing
    setupDragging(windowElement, titleBar, windowId, desktop, taskbar, openWindows);
    setupResizing(windowElement, windowId, bringToFront); // Pass only needed args

    // --- Window Controls ---
    closeButton.addEventListener('click', () => closeWindow(windowId));
    minimizeButton.addEventListener('click', () => minimizeWindow(windowId));
    maximizeButton.addEventListener('click', () => toggleMaximize(windowId));
    titleBar.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.window-controls')) {
            toggleMaximize(windowId);
        }
    });

    desktop.appendChild(windowElement);
    console.log(`Window created: ${windowId} - ${title}`);

    // Trigger opening animation and bring to front
    requestAnimationFrame(() => {
        windowElement.style.opacity = '1';
        windowElement.style.transform = 'scale(1)';
        bringToFront(windowId); // Set initial focus and z-index
    });

    return windowId;
}

export function closeWindow(windowId) {
    const windowData = openWindows[windowId];
    // Prevent closing if already closing or doesn't exist
    if (!windowData || windowData.isClosing) return;

    windowData.isClosing = true; // Mark as closing
    windowData.isClosed = true; // Mark as closed for task manager etc.

    // Check if this window is in a group
    if (windowData.element.closest('.embedded-window')) {
        // TODO: Handle closing window from within a group (detach?)
        console.warn(`Closing window ${windowId} from within a group is not fully handled yet.`);
        // For now, just remove it visually and from group data
        const groupContainer = windowData.element.closest('.window-group-container');
        const groupWindowId = groupContainer?.closest('.window')?.id;
        if (groupWindowId && openWindows[groupWindowId] && openWindows[groupWindowId].groupMemberIds) {
             openWindows[groupWindowId].groupMemberIds = openWindows[groupWindowId].groupMemberIds.filter(id => id !== windowId);
             // Remove tab and embedded content
             const tab = groupContainer.querySelector(`.window-tab[data-window-id="${windowId}"]`);
             if (tab) tab.remove();
             const embedWrapper = groupContainer.querySelector(`.embedded-window[data-window-id="${windowId}"]`);
             if (embedWrapper) embedWrapper.remove();
             // Activate next tab if needed?
        }
        // Don't proceed with standard close animation/taskbar removal for embedded windows for now
        delete openWindows[windowId]; // Remove from map directly
        return;
    }

    // Check if this is a group container window being closed
    if (windowData.groupMemberIds) {
        restoreWindowsFromGroup(windowId); // Restore members first
    }

    // Fade out window
    windowData.element.style.opacity = '0';
    windowData.element.style.transform = 'scale(0.9)';
    windowData.element.style.pointerEvents = 'none';

    // Animate taskbar icon removal via taskbar module
    removeTaskbarIcon(windowData.taskbarIconId);

    // Remove after transition
    setTimeout(() => {
         if (windowData.element.parentNode) {
             windowData.element.remove();
         }
        delete openWindows[windowId]; // Remove from map
        console.log(`Window closed: ${windowId}`);

        // Activate the next highest window if the closed one was active
        if (activeWindowId === windowId) {
            activeWindowId = null;
            activateNextHighestWindow();
        } else {
             // Recalculate highestZIndex if needed
             recalculateHighestZIndex();
        }

    }, ANIMATION_SPEED);
}

export function minimizeWindow(windowId) {
    const windowData = openWindows[windowId];
    if (!windowData || windowData.isMinimized) return;

    windowData.element.classList.add('window-hidden'); // Hide window visually
    windowData.element.classList.remove('focused');   // Remove focus style
    windowData.isMinimized = true;

    // Update taskbar icon state via taskbar module
    updateTaskbarIconState(windowData.taskbarIconId, 'minimized');

    console.log(`Window minimized: ${windowId}`);

    // If the minimized window was active, activate the next highest one
    if (activeWindowId === windowId) {
        activeWindowId = null;
        activateNextHighestWindow();
    }
}

export function toggleMaximize(windowId) {
    const windowData = openWindows[windowId];
    if (!windowData) return;

    const windowElement = windowData.element;
    const taskbarHeight = taskbar.offsetHeight;
    const maximizeButton = windowElement.querySelector('.maximize'); // Ensure this is correct

    bringToFront(windowId); // Ensure it's focused and on top

    if (windowElement.classList.contains('maximized')) {
        // --- Restore ---
        if (windowData.originalState) {
            // Restore styles - Transitions are handled by CSS when the class is removed
            windowElement.style.top = windowData.originalState.top;
            windowElement.style.left = windowData.originalState.left;
            windowElement.style.width = windowData.originalState.width;
            windowElement.style.height = windowData.originalState.height;
            windowData.originalState = null; // Clear the saved state

            // Remove the maximized class - CSS transitions will animate the change
            windowElement.classList.remove('maximized');

        } else {
             // Fallback if no original state (shouldn't happen often)
             windowElement.style.top = `${WINDOW_DEFAULTS.top}px`;
             windowElement.style.left = `${WINDOW_DEFAULTS.left}px`;
             windowElement.style.width = `${WINDOW_DEFAULTS.width}px`;
             windowElement.style.height = `${WINDOW_DEFAULTS.height}px`;
             windowElement.classList.remove('maximized');
        }
         console.log(`Window restored: ${windowId}`);

    } else {
        // --- Maximize ---
        // Save current state *before* changing styles
        windowData.originalState = {
            top: windowElement.style.top,
            left: windowElement.style.left,
            width: windowElement.offsetWidth + 'px', // Use offsetWidth/Height for current rendered size
            height: windowElement.offsetHeight + 'px'
        };

        // Apply maximized styles (inline styles take precedence, but class adds others)
        windowElement.style.top = '0px';
        windowElement.style.left = '0px';
        windowElement.style.width = '100%';
        windowElement.style.height = `calc(100% - ${taskbarHeight}px)`;

         // Add class - transition happens via CSS
         windowElement.classList.add('maximized');
        console.log(`Window maximized: ${windowId}`);
    }
}

// --- Internal Helper Functions ---

function activateNextHighestWindow() {
    let topZ = -1;
    let nextActiveId = null;
    for (const id in openWindows) {
        if (!openWindows[id].isMinimized) {
            const z = parseInt(openWindows[id].element.style.zIndex || 0);
            if (z > topZ) {
                topZ = z;
                nextActiveId = id;
            }
        }
    }
    if (nextActiveId) {
        bringToFront(nextActiveId);
    } else {
        // No non-minimized windows left
        // activeWindowId = null; // Handled by bringToFront
        highestZIndex = 1; // Reset base z-index
    }
}

function recalculateHighestZIndex() {
     let currentMaxZ = 0;
     for (const id in openWindows) {
         // Consider only non-minimized, non-closing windows
         if (openWindows[id].element && !openWindows[id].isMinimized && !openWindows[id].isClosing) {
             currentMaxZ = Math.max(currentMaxZ, parseInt(openWindows[id].element.style.zIndex || 0));
         }
     }
     highestZIndex = Math.max(100, currentMaxZ); // Ensure it starts at 100
}

function restoreWindowsFromGroup(groupWindowId) {
    const groupWindow = openWindows[groupWindowId];
    if (!groupWindow || !groupWindow.groupMemberIds) return;

    // Get all non-closed windows from group
    const windowsToRestore = groupWindow.groupMemberIds.filter(id =>
        openWindows[id] && !openWindows[id].isClosed); // Check isClosed flag

    // Restore taskbar icons first
    restoreTaskbarIconsOnUngroup(windowsToRestore, openWindows);

    // Restore windows to desktop
    windowsToRestore.forEach(id => {
        const windowData = openWindows[id];
        if (!windowData || !windowData.element) return;

        // If the window was marked as closed *while* in the group, skip restoration
        if (windowData.isClosed) {
            console.log(`Skipping restoration of window ${id} as it was closed within the group.`);
            // Ensure it's fully removed from openWindows map if not already handled
            if (openWindows[id]) delete openWindows[id];
            return;
        }

        // Show controls again
        const windowControls = windowData.element.querySelector('.window-controls');
        if (windowControls) {
            windowControls.style.display = '';
        }

        // Restore original position and size
        if (windowData.originalGroupState) {
            windowData.element.style.top = windowData.originalGroupState.top;
            windowData.element.style.left = windowData.originalGroupState.left;
            windowData.element.style.width = windowData.originalGroupState.width;
            windowData.element.style.height = windowData.originalGroupState.height;
            windowData.element.style.zIndex = windowData.originalGroupState.zIndex || (highestZIndex + 1); // Restore or set new zIndex
            delete windowData.originalGroupState;
        } else {
             // Fallback positioning if no state saved
             windowData.element.style.top = `${WINDOW_DEFAULTS.top}px`;
             windowData.element.style.left = `${WINDOW_DEFAULTS.left}px`;
             windowData.element.style.width = `${WINDOW_DEFAULTS.width}px`;
             windowData.element.style.height = `${WINDOW_DEFAULTS.height}px`;
             windowData.element.style.zIndex = highestZIndex + 1;
        }
         highestZIndex = Math.max(highestZIndex, parseInt(windowData.element.style.zIndex));

        // Remove grouping flags
        delete windowData.isGrouped;
        delete windowData.groupParentId;

        // Add back to desktop DOM if not already there
        if (windowData.element.parentNode !== desktop) {
             // Check if it's still in an embedded wrapper and remove first
             const wrapper = windowData.element.closest('.embedded-window');
             if (wrapper && wrapper.parentNode) {
                 wrapper.parentNode.removeChild(wrapper);
             }
             desktop.appendChild(windowData.element);
        }
    });
}