// windowGroups.js - Handles window grouping (tabbed windows) functionality

import { bringToFront, closeWindow } from './windowManager.js';
import { updateTaskbarForGrouping, handleTabSwitchInTaskbar, restoreTaskbarIconsOnUngroup } from './groupTaskbarSync.js';

let groupWindows = {}; // Track group windows by ID

export function createWindowGroup(mainWindowId, groupWindowIds, openWindows) {
    if (!openWindows[mainWindowId]) return;
    
    // Check if any of the windows are already part of a group
    if (openWindows[mainWindowId].element.closest('.embedded-window')) {
        console.warn("Main window is already part of a group");
        return;
    }
    
    // Filter out invalid windows and windows already in groups
    const validGroupWindowIds = groupWindowIds.filter(id => {
        if (!openWindows[id]) return false;
        if (id === mainWindowId) return false; // Prevent self-grouping
        if (openWindows[id].element.closest('.embedded-window')) return false;
        return true;
    });
    
    if (validGroupWindowIds.length === 0) {
        console.warn("No valid windows to group");
        return;
    }
    
    const mainWindow = openWindows[mainWindowId];
    const groupId = `group-${Date.now()}`;
    
    // Create tabs for windows, now without close buttons
    const tabsHTML = `
        <div class="window-group-tabs">
            ${[mainWindowId, ...validGroupWindowIds].map(id => 
                `<div class="window-tab ${id === mainWindowId ? 'active' : ''}" 
                      data-window-id="${id}">
                    <span>${openWindows[id].title}</span>
                </div>`
            ).join('')}
            <div class="window-tab-actions">
                <button class="add-window-tab" title="Add Window">+</button>
            </div>
        </div>
    `;
    
    // Create the container for embedded windows
    const containerHTML = `
        <div class="window-group-container">
            ${tabsHTML}
            <div class="window-tab-content">
                <!-- Windows will be embedded here -->
            </div>
        </div>
    `;
    
    // Create group's parent window with a unique ID
    const groupWindowId = `group-window-${Date.now()}`;
    
    return {
        groupId,
        groupWindowId,
        containerHTML,
        memberIds: [mainWindowId, ...validGroupWindowIds]
    };
}

export function setupGroupWindowEvents(groupWindow, memberIds, openWindows) {
    const tabsContainer = groupWindow.querySelector('.window-group-tabs');
    const contentContainer = groupWindow.querySelector('.window-tab-content');
    const addButton = groupWindow.querySelector('.add-window-tab');
    
    if (!tabsContainer || !contentContainer) return;
    
    // Store group information
    const groupId = groupWindow.id;
    openWindows[groupId].groupMemberIds = [...memberIds];
    
    // Set up tab switching
    tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.window-tab');
        if (!tab) return;
        
        const windowId = tab.dataset.windowId;
        if (!windowId || !openWindows[windowId]) return;
        
        // Activate this tab
        tabsContainer.querySelectorAll('.window-tab').forEach(t => 
            t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show this window, hide others
        contentContainer.querySelectorAll('.embedded-window').forEach(win => {
            win.style.display = 'none';
        });
        
        const embeddedWindow = contentContainer.querySelector(
            `.embedded-window[data-window-id="${windowId}"]`);
        if (embeddedWindow) {
            embeddedWindow.style.display = 'flex';
        }
        
        // Synchronize with taskbar
        handleTabSwitchInTaskbar(windowId, groupWindow.id, openWindows);
    });
    
    // Import drag operations functions
    import('./dragOperations.js').then(module => {
        // Set up add tab button as drop target
        if (addButton) {
            module.setupAddWindowButtonDragTarget(addButton, groupId, openWindows);
        }
        
        // Make tabs draggable
        const tabs = tabsContainer.querySelectorAll('.window-tab');
        module.setupWindowTabDragHandles(tabs, groupId, openWindows, document.getElementById('desktop'));
    });
    
    // We've removed the close functionality for tabs
    
    // Add window tab button action
    if (addButton) {
        addButton.addEventListener('click', () => {
            console.log("Add new window to group - implement dialog");
            // This would show a dialog of open windows to add to the group
        });
    }
    
    // Add ungroup functionality 
    const ungroupButton = groupWindow.querySelector('.ungroup-button');
    if (ungroupButton) {
        ungroupButton.addEventListener('click', () => {
            // Get all windows in this group
            const groupedWindows = [];
            tabsContainer.querySelectorAll('.window-tab').forEach(tab => {
                const id = tab.dataset.windowId;
                if (id && openWindows[id]) {
                    groupedWindows.push(id);
                }
            });
            
            // Restore taskbar icons
            restoreTaskbarIconsOnUngroup(groupedWindows, openWindows);
            
            // Close the group window - individual windows will be restored
            closeWindow(groupWindow.id);
        });
    }
}

export function embedWindowInGroup(windowElement, contentContainer, windowId) {
    // Create a wrapper for the window
    const wrapper = document.createElement('div');
    wrapper.className = 'embedded-window';
    wrapper.dataset.windowId = windowId;
    
    // Hide window controls for embedded windows
    const windowControls = windowElement.querySelector('.window-controls');
    if (windowControls) {
        windowControls.style.display = 'none';
    }
    
    // Move window to the wrapper
    wrapper.appendChild(windowElement);
    
    // Add to container
    contentContainer.appendChild(wrapper);
    
    return wrapper;
}