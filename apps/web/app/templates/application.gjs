import { pageTitle } from 'ember-page-title';
import demo from '@picket/client/fixtures/demo.json';

const high = demo.alerts.filter((a) => a.severity === 1).length;

<template>
  {{pageTitle "Picket — IDS Console"}}

  <header class="picket-header">
    <div class="picket-brand">
      <h1>Picket</h1>
      <span class="sub">pfSense IDS/IPS — Suricata + Snort</span>
    </div>
    <div class="picket-kpis">
      <div class="kpi"><span class="num">{{demo.alerts.length}}</span><span class="cl-lbl">alerts</span></div>
      <div class="kpi"><span class="num hi">{{high}}</span><span class="cl-lbl">high</span></div>
      <div class="kpi"><span class="num">{{demo.rules.length}}</span><span class="cl-lbl">rules</span></div>
      <div class="kpi"><span class="num">{{demo.interfaces.length}}</span><span class="cl-lbl">interfaces</span></div>
      <div class="picket-status"><span class="dot"></span>monitoring</div>
    </div>
  </header>

  <div class="picket-grid">
    <section class="picket-stream">
      <div class="picket-stream-head">
        <span class="cl-lbl">Live alert feed</span>
        <span class="cl-lbl">newest first</span>
      </div>
      <picket-alert-table></picket-alert-table>

      <div class="picket-stream-head" style="margin-top:24px">
        <span class="cl-lbl">Network radar</span>
        <span class="cl-lbl">who's on the LAN</span>
      </div>
      <picket-radar></picket-radar>
    </section>

    <aside class="picket-console">
      <picket-assistant></picket-assistant>
    </aside>
  </div>

  {{outlet}}
</template>
