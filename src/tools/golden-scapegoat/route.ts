import type { RouteRecordRaw } from 'vue-router'

export const goldenScapegoatRoute: RouteRecordRaw = {
  path: '/golden-scapegoat',
  component: () => import('./GoldenScapegoatPage.vue'),
  meta: { title: 'goldenScapegoat.title' },
}
