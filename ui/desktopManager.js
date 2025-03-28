// ui/desktopManager.js - Manages desktop icons and context menu

import { createWindow, getOpenWindows, bringToFront } from './windowManager.js';
import { initFolderView } from './folderView.js';

const desktop = document.getElementById('desktop');
const iconTemplate = document.getElementById('desktop-icon-template');
const contextMenuTemplate = document.getElementById('context-menu-template');
let desktopItems = [];
let contextMenu = null;
let activeContextMenuTarget = null;
let nextZIndex = 1;
let selectionBox = null;
let isSelecting = false;
let selectionStartX, selectionStartY;
let justFinishedSelecting = false;

const ICON_WIDTH = 80;
const ICON_HEIGHT = 80;
const ICON_GRID_SIZE = 90;

function renameItem(itemId, selectText = false) {
    const itemInfo = findItemData(itemId);
    if (!itemInfo || !itemInfo.item.element) {
        console.error(`Cannot rename: Item or element not found for ID ${itemId}`);
        return;
    }
    const item = itemInfo.item;
    const element = item.element;
    const labelElement = element.querySelector('.icon-label');
    const context = itemInfo.context; 
    const folderData = itemInfo.folderData; 

    if (!labelElement) return;

    if (labelElement.contentEditable === 'true') {
        labelElement.focus();
        return;
    }

    if (context === 'desktop') {
        desktopItems.forEach(i => {
            if (i.id !== itemId) i.element?.classList.remove('selected');
        });
        element.classList.add('selected');
    }

    const originalName = item.name;
    labelElement.contentEditable = 'true';
    labelElement.focus();

    if (selectText) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(labelElement);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(labelElement);
        range.collapse(false); 
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function finishRename(event) {
        if (labelElement.contentEditable !== 'true') return; 

        const newName = labelElement.textContent.trim().replace(/[\r\n]/g, ""); 

        if (!newName) {
            labelElement.textContent = originalName;
            console.log("Rename cancelled: Name cannot be empty.");
        } else {
            const sourceArray = context === 'desktop' ? desktopItems : folderData?.content;
            const collision = sourceArray && sourceArray.some(i => i.id !== itemId && i.name === newName);

            if (collision) {
                 labelElement.textContent = originalName; 
                 alert(`An item named "${newName}" already exists in this location. Please choose a different name.`);
                 setTimeout(() => {
                     labelElement.contentEditable = 'true';
                     labelElement.focus();
                     const range = document.createRange();
                     const selection = window.getSelection();
                     range.selectNodeContents(labelElement);
                     selection.removeAllRanges();
                     selection.addRange(range);
                 }, 0);
                 return; 
            } else {
                 item.name = newName;
                 labelElement.textContent = newName; 
                 console.log(`Renamed item ${itemId} to "${newName}"`);
                 saveDesktopState(); 
            }
        }

        labelElement.contentEditable = 'false';
        labelElement.removeEventListener('blur', finishRename);
        labelElement.removeEventListener('keydown', handleKeyDown);

        if (context === 'folder' && folderData?.id) {
            const folderContentElement = document.getElementById(`folder-content-${folderData.id}`);
            if (folderContentElement && folderContentElement.__refreshFolderView) {
                 console.log(`Refreshing folder view ${folderData.id} after rename`);
                 folderContentElement.__refreshFolderView();
            } else {
                 console.warn(`Could not find folder view element to refresh after renaming item ${item.id}`);
            }
        }
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            finishRename();
        } else if (event.key === 'Escape') {
            labelElement.textContent = originalName; 
            finishRename(); 
        }
    }

    labelElement.addEventListener('blur', finishRename);
    labelElement.addEventListener('keydown', handleKeyDown);
}

function renameItemInFolder(item, folderData, selectText = false) {
     if (!item || !folderData) {
          console.error("Missing item or folderData for renameItemInFolder");
          return;
     }
     const itemInfo = findItemData(item.id);
     if (itemInfo && itemInfo.context === 'folder' && itemInfo.folderData?.id === folderData.id) {
          renameItem(item.id, selectText);
     } else {
          console.error(`Could not initiate rename for item ${item.id} in folder ${folderData.id}. Context mismatch or item not found.`);
     }
}

const folderViewCallbacks = {
    openItem,
    renameItem: renameItemInFolder, 
    deleteItem,
    showProperties,
    createNewTextFile, 
    createNewFolder,   
    showContextMenu,
    moveItemFromFolderToDesktop,
    moveItemToFolder
};

folderViewCallbacks.createDesktopIconElement = createDesktopIconElement;

