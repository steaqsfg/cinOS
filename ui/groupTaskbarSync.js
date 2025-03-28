// ui/groupTaskbarSync.js - Handles taskbar synchronization for window groups

import { updateTaskbarIconState, removeTaskbarIcon, createTaskbarIcon } from './taskbar.js';

export function updateTaskbarForGrouping(windowIds, openWindows, groupWindowId) {
    // Hide taskbar icons for all windows being grouped
    windowIds.forEach(windowId => {
        if (openWindows[windowId] && openWindows[windowId].taskbarIconId) {
            // Hide the window's taskbar icon
            removeTaskbarIcon(openWindows[windowId].taskbarIconId);
            
            // Store original taskbar icon info for possible later ungrouping
            openWindows[windowId].originalTaskbarIconInfo = {
                id: openWindows[windowId].taskbarIconId,
                title: openWindows[windowId].title
            };
            
            // Mark this window as grouped for task tracking
            openWindows[windowId].isGrouped = true;
            openWindows[windowId].groupParentId = groupWindowId;
        }
    });
    
    // Update the group window's taskbar icon to reflect it contains multiple windows
    if (openWindows[groupWindowId] && openWindows[groupWindowId].taskbarIconId) {
        // Could optionally update the icon or title to indicate it's a group
        updateTaskbarIconState(openWindows[groupWindowId].taskbarIconId, 'active');
    }
}

export function handleTabSwitchInTaskbar(activeTabId, groupWindowId, openWindows) {
    if (openWindows[groupWindowId] && openWindows[groupWindowId].taskbarIconId) {
        // Update taskbar icon title to reflect the active tab
        const taskbarIcon = document.getElementById(openWindows[groupWindowId].taskbarIconId);
        if (taskbarIcon && openWindows[activeTabId]) {
            taskbarIcon.textContent = openWindows[activeTabId].title;
            taskbarIcon.title = openWindows[activeTabId].title;
        }
    }
}

export function restoreTaskbarIconsOnUngroup(groupedWindows, openWindows) {
    groupedWindows.forEach(windowId => {
        if (openWindows[windowId] && openWindows[windowId].originalTaskbarIconInfo) {
            const info = openWindows[windowId].originalTaskbarIconInfo;
            // Recreate the taskbar icon
            createTaskbarIcon(info.id, windowId, info.title);
            openWindows[windowId].taskbarIconId = info.id;
            delete openWindows[windowId].originalTaskbarIconInfo;
            // Remove grouping markers on ungroup
            delete openWindows[windowId].isGrouped;
            delete openWindows[windowId].groupParentId;
        }
    });
}

export function checkTaskConsistency(openWindows) {
    // This function scans all windows and ensures taskbar icons match reality
    for (const id in openWindows) {
        const win = openWindows[id];
        
        // Check if window exists in DOM but has no taskbar icon
        if (win.element && win.element.parentNode && !win.isGrouped && !win.taskbarIconId) {
            console.warn(`Window ${id} has no taskbar icon. Recreating.`);
            createTaskbarIcon(`tbicon-${id}`, id, win.title);
            win.taskbarIconId = `tbicon-${id}`;
        }
        
        // Check if grouped windows are properly tracked
        if (win.isGrouped && !win.groupParentId) {
            console.warn(`Window ${id} is marked as grouped but has no parent. Fixing.`);
            win.isGrouped = false;
        }
    }
    
    return true; // Return success for task manager reporting
}