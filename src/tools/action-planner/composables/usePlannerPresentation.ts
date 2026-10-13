import { computed, type Ref } from 'vue'
import { gameData, characterName, assetUrl } from '../../../data/adapters/game-data'
import { participantCatalog } from '../../../engine/action-planner/validation'
import type {
  EffectOperation,
  EventAnchor,
  SimulationState,
} from '../../../engine/action-planner/types'
import type { ToolLocale } from '../../../locales/types'
import type { PlannerDocument } from '../model/editor'
import { operationName, participantLabels } from '../model/naming'
export function usePlannerPresentation(
  document: Readonly<Ref<PlannerDocument>>,
  locale: Ref<string>,
) {
  const catalog = computed(() => participantCatalog(document.value.plan))
  const character = (id: string) =>
    gameData.characters.find((c) => c.id === document.value.metadata.characterIds[id])
  const rawName = (id: string) => {
    const c = character(id)
    return c
      ? characterName(c, locale.value as ToolLocale)
      : (catalog.value.find((p) => p.id === id)?.name ??
          (locale.value === 'zh-CN' ? '已移除单位' : 'Removed unit'))
  }
  const labels = computed(() => participantLabels(catalog.value, rawName))
  const label = (id: string) => labels.value.get(id) ?? rawName(id)
  const image = (id: string) =>
    assetUrl(character(id)?.assetKey) ?? catalog.value.find((p) => p.id === id)?.iconUrl
  const title = (operation: EffectOperation, state?: SimulationState) =>
    operationName(
      operation,
      locale.value as ToolLocale,
      label,
      state,
      document.value.metadata.customNames[operation.id],
    )
  const anchorLabel = (anchor: EventAnchor) =>
    anchor.kind === 'start'
      ? locale.value === 'zh-CN'
        ? '战斗开始'
        : 'Battle start'
      : `${label(anchor.participantId)} · ${anchor.kind === 'action' ? (locale.value === 'zh-CN' ? `第 ${anchor.turn} 回合` : `Turn ${anchor.turn}`) : locale.value === 'zh-CN' ? '事件触发' : 'Event trigger'}`
  return { catalog, label, image, title, anchorLabel }
}
