import { describe, expect, it } from "vitest"
import {
  formatPickedElement,
  type PickedElement,
  sourceFromStack,
} from "@/features/browser/capture"
import { appendBlock } from "@/features/extensions/prompt"

const picked = (patch: Partial<PickedElement> = {}): PickedElement => ({
  url: "http://localhost:5173/login",
  title: "Login",
  selector: "main > form > button.primary",
  label: "button.primary",
  html: '<button class="primary">Save changes</button>',
  htmlTruncated: false,
  text: "Save changes",
  styles: [
    ["display", "inline-block"],
    ["color", "rgb(255, 255, 255)"],
  ],
  box: { x: 40, y: 300, width: 120, height: 36 },
  react: null,
  ...patch,
})

describe("sourceFromStack", () => {
  it("finds the app's own frame in a React 19 debug stack", () => {
    const stack = [
      "Error: react-stack-top-frame",
      "    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:247:30)",
      "    at LoginForm (http://localhost:5173/src/features/auth/LoginForm.tsx?t=1700000000:42:7)",
      "    at App (http://localhost:5173/src/App.tsx:10:3)",
    ].join("\n")
    expect(sourceFromStack(stack)).toEqual({
      file: "src/features/auth/LoginForm.tsx",
      line: 42,
      column: 7,
    })
  })

  it("reads Firefox-style frames, and finds nothing in React's own", () => {
    expect(sourceFromStack("x\nLoginForm@http://localhost:3000/app/page.tsx:5:9")).toEqual({
      file: "app/page.tsx",
      line: 5,
      column: 9,
    })
    expect(
      sourceFromStack("Error\n    at f (http://localhost:5173/node_modules/react-dom/x.js:1:1)"),
    ).toBeUndefined()
  })
})

describe("formatPickedElement", () => {
  it("says what the element is, where it was written, and shows its HTML", () => {
    const text = formatPickedElement(
      picked({
        react: {
          name: "LoginForm",
          source: { file: "/home/me/app/src/LoginForm.tsx", line: 42, column: 7 },
          stack: null,
        },
      }),
    )
    expect(text).toContain(
      'Element picked in the Browser: `button.primary` ("Save changes") on http://localhost:5173/login',
    )
    expect(text).toContain("- Component: `LoginForm` in `src/LoginForm.tsx:42`")
    expect(text).toContain("- Selector: `main > form > button.primary`")
    expect(text).toContain("- Box: 120 × 36 at (40, 300)")
    expect(text).toContain("- Styles: display: inline-block; color: rgb(255, 255, 255)")
    expect(text).toContain('```html\n<button class="primary">Save changes</button>\n```')
  })

  it("leaves the component out for a page without React", () => {
    expect(formatPickedElement(picked())).not.toContain("Component")
  })
})

describe("appendBlock", () => {
  it("adds a paragraph after what is typed", () => {
    expect(appendBlock("Fix this:  ", "BLOCK")).toEqual({
      text: "Fix this:\n\nBLOCK\n\n",
      caret: "Fix this:\n\nBLOCK\n\n".length,
    })
    expect(appendBlock("", "BLOCK").text).toBe("BLOCK\n\n")
  })
})