export function initDesktop() {
    loadDesktopState();
    renderDesktopIcons();
    setupContextMenu();
    setupSelectionBox();

    desktop.addEventListener('contextmenu', handleDesktopContextMenu);
    desktop.addEventListener('click', handleDesktopClick);
    desktop.addEventListener('mousedown', handleDesktopMouseDown);

    desktop.addEventListener('dragover', (e) => {
        e.preventDefault();
        const iconElement = e.target.closest('.desktop-icon');
        let canDrop = false;
        let dropTargetFolder = false;

        if (e.dataTransfer.types.includes('application/desktop-icon')) {
             const draggedItemId = e.dataTransfer.getData('application/desktop-icon');
             if (iconElement) { 
                 const targetItem = desktopItems.find(i => i.id === iconElement.id);
                 if (targetItem && targetItem.type === 'folder' && targetItem.id !== draggedItemId) {
                     canDrop = true;
                     dropTargetFolder = true;
                     iconElement.classList.add('drop-target-folder');
                 }
             } else { 
                 canDrop = true;
             }
        }
        else if (e.dataTransfer.types.includes('application/cnios-folder-item')) {
             if (!iconElement) {
                  canDrop = true;
             }
        }

        e.dataTransfer.dropEffect = canDrop ? (dropTargetFolder ? 'link' : 'move') : 'none';
        if (!dropTargetFolder) {
            removeFolderHighlight(); 
        }

    });

    desktop.addEventListener('dragleave', (e) => {
         if (!desktop.contains(e.relatedTarget)) {
             removeFolderHighlight();
         }
         const iconElement = e.target.closest('.desktop-icon');
         if (iconElement && !iconElement.contains(e.relatedTarget)) {
             iconElement.classList.remove('drop-target-folder');
         }
    });


    desktop.addEventListener('drop', (e) => {
        e.preventDefault();
        removeFolderHighlight();

        const targetElement = e.target.closest('.desktop-icon');
        const targetItemId = targetElement ? targetElement.id : null;
        const targetItemData = targetItemId ? desktopItems.find(item => item.id === targetItemId) : null;

        if (e.dataTransfer.types.includes('application/desktop-icon')) {
            const iconId = e.dataTransfer.getData('application/desktop-icon');
            const draggedItemData = desktopItems.find(item => item.id === iconId);

            if (draggedItemData && draggedItemData.element) {
                if (targetItemData && targetItemData.type === 'folder' && targetItemData.id !== draggedItemData.id) {
                     moveItemToFolder(draggedItemData.id, targetItemData.id);
                }
                else {
                     const desktopRect = desktop.getBoundingClientRect();
                     const taskbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height') || '45'); 
                     let dropX = e.clientX - desktopRect.left - (draggedItemData.dragOffsetX || 0);
                     let dropY = e.clientY - desktopRect.top - (draggedItemData.dragOffsetY || 0);

                     let gridX = Math.round(dropX / ICON_GRID_SIZE) * ICON_GRID_SIZE;
                     let gridY = Math.round(dropY / ICON_GRID_SIZE) * ICON_GRID_SIZE;

                     gridX = Math.max(0, Math.min(gridX, desktopRect.width - ICON_WIDTH));
                     gridY = Math.max(0, Math.min(gridY, desktopRect.height - ICON_HEIGHT - taskbarHeight)); 

                     let occupied = false;
                     for (const item of desktopItems) {
                         if (item.id !== iconId && item.x === gridX && item.y === gridY) {
                             occupied = true;
                             break;
                         }
                     }

                     if (occupied) {
                          console.log(`Grid slot ${gridX},${gridY} occupied. Reverting icon ${iconId}.`);
                          draggedItemData.element.style.left = `${draggedItemData.originalX}px`;
                          draggedItemData.element.style.top = `${draggedItemData.originalY}px`;
                          draggedItemData.x = draggedItemData.originalX;
                          draggedItemData.y = draggedItemData.originalY;
                     } else {
                          draggedItemData.x = gridX;
                          draggedItemData.y = gridY;
                          draggedItemData.element.style.left = `${gridX}px`;
                          draggedItemData.element.style.top = `${gridY}px`;
                          saveDesktopState();
                     }
                }
                delete draggedItemData.originalX;
                delete draggedItemData.originalY;
                delete draggedItemData.dragOffsetX;
                delete draggedItemData.dragOffsetY;
            }
        }
        else if (e.dataTransfer.types.includes('application/cnios-folder-item')) {
            const data = JSON.parse(e.dataTransfer.getData('application/cnios-folder-item'));
            const { folderId, itemId } = data;

             const sourceFolder = desktopItems.find(f => f.id === folderId);
             const itemToMove = sourceFolder?.content?.find(i => i.id === itemId);

             if (!itemToMove || !sourceFolder) {
                  console.error("Could not find source item or folder for folder drop.");
                  return;
             }

             if (!targetElement) {
                 const desktopRect = desktop.getBoundingClientRect();
                 const dropX = e.clientX - desktopRect.left - (ICON_WIDTH / 2);
                 const dropY = e.clientY - desktopRect.top - (ICON_HEIGHT / 2);

                 if (folderViewCallbacks.moveItemFromFolderToDesktop) {
                     folderViewCallbacks.moveItemFromFolderToDesktop(itemToMove, folderId, dropX, dropY);
                      const folderWindow = document.getElementById(`folder-content-${folderId}`);
                      if (folderWindow && folderWindow.__refreshFolderView) {
                          folderWindow.__refreshFolderView();
                      }
                 } else {
                      console.error("moveItemFromFolderToDesktop callback missing.");
                 }
             }
        }
    });
}

function removeFolderHighlight() {
    desktop.querySelectorAll('.desktop-icon.drop-target-folder').forEach(el => {
        el.classList.remove('drop-target-folder');
    });
}

function findItemData(itemId) {
    let item = desktopItems.find(i => i.id === itemId);
    if (item) {
        return { item, source: desktopItems, context: 'desktop', folderData: null };
    }
    for (const folder of desktopItems.filter(f => f.type === 'folder' && Array.isArray(f.content))) {
        item = folder.content.find(i => i.id === itemId);
        if (item) {
            return { item, source: folder.content, context: 'folder', folderData: folder };
        }
    }
    return null; 
}

