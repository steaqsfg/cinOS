// NEW FILE: ui/folderView.js - Manages folder window content and interactions

// Import necessary functions if NOT passed via callbacks (less preferred)
// import { openItem, renameItem, deleteItem, showProperties, createNewItem... } from './desktopManager.js';

const ICON_WIDTH = 80;
const ICON_HEIGHT = 80;
const ICON_GRID_SIZE = 90;

let currentFolderData = null;
let folderElement = null;
let callbacks = {}; // Store callbacks { openItem, renameItem, deleteItem, ... }
let emptyFolderTextElement = null;

let draggedItemData = null; // Data of the item being dragged *from this folder*
let dragOffsetX = 0;
let dragOffsetY = 0;

export function initFolderView(
    folderContentElement,
    folderData,
    passedCallbacks // Object containing functions from desktopManager
) {
    console.log(`Initializing folder view for: ${folderData.name} (${folderData.id})`);
    folderElement = folderContentElement;
    currentFolderData = folderData;
    callbacks = passedCallbacks; // Store the passed functions
    emptyFolderTextElement = folderElement.querySelector('.empty-folder-text');

    // Expose a refresh function on the element itself
    folderElement.__refreshFolderView = (postRenderCallback) => {
        console.log(`Refreshing folder view for ${currentFolderData.id}`);
        renderFolderContent(postRenderCallback);
    };

    renderFolderContent();
    setupFolderViewInteractions();
}

// Added optional callback for post-render actions (like rename)
function renderFolderContent(postRenderCallback = null) {
    if (!folderElement || !currentFolderData || !Array.isArray(currentFolderData.content)) {
        console.error("Cannot render folder content: Missing element, data, or content array.");
        return;
    }

    // Clear existing icons but preserve the empty folder text element
    folderElement.querySelectorAll('.desktop-icon').forEach(icon => icon.remove());

    // Sort content alphabetically (folders first, then files)
    currentFolderData.content.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });

    currentFolderData.content.forEach(item => {
        // Ensure item has necessary properties (should be done on load/creation)
        item.id = item.id || `item-in-folder-${Date.now()}${Math.random()}`;
        item.name = item.name || 'Unnamed Item';
        item.type = item.type || 'unknown';

        // Use the createDesktopIconElement from callbacks (it handles folder items now)
        const iconElement = callbacks.createDesktopIconElement(item);
        if (iconElement) {
            folderElement.appendChild(iconElement);
            item.element = iconElement; // Store element reference back onto the item data

            // Add folder-specific drag listeners (for dragging *out* of the folder)
            addDragListenersToFolderItem(iconElement, item);
        }
    });

    updateEmptyFolderText();

    // Execute callback after rendering is complete
    if (postRenderCallback) {
        // Use setTimeout to ensure DOM is fully updated
        setTimeout(postRenderCallback, 0);
    }
}

function updateEmptyFolderText() {
    if (emptyFolderTextElement) {
        emptyFolderTextElement.style.display =
            currentFolderData && currentFolderData.content && currentFolderData.content.length > 0
            ? 'none'
            : 'block';
    }
}

// Replaced createFolderItemIconElement with addDragListenersToFolderItem
// The creation is now handled by the shared createDesktopIconElement callback

