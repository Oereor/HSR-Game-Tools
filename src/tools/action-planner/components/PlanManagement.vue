<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { Download, Upload, FilePlus2, UsersRound } from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import { gameData, assetUrl, characterName } from '../data/adapters/game-data'
import { participantCatalog } from '../engine/validation'
import { FILE_LIMITS } from '../model/document-file'
import { plannerTemplates, type PlannerTemplate } from '../templates/catalog'
import { loadPlannerTemplate } from '../templates/loader'
import type { useActionPlanner } from '../composables/useActionPlanner'
import { usePlannerFiles } from '../composables/usePlannerFiles'
import type { createPlannerPersistence, SaveStatus } from '../model/persistence'
import type { ToolLocale } from '../../../locales/types'

const props = defineProps<{
  planner: ReturnType<typeof useActionPlanner>
  persistence: ReturnType<typeof createPlannerPersistence>
  saveStatus: SaveStatus
  setupDirty: boolean
}>()
const { t, locale } = useI18n()
const nameDraft = ref(props.planner.document.value.name)
watch([() => props.planner.document.value.name, () => props.planner.setupRevision.value], () => {
  nameDraft.value = props.planner.document.value.name
})
const fileInput = ref<HTMLInputElement>()
const templatesVisible = ref(false)
const templateList = computed(() => [...plannerTemplates].sort((a, b) => a.order - b.order))
const {
  busy,
  error,
  pending,
  migrationReview,
  backupMigrationSource,
  exportFile,
  backupRaw,
  newDocument,
  importFile,
  useTemplate,
  reload,
  overwrite,
  retry,
  confirm,
} = usePlannerFiles(
  props,
  () =>
    nameDraft.value !== props.planner.document.value.name ||
    props.setupDirty ||
    !!props.planner.draft.value,
  download,
)
const confirmVisible = computed({
  get: () => !!pending.value,
  set: (value) => {
    if (!value) pending.value = undefined
  },
})
const issueName = (id: string) =>
  participantCatalog(props.planner.plan.value).find((p) => p.id === id)?.name ?? id
