// ui/taskbar.js - Handles taskbar elements like time, icons, system tray

import { ANIMATION_SPEED } from '../config.js';
import { bringToFront } from './windowManager.js'; // Import bringToFront

// Check if dayjs is loaded globally
if (typeof dayjs === 'undefined' || typeof dayjs_plugin_relativeTime === 'undefined') {
    console.error("Dayjs or relativeTime plugin not loaded correctly. Check script tags in HTML.");
} else {
    dayjs.extend(dayjs_plugin_relativeTime);
}

const timeDateElement = document.getElementById('time-date');
const taskbarIconsContainer = document.getElementById('taskbar-icons');
const volumeControl = document.getElementById('volume-control');

let taskbarIcons = {}; // { iconId: { element, windowId } }

export function initTaskbar() {
    updateTimeDate();
    setInterval(updateTimeDate, 1000 * 30); // Update every 30 seconds

    // Volume control placeholder action
    if (volumeControl) {
        volumeControl.addEventListener('click', () => {
            console.log("Volume icon clicked - implement control panel/mute toggle");
            // Example: Toggle a 'muted' class for visual feedback
            volumeControl.classList.toggle('muted');
            // You might want to change the SVG icon based on the muted state here
        });
    }
}

// --- Time/Date Update ---
function updateTimeDate() {
    if (typeof dayjs !== 'undefined') {
         const now = dayjs();
         timeDateElement.textContent = now.format('h:mm A'); // Simpler format
    } else {
        timeDateElement.textContent = "No Clock";
    }
}

// --- Taskbar Icon Management ---

function createTaskbarIcon(iconId, windowId, title) {
    const taskbarIcon = document.createElement('button');
    taskbarIcon.className = 'taskbar-app-icon'; // Base class only initially
    taskbarIcon.textContent = title;
    taskbarIcon.dataset.windowId = windowId; // Link icon to window
    taskbarIcon.id = iconId;
    taskbarIcon.title = title;

    taskbarIcon.addEventListener('click', () => {
        bringToFront(windowId); // Use imported bringToFront
    });

    taskbarIconsContainer.appendChild(taskbarIcon);
    taskbarIcons[iconId] = { element: taskbarIcon, windowId: windowId };

    // Trigger entry animation
    requestAnimationFrame(() => {
        taskbarIcon.classList.add('visible');
    });
}

function removeTaskbarIcon(iconId) {
    const iconData = taskbarIcons[iconId];
    if (iconData && iconData.element) {
        iconData.element.classList.remove('visible', 'active', 'minimized'); // Trigger exit animation
        iconData.element.style.pointerEvents = 'none'; // Prevent clicks during removal

        // Remove from DOM and memory after animation
        setTimeout(() => {
            if (iconData.element.parentNode) {
                iconData.element.remove();
            }
            delete taskbarIcons[iconId];
        }, ANIMATION_SPEED);
    }
}

function updateTaskbarIconState(iconId, state) { // state: 'active', 'inactive', 'minimized'
    const iconData = taskbarIcons[iconId];
    if (iconData && iconData.element) {
        const iconElement = iconData.element;
        // Reset states first
        iconElement.classList.remove('active', 'minimized');

        // Apply new state
        switch (state) {
            case 'active':
                iconElement.classList.add('active');
                break;
            case 'minimized':
                iconElement.classList.add('minimized');
                // Ensure active is removed if minimized
                iconElement.classList.remove('active');
                break;
            case 'inactive':
                 // No specific class needed for inactive, just ensure active/minimized removed
                break;
        }
    }
}

export { createTaskbarIcon, removeTaskbarIcon, updateTaskbarIconState };