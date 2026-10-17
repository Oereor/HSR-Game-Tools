import { ref } from 'vue'

export type WarpPanel = 'controls' | 'history'
/** UI navigation only: no session, engine or RNG dependency. */
export function useWarpOverlay() {
  const panel = ref<WarpPanel>()
  let pending: (() => void) | undefined
  let origin: WarpPanel | undefined
  let focusId: string | undefined
  let panelTrigger: string | undefined
  function openPanel(value: WarpPanel) {
    panel.value = value
  }
  function closePanel() {
    if (!pending && panel.value) panelTrigger = `warp-${panel.value}-trigger`
    panel.value = undefined
  }
  function openDialog(action: () => void, triggerId: string) {
    origin = panel.value
    focusId = triggerId
    if (panel.value) {
      pending = action
      closePanel()
    } else action()
  }
  function afterPanelHide() {
    const action = pending
    pending = undefined
    if (action) {
      action()
      return undefined
    }
    const trigger = panelTrigger
    panelTrigger = undefined
    return trigger
  }
  function afterDialogHide() {
    panel.value = origin
    origin = undefined
    return panel.value ? undefined : takeFocus()
  }
  function takeFocus() {
    const id = focusId
    focusId = undefined
    return id
  }
  return { panel, openPanel, closePanel, openDialog, afterPanelHide, afterDialogHide, takeFocus }
}
