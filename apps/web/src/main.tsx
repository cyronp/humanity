import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-semibold">Humanity</h1>
      <p className="text-neutral-500">Human in the loop, not AI in the loop.</p>
    </main>
  </StrictMode>,
)
