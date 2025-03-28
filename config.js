// Configuration for cniOS elements

export const WINDOW_DEFAULTS = {
    title: "New Window",
    content: "<p>Default window content.</p>",
    width: 500,   // Default width in pixels
    height: 350,  // Default height in pixels
    top: 60,      // Initial top position in pixels
    left: 80      // Initial left position in pixels
};

export const TASKBAR_OPTIONS = {
    height: 45, // In pixels - keep in sync with CSS var(--taskbar-height)
    blur: 15    // Blur amount for backdrop - keep in sync with CSS
};

// Snap threshold for window edge detection (in pixels)
export const SNAP_THRESHOLD = 30;

export const START_MENU_OPTIONS = {
    width: 320, // In pixels - keep in sync with CSS var(--start-menu-width)
    maxHeight: 450 // In pixels - keep in sync with CSS var(--start-menu-max-height)
};

// Adjusted animation speed slightly for better feel, sync with CSS --transition-speed
export const ANIMATION_SPEED = 250; // ms

export const WALLPAPER_OPTIONS = [
    { id: 'default', name: 'Default', value: 'linear-gradient(135deg, #f2f2f7 0%, #dcdce0 100%)' },
    { id: 'ocean', name: 'Ocean', value: 'linear-gradient(135deg, #69b7eb 0%, #b3dbd3 100%)' },
    { id: 'sunset', name: 'Sunset', value: 'linear-gradient(135deg, #ff8c42 0%, #ff3f55 100%)' },
    { id: 'forest', name: 'Forest', value: 'linear-gradient(135deg, #58A36F 0%, #9DD388 100%)' },
    { id: 'lavender', name: 'Lavender', value: 'linear-gradient(135deg, #D8B4FE 0%, #A78BFA 100%)' },
    { id: 'night', name: 'Night', value: 'linear-gradient(135deg, #2c3e50 0%, #4a69bd 100%)' },
];

export const DEFAULT_WALLPAPER_ID = 'default';

// Add more configuration as needed