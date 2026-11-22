import type { ModelDefault } from "@humanity/contracts"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_MODEL, shortModelName } from "@/features/providers/models"
import { PROVIDER_IDS, PROVIDERS } from "@/features/providers/ProviderIcon"
import { useProviderModels } from "@/features/providers/useProviderModels"

const NONE = "none"

const encode = (choice: ModelDefault): string =>
  JSON.stringify([choice.provider, choice.model ?? DEFAULT_MODEL])

const decode = (value: string): ModelDefault | null => {
  if (value === NONE) return null
  const [provider, model] = JSON.parse(value) as [ModelDefault["provider"], string]
  return { provider, model: model === DEFAULT_MODEL ? null : model }
}

export function ModelDefaultSelect({
  value,
  onChange,
  noneLabel,
  labelledBy,
  disabled = false,
}: {
  readonly value: ModelDefault | null
  readonly onChange: (value: ModelDefault | null) => void
  readonly noneLabel: string
  readonly labelledBy: string
  readonly disabled?: boolean
}) {
  const { models, connected } = useProviderModels()
  const providers = PROVIDER_IDS.filter(
    (provider) => connected[provider] || value?.provider === provider,
  )
  const current = value === null ? NONE : encode(value)
  const listed = providers.some((provider) =>
    models[provider].some((model) => encode({ provider, model: model.value }) === current),
  )

  return (
    <Select value={current} onValueChange={(next) => onChange(decode(next))} disabled={disabled}>
      <SelectTrigger className="w-64" aria-labelledby={labelledBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {value !== null && !listed && (
          <SelectItem value={current} disabled>
            {PROVIDERS[value.provider].name}: {value.model ?? "Default"} (not offered)
          </SelectItem>
        )}
        {providers.map((provider) => {
          const { name, Icon } = PROVIDERS[provider]
          return (
            <SelectGroup key={provider}>
              <SelectSeparator />
              <SelectLabel className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-3.5" />
                {name}
              </SelectLabel>
              {models[provider].map((model) => (
                <SelectItem
                  key={model.value}
                  value={encode({ provider, model: model.value })}
                  title={model.description}
                >
                  {shortModelName(model)}
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