function addDragListenersToFolderItem(iconElement, item) {
    // Make draggable *out* of the folder
    iconElement.draggable = true;

    // Remove potential desktop drag listeners if they were added
    // This is a bit hacky, cleaner way would be better separation in createDesktopIconElement
    // For now, let's assume createDesktopIconElement doesn't add drag listeners for folder items.

    iconElement.addEventListener('dragstart', (e) => {
        e.stopPropagation();

        // Select the item being dragged
        folderElement.querySelectorAll('.desktop-icon').forEach(el => el.classList.remove('selected'));
        iconElement.classList.add('selected');

        draggedItemData = item; // Store the item data being dragged from this folder
        const rect = iconElement.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        // Use a specific data type for items dragged from folders
        e.dataTransfer.setData('application/cnios-folder-item', JSON.stringify({ folderId: currentFolderData.id, itemId: item.id }));
        e.dataTransfer.effectAllowed = 'move';
        iconElement.classList.add('dragging');

        // Custom drag image (optional)
        try {
            const ghost = iconElement.cloneNode(true);
            ghost.style.position = 'absolute';
            ghost.style.left = '-150px'; // Position offscreen
            ghost.style.top = '-150px';
            ghost.style.opacity = 0.7;
            ghost.style.transform = 'scale(0.9)';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, dragOffsetX * 0.9, dragOffsetY * 0.9);
            setTimeout(() => ghost.remove(), 50);
        } catch (err) { console.warn("Folder item drag image error:", err); }
    });

    iconElement.addEventListener('dragend', (e) => {
        iconElement.classList.remove('dragging');
        // Clear data only if this dragend corresponds to the active drag from *this* folder
        if (draggedItemData && draggedItemData.id === item.id) {
            draggedItemData = null;
            dragOffsetX = 0;
            dragOffsetY = 0;
        }
    });
}

function setupFolderViewInteractions() {
    if (!folderElement) return;

    // --- Drag Over (Accepting Desktop Icons) ---
    folderElement.addEventListener('dragover', (e) => {
        // Check if dragging a desktop icon INTO the folder area
        if (e.dataTransfer.types.includes('application/desktop-icon')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link'; // Use 'link' or 'move'
            folderElement.classList.add('drop-target-folder-area');
        } else {
            // Prevent dropping other things (like folder items from the *same* folder)
            e.dataTransfer.dropEffect = 'none';
        }
    });

    folderElement.addEventListener('dragleave', (e) => {
        // Check if leaving the folder content area entirely
        if (!folderElement.contains(e.relatedTarget)) {
            folderElement.classList.remove('drop-target-folder-area');
        }
    });

    // --- Drop (Accepting Desktop Icons) ---
    folderElement.addEventListener('drop', (e) => {
        e.preventDefault();
        folderElement.classList.remove('drop-target-folder-area');

        // Handle dropping a DESKTOP icon into the folder background
        if (e.dataTransfer.types.includes('application/desktop-icon')) {
            const desktopItemId = e.dataTransfer.getData('application/desktop-icon');
            // Use the moveItemToFolder callback (which handles removing from desktop etc.)
            if (callbacks.moveItemToFolder) {
                callbacks.moveItemToFolder(desktopItemId, currentFolderData.id);
                // The moveItemToFolder function should handle state saving and folder refresh trigger
            } else {
                console.error("moveItemToFolder callback not provided to folderView.");
            }
        }
        // Dropping items from other folders might need handling here too if desired
    });

    // --- Click on Background (Deselect) ---
    folderElement.addEventListener('click', (e) => {
        // If click is directly on the folder background, deselect all items within it
        if (e.target === folderElement) {
            folderElement.querySelectorAll('.desktop-icon.selected').forEach(el => {
                el.classList.remove('selected');
            });
        }
    });

    // --- Context Menu on Background ---
    folderElement.addEventListener('contextmenu', (e) => {
        // Prevent menu if clicking on an item (item handler takes precedence)
        if (e.target.closest('.desktop-icon')) return;

        e.preventDefault();
        e.stopPropagation();
        console.log("Right-click on folder background", currentFolderData.id);
        // Show the main context menu, configured for the folder background
        if (callbacks.showContextMenu) {
            callbacks.showContextMenu(e, null, 'folder-background', currentFolderData);
        } else {
            console.error("showContextMenu callback not available in folderView");
            alert("Context menu not available.");
        }
    });

    // --- Dragging Items OUT ---
    // Listen on document to detect drops outside the folder window
    document.addEventListener('drop', handleDropOutsideFolder, true); // Use capture phase

    // --- Cleanup ---
    // Use MutationObserver on the window element to clean up listeners when the folder window is closed
    const containingWindow = folderElement.closest('.window');
    if (containingWindow) {
        const observer = new MutationObserver((mutationsList, obs) => {
            for (const mutation of mutationsList) {
                if (mutation.removedNodes) {
                    mutation.removedNodes.forEach(node => {
                        if (node === containingWindow) {
                            console.log(`Folder window ${containingWindow.id} removed, cleaning up folderView listeners.`);
                            document.removeEventListener('drop', handleDropOutsideFolder, true); // Clean up global listener
                            obs.disconnect(); // Stop observing
                            // Nullify references to prevent memory leaks
                            currentFolderData = null;
                            folderElement = null;
                            callbacks = {};
                            emptyFolderTextElement = null;
                            draggedItemData = null;
                            return;
                        }
                    });
                }
            }
        });
        // Observe the parent of the window (the desktop) for child removal
        const desktopElement = document.getElementById('desktop');
        if (desktopElement) {
            observer.observe(desktopElement, { childList: true });
        }
    }
}

