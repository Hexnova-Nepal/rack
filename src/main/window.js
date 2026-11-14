// Where Rack's window opens.
'use strict';

/**
 * The saved position of the window, or {} when no screen shows it any more: a monitor was
 * unplugged or moved, or the resolution changed. Without this the window would open where you
 * can't see it. displays is what Electron's screen.getAllDisplays() returns.
 */
function placeOnScreen(bounds, displays) {
  const b = bounds || {};
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return {};
  const width = b.width || 1440;
  const seen = (displays || []).some((d) => {
    const a = d.workArea || d.bounds;
    if (!a) return false;
    const across = Math.min(b.x + width, a.x + a.width) - Math.max(b.x, a.x);
    // enough of the title bar is on this screen to grab and drag
    return across >= 240 && b.y >= a.y - 12 && b.y <= a.y + a.height - 80;
  });
  return seen ? { x: b.x, y: b.y } : {};
}

module.exports = { placeOnScreen };
