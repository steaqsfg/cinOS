// Main script - Imports modules, initializes UI, handles interactions

import { WINDOW_DEFAULTS, DEFAULT_WALLPAPER_ID, WALLPAPER_OPTIONS } from './config.js';
import { initStartMenu, closeStartMenu } from './ui/startMenu.js';
import { initTaskbar } from './ui/taskbar.js';
import { createWindow, bringToFront, getOpenWindows, getActiveWindowId, updateWallpaper, closeWindow } from './ui/windowManager.js';
import { checkTaskConsistency } from './ui/groupTaskbarSync.js';
import { initDragOperations } from './ui/dragOperations.js';
import { initDesktop, openItem } from './ui/desktopManager.js';
import './ui/folderView.js'; // Ensure folderView module is loaded

// --- DOM Elements ---
const desktop = document.getElementById('desktop');
const startMenuApps = document.querySelector('.start-menu-apps');

// --- Initialization ---
initStartMenu();
initTaskbar();
loadWallpaper(); // Load saved or default wallpaper
initDragOperations(); // Initialize drag and drop operations for windows/tabs/icons
initDesktop(); // Initialize desktop icons and context menu

// Initialize task consistency checker
setInterval(() => {
    const consistencyCheck = checkTaskConsistency(getOpenWindows());
    console.log("System health check: " + (consistencyCheck ? "OK" : "Issues detected"));
}, 30000); // Check every 30 seconds

// --- Initial Window ---
// createWindow("Welcome to cniOS!", `<p>This is a basic window...</p>`); // Example

// --- Event Listeners ---

// Start Menu App Launcher
startMenuApps.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const appName = e.target.textContent;
        const openWindows = getOpenWindows(); // Get current open windows from windowManager
        let existingWindowId = null;

        // Check if a window with this title already exists AND IS NOT MINIMIZED
        for (const id in openWindows) {
            // Find existing, non-grouped, non-closed window
            if (openWindows[id].title === appName && !openWindows[id].isClosed && !openWindows[id].isGrouped) {
                existingWindowId = id;
                break;
            }
        }

        if (existingWindowId) {
            bringToFront(existingWindowId);
        } else {
            // Create new window based on appName
            let content = `<p>Content for <strong>${appName}</strong>.</p>`;
            let windowOptions = {}; // Default options

            if (appName === 'Settings') {
                content = generateSettingsContent();
            } else if (appName === 'Task Manager') {
                content = generateTaskManagerContent();
                windowOptions = { width: 550, height: 450 }; // Slightly larger for task manager
            } else if (appName === 'Text Editor') {
                // Open a new blank text file item which opens the editor
                // This needs a function in desktopManager to create a temporary item or directly open editor
                // For now, let's just create an empty editor window directly
                content = `
                    <div class="text-editor-content" data-file-id="">
                        <textarea class="editor-area" spellcheck="false"></textarea>
                        <div class="editor-statusbar"><span>New File</span></div>
                    </div>`;
                // Maybe add setupTextEditor call here if not linked to a file?
            }

            createWindow(appName, content, windowOptions);
        }
        closeStartMenu(); // Close start menu after launching or focusing
    }
});

// Desktop Click Handler
desktop.addEventListener('click', (e) => {
    const startMenu = document.getElementById('start-menu');
    // If click is directly on desktop (not taskbar, window, icon or start menu elements)
    if (e.target === desktop) {
        // Close start menu if open
        if (startMenu && (startMenu.style.opacity === '1')) {
            closeStartMenu();
        }
        // Deselect any focused window
        const activeWindowId = getActiveWindowId();
        const openWindows = getOpenWindows();
        if (activeWindowId && openWindows[activeWindowId]) {
            // Find the associated taskbar icon ID if it exists
            const taskbarIconId = openWindows[activeWindowId].taskbarIconId;
            const taskbarIcon = taskbarIconId ? document.getElementById(taskbarIconId) : null;

            openWindows[activeWindowId].element.classList.remove('focused');
            if(taskbarIcon) { // Check if taskbar icon exists
                taskbarIcon.classList.remove('active');
            }
            // Let windowManager handle setting activeWindowId to null internally if needed
            // For now, maybe force it null here, though less ideal separation
            // activeWindowId = null; // This assignment won't affect the original in windowManager directly
        }
    }
    // Handle wallpaper selection click if event bubbles up to desktop
    else if (e.target.classList.contains('wallpaper-option')) {
        handleWallpaperSelection(e.target);
    }
    // DesktopManager's click handler handles icon deselection and context menu hiding
});

