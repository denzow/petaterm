import type { PetatermApi } from './index'

declare global {
  interface Window {
    petaterm: PetatermApi
  }
}

export {}
