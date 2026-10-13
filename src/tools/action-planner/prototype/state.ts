import { computed, ref, shallowRef, watch } from 'vue'

export type PrototypeKind = 'speed' | 'advance' | 'delay' | 'event'
export type PrototypeOperation = { id: string; phase: 'preAction' | 'postAction' } & (
  | {
      kind: 'speed'
      targets: string[]
      mode: 'flat' | 'percent'
      amount: number
      duration:
        { kind: 'turns'; turns: number } | { kind: 'countdown'; name: string; speed: number }
    }
  | { kind: 'advance' | 'delay'; targets: string[]; amount: number }
  | { kind: 'event'; name: string; speed: number }
)
export interface PrototypeDraft {
  id?: string
  kind: PrototypeKind
  targets: string[]
  mode: 'flat' | 'percent'
  amount: number | null
  phase: 'preAction' | 'postAction'
  duration: 'turns' | 'countdown'
  turns: number | null
  countdownName: string
  countdownSpeed: number | null
  eventName: string
  eventSpeed: number | null
}
export function newDraft(operation?: PrototypeOperation): PrototypeDraft {
  const draft: PrototypeDraft = {
    kind: 'speed',
    targets: ['1001'],
    mode: 'flat',
    amount: 20,
    phase: 'postAction',
    duration: 'turns',
    turns: 2,
    countdownName: '',
    countdownSpeed: 70,
    eventName: '',
    eventSpeed: 90,
  }
  if (!operation) return draft
  draft.id = operation.id
  draft.kind = operation.kind
  draft.phase = operation.phase
  if (operation.kind === 'event') {
    draft.eventName = operation.name
    draft.eventSpeed = operation.speed
  } else {
    draft.targets = [...operation.targets]
    draft.amount = operation.amount
    if (operation.kind === 'speed') {
      draft.mode = operation.mode
      draft.duration = operation.duration.kind
      if (operation.duration.kind === 'turns') draft.turns = operation.duration.turns
      else {
        draft.countdownName = operation.duration.name
        draft.countdownSpeed = operation.duration.speed
      }
    }
  }
  return draft
}
const positive = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0
export function parseDraft(
  draft: PrototypeDraft,
  id: string,
): { operation?: PrototypeOperation; errors: string[] } {
  const errors: string[] = []
  const common = { id, phase: draft.phase }
  if (draft.kind === 'event') {
    if (!draft.eventName.trim()) errors.push('eventName')
    if (!positive(draft.eventSpeed)) errors.push('eventSpeed')
    return errors.length
      ? { errors }
      : {
          errors,
          operation: {
            ...common,
            kind: 'event',
            name: draft.eventName.trim(),
            speed: draft.eventSpeed!,
          },
        }
  }
  if (!draft.targets.length) errors.push('targets')
  if (
    draft.amount === null ||
    !Number.isFinite(draft.amount) ||
    (draft.kind !== 'speed' && draft.amount < 0)
  )
    errors.push('amount')
  if (draft.kind === 'advance' && draft.amount !== null && draft.amount > 100) errors.push('amount')
  if (draft.kind !== 'speed')
    return errors.length
      ? { errors }
      : {
          errors,
          operation: {
            ...common,
            kind: draft.kind,
            targets: [...draft.targets],
            amount: draft.amount!,
          },
        }
  if (draft.duration === 'turns' && (!positive(draft.turns) || !Number.isSafeInteger(draft.turns)))
    errors.push('turns')
  if (draft.duration === 'countdown') {
    if (!draft.countdownName.trim()) errors.push('countdownName')
    if (!positive(draft.countdownSpeed)) errors.push('countdownSpeed')
  }
  return errors.length
    ? { errors }
    : {
        errors,
        operation: {
          ...common,
          kind: 'speed',
          targets: [...draft.targets],
          mode: draft.mode,
          amount: draft.amount!,
          duration:
            draft.duration === 'turns'
              ? { kind: 'turns', turns: draft.turns! }
              : {
                  kind: 'countdown',
                  name: draft.countdownName.trim(),
                  speed: draft.countdownSpeed!,
                },
        },
      }
}
/** Design-spike state only. No SimulationPlan mutation or persistence. */
export function usePlannerPrototype(
  keys: string[],
  initial: Record<string, PrototypeOperation[]> = {},
) {
  const selected = ref(keys[0] ?? '')
  const committed = shallowRef(initial)
  const draft = ref<PrototypeDraft>()
  const errors = ref<string[]>([])
  const operations = computed(() => committed.value[selected.value] ?? [])
  watch(
    () => [draft.value?.kind, draft.value?.duration],
    () => {
      errors.value = []
    },
  )
  let sequence = 0
  function cancel() {
    draft.value = undefined
    errors.value = []
  }
  function select(key: string) {
    if (keys.includes(key) && key !== selected.value) {
      cancel()
      selected.value = key
    }
  }
  function edit(operation?: PrototypeOperation) {
    draft.value = newDraft(operation)
    errors.value = []
  }
  function submit() {
    if (!draft.value) return false
    const parsed = parseDraft(draft.value, draft.value.id ?? `prototype:${++sequence}`)
    errors.value = parsed.errors
    if (!parsed.operation) return false
    const next = operations.value.filter((o) => o.id !== parsed.operation!.id)
    const oldIndex = operations.value.findIndex((o) => o.id === parsed.operation!.id)
    next.splice(oldIndex < 0 ? next.length : oldIndex, 0, parsed.operation)
    committed.value = { ...committed.value, [selected.value]: next }
    cancel()
    return true
  }
  function remove(id: string) {
    committed.value = {
      ...committed.value,
      [selected.value]: operations.value.filter((o) => o.id !== id),
    }
  }
  return { selected, committed, draft, errors, operations, select, edit, cancel, submit, remove }
}
