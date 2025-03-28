// ui/windowSnapping.js - Handles window snapping functionality

import { SNAP_THRESHOLD } from '../config.js';
import { toggleMaximize } from './windowManager.js';

let snapPreview = null;

export function initSnapPreview(desktop) {
    // Create snap preview if it doesn't exist
    if (!snapPreview) {
        snapPreview = document.createElement('div');
        snapPreview.className = 'snap-preview';
        snapPreview.style.display = 'none';
        desktop.appendChild(snapPreview);
    }
}

export function detectSnapZone(e, desktopWidth, desktopHeight, taskbarHeight) {
    if (e.clientX < SNAP_THRESHOLD) {
        // Left edge snap
        showSnapPreview('left', desktopWidth, desktopHeight, taskbarHeight);
        return 'left';
    } else if (e.clientX > desktopWidth - SNAP_THRESHOLD) {
        // Right edge snap
        showSnapPreview('right', desktopWidth, desktopHeight, taskbarHeight);
        return 'right';
    } else if (e.clientY < SNAP_THRESHOLD) {
        // Top edge snap (maximize)
        showSnapPreview('top', desktopWidth, desktopHeight, taskbarHeight);
        return 'top';
    } else {
        hideSnapPreview();
        return null;
    }
}

export function showSnapPreview(position, desktopWidth, desktopHeight, taskbarHeight) {
    if (!snapPreview) return;
    
    snapPreview.style.display = 'block';
    snapPreview.className = 'snap-preview';
    
    switch (position) {
        case 'left':
            snapPreview.style.top = '0';
            snapPreview.style.left = '0';
            snapPreview.style.width = `${desktopWidth / 2}px`;
            snapPreview.style.height = `${desktopHeight}px`;
            break;
        case 'right':
            snapPreview.style.top = '0';
            snapPreview.style.left = `${desktopWidth / 2}px`;
            snapPreview.style.width = `${desktopWidth / 2}px`;
            snapPreview.style.height = `${desktopHeight}px`;
            break;
        case 'top':
            snapPreview.style.top = '0';
            snapPreview.style.left = '0';
            snapPreview.style.width = `${desktopWidth}px`;
            snapPreview.style.height = `${desktopHeight}px`;
            break;
    }
    
    // Add animation class
    requestAnimationFrame(() => {
        snapPreview.classList.add('visible');
    });
}

export function hideSnapPreview() {
    if (!snapPreview) return;
    snapPreview.classList.remove('visible');
    setTimeout(() => {
        if (!snapPreview.classList.contains('visible')) {
            snapPreview.style.display = 'none';
        }
    }, 300);
}

export function applySnapAction(windowId, position, openWindows, taskbar) {
    const windowData = openWindows[windowId];
    if (!windowData) return;
    
    const windowElement = windowData.element;
    const taskbarHeight = taskbar.offsetHeight;
    const desktopWidth = window.innerWidth;
    const desktopHeight = window.innerHeight - taskbarHeight;
    
    // Save current state for possible restoration
    windowData.originalState = {
        top: windowElement.style.top,
        left: windowElement.style.left,
        width: windowElement.offsetWidth + 'px',
        height: windowElement.offsetHeight + 'px'
    };
    
    // Apply styles based on position
    switch (position) {
        case 'left':
            windowElement.style.top = '0px';
            windowElement.style.left = '0px';
            windowElement.style.width = `${desktopWidth / 2}px`;
            windowElement.style.height = `${desktopHeight}px`;
            windowElement.classList.add('snapped', 'snapped-left');
            break;
        case 'right':
            windowElement.style.top = '0px';
            windowElement.style.left = `${desktopWidth / 2}px`;
            windowElement.style.width = `${desktopWidth / 2}px`;
            windowElement.style.height = `${desktopHeight}px`;
            windowElement.classList.add('snapped', 'snapped-right');
            break;
        case 'top':
            toggleMaximize(windowId);
            break;
    }
}