import { Globe } from "lucide-react"
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import type { PaletteResultsProps } from "@/features/palette/registry"
import { requestPreview } from "./browser.ts"
import { useLocalServers } from "./ServerList.tsx"

export function ServerResults({ close }: PaletteResultsProps) {
  const servers = useLocalServers(false)
  return (
    <>
      <CommandEmpty>No local server is running.</CommandEmpty>
      {servers.length > 0 && (
        <CommandGroup heading="Local servers">
          {servers.map((server) => (
            <CommandItem
              key={server.port}
              value={`server ${server.port}`}
              keywords={[server.url, server.processName ?? ""]}
              onSelect={() => {
                close()
                requestPreview(server.url, { explicit: true })
              }}
            >
              <Globe className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{server.url}</span>
              {server.processName !== null && (
                <span className="shrink-0 text-xs text-muted-foreground">{server.processName}</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}
