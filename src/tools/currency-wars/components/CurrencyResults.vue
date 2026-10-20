<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Minus, CircleCheck, Sparkles, ChevronDown } from '@lucide/vue'
import { HBadge, HButton, HTabs, HTabPanels } from 'astral-ui/components'
import Dialog from 'primevue/dialog'
import CurrencyRoleCard from './CurrencyRoleCard.vue'
import CurrencyImage from './CurrencyImage.vue'
import CurrencyTrait from './CurrencyTrait.vue'
import CurrencyEmblemDemand from './CurrencyEmblemDemand.vue'
import { createEmblemDemand, type CurrencyWarsCraftCatalog } from '../ui/crafting'
import { traitDetails } from '../ui/trait-details'
import { resultSummary } from '../ui/result-summary'
import {
  createVisuals,
  sortVisualMembers,
  type VisualCatalog,
  type VisualMember,
} from '../ui/visuals'
import type { SolvedAttempt } from '../ui/session'
import type { Snapshot } from '../types'
const props = defineProps<{
  snapshot: Snapshot
  catalog: VisualCatalog
  crafts: CurrencyWarsCraftCatalog
  attempt: SolvedAttempt
  stale: boolean
  historical: boolean
}>()
const { t } = useI18n()
const visuals = computed(() =>
  createVisuals(props.snapshot, props.catalog, import.meta.env.BASE_URL),
)
const result = computed(() => props.attempt.result)
const summary = computed(() => resultSummary(props.attempt))
const evaluation = computed(() => result.value.evaluation!)
const lineup = computed(() => result.value.lineup!)
const emblemDemands = computed(() =>
  createEmblemDemand(
    { lineup: lineup.value },
    props.snapshot,
    props.crafts,
    props.catalog,
    import.meta.env.BASE_URL,
  ),
)
const members = computed(() =>
  sortVisualMembers(
    lineup.value.members.map((member) =>
      visuals.value.member(
        member,
        evaluation.value.members.find((m) => m.formId === member.formId)!,
      ),
    ),
  ),
)
const traits = computed(() => traitDetails(evaluation.value))
const specialMembers = computed(() => members.value.filter((member) => member.role.mechanic))
const resultTab = ref('lineup')
const resultTabs = computed(() => [
  { value: 'lineup', label: t('currencyWars.result.lineup') },
  { value: 'traits', label: t('currencyWars.result.traits') },
  { value: 'emblems', label: t('currencyWars.crafting.title') },
])
watch(resultTab, () => {
  roleDetailsOpen.value = false
})
const selectedMember = shallowRef<VisualMember>()
const roleDetailsOpen = ref(false)
function inspect(member: VisualMember) {
  selectedMember.value = member
  roleDetailsOpen.value = true
}
function mechanicDescription(member: VisualMember) {
  if (member.role.mechanic === 'navigator')
    return member.target
      ? t('currencyWars.visual.navigatorLink', {
          name: member.role.name,
          target: member.target.name,
        })
      : t('currencyWars.visual.navigatorWithoutTarget', { name: member.role.name })
  return member.bronyaTrait
    ? t('currencyWars.visual.bronyaAssignment', {
        name: member.role.name,
        trait: member.bronyaTrait.name,
      })
    : t('currencyWars.visual.bronyaUnassigned', { name: member.role.name })
}
watch(
  () => props.attempt.requestId,
  () => {
    resultTab.value = 'lineup'
    roleDetailsOpen.value = false
  },
)
</script>