// Handles drops anywhere in the document when dragging an item *from this folder*
function handleDropOutsideFolder(e) {
    // Only act if an item from THIS folder is being dragged
    if (!draggedItemData || !e.dataTransfer.types.includes('application/cnios-folder-item')) return;

    const folderWindow = folderElement?.closest('.window');
    // Ignore drops inside the source folder window itself
    if (!folderWindow || folderWindow.contains(e.target)) {
        return;
    }

    const desktopElement = document.getElementById('desktop');
    const targetIsDesktop = desktopElement && (e.target === desktopElement || desktopElement.contains(e.target));
    // Optionally check for dropping onto another folder icon on the desktop
    const targetFolderIcon = e.target.closest('.desktop-icon[data-folder-id]'); // Assuming desktop icons might have data-folder-id if they represent folders

    // --- Case 1: Dropping onto Desktop Background ---
    if (targetIsDesktop && !targetFolderIcon) {
        e.preventDefault(); // Prevent default browser drop behavior
        console.log(`Item ${draggedItemData.id} dropped outside folder onto desktop area.`);

        const desktopRect = desktopElement.getBoundingClientRect();
        // Adjust coordinates based on where the user clicked *within* the icon during dragstart
        const dropX = e.clientX - desktopRect.left - dragOffsetX;
        const dropY = e.clientY - desktopRect.top - dragOffsetY;

        if (callbacks.moveItemFromFolderToDesktop) {
            // The callback handles removing from folder data, adding to desktop data, creating element, saving state
            const movedItem = callbacks.moveItemFromFolderToDesktop(draggedItemData, currentFolderData.id, dropX, dropY);
            if (movedItem) {
                // Item successfully moved, source folder's data (currentFolderData.content) was modified by the callback.
                // Refresh THIS folder view visually to remove the icon.
                console.log(`Triggering visual refresh for source folder ${currentFolderData.id} after successful move.`);
                renderFolderContent(); // Re-render this folder instance's content based on the updated currentFolderData.content
            } else {
                console.warn("Move item from folder to desktop failed.");
                // Item should remain in folder visually
            }
        } else {
            console.error("moveItemFromFolderToDesktop callback is not defined in folderView.");
        }
        // Dragged item data is cleared in dragend
    }
    // --- Case 2: Dropping onto another Folder Icon on the Desktop ---
    // TODO: Implement dropping folder item onto another folder icon directly
    // This would involve:
    // 1. Identifying the target folder icon's ID.
    // 2. Calling a function (maybe a new callback or adapt moveItemToFolder) to:
    //    a. Remove item from currentFolderData.content.
    //    b. Add item to target folder's content.
    //    c. Save state.
    //    d. Refresh this folder view.
    //    e. Refresh target folder view if open.
    else {
        // Dropped somewhere else (another window, taskbar, etc.) - potentially revert or do nothing
        console.log("Folder item dropped on unsupported area.");
    }
}