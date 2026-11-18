/** What the picker reports about the element the human clicked in a Browser page. */
export interface PickedElement {
  readonly url: string
  readonly title: string
  readonly selector: string
  readonly label: string
  readonly html: string
  readonly htmlTruncated: boolean
  readonly text: string
  readonly styles: ReadonlyArray<readonly [string, string]>
  readonly box: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly react: {
    readonly name: string | null
    readonly source: SourceLocation | null
    readonly stack: string | null
  } | null
}

export interface SourceLocation {
  readonly file: string
  readonly line: number
  readonly column: number | null
}

/**
 * Runs in the page's own world (`executeJavaScript`), so it sees React's internals and no CSP of
 * the page stops it. It highlights the element under the pointer and resolves with what the human
 * clicks, or with null on Esc. Its overlay lives in a closed shadow root and is removed after.
 */
export const PICKER_SCRIPT = String.raw`(() => new Promise((resolve) => {
  if (window.__humanityPick) window.__humanityPick.cancel()
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none"
  const shadow = host.attachShadow({ mode: "closed" })
  shadow.innerHTML = '<style>.box{position:fixed;border:2px solid #3b82f6;background:rgba(59,130,246,.14);border-radius:2px;pointer-events:none}.tag{position:fixed;font:12px/1.5 system-ui,sans-serif;background:#1d4ed8;color:#fff;padding:1px 6px;border-radius:4px;white-space:nowrap}.hint{position:fixed;left:50%;top:8px;transform:translateX(-50%);font:12px/1.5 system-ui,sans-serif;background:#111827;color:#fff;padding:4px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3)}</style><div class="box"></div><div class="tag"></div><div class="hint">Click an element to add it to your message · Esc cancels</div>'
  const box = shadow.querySelector(".box")
  const tag = shadow.querySelector(".tag")
  document.documentElement.appendChild(host)
  let current = null
  const label = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + [...el.classList].slice(0, 2).map((c) => "." + c).join("")
  const selector = (el) => {
    const parts = []
    for (let node = el; node && node.nodeType === 1 && parts.length < 5; node = node.parentElement) {
      if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) {
        parts.unshift("#" + CSS.escape(node.id))
        break
      }
      let part = node.tagName.toLowerCase() + [...node.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("")
      const parent = node.parentElement
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName)
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")"
      }
      parts.unshift(part)
    }
    return parts.join(" > ")
  }
  const react = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"))
    if (!key) return null
    const own = el[key]
    let name = null
    let owner = null
    for (let fiber = own.return; fiber; fiber = fiber.return) {
      const type = fiber.type
      if (typeof type === "function") { name = type.displayName || type.name || null; owner = fiber; break }
      if (type && typeof type === "object" && (type.render || type.type)) {
        const inner = type.render || type.type
        name = type.displayName || inner.displayName || inner.name || null
        owner = fiber
        break
      }
    }
    const source = own._debugSource || (owner && owner._debugSource) || null
    const stack = own._debugStack && own._debugStack.stack ? String(own._debugStack.stack) : null
    return {
      name,
      source: source ? { file: source.fileName, line: source.lineNumber, column: source.columnNumber == null ? null : source.columnNumber } : null,
      stack,
    }
  }
  const STYLES = ["display", "position", "width", "height", "margin", "padding", "color", "background-color", "font-family", "font-size", "font-weight", "line-height", "border", "border-radius", "gap", "flex-direction", "justify-content", "align-items", "opacity", "z-index"]
  const styles = (el) => {
    const computed = getComputedStyle(el)
    return STYLES.map((name) => [name, computed.getPropertyValue(name)]).filter(([, value]) => value && !["none", "normal", "auto", "0px", "rgba(0, 0, 0, 0)", "static", "1"].includes(value))
  }
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const html = el.outerHTML
    return {
      url: location.href,
      title: document.title,
      selector: selector(el),
      label: label(el),
      html: html.slice(0, 2000),
      htmlTruncated: html.length > 2000,
      text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 200),
      styles: styles(el),
      box: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      react: react(el),
    }
  }
  const move = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY)
    if (!el || el === current) return
    current = el
    const r = el.getBoundingClientRect()
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" })
    tag.textContent = label(el) + "  " + Math.round(r.width) + "×" + Math.round(r.height)
    Object.assign(tag.style, { left: Math.max(0, r.left) + "px", top: Math.max(0, r.top - 22) + "px" })
  }
  const swallow = (event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation() }
  const finish = (value) => {
    removeEventListener("mousemove", move, true)
    removeEventListener("click", click, true)
    removeEventListener("mousedown", swallow, true)
    removeEventListener("mouseup", swallow, true)
    removeEventListener("keydown", key, true)
    host.remove()
    delete window.__humanityPick
    resolve(value)
  }
  const click = (event) => {
    swallow(event)
    const el = document.elementFromPoint(event.clientX, event.clientY) || current
    finish(el ? describe(el) : null)
  }
  const key = (event) => { if (event.key === "Escape") { swallow(event); finish(null) } }
  addEventListener("mousemove", move, true)
  addEventListener("click", click, true)
  addEventListener("mousedown", swallow, true)
  addEventListener("mouseup", swallow, true)
  addEventListener("keydown", key, true)
  window.__humanityPick = { cancel: () => finish(null) }
}))()`

