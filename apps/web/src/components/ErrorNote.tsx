import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/** Every failure the UI knows about ends up here: visible, specific, never silent. */
export function ErrorNote({
  title = "Something went wrong",
  message,
}: {
  readonly title?: string
  readonly message: string
}) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap">{message}</AlertDescription>
    </Alert>
  )
}