// Prevent default drag behavior for images/links
desktop.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'A') {
        e.preventDefault();
    }
    // Allow dragging desktop icons (handled by desktopManager)
    if (e.target.classList.contains('desktop-icon')) {
        // Let desktopManager handle it
        return;
    }
    // Prevent other drags unless specifically allowed
    // e.preventDefault(); // Maybe too broad?
});

// --- Wallpaper Logic ---

function generateSettingsContent() {
    const currentWallpaperId = localStorage.getItem('cniOSWallpaperId') || DEFAULT_WALLPAPER_ID;
    let optionsHTML = WALLPAPER_OPTIONS.map(wp => `
        <div class="wallpaper-option ${wp.id === currentWallpaperId ? 'selected' : ''}"
             data-wallpaper-id="${wp.id}"
             style="background: ${wp.value};"
             title="${wp.name}">
        </div>
    `).join('');

    return `
        <div class="settings-content">
            <h3>Appearance</h3>
            <h4>Wallpaper</h4>
            <div class="wallpaper-options">
                ${optionsHTML}
            </div>
        </div>
    `;
}

function handleWallpaperSelection(selectedOptionElement) {
     const wallpaperId = selectedOptionElement.dataset.wallpaperId;
     const selectedWallpaper = WALLPAPER_OPTIONS.find(wp => wp.id === wallpaperId);

     if (selectedWallpaper) {
         updateWallpaper(selectedWallpaper.value);
         localStorage.setItem('cniOSWallpaperId', wallpaperId);
         localStorage.setItem('cniOSWallpaperValue', selectedWallpaper.value);

         // Update selection state in the settings window
         const optionsContainer = selectedOptionElement.closest('.wallpaper-options');
         if (optionsContainer) {
             optionsContainer.querySelectorAll('.wallpaper-option').forEach(opt => {
                 opt.classList.remove('selected');
             });
             selectedOptionElement.classList.add('selected');
         }
     }
}

function loadWallpaper() {
    const savedWallpaperValue = localStorage.getItem('cniOSWallpaperValue');
    if (savedWallpaperValue) {
        updateWallpaper(savedWallpaperValue);
    } else {
        // Apply default if nothing is saved
        const defaultWallpaper = WALLPAPER_OPTIONS.find(wp => wp.id === DEFAULT_WALLPAPER_ID);
        if (defaultWallpaper) {
             updateWallpaper(defaultWallpaper.value);
             // Optionally save the default value so it persists
             localStorage.setItem('cniOSWallpaperId', DEFAULT_WALLPAPER_ID);
             localStorage.setItem('cniOSWallpaperValue', defaultWallpaper.value);
        }
    }
}

// --- Task Manager Logic ---

function generateTaskManagerContent() {
    // ... (existing Task Manager content generation)
    return `
        <div class="task-manager-content">
            <h3>System Tasks</h3>
            <div class="task-list-container">
                <table class="task-list">
                    <thead>
                        <tr>
                            <th>Task Name</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="task-list-body">
                        <!-- Tasks will be populated by updateTaskManager() -->
                    </tbody>
                </table>
            </div>
            <div class="task-stats">
                <div class="stat-item">
                    <span class="stat-label">Windows:</span>
                    <span class="stat-value" id="windows-count">0</span>
                </div>
                 <!-- Removed Memory stat -->
            </div>
            <button id="refresh-tasks" class="task-manager-button">Refresh</button>
        </div>
    `;
}

