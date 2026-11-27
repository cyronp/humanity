import { createContext, useContext, useEffect } from "react"

export const WidePanel = createContext<(wide: boolean) => void>(() => undefined)

export const useWidePanel = (wide: boolean) => {
  const setWide = useContext(WidePanel)
  useEffect(() => {
    setWide(wide)
    return () => setWide(false)
  }, [wide, setWide])
}
