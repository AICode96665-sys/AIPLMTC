import type { TcApi } from './index'

declare global {
  interface Window {
    tc: TcApi
  }
}

export {}