function moveItemToFolder(itemIdToMove, targetFolderId) {
    const itemIndex = desktopItems.findIndex(i => i.id === itemIdToMove);
    const folderIndex = desktopItems.findIndex(f => f.id === targetFolderId);

    if (itemIndex === -1 || folderIndex === -1) {
        console.error("Could not find item or folder for move operation.");
        return;
    }

    const itemToMove = desktopItems[itemIndex];
    const targetFolder = desktopItems[folderIndex];

    if (itemToMove.type === 'folder') {
        console.warn("Moving folders into folders is not supported yet.");
        return;
    }

    desktopItems.splice(itemIndex, 1);

    if (itemToMove.element && itemToMove.element.parentNode) {
        itemToMove.element.parentNode.removeChild(itemToMove.element);
    }

    if (!targetFolder.content || !Array.isArray(targetFolder.content)) {
        targetFolder.content = [];
    }
    const { element, x, y, originalX, originalY, dragOffsetX, dragOffsetY, ...itemDataToStore } = itemToMove;

    let counter = 0;
    let finalName = itemDataToStore.name;
    while (targetFolder.content.some(item => item.name === finalName)) {
         counter++;
         const extensionMatch = itemDataToStore.name.match(/\.([^.]+)$/);
         const baseName = extensionMatch ? itemDataToStore.name.substring(0, itemDataToStore.name.lastIndexOf('.')) : itemDataToStore.name;
         const extension = extensionMatch ? `.${extensionMatch[1]}` : '';
         finalName = `${baseName} (${counter})${extension}`;
     }
     itemDataToStore.name = finalName;

    targetFolder.content.push(itemDataToStore);

    saveDesktopState();

    console.log(`Moved item ${itemIdToMove} into folder ${targetFolderId}`);

    const folderWindow = document.getElementById(`folder-content-${targetFolderId}`);
    if (folderWindow && folderWindow.__refreshFolderView) {
        folderWindow.__refreshFolderView();
    }
}

export function moveItemFromFolderToDesktop(itemData, folderId, dropX, dropY) {
    const folderIndex = desktopItems.findIndex(f => f.id === folderId);
    if (folderIndex === -1) {
        console.error("Cannot move item out: Source folder not found on desktop.");
        return null;
    }
    const folder = desktopItems[folderIndex];

    const itemIndexInFolder = folder.content.findIndex(i => i.id === itemData.id);
    if (itemIndexInFolder === -1) {
        console.error(`Item ${itemData.id} not found within folder ${folderId} content.`);
        return null;
    }
    const [movedItemData] = folder.content.splice(itemIndexInFolder, 1);

    let gridX = Math.round(dropX / ICON_GRID_SIZE) * ICON_GRID_SIZE;
    let gridY = Math.round(dropY / ICON_GRID_SIZE) * ICON_GRID_SIZE;

    const desktopRect = desktop.getBoundingClientRect();
    gridX = Math.max(0, Math.min(gridX, desktopRect.width - ICON_WIDTH));
    const taskbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height') || '45');
    gridY = Math.max(0, Math.min(gridY, desktopRect.height - ICON_HEIGHT - taskbarHeight));

    let attempts = 0;
    const maxAttempts = (Math.floor(desktopRect.width / ICON_GRID_SIZE) * Math.floor((desktopRect.height - taskbarHeight) / ICON_GRID_SIZE)) || 100;

    while (desktopItems.some(item => item.x === gridX && item.y === gridY) && attempts < maxAttempts) {
        console.log(`Grid slot ${gridX},${gridY} occupied, finding next for item from folder.`);
        gridX += ICON_GRID_SIZE;
        if (gridX >= desktopRect.width - ICON_WIDTH / 2) { 
            gridX = 0;
            gridY += ICON_GRID_SIZE;
            if (gridY >= desktopRect.height - ICON_HEIGHT - taskbarHeight) {
                gridY = 0; 
            }
        }
        attempts++;
    }

    if (attempts >= maxAttempts) {
         console.error("Could not find a free desktop slot for the item. Aborting move.");
         folder.content.splice(itemIndexInFolder, 0, movedItemData);
         return null;
    }

    movedItemData.x = gridX;
    movedItemData.y = gridY;
    desktopItems.push(movedItemData);

    const newElement = createDesktopIconElement(movedItemData);
    movedItemData.element = newElement; 

    saveDesktopState();

    console.log(`Moved item ${itemData.id} from folder ${folderId} to desktop at ${gridX},${gridY}`);
    return movedItemData; 
}

function setupSelectionBox() {
    selectionBox = document.createElement('div');
    selectionBox.id = 'selection-box';
    desktop.appendChild(selectionBox);
}

