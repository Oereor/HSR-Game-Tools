<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { gameData, characterName } from '../data/adapters/game-data'
import GameIcon from '../components/ui/GameIcon.vue'
import { useActionPlanner } from '../tools/action-planner/composables/useActionPlanner'
import { formatAV } from '../tools/action-planner/model/presentation'
import type { ToolLocale } from '../locales/types'
const { t, locale } = useI18n()
const sample = gameData.characters.find((c) => c.id === '1001')!
const { result } = useActionPlanner({
  actors: [
    {
      id: 'smoke:a',
      name: 'A',
      kind: 'actor',
      camp: 'ally',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 160,
    },
    {
      id: 'smoke:b',
      name: 'B',
      kind: 'actor',
      camp: 'ally',
      position: 1,
      baseSpeed: 100,
      panelSpeed: 134,
    },
  ],
  events: [],
  maxNodes: 4,
  maxAV: 600,
})
</script>
<template>
  <p class="eyebrow">{{ t('site.phase') }}</p>
  <h1>{{ t('planner.title') }}</h1>
  <p class="muted">{{ t('planner.note') }}</p>
  <section class="smoke-section">
    <h2>{{ t('planner.data') }}</h2>
    <p>{{ t('planner.count', { count: gameData.characters.length }) }}</p>
    <div class="character-example">
      <GameIcon
        :asset-key="sample.assetKey"
        :name="characterName(sample, locale as ToolLocale)"
        :fallback="t('planner.imageMissing')"
      />
      <div>
        <strong>{{ characterName(sample, locale as ToolLocale) }}</strong>
        <p class="muted">{{ t('planner.speed') }}: {{ sample.baseSpeed }}</p>
      </div>
    </div>
  </section>
  <section class="smoke-section">
    <h2>{{ t('planner.simulation') }}</h2>
    <p class="muted">{{ t('planner.synthetic') }}</p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ t('planner.actor') }}</th>
            <th>{{ t('planner.turn') }}</th>
            <th>{{ t('planner.elapsed') }}</th>
            <th>{{ t('planner.delta') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="record in result.records"
            :key="
              record.id + ':' + (record.anchor.kind === 'action' ? record.anchor.turn : 'trigger')
            "
            :data-anchor="
              record.id + ':' + (record.anchor.kind === 'action' ? record.anchor.turn : 'trigger')
            "
            :data-av="record.elapsedAV"
          >
            <td>{{ record.name }}</td>
            <td>{{ record.anchor.kind === 'action' ? record.anchor.turn : '—' }}</td>
            <td>{{ formatAV(record.elapsedAV, locale as ToolLocale) }}</td>
            <td>{{ formatAV(record.deltaAV, locale as ToolLocale) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted">
      {{
        t('planner.result', {
          count: result.records.length,
          diagnostics: result.diagnostics.length,
        })
      }}
    </p>
  </section>
</template>
