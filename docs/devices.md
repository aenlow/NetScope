# Device library

NetScope ships 222 access points and routers from 20 vendors. Every entry records where its values come from, and the app shows that on the spec sheet, in the device picker and in the PDF bill of materials.

- **Datasheet**: the listed fields were checked against the published source below on the date shown. Fields that were not confirmed still use typical values and are marked with `*` in the app.
- **Typical / unverified**: bands and spatial streams come from the model's published product information; transmit power, antenna gain and PoE are typical values for its class (Wi-Fi generation, indoor/outdoor, streams). Treat these as placeholders and enter datasheet values through a custom device when accuracy matters.
- **Custom**: values you entered.

Typical values used for unverified models (conducted transmit power per radio and antenna gain, from `src/data/devices.js`):

| Class | 2.4 GHz | 5 GHz | 6 GHz |
|---|---|---|---|
| Indoor AP, router | 22 dBm, 4 dBi | 23 dBm, 5 dBi | 22 dBm, 5 dBi |
| Wall plate | 20 dBm, 3 dBi | 21 dBm, 4 dBi | 20 dBm, 4 dBi |
| Outdoor AP | 24 dBm, 5 dBi | 25 dBm, 6 dBi | 23 dBm, 6 dBi |
| Mesh / home | 21 dBm, 3 dBi | 22 dBm, 4 dBi | 21 dBm, 4 dBi |

Maximum transmit power in a datasheet is usually per chain or aggregate depending on vendor; NetScope uses the per-radio figure as published. Regulatory limits can be lower than the device maximum.

## Checked against a datasheet

Checked 2026-10-25.

| Model | Fields checked | Source |
|---|---|---|
| Ubiquiti U7 Pro | bands, streams, txMax, gain, width, poe | https://download.axilogi.com/Ubiquiti/Datasheet/U7-Pro.pdf |
| Ubiquiti U7 Lite | bands, streams, txMax, gain, width, poe | https://download.axilogi.com/Ubiquiti/Datasheet/U7-Lite.pdf |
| Ubiquiti U6+ | bands, streams, txMax, gain, poe | https://dl.ui.com/ds/u6+_ds.pdf |
| Ubiquiti U6 Pro | bands, streams, txMax, gain, poe | https://www.bhphotovideo.com/lit_files/855201.pdf |
| Ubiquiti U6 Lite | bands, streams, txMax, gain, poe | https://dl.ui.com/ds/u6-lite_ds.pdf |
| Ubiquiti U6 Enterprise | bands, streams, txMax, gain, poe | https://dl.ui.com/ds/u6-enterprise_ds.pdf |
| Ubiquiti U6 In-Wall | bands, streams, txMax, gain, poe | https://dl.ui.com/ds/u6-iw_ds.pdf |
| TP-Link EAP650 | bands, streams, txMax, gain, poe | https://static.tp-link.com/upload/product-overview/2026/202601/20260108/Datasheet_EAP650%20V2.pdf |
| TP-Link EAP773 | bands, streams, txMax, gain, width, poe | https://static.tp-link.com/upload/product-overview/2026/202605/20260512/Datasheet_EAP773%201.0.pdf |
| Cisco Meraki MR36 | bands, streams, gain, poe | https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/MR36_Datasheet |
| Cisco Meraki MR57 | bands, streams, gain, poe | https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/MR57_Datasheet |
| Cisco Meraki CW9172I | bands, streams, gain, width, poe | https://documentation.meraki.com/Wireless/Product_Information/Overviews_and_Datasheets/CW9172I_Datasheet |
| HPE Aruba Networking AP-635 | bands, streams, gain | https://www.neweggbusiness.com/hpe-ap-635/p/9B-0ED-004D-001Y7 |
| Ruckus R650 | bands, streams, txMax, gain, poe | https://webresources.ruckuswireless.com/datasheets/r650/ds-ruckus-r650.html |
| Ruckus R770 | bands, streams, gain | https://www.ruckusnetworks.com/products/wireless-access-points/r770/ |
| Grandstream GWN7664 | bands, streams, txMax, gain, poe | https://documentation.grandstream.com/knowledge-base/gwn7664-technical-specifications/ |
| Netgear Business WAX630E | bands, streams, gain, poe | https://cdn.fusionplus.net/documents/fusion/fus_798518_datasheet.pdf |
| EnGenius ECW336 | bands, streams, txMax, gain, poe | https://www.engeniustech.com/eu/products/wireless/indoor-access-points/ecw336/ |
| Juniper Mist AP12 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP32 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP33 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP34 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP43 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP45 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP47 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP63 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |
| Juniper Mist AP64 | bands, gain | https://www.juniper.net/documentation/mx/es/software/mist/mist-wireless/topics/ref/mist-antenna-gains.html |

