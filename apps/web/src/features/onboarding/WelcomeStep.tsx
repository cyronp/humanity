import { Button } from "@/components/ui/button"
import { BrandMark } from "@/components/BrandMark"

export function WelcomeStep({ onStart }: { readonly onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <BrandMark className="size-24" />
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Humanity</h1>
      <Button variant="brand" size="lg" onClick={onStart} autoFocus>
        Get started
      </Button>
    </div>
  )
}
