// Datasheet-checked values. Each entry lists only the fields confirmed from the
// linked source in `fields`; anything else keeps its typical value and is
// shown as typical in the UI. Keys are device ids (slug of vendor and model).
//
// Field names: bands, streams, txMax, gain, width, poe.
// txMax is the vendor's stated maximum transmit power for the radio. Vendors
// define it differently (conducted per radio, or including combining gain);
// notes say which where the source does.

const CHECKED = '2026-10-25';
const UI_NOTE = 'Copy of the Ubiquiti datasheet hosted by a distributor.';

export const VERIFIED = {
  'ubiquiti-u7-pro': {
    source: 'https://download.axilogi.com/Ubiquiti/Datasheet/U7-Pro.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'width', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 23, gain: 4, maxWidth: 40 }, '5': { nss: 2, txMax: 26, gain: 6, maxWidth: 160 }, '6': { nss: 2, txMax: 23, gain: 5.8, maxWidth: 320 } },
    poeW: 21, notes: `${UI_NOTE} 5 GHz also supports 240 MHz, modelled here up to 160 MHz.`,
  },
  'ubiquiti-u7-lite': {
    source: 'https://download.axilogi.com/Ubiquiti/Datasheet/U7-Lite.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'width', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 23, gain: 4, maxWidth: 40 }, '5': { nss: 2, txMax: 24, gain: 5, maxWidth: 160 } },
    poeW: 13, notes: `${UI_NOTE} 5 GHz also supports 240 MHz, modelled here up to 160 MHz.`,
  },
  'ubiquiti-u6-plus': {
    source: 'https://dl.ui.com/ds/u6+_ds.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 23, gain: 3 }, '5': { nss: 2, txMax: 23, gain: 5.4 } },
    poeW: 9,
  },
  'ubiquiti-u6-pro': {
    source: 'https://www.bhphotovideo.com/lit_files/855201.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 22, gain: 4 }, '5': { nss: 4, txMax: 26, gain: 6 } },
    poeW: 13, notes: UI_NOTE,
  },
  'ubiquiti-u6-lite': {
    source: 'https://dl.ui.com/ds/u6-lite_ds.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 23, gain: 2.8 }, '5': { nss: 2, txMax: 23, gain: 3 } },
    poeW: 13.5,
  },
  'ubiquiti-u6-enterprise': {
    source: 'https://dl.ui.com/ds/u6-enterprise_ds.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 22, gain: 3.2 }, '5': { nss: 4, txMax: 26, gain: 5.3 }, '6': { nss: 4, txMax: 26, gain: 6 } },
    poeW: 22, notes: 'The datasheet gives one 26 dBm figure for 5 to 7 GHz.',
  },
  'ubiquiti-u6-in-wall': {
    source: 'https://dl.ui.com/ds/u6-iw_ds.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 22, gain: 5 }, '5': { nss: 4, txMax: 26, gain: 5.9 } },
    poeW: 13.5, notes: 'Power excludes PoE pass-through output.',
  },
  'tp-link-eap650': {
    source: 'https://static.tp-link.com/upload/product-overview/2026/202601/20260108/Datasheet_EAP650 V2.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 24, gain: 3 }, '5': { nss: 2, txMax: 25, gain: 4 } },
    poeW: 14.7, notes: 'Hardware V2, FCC transmit power stated as an upper bound; US PoE consumption.',
  },
  'tp-link-eap773': {
    source: 'https://static.tp-link.com/upload/product-overview/2026/202605/20260512/Datasheet_EAP773 1.0.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'width', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 25, gain: 4 }, '5': { nss: 2, txMax: 25, gain: 5 }, '6': { nss: 2, txMax: 23, gain: 5, maxWidth: 320 } },
    poeW: 25.44, notes: 'FCC transmit power stated as an upper bound; US PoE consumption.',
  },
  'cisco-meraki-mr36': {
    source: 'https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/MR36_Datasheet', checked: CHECKED,
    fields: ['bands', 'streams', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, gain: 5.4 }, '5': { nss: 2, gain: 6 } },
    poeW: 15,
  },
  'cisco-meraki-mr57': {
    source: 'https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/MR57_Datasheet', checked: CHECKED,
    fields: ['bands', 'streams', 'gain', 'poe'],
    radios: { '2.4': { nss: 4, gain: 4.5 }, '5': { nss: 4, gain: 5.5 }, '6': { nss: 4, gain: 5.5 } },
    poeW: 40, notes: '40 W maximum with USB in use; 30 W without.',
  },
  'cisco-meraki-cw9172i': {
    source: 'https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/CW9172I_Datasheet', checked: CHECKED,
    fields: ['bands', 'streams', 'gain', 'width', 'poe'],
    radios: { '2.4': { nss: 2, gain: 4 }, '5': { nss: 2, gain: 5 }, '6': { nss: 2, gain: 6, maxWidth: 320 } },
    poeW: 30, notes: 'Peak antenna gains. The 5 GHz radio can also run 4x4 in a dual-band mode.',
  },
  'hpe-aruba-networking-ap-635': {
    source: 'https://www.neweggbusiness.com/hpe-ap-635/p/9B-0ED-004D-001Y7', checked: CHECKED,
    fields: ['bands', 'streams', 'gain'],
    radios: { '2.4': { nss: 2, gain: 4.6 }, '5': { nss: 2, gain: 7.0 }, '6': { nss: 2, gain: 6.3 } },
    notes: 'Peak antenna gains from the vendor specification as listed by a reseller. Average-pattern gains are 2.9 / 4.9 / 4.3 dBi.',
  },
  'ruckus-r650': {
    source: 'https://webresources.ruckuswireless.com/datasheets/r650/ds-ruckus-r650.html', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, txMax: 26, gain: 3 }, '5': { nss: 4, txMax: 28, gain: 3 } },
    poeW: 21.59, notes: 'Peak transmit power includes combining gain; antenna gain is stated as up to 3 dBi.',
  },
  'ruckus-r770': {
    source: 'https://www.ruckusnetworks.com/products/wireless-access-points/r770/', checked: CHECKED,
    fields: ['bands', 'streams', 'gain'],
    radios: { '2.4': { nss: 2, gain: 4 }, '5': { nss: 4, gain: 4 }, '6': { nss: 2, gain: 4 } },
    notes: 'Antenna gain stated as up to 4 dBi.',
  },
  'grandstream-gwn7664': {
    source: 'https://documentation.grandstream.com/knowledge-base/gwn7664-technical-specifications/', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 4, txMax: 26, gain: 3 }, '5': { nss: 4, txMax: 25, gain: 4 } },
    poeW: 17,
  },
  'netgear-business-wax630e': {
    source: 'https://cdn.fusionplus.net/documents/fusion/fus_798518_datasheet.pdf', checked: CHECKED,
    fields: ['bands', 'streams', 'gain', 'poe'],
    radios: { '2.4': { nss: 2, gain: 4.4 }, '5': { nss: 4, gain: 6.3 }, '6': { nss: 2, gain: 3.1 } },
    poeW: 27.64, notes: 'Copy of the NETGEAR datasheet hosted by a distributor.',
  },
  'engenius-ecw336': {
    source: 'https://www.engeniustech.com/eu/products/wireless/indoor-access-points/ecw336/', checked: CHECKED,
    fields: ['bands', 'streams', 'txMax', 'gain', 'poe'],
    radios: { '2.4': { nss: 4, txMax: 23, gain: 5 }, '5': { nss: 4, txMax: 23, gain: 6 }, '6': { nss: 4, txMax: 23, gain: 5 } },
    poeW: 22.5, notes: 'Maximum transmit power is limited by regulatory domain.',
  },
};

// Juniper publishes antenna gains for its whole range in one table.
const MIST_SRC = 'https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html';
const MIST = { AP12: [2, 5], AP32: [5, 6], AP33: [5, 6], AP34: [4, 6, 6], AP43: [4, 6], AP45: [3, 5, 5], AP47: [4, 6, 6], AP63: [4, 6], AP64: [3, 5, 5] };
for (const [model, g] of Object.entries(MIST)) {
  const radios = { '2.4': { gain: g[0] }, '5': { gain: g[1] } };
  if (g[2] != null) radios['6'] = { gain: g[2] };
  VERIFIED[`juniper-mist-${model.toLowerCase()}`] = {
    source: MIST_SRC, checked: CHECKED, fields: ['bands', 'gain'], radios,
    notes: 'Gains from Juniper\'s antenna gain table (internal antennas). Stream counts are typical.',
  };
}