## All models

| Vendor | Model | Wi-Fi | Bands | Spec level |
|---|---|---|---|---|
| Ubiquiti | U7 Pro | 7 | 2.4 / 5 / 6 GHz | Datasheet |
| Ubiquiti | U7 Pro Max | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | U7 Pro XG | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | U7 Pro XGS | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | U7 Pro Wall | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | U7 Lite | 7 | 2.4 / 5 GHz | Datasheet |
| Ubiquiti | U7 LR | 7 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U7 In-Wall | 7 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U7 Outdoor | 7 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U6 Enterprise | 6E | 2.4 / 5 / 6 GHz | Datasheet |
| Ubiquiti | U6 Enterprise In-Wall | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | U6 Pro | 6 | 2.4 / 5 GHz | Datasheet |
| Ubiquiti | U6+ | 6 | 2.4 / 5 GHz | Datasheet |
| Ubiquiti | U6 Lite | 6 | 2.4 / 5 GHz | Datasheet |
| Ubiquiti | U6 LR | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U6 Mesh | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U6 Mesh Pro | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | U6 In-Wall | 6 | 2.4 / 5 GHz | Datasheet |
| Ubiquiti | U6 Extender | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-Lite | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-LR | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-Pro | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-HD | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-SHD | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-nanoHD | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-FlexHD | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-IW | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-AC-M | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | UAP-BeaconHD | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | Dream Router 7 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ubiquiti | Dream Router | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | Dream Machine | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | Dream Wall | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | Express | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ubiquiti | Express 7 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | EAP783 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | EAP773 | 7 | 2.4 / 5 / 6 GHz | Datasheet |
| TP-Link | EAP772 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | EAP723 | 7 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP690E HD | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | EAP680 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP670 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP660 HD | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP653 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP650 | 6 | 2.4 / 5 GHz | Datasheet |
| TP-Link | EAP620 HD | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP613 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP610 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP615-Wall | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP655-Wall | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP650-Outdoor | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP610-Outdoor | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP265 HD | 5 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP245 | 5 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP225 | 5 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | EAP225-Outdoor | 5 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | Archer BE800 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Archer BE550 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Archer AXE75 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Archer AX73 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | Archer AX55 | 6 | 2.4 / 5 GHz | Typical / unverified |
| TP-Link | Deco BE85 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Deco BE63 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Deco XE75 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| TP-Link | Deco X55 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-735 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| HPE Aruba Networking | AP-755 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| HPE Aruba Networking | AP-655 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| HPE Aruba Networking | AP-635 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| HPE Aruba Networking | AP-615 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| HPE Aruba Networking | AP-585 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-575 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-565 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-555 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-535 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-515 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-505 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-505H | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP-303 | 5 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP32 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| HPE Aruba Networking | AP25 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP22 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP21 | 6 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP17 | 5 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP12 | 5 | 2.4 / 5 GHz | Typical / unverified |
| HPE Aruba Networking | AP11 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | CW9178I | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco Meraki | CW9176I | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco Meraki | CW9172I | 7 | 2.4 / 5 / 6 GHz | Partly verified |
| Cisco Meraki | CW9166I | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco Meraki | CW9164I | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco Meraki | CW9162I | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco Meraki | MR57 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Cisco Meraki | MR56 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR46 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR44 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR36 | 6 | 2.4 / 5 GHz | Partly verified |
| Cisco Meraki | MR36H | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR28 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR86 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco Meraki | MR76 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco | C9136I | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cisco | C9130AXI | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco | C9120AXI | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco | C9115AXI | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco | C9105AXI | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cisco | C9105AXW | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R770 | 7 | 2.4 / 5 / 6 GHz | Partly verified |
| Ruckus | R670 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ruckus | R760 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ruckus | R560 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Ruckus | R850 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R750 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R650 | 6 | 2.4 / 5 GHz | Datasheet |
| Ruckus | R550 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R350 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R720 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R610 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R510 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | R320 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | H550 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | H350 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | T750 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | T350c | 6 | 2.4 / 5 GHz | Typical / unverified |
| Ruckus | T350d | 6 | 2.4 / 5 GHz | Typical / unverified |
| Juniper Mist | AP47 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Juniper Mist | AP45 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Juniper Mist | AP34 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Juniper Mist | AP43 | 6 | 2.4 / 5 GHz | Partly verified |
| Juniper Mist | AP33 | 6 | 2.4 / 5 GHz | Partly verified |
| Juniper Mist | AP32 | 6 | 2.4 / 5 GHz | Partly verified |
| Juniper Mist | AP12 | 6 | 2.4 / 5 GHz | Partly verified |
| Juniper Mist | AP64 | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Juniper Mist | AP63 | 6 | 2.4 / 5 GHz | Partly verified |
| Fortinet | FAP-441K | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Fortinet | FAP-431G | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Fortinet | FAP-231G | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Fortinet | FAP-831F | 6 | 2.4 / 5 GHz | Typical / unverified |
| Fortinet | FAP-433F | 6 | 2.4 / 5 GHz | Typical / unverified |
| Fortinet | FAP-431F | 6 | 2.4 / 5 GHz | Typical / unverified |
| Fortinet | FAP-231F | 6 | 2.4 / 5 GHz | Typical / unverified |
| Extreme Networks | AP5010 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Extreme Networks | AP4000 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Extreme Networks | AP3000 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Extreme Networks | AP410C | 6 | 2.4 / 5 GHz | Typical / unverified |
| Extreme Networks | AP305C | 6 | 2.4 / 5 GHz | Typical / unverified |
| Extreme Networks | AP302W | 6 | 2.4 / 5 GHz | Typical / unverified |
| Extreme Networks | AP460C | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cambium Networks | XE5-8 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cambium Networks | XE3-4 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Cambium Networks | XV3-8 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cambium Networks | XV2-2 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Cambium Networks | XV2-2T | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WBE750 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear Business | WBE710 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear Business | WAX638E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear Business | WAX630E | 6E | 2.4 / 5 / 6 GHz | Partly verified |
| Netgear Business | WAX630 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WAX620 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WAX618 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WAX615 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WAX610 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear Business | WAX610Y | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear | Orbi 970 (RBE971) | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear | Orbi 770 (RBE771) | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear | Orbi RBKE963 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear | Orbi RBK852 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear | Nighthawk RS700S | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear | Nighthawk RAXE500 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Netgear | Nighthawk RAX120 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Netgear | Nighthawk RAX50 | 6 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | GT-BE98 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| ASUS | RT-BE96U | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| ASUS | RT-BE88U | 7 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | GT-AXE16000 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| ASUS | GT-AX6000 | 6 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | RT-AX88U Pro | 6 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | RT-AX86U Pro | 6 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | RT-AX58U | 6 | 2.4 / 5 GHz | Typical / unverified |
| ASUS | ZenWiFi BT10 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| ASUS | ZenWiFi ET8 | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| ASUS | ZenWiFi XT8 | 6 | 2.4 / 5 GHz | Typical / unverified |
| EnGenius | ECW336 | 6E | 2.4 / 5 / 6 GHz | Datasheet |
| EnGenius | ECW230 | 6 | 2.4 / 5 GHz | Typical / unverified |
| EnGenius | ECW220 | 6 | 2.4 / 5 GHz | Typical / unverified |
| EnGenius | EWS377AP | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | WBE660S | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | WBE530 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | NWA130BE | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | WAX640S-6E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | WAX620D-6E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | NWA220AX-6E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Zyxel | WAX650S | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | WAX630S | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | WAX610D | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | WAX510D | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | NWA210AX | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | NWA110AX | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | NWA90AX | 6 | 2.4 / 5 GHz | Typical / unverified |
| Zyxel | NWA50AX | 6 | 2.4 / 5 GHz | Typical / unverified |
| Grandstream | GWN7660E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Grandstream | GWN7664 | 6 | 2.4 / 5 GHz | Datasheet |
| Grandstream | GWN7662 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Grandstream | GWN7660 | 6 | 2.4 / 5 GHz | Typical / unverified |
| Grandstream | GWN7615 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Grandstream | GWN7605 | 5 | 2.4 / 5 GHz | Typical / unverified |
| Grandstream | GWN7630 | 5 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | cAP ax | 6 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | cAP ac | 5 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | wAP ax | 6 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | hAP ax3 | 6 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | hAP ax2 | 6 | 2.4 / 5 GHz | Typical / unverified |
| MikroTik | Audience | 5 | 2.4 / 5 GHz | Typical / unverified |
| Linksys | Velop Pro 7 (MBE7000) | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| Linksys | Velop Pro 6E (MX6200) | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| Linksys | Velop MX4200 | 6 | 2.4 / 5 GHz | Typical / unverified |
| eero | eero Max 7 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| eero | eero Pro 7 | 7 | 2.4 / 5 / 6 GHz | Typical / unverified |
| eero | eero 7 | 7 | 2.4 / 5 GHz | Typical / unverified |
| eero | eero Pro 6E | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
| eero | eero 6+ | 6 | 2.4 / 5 GHz | Typical / unverified |
| Google | Nest Wifi Pro | 6E | 2.4 / 5 / 6 GHz | Typical / unverified |
