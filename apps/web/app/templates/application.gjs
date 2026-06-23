import { pageTitle } from 'ember-page-title';
import demo from '@picket/client/fixtures/demo.json';

const high = demo.alerts.filter((a) => a.severity === 1).length;

<template>
  {{pageTitle "Picket — IDS Console"}}

  <header class="picket-header">
    <h1>Picket <span class="muted">· pfSense IDS/IPS</span></h1>
    <div class="picket-kpis">
      <span>{{demo.alerts.length}} alerts</span>
      <span class="hi">{{high}} high</span>
      <span>{{demo.rules.length}} rules</span>
      <span>{{demo.interfaces.length}} interfaces</span>
    </div>
  </header>

  <main class="picket-main">
    <picket-alert-table></picket-alert-table>
  </main>

  {{outlet}}
</template>
