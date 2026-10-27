// Reserve playback keys, including while another control has focus.
export function installFrameKeys({ target, blurTarget, isReady, step, toggle }) {
  const held = new Set();
  let spaceHeld = false;
  const advance = () => {
    if (!isReady() || !held.size) return;
    const key = [...held].at(-1);
    step(key === 'ArrowRight' ? 1 : -1);
  };
  const clear = () => { held.clear(); spaceHeld = false; };
  target.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', ' '].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === ' ') {
      if (!spaceHeld && !event.repeat) { spaceHeld = true; if (isReady()) toggle?.(); }
      return;
    }
    // Match multiview_tool: one immediate step, then only native OS repeats.
    if (event.repeat) { if (held.has(event.key)) advance(); return; }
    if (held.has(event.key)) return;
    held.clear(); held.add(event.key); advance();
  }, true);
  target.addEventListener('keyup', event => {
    if (event.key === ' ' && spaceHeld) {
      event.preventDefault(); event.stopImmediatePropagation(); spaceHeld = false; return;
    }
    if (!held.has(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); held.delete(event.key);
  }, true);
  blurTarget.addEventListener('blur', clear);
  target.addEventListener('visibilitychange', () => { if (target.hidden) clear(); });
  return { clear };
}
