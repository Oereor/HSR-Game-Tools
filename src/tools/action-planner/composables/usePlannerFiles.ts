import { ref, shallowRef } from 'vue'
import { DEFAULT_LIMITS } from '../engine/queue'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
  preparePlannerDocument,
  plannerFilename,
  FILE_LIMITS,
  PlannerFileError,
} from '../model/document-file'
import type { createPlannerPersistence, StorageToken } from '../model/persistence'
import type { PlannerTemplate } from '../templates/catalog'
import { loadPlannerTemplate } from '../templates/loader'
import type { useActionPlanner } from './useActionPlanner'

type PreparedDocument = ReturnType<typeof preparePlannerDocument>
type PendingAction =
  | { kind: 'replace'; prepared: PreparedDocument; token?: StorageToken; guarded: boolean }
  | { kind: 'reload'; prepared: PreparedDocument; token: StorageToken; guarded: boolean }
  | { kind: 'overwrite'; token: StorageToken; guarded: true }

/** File and recovery actions share the session's committed document and storage guard. */
export function usePlannerFiles(
  session: {
    planner: Pick<ReturnType<typeof useActionPlanner>, 'document' | 'restorePrepared'>
    persistence: ReturnType<typeof createPlannerPersistence>
  },
  hasUncommittedInput: () => boolean,
  download: (source: string, filename: string) => void,
) {
  const { planner, persistence } = session
  const busy = ref(false)
  const error = ref<string>()
  const pending = shallowRef<PendingAction>()

  function setError(cause: unknown) {
    error.value = cause instanceof PlannerFileError ? cause.code : 'read'
  }
  function prepare({ document, issues, migration }: ReturnType<typeof parsePlannerDocument>) {
    return preparePlannerDocument(document, issues, migration)
  }
  function exportFile() {
    try {
      const doc = planner.document.value
      download(serializePlannerDocument(doc), plannerFilename(doc.name))
      error.value = undefined
    } catch (cause) {
      setError(cause)
    }
  }
  function backupRaw() {
    const token = persistence.capture()
    if (token && token.raw !== null) download(token.raw, 'action-planner-storage-backup.json')
  }
  function worthKeeping() {
    const doc = planner.document.value
    return !!(
      doc.name ||
      doc.plan.actors.length ||
      doc.plan.skillPoints !== undefined ||
      doc.plan.events.some((event) => event.operations.length || event.skill !== undefined) ||
      Object.keys(doc.metadata.customNames).length ||
      doc.plan.maxNodes !== DEFAULT_LIMITS.maxNodes ||
      doc.plan.maxAV !== DEFAULT_LIMITS.maxAV ||
      doc.plan.cycleMode !== 'none' ||
      doc.plan.aha.baseSpeed !== 80 ||
      hasUncommittedInput()
    )
  }
  function requestReplacement(prepared: PreparedDocument) {
    const token = persistence.capture()
    pending.value = { kind: 'replace', prepared, token, guarded: persistence.guarded }
    if (!worthKeeping() && !persistence.guarded) confirm()
  }
  function newDocument() {
    error.value = undefined
    requestReplacement(preparePlannerDocument(emptyDocument()))
  }
  async function importFile(file: Pick<File, 'size' | 'text'>) {
    if (busy.value) return
    busy.value = true
    error.value = undefined
    try {
      if (file.size > FILE_LIMITS.bytes) throw new PlannerFileError('limit')
      requestReplacement(prepare(parsePlannerDocument(await file.text())))
    } catch (cause) {
      setError(cause)
    } finally {
      busy.value = false
    }
  }
  function useTemplate(template: PlannerTemplate) {
    try {
      const prepared = prepare(loadPlannerTemplate(template))
      error.value = undefined
      requestReplacement(prepared)
      return true
    } catch (cause) {
      setError(cause)
      return false
    }
  }
  function reload() {
    try {
      const token = persistence.capture()
      if (!token) return
      const prepared =
        token.raw === null
          ? preparePlannerDocument(emptyDocument())
          : prepare(parsePlannerDocument(token.raw))
      pending.value = { kind: 'reload', prepared, token, guarded: persistence.guarded }
    } catch (cause) {
      setError(cause)
    }
  }
  function overwrite() {
    const token = persistence.capture()
    if (token) pending.value = { kind: 'overwrite', token, guarded: true }
  }
  function retry() {
    if (persistence.guarded) overwrite()
    else persistence.save(planner.document.value)
  }
  function confirm() {
    const action = pending.value
    if (!action) return
    const latest = persistence.capture()
    if (action.token && (!latest || latest.raw !== action.token.raw)) {
      error.value = 'changed'
      pending.value = undefined
      return
    }
    if (action.kind === 'overwrite') {
      persistence.overwrite(planner.document.value, action.token)
    } else if (action.kind === 'reload') {
      persistence.reload(() => planner.restorePrepared(action.prepared), action.token)
    } else {
      persistence.withoutSaving(() => planner.restorePrepared(action.prepared))
      if (action.token) persistence.overwrite(planner.document.value, action.token)
      else persistence.save(planner.document.value)
    }
    pending.value = undefined
  }

  return {
    busy,
    error,
    pending,
    exportFile,
    backupRaw,
    newDocument,
    importFile,
    useTemplate,
    reload,
    overwrite,
    retry,
    confirm,
  }
}
