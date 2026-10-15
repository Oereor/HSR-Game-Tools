<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import CurrencyImage from './CurrencyImage.vue'
import type { createVisuals } from '../ui/visuals'
defineProps<{ member: ReturnType<ReturnType<typeof createVisuals>['member']> }>()
const { t } = useI18n()
</script>

<template>
  <li class="currency-role">
    <div class="currency-role-visual">
      <div
        class="currency-role-portrait"
        :style="{ background: `var(--p-currency-cost-${member.cost})` }"
      >
        <CurrencyImage :source="member.portraitUrl" :name="member.role.name" kind="role" />
        <span class="currency-role-cost">{{
          t('currencyWars.visual.cost', { cost: member.cost })
        }}</span>
      </div>
      <div
        class="currency-emblem-row"
        :aria-label="t('currencyWars.visual.emblems', { name: member.role.name })"
      >
        <span
          v-for="(emblem, index) in member.slots"
          :key="index"
          class="currency-emblem-slot"
          :title="emblem?.name ?? t('currencyWars.visual.emptySlot')"
          v-tooltip="emblem?.traitName"
          tabindex="0"
          :aria-label="emblem?.name ?? t('currencyWars.visual.emptySlot')"
        >
          <CurrencyImage v-if="emblem" :source="emblem.url" :name="emblem.name" kind="emblem" />
          <span v-else aria-hidden="true">—</span>
        </span>
      </div>
    </div>
    <h3 :title="member.role.name">{{ member.role.name }}</h3>
    <Tag v-if="member.role.expert" :value="t('currencyWars.visual.expert')" severity="secondary" />
    <p v-if="member.role.identityId === 8007">
      {{ t(`currencyWars.visual.${member.role.position}`) }}
    </p>
    <p v-if="member.role.mechanic === 'navigator'">
      {{
        member.target
          ? t('currencyWars.visual.target', { name: member.target.name })
          : t('currencyWars.visual.noTarget')
      }}
    </p>
    <p v-if="member.role.mechanic === 'bronya'">
      {{
        member.bronyaTrait
          ? t('currencyWars.visual.bronyaSide', { name: member.bronyaTrait.name })
          : t('currencyWars.visual.bronyaTie')
      }}
    </p>
    <details>
      <summary>{{ t('currencyWars.visual.details') }}</summary>
      <p>
        {{
          t('currencyWars.visual.innate', {
            names: member.innate.map((trait) => trait.name).join(' · ') || t('currencyWars.none'),
          })
        }}
      </p>
      <p>
        {{
          t('currencyWars.visual.extra', {
            names: member.extra.map((trait) => trait.name).join(' · ') || t('currencyWars.none'),
          })
        }}
      </p>
      <p class="currency-role-id">{{ t('currencyWars.visual.formId', { id: member.role.id }) }}</p>
    </details>
  </li>
</template>

<style scoped>
.currency-role {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 5px;
  text-align: center;
}
.currency-role-visual {
  --portrait-size: 108px;
  --emblem-gap: 3px;
  width: var(--portrait-size);
  flex-shrink: 0;
}
.currency-role-portrait {
  width: 100%;
  aspect-ratio: 1;
  position: relative;
  border-radius: 6px 6px 0 0;
  overflow: hidden;
  color: var(--p-surface-950);
}
.currency-role-cost {
  position: absolute;
  left: 3px;
  bottom: 3px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--p-surface-950);
  color: var(--p-surface-50);
  font-size: 11px;
}
.currency-emblem-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--emblem-gap);
  width: 100%;
  margin-top: var(--emblem-gap);
}
.currency-emblem-slot {
  aspect-ratio: 1;
  min-width: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-line);
  border-radius: 3px;
  overflow: hidden;
  color: var(--color-muted);
}
h3 {
  margin: 3px 0 0;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
p,
details {
  margin: 0;
  font-size: 11px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
details {
  width: 100%;
}
details p {
  margin-top: 5px;
}
summary {
  cursor: pointer;
}
.currency-role-id {
  font-variant-numeric: tabular-nums;
}
</style>