const documentError = computed(() => props.planner.documentError.value)
const recoveryError = computed(() =>
  props.saveStatus === 'protected' ? props.persistence.failure : undefined,
)
const issues = computed(() => props.planner.resourceIssues.value)
function rename() {
  props.planner.rename(nameDraft.value)
}
function download(source: string, filename: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await importFile(file)
}
function onUseTemplate(template: PlannerTemplate) {
  if (useTemplate(template)) templatesVisible.value = false
}
function templateCharacters(template: PlannerTemplate) {
  try {
    const doc = loadPlannerTemplate(template).document
    return doc.plan.actors
      .filter((a) => a.camp === 'ally')
      .sort((a, b) => a.position - b.position)
      .slice(0, 4)
      .map((actor) => ({
        actor,
        character: gameData.characters.find((c) => c.id === doc.metadata.characterIds[actor.id]),
      }))
  } catch {
    return []
  }
}
defineExpose({ newDocument })
</script>
<template>
  <section class="plan-management">
    <div class="section-title">
      <h2>{{ t('planner.files.title') }}</h2>
      <span class="fine-print" role="status">{{ t(`planner.files.status.${saveStatus}`) }}</span>
    </div>
    <div class="plan-management-row">
      <div class="field plan-name-field">
        <label for="plan-name">{{ t('planner.files.name') }}</label
        ><InputText
          id="plan-name"
          v-model="nameDraft"
          :maxlength="FILE_LIMITS.name"
          :placeholder="t('planner.files.unnamed')"
          fluid
          @blur="rename"
          @keydown.enter.prevent="rename"
        />
      </div>
      <div class="plan-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="sr-only"
          tabindex="-1"
          :aria-label="t('planner.files.import')"
          @change="onImportFile"
        />
        <Button text severity="secondary" :disabled="busy" @click="fileInput?.click()"
          ><Upload :size="16" /><span>{{ t('planner.files.import') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="exportFile"
          ><Download :size="16" /><span>{{ t('planner.files.export') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="newDocument"
          ><FilePlus2 :size="16" /><span>{{ t('planner.files.new') }}</span></Button
        >
        <Button text severity="secondary" :disabled="busy" @click="templatesVisible = true"
          ><UsersRound :size="16" /><span>{{ t('planner.files.templates') }}</span></Button
        >
      </div>
    </div>
    <div v-if="saveStatus === 'protected' || saveStatus === 'external'" class="storage-actions">
      <p class="fine-print">
        {{
          t(
            saveStatus === 'external'
              ? 'planner.files.externalHint'
              : 'planner.files.protectedHint',
          )
        }}
      </p>
      <Button
        text
        size="small"
        :label="
          t(
            recoveryError === 'migrationRequired'
              ? 'planner.files.migrateSaved'
              : 'planner.files.reload',
          )
        "
        @click="reload"
      />
      <Button text size="small" :label="t('planner.files.backupRaw')" @click="backupRaw" />
      <Button text size="small" :label="t('planner.files.overwrite')" @click="overwrite" />
    </div>
    <div v-if="saveStatus === 'failed' || saveStatus === 'unavailable'" class="storage-actions">
      <Button text size="small" :label="t('planner.files.retry')" @click="retry" />
    </div>
    <p v-if="error || documentError || recoveryError" class="field-error" role="alert">
      {{ t(`planner.files.error.${error ?? documentError ?? recoveryError}`) }}
    </p>
    <p v-if="planner.migrationNotice.value" class="fine-print" role="status">
      {{
        t(
          planner.migrationNotice.value.ahaAdded
            ? 'planner.aha.migratedWithAha'
            : 'planner.aha.migrated',
          { version: planner.migrationNotice.value.fromVersion },
        )
      }}
    </p>
    <p v-if="planner.migrationNotice.value?.skillPoints" class="fine-print" role="status">
      {{
        t(
          planner.migrationNotice.value.fromVersion < 10
            ? 'planner.files.migrationSemantics'
            : 'planner.files.retiredEffectMigration',
        )
      }}
    </p>
    <details v-if="issues.length" class="resource-diagnostics">
      <summary>{{ t('planner.files.resources', { count: issues.length }) }}</summary>
      <p v-for="(issue, index) in issues" :key="index" class="fine-print">
        {{ t(`planner.files.resource.${issue.kind}`, { name: issueName(issue.id) }) }}
      </p>
    </details>
    <Dialog
      v-model:visible="confirmVisible"
      modal
      :header="t(migrationReview ? 'planner.files.migrationTitle' : 'planner.files.confirmTitle')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '440px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <template v-if="migrationReview">
        <p>{{ t('planner.files.migrationReview') }}</p>
        <ul>
          <li v-for="(count, kind) in migrationReview.losses" :key="kind">
            {{ t(`planner.files.migrationLoss.${kind}`, { count }) }}
          </li>
        </ul>
        <Button
          size="small"
          text
          :label="t('planner.files.backupRaw')"
          @click="backupMigrationSource"
        />
        <p v-if="error === 'migrationWrite'" class="field-error" role="alert">
          {{ t('planner.files.error.migrationWrite') }}
        </p>
      </template>
      <p v-else>
        {{
          t(
            pending?.kind === 'overwrite'
              ? 'planner.files.overwriteConfirm'
              : 'planner.files.replaceConfirm',
          )
        }}
      </p>
      <p v-if="pending?.guarded && pending.kind === 'replace'" class="fine-print">
        {{ t('planner.files.storageReplaceConfirm') }}
      </p>
      <template #footer
        ><Button
          text
          severity="secondary"
          :label="t('ui.cancel')"
          @click="pending = undefined" /><Button
          :label="t(migrationReview ? 'planner.files.migrateSaved' : 'planner.files.confirm')"
          @click="confirm"
      /></template>
    </Dialog>
    <Dialog
      v-model:visible="templatesVisible"
      modal
      :header="t('planner.files.templates')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '640px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <p v-if="!templateList.length" class="fine-print">{{ t('planner.files.noTemplates') }}</p>
      <div v-for="template in templateList" :key="template.id" class="template-entry">
        <h3>{{ t(template.nameKey) }}</h3>
        <div class="template-portraits">
          <UnitPortrait
            v-for="entry in templateCharacters(template)"
            :key="entry.actor.id"
            :src="assetUrl(entry.character?.assetKey)"
            :name="
              entry.character
                ? characterName(entry.character, locale as ToolLocale)
                : entry.actor.name
            "
          />
        </div>
        <p class="fine-print">{{ t(template.descriptionKey) }}</p>
        <p v-if="template.conditionKey" class="fine-print">{{ t(template.conditionKey) }}</p>
        <p v-if="template.gameVersion" class="fine-print">
          {{ t('planner.files.templateVersion', { version: template.gameVersion }) }}
        </p>
        <Button
          size="small"
          :label="t('planner.files.useTemplate')"
          @click="onUseTemplate(template)"
        />
      </div>
    </Dialog>
  </section>
</template>
