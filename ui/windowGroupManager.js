// ui/windowGroupManager.js - Handles checking for window grouping opportunities

import { updateTaskbarForGrouping } from './groupTaskbarSync.js';
import { createWindowGroup, setupGroupWindowEvents, embedWindowInGroup } from './windowGroups.js';
import { createWindow } from './windowManager.js';

// Function moved from windowManager.js to avoid that file getting too large
export function checkWindowGrouping(event, currentWindow, currentWindowId, x, y, openWindows) {
    // Reset group highlighting on all windows
    for (const id in openWindows) {
        if (openWindows[id] && openWindows[id].element) {
            openWindows[id].element.classList.remove('group-highlight');
            // Also remove group-target, maybe it was left over
            if (id === currentWindowId) {
                openWindows[id].element.classList.remove('group-target');
            }
        }
    }
    
    let potentialGroupWindows = [];
    
    // Check for overlap with other windows
    for (const id in openWindows) {
        // Skip the current window itself and minimized windows
        if (id === currentWindowId || openWindows[id].isMinimized) continue;
        
        // Skip windows that are already in a group container
        if (openWindows[id].element.closest('.embedded-window')) continue;
        
        // Skip windows that are group containers themselves
        if (openWindows[id].groupMemberIds) continue;
        
        // Skip if the current window is a group container (prevent nesting)
        if (openWindows[currentWindowId] && openWindows[currentWindowId].groupMemberIds) continue;

        // *** New Check: Require Ctrl key for window-on-window grouping ***
        if (!event.ctrlKey) {
            // If Ctrl is not pressed, don't check for grouping, just continue loop
            continue;
        }
        
        const otherWindow = openWindows[id].element;
        const otherRect = otherWindow.getBoundingClientRect();
        const currentRect = {
            left: x,
            top: y,
            right: x + currentWindow.offsetWidth,
            bottom: y + currentWindow.offsetHeight,
            width: currentWindow.offsetWidth,
            height: currentWindow.offsetHeight
        };
        
        // Check if windows overlap significantly
        const overlap = !(
            currentRect.right < otherRect.left || 
            currentRect.left > otherRect.right || 
            currentRect.bottom < otherRect.top || 
            currentRect.top > otherRect.bottom
        );
        
        const overlapArea = Math.min(
            currentRect.right - otherRect.left,
            otherRect.right - currentRect.left
        ) * Math.min(
            currentRect.bottom - otherRect.top,
            otherRect.bottom - currentRect.top
        );
        
        const minArea = Math.min(
            currentRect.width * currentRect.height,
            otherRect.width * otherRect.height
        );
        
        // If overlap is significant
        if (overlap && (overlapArea / minArea) > 0.5) {
            potentialGroupWindows.push(id);
            otherWindow.classList.add('group-highlight');
            currentWindow.classList.add('group-target');
        }
    }
    
    // If no potential group, remove group-target class
    if (potentialGroupWindows.length === 0) {
        currentWindow.classList.remove('group-target');
    }
    
    return potentialGroupWindows;
}

// Function to handle window grouping after drag is complete
export function handleWindowGrouping(windowId, potentialGroupWindows, openWindows, desktop) {
    if (!potentialGroupWindows || potentialGroupWindows.length === 0) return null;
    
    const groupInfo = createWindowGroup(windowId, potentialGroupWindows, openWindows);
    if (!groupInfo) return null;
    
    // Create a container window for the group
    const containerWindowId = createWindow(
        "Window Group", 
        groupInfo.containerHTML
    );
    
    const containerWindow = openWindows[containerWindowId].element;
    const contentContainer = containerWindow.querySelector('.window-tab-content');
    
    // Setup the group window events
    setupGroupWindowEvents(containerWindow, groupInfo.memberIds, openWindows);
    
    // Synchronize with taskbar - ensure main window's taskbar icon is removed too
    updateTaskbarForGrouping([windowId, ...potentialGroupWindows], openWindows, containerWindowId);
    
    // Embed all windows in the group
    groupInfo.memberIds.forEach(id => {
        if (!openWindows[id]) return;
        
        const windowEl = openWindows[id].element;
        // Save original styles
        openWindows[id].originalGroupState = {
            top: windowEl.style.top,
            left: windowEl.style.left,
            width: windowEl.style.width,
            height: windowEl.style.height,
            zIndex: windowEl.style.zIndex
        };
        
        // Remove from DOM temporarily
        if (windowEl.parentNode) {
            windowEl.parentNode.removeChild(windowEl);
        }
        
        // Embed in group container
        const wrapper = embedWindowInGroup(windowEl, contentContainer, id);
        
        // Set initial visibility
        wrapper.style.display = id === windowId ? 'flex' : 'none';
    });
    
    return containerWindowId;
}