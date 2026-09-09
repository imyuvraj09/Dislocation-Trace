/**
 * The Layer model -- one entry in an image's layer stack.
 *
 * Every layer (Base Image, Detection, and the Annotation/Measurement/Label
 * placeholders Phase 3 will give real content to) is one of these, so
 * LayerRenderer, LayerManager, and the store's layer actions only ever
 * need to deal with one shape, rather than each maintaining its own
 * slightly-different idea of what a "layer" is.
 *
 * @typedef {Object} Layer
 * @property {string} id
 * @property {string} name
 * @property {string} type        One of constants/imageWorkspace.js's LAYER_TYPES.
 * @property {boolean} visible
 * @property {boolean} locked     Locked layers reject visibility/order changes (currently just Base Image).
 * @property {number} opacity     0..1, composited via CSS opacity in LayerRenderer.
 * @property {number} zIndex      Stacking order, ascending = bottom to top.
 * @property {string} blendMode   A CSS mix-blend-mode value ("normal", "multiply", "screen", ...).
 */

/**
 * Builds one layer, filling in sensible defaults for anything not
 * specified. `id`, `name`, and `type` are the only fields callers
 * typically need to supply.
 * @param {{id: string, name: string, type: string, visible?: boolean, locked?: boolean, opacity?: number, zIndex?: number, blendMode?: string}} def
 * @returns {Layer}
 */
export function createLayer({
  id,
  name,
  type,
  visible = true,
  locked = false,
  opacity = 1,
  zIndex = 0,
  blendMode = "normal",
}) {
  return { id, name, type, visible, locked, opacity, zIndex, blendMode };
}