<template>
  <div class="currency-results">
    <div class="currency-summary" :aria-label="t('currencyWars.result.title')">
      <HBadge tone="success" class="currency-summary-tag">
        <CircleCheck :size="18" class="currency-complete-icon" aria-hidden="true" />
        <span>{{
          t('currencyWars.result.completedSummary', {
            completed: summary.completed,
            total: summary.tasks,
          })
        }}</span>
      </HBadge>
      <HBadge tone="gold" class="currency-summary-tag">
        <Sparkles :size="18" class="currency-emblems-icon" aria-hidden="true" />
        <span>{{
          t('currencyWars.result.emblemsSummary', { used: summary.emblems, budget: summary.budget })
        }}</span>
      </HBadge>
    </div>
    <p v-if="stale" class="currency-notice currency-notice--warning">
      {{ t('currencyWars.result.stale') }}
    </p>
    <p v-else-if="historical" class="currency-notice">{{ t('currencyWars.result.historical') }}</p>
    <p v-if="result.status === 'feasible'" class="currency-notice currency-notice--warning">
      {{ t('currencyWars.status.feasible') }}
    </p>
    <p
      v-for="warning in evaluation.warnings"
      :key="warning"
      class="currency-notice currency-notice--warning"
    >
      {{
        t(
          warning === 'bronya-tie-conservative-lower-bound'
            ? 'currencyWars.result.bronyaWarning'
            : 'currencyWars.result.genericWarning',
        )
      }}
    </p>
    <HTabs
      v-model="resultTab"
      :items="resultTabs"
      :label="t('currencyWars.result.title')"
      id-prefix="currency-results"
      variant="pill"
    />
    <HTabPanels
      :value="resultTab"
      :order="['lineup', 'traits', 'emblems']"
      id-prefix="currency-results"
      :animated="false"
      :animate-height="false"
    >
      <template #default="{ value }">
        <div v-if="value === 'lineup'" class="currency-lineup-content">
          <section aria-labelledby="currency-lineup-heading">
            <div class="currency-lineup-heading">
              <h2 id="currency-lineup-heading">{{ t('currencyWars.result.lineup') }}</h2>
            </div>
            <ul class="currency-roster">
              <CurrencyRoleCard
                v-for="member in members"
                :key="member.role.id"
                :member="member"
                @inspect="inspect"
              />
            </ul>
            <p v-if="!members.length" class="currency-muted">
              {{ t('currencyWars.result.noRoles') }}
            </p>
          </section>
          <details v-if="specialMembers.length" class="currency-disclosure">
            <summary>{{ t('currencyWars.result.mechanics') }}</summary>
            <ul v-if="specialMembers.length" class="currency-mechanics currency-muted">
              <li v-for="member in specialMembers" :key="member.role.id">
                {{ mechanicDescription(member) }}
              </li>
            </ul>
          </details>
        </div>
        <section v-else-if="value === 'traits'" :aria-label="t('currencyWars.result.traits')">
          <ul class="currency-trait-list">
            <li v-for="trait in traits" :key="trait.traitId">
              <details class="currency-trait-members">
                <summary>
                  <CurrencyTrait
                    :source="visuals.traitUrl(trait.traitId)"
                    :name="visuals.trait(trait.traitId).name"
                  />
                  <span v-if="trait.tasks.length" class="currency-trait-badges">
                    <HBadge tone="success">{{ t('currencyWars.result.targetTask') }}</HBadge>
                    <HBadge v-if="trait.activeThreshold === null" tone="muted">{{
                      t('currencyWars.result.inactiveTrait')
                    }}</HBadge>
                  </span>
                  <span class="currency-trait-counts">
                    <template v-if="trait.tasks.length">
                      <span v-for="task in trait.tasks" :key="task.id" class="currency-task-target">
                        <span
                          class="currency-task-count"
                          :aria-label="
                            t('currencyWars.result.taskCounts', {
                              actual: trait.count,
                              required: task.requiredCount,
                            })
                          "
                          >{{ trait.count }} / {{ task.requiredCount }}</span
                        >
                        <span class="currency-task-status" :class="{ completed: task.completed }">
                          <Check v-if="task.completed" :size="15" aria-hidden="true" /><Minus
                            v-else
                            :size="15"
                            aria-hidden="true"
                          />
                          {{
                            t(
                              task.completed
                                ? 'currencyWars.result.completed'
                                : 'currencyWars.result.incomplete',
                            )
                          }}
                        </span>
                      </span>
                    </template>
                    <span v-else class="currency-task-count">{{ trait.count }}</span>
                  </span>
                  <ChevronDown class="currency-trait-chevron" :size="16" aria-hidden="true" />
                </summary>
                <ul
                  class="currency-contributors currency-muted"
                  :aria-label="
                    t('currencyWars.result.contributors', {
                      names: trait.contributors
                        .map((id) => visuals.role(id)?.name ?? id)
                        .join(' · '),
                    })
                  "
                >
                  <li
                    v-for="id in trait.contributors"
                    :key="id"
                    :title="visuals.role(id)?.name ?? id"
                    tabindex="0"
                  >
                    <span class="currency-contributor-image"
                      ><CurrencyImage
                        :source="visuals.portrait(id)"
                        :name="visuals.role(id)?.name ?? id"
                        kind="role"
                    /></span>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
          <p v-if="!traits.length" class="currency-muted">
            {{ t('currencyWars.result.noTraits') }}
          </p>
        </section>
        <CurrencyEmblemDemand v-else :demands="emblemDemands" />
      </template>
    </HTabPanels>
    <Dialog
      v-model:visible="roleDetailsOpen"
      class="h-theme currency-theme currency-role-dialog"
      modal
      :pt="{ mask: { class: 'h-theme' } }"
      :draggable="false"
      :header="selectedMember?.role.name"
      :close-button-props="{ 'aria-label': t('currencyWars.visual.closeDetails') }"
      :style="{ width: '440px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 32px)' }"
      @after-hide="selectedMember = undefined"
    >
      <div v-if="selectedMember" class="currency-role-details">
        <p v-if="selectedMember.role.expert">{{ t('currencyWars.visual.expert') }}</p>
        <p v-if="selectedMember.role.position">
          {{ t(`currencyWars.visual.${selectedMember.role.position}`) }}
        </p>
        <h3>{{ t('currencyWars.visual.innateTitle') }}</h3>
        <div class="currency-detail-traits">
          <CurrencyTrait
            v-for="trait in selectedMember.innate"
            :key="trait.id"
            :source="visuals.traitUrl(trait.id)"
            :name="trait.name"
          />
          <span v-if="!selectedMember.innate.length">{{ t('currencyWars.none') }}</span>
        </div>
        <h3>{{ t('currencyWars.visual.wornEmblems') }}</h3>
        <ul class="currency-detail-emblems">
          <li v-for="(emblem, index) in selectedMember.slots" :key="index">
            <template v-if="emblem">
              <span class="currency-detail-emblem-image"
                ><CurrencyImage :source="emblem.url" :name="emblem.name" kind="emblem"
              /></span>
              <span>{{
                t('currencyWars.visual.emblemTrait', { name: emblem.name, trait: emblem.traitName })
              }}</span>
            </template>
            <span v-else class="currency-muted">{{ t('currencyWars.visual.emptySlot') }}</span>
          </li>
        </ul>
        <h3>{{ t('currencyWars.visual.extraTitle') }}</h3>
        <div class="currency-detail-traits">
          <CurrencyTrait
            v-for="trait in selectedMember.extra"
            :key="trait.id"
            :source="visuals.traitUrl(trait.id)"
            :name="trait.name"
          />
          <span v-if="!selectedMember.extra.length">{{ t('currencyWars.none') }}</span>
        </div>
        <div v-if="selectedMember.target" class="currency-navigator-target">
          <span class="currency-detail-emblem-image"
            ><CurrencyImage
              :source="visuals.portrait(selectedMember.target.id)"
              :name="selectedMember.target.name"
              kind="role"
          /></span>
          <span>{{
            t('currencyWars.visual.navigatorTarget', { name: selectedMember.target.name })
          }}</span>
        </div>
        <p
          v-if="selectedMember.target && ['8007', '8009'].includes(selectedMember.target.id)"
          class="currency-muted"
        >
          {{ t('currencyWars.visual.trailblazerInheritance') }}
        </p>
        <p v-if="selectedMember.role.mechanic">{{ mechanicDescription(selectedMember) }}</p>
        <p class="currency-muted">
          {{ t('currencyWars.visual.formId', { id: selectedMember.role.id }) }}
        </p>
      </div>
      <template #footer>
        <HButton @click="roleDetailsOpen = false">{{
          t('currencyWars.visual.closeDetails')
        }}</HButton>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.currency-results {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.currency-results h2 {
  font-size: 15px;
  margin: 0 0 12px;
}
.currency-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.currency-summary-tag {
  font-size: 12px;
  padding: 6px 10px;
  font-variant-numeric: tabular-nums;
  white-space: normal;
}
.currency-lineup-heading {
  margin-bottom: 14px;
}
.currency-muted {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.currency-roster {
  display: grid;
  --role-size: 128px;
  grid-template-columns: repeat(auto-fill, minmax(0, var(--role-size)));
  justify-content: start;
  gap: 16px 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.currency-trait-list,
.currency-mechanics,
.currency-detail-emblems {
  padding: 0;
  list-style: none;
  margin: 0;
}
.currency-mechanics {
  display: grid;
  gap: 4px;
  margin-top: 12px;
}
.currency-trait-list {
  font-size: 13px;
}
.currency-trait-list > li {
  border-bottom: 1px solid var(--h-line);
}
summary {
  cursor: pointer;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.currency-disclosure > summary {
  color: var(--color-muted);
  font-size: 13px;
}
.currency-trait-members > summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  list-style: none;
  --trait-icon-size: 28px;
}
.currency-trait-members > summary::-webkit-details-marker {
  display: none;
}
.currency-trait-counts {
  margin-left: auto;
  display: grid;
  gap: 4px;
  flex-shrink: 0;
  text-align: right;
}
.currency-trait-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.currency-task-target {
  display: grid;
  justify-items: end;
  gap: 2px;
}
.currency-lineup-content {
  display: grid;
  gap: 20px;
}
.currency-trait-chevron {
  flex: 0 0 auto;
  transition: transform 180ms ease;
}
.currency-trait-members[open] > summary .currency-trait-chevron {
  transform: rotate(180deg);
}
.currency-task-count {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.currency-task-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-task-status.completed {
  color: var(--color-ally);
}
.currency-role-details {
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.currency-role-details h3 {
  font-size: 13px;
  margin: 16px 0 8px;
}
.currency-detail-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  --trait-icon-size: 24px;
}
.currency-contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 0 14px 40px;
  margin: 0;
  list-style: none;
}
.currency-contributor-image {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  background: #7b77831a;
}
.currency-navigator-target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.currency-detail-emblems {
  display: grid;
  gap: 8px;
}
.currency-detail-emblems li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.currency-detail-emblem-image {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}
@media (max-width: 480px) {
  .currency-roster {
    --role-size: 104px;
    gap: 16px 10px;
  }
  .currency-task-status {
    font-size: 11px;
  }
  .currency-trait-members > summary {
    flex-wrap: wrap;
    gap: 8px;
  }
  .currency-trait-badges {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
