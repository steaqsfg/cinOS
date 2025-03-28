// ui/startMenu.js - Handles Start Menu toggle and interactions

export function initStartMenu() {
    const startMenuButton = document.getElementById('start-menu-button');
    const startMenu = document.getElementById('start-menu');
    
    // Apply initial hidden state using JS to avoid flicker
    startMenu.style.opacity = '0';
    startMenu.style.pointerEvents = 'none';
    startMenu.style.transform = 'translateY(10px) scale(0.98)';
    startMenu.classList.add('hidden-initially'); // Mark initial state

    let isMenuOpening = false; // Prevent race conditions with click outside listener

    startMenuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent click from immediately triggering close listener
        toggleStartMenu();
    });

    // Optional: Add listener to power button 
    const powerButton = startMenu.querySelector('.start-menu-power');
    if (powerButton) {
        powerButton.addEventListener('click', () => {
            console.log("Power button clicked (implement action)");
            closeStartMenu();
        });
    }
}

function toggleStartMenu() {
    const startMenu = document.getElementById('start-menu');
    const isHidden = startMenu.style.opacity === '0' || startMenu.classList.contains('hidden-initially');

    if (isHidden) {
        openStartMenu();
    } else {
        closeStartMenu();
    }
}

function openStartMenu() {
    const startMenu = document.getElementById('start-menu');
    const startMenuButton = document.getElementById('start-menu-button');
    if (startMenuButton === null || startMenu === null) return;

    let isMenuOpening = false; // Prevent race conditions with click outside listener
    if (isMenuOpening) return;
    isMenuOpening = true;

    startMenu.classList.remove('hidden-initially'); // Allow transition
    requestAnimationFrame(() => { // Ensure class removed before style changes for transition
        startMenu.style.opacity = '1';
        startMenu.style.pointerEvents = 'auto';
        startMenu.style.transform = 'translateY(0) scale(1)';
    });


    // Add listener to close menu when clicking outside, slightly delayed
    setTimeout(() => {
         document.addEventListener('click', closeStartMenuOnClickOutside, { once: true });
         isMenuOpening = false; // Reset flag after listener added
    }, 50); // Small delay to avoid immediate closure if click happened quickly
}

export function closeStartMenu() {
    const startMenu = document.getElementById('start-menu');
    if (startMenu.style.opacity === '0') return; // Already closed or closing

    startMenu.style.opacity = '0';
    startMenu.style.pointerEvents = 'none';
    startMenu.style.transform = 'translateY(10px) scale(0.98)';

    // Clean up listener immediately (even though it's {once: true})
    document.removeEventListener('click', closeStartMenuOnClickOutside);
}

function closeStartMenuOnClickOutside(event) {
    const startMenu = document.getElementById('start-menu');
    const startMenuButton = document.getElementById('start-menu-button');
    // Check if the click is outside the start menu AND outside the start button
    if (!startMenu.contains(event.target) && !startMenuButton.contains(event.target)) {
        closeStartMenu();
    }
     // If click was inside menu or on button, the {once: true} removes the listener automatically.
     // No need to re-add it here as the button click handler will open it again if needed.
}