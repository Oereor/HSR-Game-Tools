import { Gem, ListOrdered, Ticket } from '@lucide/vue'
import type { Component } from 'vue'
import type { SiteMessages } from '../locales/types'

export interface ToolEntry {
  id: keyof SiteMessages['home']['tools']
  icon: Component
  route?: string
}

export const toolCatalog: readonly ToolEntry[] = [
  { id: 'actionOrder', icon: ListOrdered, route: '/action-planner' },
  { id: 'warp', icon: Ticket, route: '/warp-simulator' },
  { id: 'relic', icon: Gem },
]