function handleDesktopMouseDown(event) {
    if (event.target === desktop && event.button === 0) {
        isSelecting = true;
        justFinishedSelecting = false;
        selectionStartX = event.clientX;
        selectionStartY = event.clientY;

        desktopItems.forEach(item => item.element?.classList.remove('selected'));

        const desktopRect = desktop.getBoundingClientRect();
        selectionBox.style.left = `${selectionStartX - desktopRect.left}px`;
        selectionBox.style.top = `${selectionStartY - desktopRect.top}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';

        document.addEventListener('mousemove', handleSelectionMove);
        document.addEventListener('mouseup', handleSelectionEnd, { once: true });

        event.preventDefault(); 
    }
}

function handleSelectionMove(event) {
    if (!isSelecting) return;

    const currentX = event.clientX;
    const currentY = event.clientY;

    const boxX_viewport = Math.min(selectionStartX, currentX);
    const boxY_viewport = Math.min(selectionStartY, currentY);
    const boxW = Math.abs(selectionStartX - currentX);
    const boxH = Math.abs(selectionStartY - currentY);

    const desktopRect = desktop.getBoundingClientRect();
    selectionBox.style.left = `${boxX_viewport - desktopRect.left}px`;
    selectionBox.style.top = `${boxY_viewport - desktopRect.top}px`;
    selectionBox.style.width = `${boxW}px`;
    selectionBox.style.height = `${boxH}px`;

    desktopItems.forEach(item => {
        if (!item.element) return;
        const iconRect = item.element.getBoundingClientRect();

        const intersects = (
            iconRect.left < boxX_viewport + boxW &&
            iconRect.left + iconRect.width > boxX_viewport &&
            iconRect.top < boxY_viewport + boxH &&
            iconRect.top + iconRect.height > boxY_viewport
        );

        if (intersects) {
            item.element.classList.add('selected');
        } else {
            item.element.classList.remove('selected');
        }
    });
}

function handleSelectionEnd(event) {
    if (!isSelecting) return;
    isSelecting = false;

    selectionBox.style.display = 'none';

    document.removeEventListener('mousemove', handleSelectionMove);
    document.removeEventListener('mouseup', handleSelectionEnd, { once: true, capture: true });

    justFinishedSelecting = true;
    setTimeout(() => { justFinishedSelecting = false; }, 0); 
}

function setupContextMenu() {
    if (!contextMenuTemplate) {
        console.error("Context menu template not found!");
        return;
    }
    const menuClone = contextMenuTemplate.content.cloneNode(true);
    contextMenu = menuClone.querySelector('.context-menu');
    document.body.appendChild(contextMenu);

    contextMenu.addEventListener('click', handleContextMenuAction);
}

function handleDesktopContextMenu(event) {
    if (event.target === desktop) {
        event.preventDefault();
        showContextMenu(event, null, 'desktop'); 
    } else {
        hideContextMenu();
    }
}

function handleIconContextMenu(event, item) {
    event.preventDefault();
    event.stopPropagation(); 
    showContextMenu(event, item, 'desktop-icon'); 
}

function handleDesktopClick(event) {
    hideContextMenu();

    if (justFinishedSelecting) {
        return;
    }

    if (!isSelecting && event.target === desktop && event.button === 0) {
        desktopItems.forEach(item => item.element?.classList.remove('selected'));
    }
}

export function showContextMenu(event, item = null, context = 'desktop', folderData = null) {
    if (!contextMenu) return;

    activeContextMenuTarget = {
        item: item,
        context: context, 
        folderData: folderData, 
        eventCoords: { x: event.clientX, y: event.clientY } 
    };

    updateMenuItemsVisibility();

    contextMenu.style.display = 'block';

    let x = event.clientX;
    let y = event.clientY;
    const menuRect = contextMenu.getBoundingClientRect(); 
    const bodyRect = document.body.getBoundingClientRect();

    if (x + menuRect.width > bodyRect.width) {
        x = bodyRect.width - menuRect.width - 5; 
    }
    if (y + menuRect.height > bodyRect.height) {
        y = bodyRect.height - menuRect.height - 5; 
    }
    x = Math.max(5, x);
    y = Math.max(5, y);


    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.opacity = '1';
    contextMenu.style.transform = 'scale(1)';

    setTimeout(() => {
        document.addEventListener('click', hideContextMenuOnClickOutside, { once: true, capture: true });
        document.addEventListener('contextmenu', hideContextMenuOnClickOutside, { once: true, capture: true }); 
    }, 0);
}

function hideContextMenu() {
    if (contextMenu && contextMenu.style.display !== 'none') {
        contextMenu.style.opacity = '0';
        contextMenu.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (contextMenu.style.opacity === '0') {
                contextMenu.style.display = 'none';
            }
        }, 150); 
    }
    document.removeEventListener('click', hideContextMenuOnClickOutside, { capture: true });
    document.removeEventListener('contextmenu', hideContextMenuOnClickOutside, { capture: true });
    activeContextMenuTarget = null; 
}

function hideContextMenuOnClickOutside(event) {
    if (contextMenu && !contextMenu.contains(event.target)) {
        hideContextMenu();
    }
}

function updateMenuItemsVisibility() {
    if (!contextMenu || !activeContextMenuTarget) return;
    const currentContext = activeContextMenuTarget.context;

    contextMenu.querySelectorAll('li[data-target]').forEach(item => {
        const targetTypes = item.dataset.target.split(' ');
        if (targetTypes.includes(currentContext)) {
            item.style.display = ''; 
        } else {
            item.style.display = 'none'; 
        }
    });

    contextMenu.querySelectorAll('li.has-submenu').forEach(parentLi => {
        const submenu = parentLi.querySelector('.submenu');
        if (submenu) {
            let anyChildVisible = false;
            submenu.querySelectorAll(':scope > li').forEach(subItem => {
                if (subItem.style.display !== 'none') {
                    anyChildVisible = true;
                }
            });
            parentLi.style.display = anyChildVisible ? '' : 'none';
        }
    });

    const menuItems = Array.from(contextMenu.querySelectorAll(':scope > li'));
    menuItems.forEach((li, index) => {
        if (li.classList.contains('separator')) {
            const prevVisible = menuItems[index - 1] && menuItems[index - 1].style.display !== 'none';
            const nextVisible = menuItems[index + 1] && menuItems[index + 1].style.display !== 'none';
            if (!prevVisible || !nextVisible) {
                li.style.display = 'none';
            } else {
                li.style.display = ''; 
            }
        }
    });
}

function handleContextMenuAction(event) {
    const actionItem = event.target.closest('li[data-action]');
    if (!actionItem || !activeContextMenuTarget) return;

    const action = actionItem.dataset.action;
    const targetInfo = activeContextMenuTarget;
    hideContextMenu();

    const targetItem = targetInfo.item;
    const context = targetInfo.context; 
    const folderData = targetInfo.folderData; 
    const clickCoords = targetInfo.eventCoords; 

    switch (action) {
        case 'refresh':
            if (context === 'desktop') {
                 console.log("Desktop refreshed (re-rendering icons)");
                 renderDesktopIcons(); 
            } else if (context === 'folder-background' && folderData) {
                 const folderContentElement = document.getElementById(`folder-content-${folderData.id}`);
                 if (folderContentElement && folderContentElement.__refreshFolderView) {
                      folderContentElement.__refreshFolderView();
                 }
            }
            break;
        case 'new-txt':
            if (context === 'desktop') {
                createNewTextFile();
            } else if (context === 'folder-background' && folderData) {
                createNewItemInFolder(folderData, 'txt');
            }
            break;
        case 'new-folder':
            if (context === 'desktop') {
                createNewFolder();
            } else if (context === 'folder-background' && folderData) {
                createNewItemInFolder(folderData, 'folder');
            }
            break;
        case 'open':
            if (targetItem) {
                openItem(targetItem.id, targetItem); 
            }
            break;
        case 'rename':
            if (targetItem) {
                 if (context === 'desktop-icon') {
                      renameItem(targetItem.id, true); 
                 } else if (context === 'folder-item' && folderData) {
                      renameItemInFolder(targetItem, folderData, true); 
                 }
            }
            break;
        case 'properties':
            if (targetItem) {
                 showProperties(targetItem.id, context === 'folder-item' ? `Folder (${folderData?.name})` : 'Desktop');
            }
            break;
        case 'delete':
            if (targetItem) {
                deleteItem(targetItem.id, context, folderData);
            }
            break;
    }
}

function findNextAvailableDesktopPosition() {
    const occupiedPositions = new Set();
    desktopItems.forEach(item => {
        if (typeof item.x === 'number' && typeof item.y === 'number') {
            occupiedPositions.add(`${item.x},${item.y}`);
        }
    });

    const desktopRect = desktop.getBoundingClientRect();
    const taskbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height') || '45'); 
    const availableHeight = desktopRect.height - taskbarHeight;

    const maxCols = Math.floor(desktopRect.width / ICON_GRID_SIZE);
    const maxRows = Math.floor(availableHeight / ICON_GRID_SIZE);

    for (let yGrid = 0; yGrid < maxRows; yGrid++) {
        for (let xGrid = 0; xGrid < maxCols; xGrid++) {
            const x = xGrid * ICON_GRID_SIZE;
            const y = yGrid * ICON_GRID_SIZE;
            if (!occupiedPositions.has(`${x},${y}`)) {
                return { x, y };
            }
        }
    }
    console.warn("No free desktop grid slot found, using fallback position.");
    return { x: 10, y: 10 + (desktopItems.length % 5) * 20 }; 
}

function createNewTextFile() {
    const position = findNextAvailableDesktopPosition();
    let baseName = "New Text Document";
    let name = baseName;
    let counter = 1;
     while (desktopItems.some(item => item.name === name)) {
         counter++;
         name = `${baseName} (${counter})`;
     }

    const newItem = {
        id: `item-${Date.now()}`,
        name: name,
        type: "txt",
        x: position.x,
        y: position.y,
        content: "" 
    };
    desktopItems.push(newItem);
    const iconElement = createDesktopIconElement(newItem);
    newItem.element = iconElement; 

    saveDesktopState();

    renameItem(newItem.id, true); 
}

function createNewFolder() {
    const position = findNextAvailableDesktopPosition();
     let baseName = "New Folder";
     let name = baseName;
     let counter = 1;
      while (desktopItems.some(item => item.name === name)) {
          counter++;
          name = `${baseName} (${counter})`;
      }

    const newItem = {
        id: `folder-${Date.now()}`,
        name: name,
        type: "folder",
        x: position.x,
        y: position.y,
        content: [] 
    };
    desktopItems.push(newItem);
    const iconElement = createDesktopIconElement(newItem);
    newItem.element = iconElement; 

    saveDesktopState();

    renameItem(newItem.id, true); 
}

function createNewItemInFolder(folderData, type) {
     if (!folderData || !Array.isArray(folderData.content)) {
         console.error("Cannot create item: Invalid folder data provided.");
         return;
     }

     const baseName = type === 'folder' ? "New Folder" : "New Text Document";
     let name = baseName;
     let counter = 1;
     while (folderData.content.some(item => item.name === name)) {
         counter++;
         name = `${baseName} (${counter})`;
     }

     const newItem = {
         id: `${type === 'folder' ? 'folder' : 'item'}-in-${folderData.id}-${Date.now()}`, 
         name: name,
         type: type,
         content: type === 'folder' ? [] : ""
     };

     folderData.content.push(newItem);
     saveDesktopState();

     const folderContentElement = document.getElementById(`folder-content-${folderData.id}`);
     if (folderContentElement && folderContentElement.__refreshFolderView) {
          folderContentElement.__refreshFolderView(() => {
              const newItemDataInFolder = folderData.content.find(i => i.id === newItem.id);
              if (newItemDataInFolder) {
                   renameItemInFolder(newItemDataInFolder, folderData, true); 
              } else {
                   console.error(`Could not find newly created item ${newItem.id} in folder data after refresh.`);
              }
          });
     } else {
          console.warn(`Could not find open folder view for ${folderData.id} to refresh after creating item.`);
     }
}

export function createDesktopIconElement(item) {
    if (!iconTemplate) {
        console.error("Desktop icon template not found!");
        return null;
    }
    const iconClone = iconTemplate.content.cloneNode(true);
    const iconElement = iconClone.querySelector('.desktop-icon');
    const iconLabel = iconElement.querySelector('.icon-label');
    const iconImageContainer = iconElement.querySelector('.icon-image');

    iconElement.id = item.id;
    if (item.x !== undefined && item.y !== undefined) {
        iconElement.style.position = 'absolute'; 
        iconElement.style.left = `${item.x}px`;
        iconElement.style.top = `${item.y}px`;
        iconElement.style.zIndex = 'var(--desktop-icon-z-index)';
    } else {
         iconElement.style.position = 'relative'; 
         iconElement.style.left = 'auto';
         iconElement.style.top = 'auto';
    }

    iconLabel.textContent = item.name;
    iconElement.dataset.itemId = item.id; 

    if (iconImageContainer) {
        let svgContent = '';
        let fillColor = '#6c757d'; 

        if (item.type === 'txt') {
            svgContent = `<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>`;
            fillColor = '#6c757d'; 
        } else if (item.type === 'folder') {
            svgContent = `<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>`;
            fillColor = '#ffca28'; 
        } else {
            svgContent = `<path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/>`;
            fillColor = '#adb5bd'; 
        }

        let svgElement = iconImageContainer.querySelector('svg');
        if (!svgElement) {
             svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
             svgElement.setAttribute('viewBox', '0 0 24 24');
             svgElement.setAttribute('width', '36');
             svgElement.setAttribute('height', '36');
             iconImageContainer.appendChild(svgElement);
        }
        svgElement.innerHTML = svgContent; 
        svgElement.setAttribute('fill', fillColor); 
    }

    iconElement.addEventListener('click', (e) => {
        e.stopPropagation(); 

        const parentElement = iconElement.parentElement; 
        const siblingIconsSelector = parentElement === desktop ? ':scope > .desktop-icon' : '.desktop-icon';
        const siblingIcons = parentElement.querySelectorAll(siblingIconsSelector);

        const isCtrlClick = e.ctrlKey || e.metaKey; 
        const isShiftClick = e.shiftKey;

        if (!isCtrlClick && !isShiftClick) {
            siblingIcons.forEach(i => {
                if (i !== iconElement) {
                    i.classList.remove('selected');
                }
            });
            iconElement.classList.add('selected');
        } else if (isCtrlClick) {
            iconElement.classList.toggle('selected');
        } else if (isShiftClick) {
            console.log("Shift-click selection not implemented yet.");
        }
    });

    iconElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const itemDataResult = findItemData(item.id);
        if (itemDataResult) {
            openItem(item.id, itemDataResult.item); 
        } else {
            console.error(`Could not find data for item ID ${item.id} on double click.`);
        }
    });

    iconElement.addEventListener('contextmenu', (e) => {
         const parentFolderElement = iconElement.closest('.folder-view-content');
         if (parentFolderElement) {
             const folderId = parentFolderElement.dataset.folderId;
             const folderData = desktopItems.find(f => f.id === folderId);
             const itemDataInFolder = folderData?.content?.find(i => i.id === item.id);
             if (itemDataInFolder && folderData) {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu(e, itemDataInFolder, 'folder-item', folderData);
             } else {
                  console.error("Could not find folder item data for context menu, falling back to desktop context.");
                  handleIconContextMenu(e, item); 
             }
         } else {
              handleIconContextMenu(e, item); 
         }
    });

    if (item.x !== undefined && item.y !== undefined) { 
        iconElement.draggable = true;
        iconElement.addEventListener('dragstart', (e) => {
            e.stopPropagation(); 

            e.dataTransfer.setData('application/desktop-icon', item.id);
            e.dataTransfer.effectAllowed = 'move';
            iconElement.classList.add('dragging'); 

            const rect = iconElement.getBoundingClientRect();
            item.dragOffsetX = e.clientX - rect.left;
            item.dragOffsetY = e.clientY - rect.top;
            item.originalX = item.x; 
            item.originalY = item.y;

        });

        iconElement.addEventListener('dragend', (e) => {
            iconElement.classList.remove('dragging');
            removeFolderHighlight(); 

            delete item.originalX;
            delete item.originalY;
            delete item.dragOffsetX;
            delete item.dragOffsetY;
        });
    }

    if (item.x !== undefined && item.y !== undefined) { 
        desktop.appendChild(iconElement);
    }

    return iconElement; 
}

export function openItem(itemId, itemData = null) {
    if (!itemData) {
         const result = findItemData(itemId);
         if (result) {
             itemData = result.item;
         }
    }
    if (!itemData) {
        console.error(`Cannot open item: Data not found for ID ${itemId}`);
        return;
    }

    console.log(`Opening item: ${itemData.name} (Type: ${itemData.type})`);

    if (itemData.type === 'txt') {
        const editorContent = `
            <div class="text-editor-content" data-file-id="${itemData.id}">
                <textarea class="editor-area" spellcheck="false">${itemData.content || ''}</textarea>
                <div class="editor-statusbar">
                    <span class="line-col-info">Ln 1, Col 1</span>
                    <button class="save-button" title="Save changes">Save</button>
                 </div>
            </div>
        `;
        const windowId = createWindow(itemData.name, editorContent);
        setTimeout(() => setupTextEditor(windowId, itemId), 0); 
    } else if (itemData.type === 'folder') {
         const openWindowsMap = getOpenWindows(); 
         const existingWindowId = Object.keys(openWindowsMap).find(winId => {
              const winData = openWindowsMap[winId];
              return winData.isFolderView && winData.folderId === itemData.id && !winData.isClosed;
          });

          if (existingWindowId) {
               bringToFront(existingWindowId);
               return; 
          }

        const folderContentHTML = `
            <div class="folder-view-content" id="folder-content-${itemData.id}" data-folder-id="${itemData.id}">
                <!-- Folder icons will be rendered here by folderView.js -->
                <p class="empty-folder-text" style="display: ${itemData.content && itemData.content.length > 0 ? 'none' : 'block'};">
                    This folder is empty.
                </p>
            </div>
        `;
        const windowId = createWindow(itemData.name, folderContentHTML, { width: 600, height: 400 });
        const windowInfo = getOpenWindows()[windowId]; 
        if (windowInfo) {
             windowInfo.isFolderView = true; 
             windowInfo.folderId = itemData.id; 
        }

        setTimeout(() => {
             const folderContentElement = document.getElementById(`folder-content-${itemData.id}`);
             if (folderContentElement) {
                  initFolderView(folderContentElement, itemData, folderViewCallbacks);
             } else {
                 console.error(`Could not find folder content element for ${itemData.id} immediately after creation.`);
             }
        }, 0); 
    } else {
        createWindow(itemData.name, `<p>Cannot open file of type: ${itemData.type}</p>`);
    }
}

function setupTextEditor(windowId, fileId) {
    const windowElement = document.getElementById(windowId);
    if (!windowElement) {
        console.error("Could not find window element for text editor setup:", windowId);
        return;
    }

    const textarea = windowElement.querySelector('.editor-area');
    const saveButton = windowElement.querySelector('.save-button');
    const statusBarInfo = windowElement.querySelector('.line-col-info');

    if (!textarea || !saveButton || !fileId || !statusBarInfo) {
        console.warn("Text editor elements not found or fileId missing in window:", windowId);
        return;
    }

    saveButton.addEventListener('click', () => {
        const itemInfo = findItemData(fileId); 
        if (itemInfo) {
            itemInfo.item.content = textarea.value; 
            saveDesktopState(); 
            console.log(`Saved content for ${itemInfo.item.name}`);
            saveButton.textContent = "Saved!";
            saveButton.disabled = true; 
            setTimeout(() => {
                saveButton.textContent = "Save";
                saveButton.disabled = false; 
            }, 1500);
        } else {
            console.error("Could not find item data to save for ID:", fileId);
            alert("Error: Could not find original file data to save.");
        }
    });

    const updateStatus = () => {
         const text = textarea.value;
         const cursorPos = textarea.selectionStart;
         const lineNum = text.substring(0, cursorPos).split('\n').length;
         const lineStartPos = text.lastIndexOf('\n', cursorPos - 1) + 1;
         const colNum = cursorPos - lineStartPos + 1;
         statusBarInfo.textContent = `Ln ${lineNum}, Col ${colNum}`;
     };

     textarea.addEventListener('input', updateStatus);
     textarea.addEventListener('click', updateStatus); 
     textarea.addEventListener('keyup', updateStatus); 
     updateStatus(); 
}

function showProperties(itemId, locationContext = 'Desktop') {
     const itemInfo = findItemData(itemId);
     if (!itemInfo) {
          console.error(`Cannot show properties: Item data not found for ID ${itemId}`);
          return;
     }
     const item = itemInfo.item;

    let sizeInfo = '';
    if (item.type === 'folder') {
        const count = item.content ? item.content.length : 0;
        sizeInfo = `Contains ${count} item${count === 1 ? '' : 's'}`;
    } else if (item.type === 'txt') {
        const sizeInBytes = item.content ? new Blob([item.content]).size : 0;
        sizeInfo = `Size: ${formatBytes(sizeInBytes)}`;
    } else {
         sizeInfo = 'Size: N/A'; 
    }

    const propertiesContent = `
        <div class="properties-content">
            <h3>${item.name} Properties</h3>
            <p><strong>Type:</strong> ${item.type.toUpperCase()} ${item.type === 'folder' ? 'Folder' : 'File'}</p>
            <p><strong>Location:</strong> ${locationContext}</p> 
            <p><strong>${item.type === 'folder' ? 'Contents:' : 'Size:'}</strong> ${sizeInfo}</p>
            <p><strong>ID:</strong> <small>${item.id}</small></p>
            </div>
            `;

    createWindow(`${item.name} Properties`, propertiesContent, { width: 350, height: 250 /*, resizable: false*/ });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function deleteItem(itemId, context, folderData = null) {
     const itemInfo = findItemData(itemId);
     if (!itemInfo) {
          console.error(`Cannot delete item: Data not found for ID ${itemId}`);
          return;
     }

     const item = itemInfo.item;
     const sourceArray = itemInfo.source; 
     const itemIndex = sourceArray.findIndex(i => i.id === itemId);

     if (itemIndex > -1) {
         if (!confirm(`Are you sure you want to delete "${item.name}"? This cannot be undone.`)) {
             return; 
         }

         if (item.type === 'folder' && item.content && item.content.length > 0) {
             console.warn(`Deleting folder "${item.name}" which contains ${item.content.length} item(s).`);
         }

         if (item.element && item.element.parentNode) {
             item.element.parentNode.removeChild(item.element);
         }

         sourceArray.splice(itemIndex, 1);

         saveDesktopState();

         console.log(`Deleted item: ${itemId} from context: ${context}`);

         if (context === 'folder-item' && folderData) {
             const folderContentElement = document.getElementById(`folder-content-${folderData.id}`);
             if (folderContentElement && folderContentElement.__refreshFolderView) {
                  folderContentElement.__refreshFolderView();
             }
         }
     } else {
          console.error(`Failed to find item index for deletion after finding item data: ${itemId}`);
     }
}

function renderDesktopIcons() {
    const existingIcons = desktop.querySelectorAll(':scope > .desktop-icon');
    existingIcons.forEach(icon => icon.remove());
    nextZIndex = 1; 

    desktopItems.forEach(item => {
        if (item.x !== undefined && item.y !== undefined) {
            const iconElement = createDesktopIconElement(item);
            item.element = iconElement; 
        }
    });
}

export function saveDesktopState() {
    const dataToSave = JSON.parse(JSON.stringify(desktopItems));

    function removeElementRef(items) {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            delete item.element;
            delete item.originalX;
            delete item.originalY;
            delete item.dragOffsetX;
            delete item.dragOffsetY;
            if (item.type === 'folder' && item.content) {
                removeElementRef(item.content); 
            }
        });
    }

    removeElementRef(dataToSave);

    try {
        localStorage.setItem('cniOSDesktopItems', JSON.stringify(dataToSave));
        console.log("Desktop state saved.");
    } catch (error) {
        console.error("Error saving desktop state:", error);
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
             alert("Error: Could not save desktop state. Storage limit reached. Please clear some storage or delete items.");
        }
    }
}

function loadDesktopState() {
    try {
        const savedData = localStorage.getItem('cniOSDesktopItems');
        if (savedData) {
            desktopItems = JSON.parse(savedData);
            desktopItems.forEach(item => {
                 if (item.x !== undefined && item.y !== undefined) {
                     item.x = Math.round((item.x ?? 0) / ICON_GRID_SIZE) * ICON_GRID_SIZE;
                     item.y = Math.round((item.y ?? 0) / ICON_GRID_SIZE) * ICON_GRID_SIZE;
                 }
                 item.type = item.type ?? 'unknown';
                 item.name = item.name ?? 'Unnamed Item';
                 item.id = item.id ?? `${item.type}-${Date.now()}${Math.random()}`;

                 if (item.type === 'folder') {
                      item.content = Array.isArray(item.content) ? item.content : [];
                      item.content.forEach((subItem, index) => {
                           subItem.id = subItem.id || `item-in-${item.id}-${index}-${Date.now()}${Math.random()}`;
                           subItem.name = subItem.name || 'Unnamed Item';
                           subItem.type = subItem.type || 'unknown';
                           subItem.content = subItem.content ?? (subItem.type === 'folder' ? [] : (subItem.type === 'txt' ? '' : null));
                      });
                 } else if (item.type === 'txt') {
                      item.content = typeof item.content === 'string' ? item.content : '';
                 } else {
                      delete item.content;
                 }
            });
        } else {
            desktopItems = []; 
            desktopItems.push({ id: 'item-default-readme', name: 'Readme.txt', type: 'txt', x: 0, y: 0, content: 'Welcome to cniOS!\n\n- Right-click the desktop for options like creating new files/folders.\n- Double-click icons to open them.\n- Drag icons to rearrange them or drop them onto folders.\n- Drag windows by their title bars.' });
            desktopItems.push({ id: 'folder-default-docs', name: 'Documents', type: 'folder', x: 0, y: ICON_GRID_SIZE, content: [
                 { id: 'item-in-docs-1', name: 'Sample Doc.txt', type: 'txt', content: 'This is a file inside the Documents folder.'}
            ] });
            saveDesktopState(); 
        }
    } catch (error) {
        console.error("Error loading or parsing desktop state:", error);
        desktopItems = [];
    }
}