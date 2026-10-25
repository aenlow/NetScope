# Regulatory notes

NetScope warns when a radio's EIRP (transmit power plus antenna gain) exceeds an indicative limit for the selected region. These checks are a simplified summary to catch obvious mistakes. They are not a compliance tool: rules differ by country, change over time, depend on device certification and have conditions (TPC, DFS, outdoor use, client-to-client) that NetScope does not model. Confirm with your regulator and the equipment vendor.

Region is set in Project settings, General: United States (FCC), Europe (ETSI) or Unrestricted (no regulatory checks).

## Channels offered

| Band | United States | Europe |
|---|---|---|
| 2.4 GHz | 1–11 | 1–13 |
| 5 GHz | 36–64, 100–144, 149–165 | 36–64, 100–140 |
| 6 GHz | 1–233 (5.925–7.125 GHz) | 1–93 (5.945–6.425 GHz) |

DFS channels on 5 GHz (52–144) are offered only when "Allow DFS" is on. APs using them must vacate the channel when radar is detected. On 6 GHz, preferred scanning channels (5, 21, 37, …) are marked PSC in channel lists.

## EIRP limits used for warnings

### United States

| Band | Limit used | Basis |
|---|---|---|
| 2.4 GHz | 36 dBm | 1 W conducted with 6 dBi antenna (47 CFR 15.247, point-to-multipoint). |
| 5 GHz UNII-1 and UNII-3 (36–48, 149–165) | 36 dBm | 1 W conducted with 6 dBi antenna for indoor access points (47 CFR 15.407). |
| 5 GHz UNII-2A / 2C (52–144) | lower of 30 dBm and 11 + 10·log10(width MHz) + 6 dBm | 250 mW or 11 dBm/MHz conducted with 6 dBi (47 CFR 15.407). |
| 6 GHz low-power indoor | lower of 30 dBm and 5 + 10·log10(width MHz) dBm | 5 dBm/MHz PSD, 30 dBm EIRP maximum for LPI access points (47 CFR 15.407, 2020 Report and Order). |

Standard-power 6 GHz operation under automated frequency coordination is not modelled.

### Europe

| Band | Limit used | Basis |
|---|---|---|
| 2.4 GHz | 20 dBm | 100 mW EIRP (ETSI EN 300 328). |
| 5 GHz 5150–5350 MHz (36–64) | 23 dBm | 200 mW EIRP, indoor (ETSI EN 301 893). |
| 5 GHz 5470–5725 MHz (100–140) | 30 dBm | 1 W EIRP with TPC (ETSI EN 301 893). Without TPC the commonly published limit is 3 dB lower. |
| 6 GHz low-power indoor (5945–6425 MHz) | lower of 23 dBm and 10 + 10·log10(width MHz) dBm | 23 dBm EIRP and 10 dBm/MHz PSD (Commission Implementing Decision (EU) 2021/1067, ETSI EN 303 687). |

The European 5 GHz figures above are the limits commonly published for the EU harmonised bands; individual countries may differ.

## Unrestricted

No channel or EIRP checks. Use this for regions not covered above, then apply local rules yourself.