function updateTaskManager() {
    const taskListBody = document.getElementById('task-list-body');
    const windowsCountEl = document.getElementById('windows-count'); // Renamed variable

    // Check if task manager window content exists in the DOM
    if (!document.getElementById('task-list-body')) return; // Exit if TM not open
    if (!taskListBody || !windowsCountEl) return; // Should exist if check above passed

    const openWindows = getOpenWindows();
    // Filter out grouped windows from the count/list? Or show them differently?
    // For now, count all non-closed windows.
    const windowCount = Object.values(openWindows).filter(w => !w.isClosed).length;

    // Clear existing tasks
    taskListBody.innerHTML = '';

    // Add each window as a task
    for (const id in openWindows) {
        const win = openWindows[id];
        if (win.isClosed) continue; // Skip closed windows

        // Determine status based on state
        let statusText = 'Running';
        let statusClass = 'running';
        if (win.isMinimized) {
            statusText = 'Minimized';
            statusClass = 'suspended';
        } else if (getActiveWindowId() === id) {
            statusText = 'Active';
            statusClass = 'active';
        } else if (win.isGrouped) {
             statusText = 'Grouped';
             // Decide on a class for grouped, maybe reuse running or suspended?
             statusClass = 'suspended'; // Or create a specific 'grouped' style
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${win.title} ${win.isGrouped ? '(Grouped)' : ''}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="task-action focus-btn" data-window-id="${id}" ${win.isGrouped ? 'disabled' : ''}>Focus</button>
                <button class="task-action end-btn" data-window-id="${id}">End Task</button>
            </td>
        `;

        taskListBody.appendChild(row);
    }

    // Update stats
    windowsCountEl.textContent = windowCount;

    // Add event listeners to buttons (using event delegation on tbody is more efficient)
    taskListBody.querySelectorAll('.focus-btn').forEach(btn => {
         // Re-add listener (or use delegation)
         btn.addEventListener('click', () => {
             const windowId = btn.dataset.windowId;
             const winData = getOpenWindows()[windowId];
             if (winData && !winData.isGrouped) { // Only focus non-grouped
                 bringToFront(windowId);
             } else if (winData && winData.isGrouped && winData.groupParentId) {
                 // If grouped, bring parent group to front and switch tab
                 bringToFront(winData.groupParentId);
                 // We need a way to switch tab here - perhaps modify bringToFront for groups?
                 // Or add a new function activateGroupTab(groupId, memberId)
             }
         });
    });

    taskListBody.querySelectorAll('.end-btn').forEach(btn => {
         // Re-add listener (or use delegation)
         btn.addEventListener('click', () => {
             const windowId = btn.dataset.windowId;
             if (windowId && getOpenWindows()[windowId]) {
                 closeWindow(windowId);
                 // No need for manual refresh here if interval is running
             }
         });
    });
}

// Set up task manager refresh
document.addEventListener('click', e => {
    if (e.target.id === 'refresh-tasks') {
        updateTaskManager();
    }
});

// Create an interval to auto-refresh the task manager
let taskManagerInterval = null;
let taskManagerObserver = null; // Store observer instance

function startTaskManagerUpdates() {
    // Initial update
    updateTaskManager();

    // Clear any existing interval
    if (taskManagerInterval) clearInterval(taskManagerInterval);

    // Set up auto-refresh every 1 second
    taskManagerInterval = setInterval(updateTaskManager, 1000);
    console.log("Task Manager interval started.");
}

function stopTaskManagerUpdates() {
    if (taskManagerInterval) {
        clearInterval(taskManagerInterval);
        taskManagerInterval = null;
        console.log("Task Manager interval stopped.");
    }
}

// Use MutationObserver to detect when Task Manager window is added/removed
taskManagerObserver = new MutationObserver(mutations => {
    let tmOpened = false;
    let tmClosed = false;

    mutations.forEach(mutation => {
        // Check added nodes
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.querySelector('.task-manager-content')) {
                tmOpened = true;
            }
        });
        // Check removed nodes
        mutation.removedNodes.forEach(node => {
            if (node.nodeType === 1 && node.querySelector('.task-manager-content')) {
                tmClosed = true;
            }
        });
    });

    if (tmOpened) {
        startTaskManagerUpdates();
    } else if (tmClosed) {
        stopTaskManagerUpdates();
    }
});

// Start observing desktop for window additions/removals
taskManagerObserver.observe(desktop, { childList: true });