/** Cancels a pick in progress, if the page has one. */
export const CANCEL_PICK_SCRIPT = `window.__humanityPick && window.__humanityPick.cancel(); true`

const INTERNAL =
  /node_modules|react-dom|react\.development|react-jsx|jsx-dev-runtime|\/chunk-|\/deps\/|react-stack-top-frame/

/**
 * Where React 19 says an element was written: the first frame of its `_debugStack` that is the
 * app's own code, as a path without the dev server's query. The line is of the code the browser
 * ran, so it is close to the source's, not always equal.
 */
export const sourceFromStack = (stack: string): SourceLocation | undefined => {
  for (const line of stack.split("\n").slice(1)) {
    const match = /(?:\(|@|\s)((?:https?|file):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(line)
    if (match === null) continue
    const [, url, row, column] = match
    if (url === undefined || INTERNAL.test(url)) continue
    let file = url
    try {
      const parsed = new URL(url)
      file = parsed.protocol === "file:" ? decodeURIComponent(parsed.pathname) : parsed.pathname
    } catch {
      // Keep the address as it is.
    }
    return {
      file: file.replace(/^\/(?=[A-Za-z]:)/, "").replace(/^\//, ""),
      line: Number(row),
      column: Number(column),
    }
  }
  return undefined
}

/** A path from the project's source folder on: `src/` first, else Next.js's `app/` or `pages/`. */
const shortFile = (file: string) => {
  for (const root of ["src", "app", "pages"]) {
    const found = new RegExp(`(?:^|[\\\\/])(${root}[\\\\/].*)$`).exec(file)
    if (found?.[1] !== undefined) return found[1]
  }
  return file
}

/** The element as a block of the message: what it is, where it was written, and its HTML. */
export const formatPickedElement = (picked: PickedElement): string => {
  const source =
    picked.react?.source ??
    (picked.react?.stack == null ? undefined : sourceFromStack(picked.react.stack))
  const lines = [
    `Element picked in the Browser: \`${picked.label}\`${picked.text === "" ? "" : ` ("${picked.text.slice(0, 80)}")`} on ${picked.url}`,
  ]
  if (picked.react?.name != null || source !== undefined) {
    const where = source === undefined ? "" : ` in \`${shortFile(source.file)}:${source.line}\``
    lines.push(`- Component: \`${picked.react?.name ?? "unknown"}\`${where}`)
  }
  lines.push(`- Selector: \`${picked.selector}\``)
  lines.push(
    `- Box: ${picked.box.width} × ${picked.box.height} at (${picked.box.x}, ${picked.box.y})`,
  )
  if (picked.styles.length > 0) {
    lines.push(`- Styles: ${picked.styles.map(([name, value]) => `${name}: ${value}`).join("; ")}`)
  }
  lines.push(
    "```html",
    `${picked.html}${picked.htmlTruncated ? "\n<!-- … cut at 2,000 characters -->" : ""}`,
    "```",
  )
  return lines.join("\n")
}

const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024

/**
 * A screenshot as a file the composer takes: a PNG, or a JPEG when the PNG is larger than an
 * image attachment may be.
 */
export const imageFile = async (png: Uint8Array, name: string): Promise<File> => {
  const pngFile = new File([png.slice()], `${name}.png`, { type: "image/png" })
  if (png.byteLength <= MAX_IMAGE_BYTES) return pngFile
  const bitmap = await createImageBitmap(pngFile)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 })
  return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" })
}
