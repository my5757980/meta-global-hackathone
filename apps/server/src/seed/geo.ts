/**
 * Countries and their main ports for Japanese used-car exports.
 * Country and port names are public facts; freight rates, transit days, inspection fees and the
 * right-hand-drive flags are DEMO values for this project (an exporter sets its own in the CRM).
 *
 * Row format: code|name|region|inspection(0/1)|inspectionFeeUsd|timezone|rhdAllowed(0/1)|port:usdPerM3:days;port:…
 */
const RAW = `
KE|Kenya|East Africa|1|250|Africa/Nairobi|1|Mombasa:78:28
TZ|Tanzania|East Africa|1|220|Africa/Dar_es_Salaam|1|Dar es Salaam:80:30;Zanzibar:95:33
UG|Uganda|East Africa|1|250|Africa/Kampala|1|Mombasa (for Kampala):78:28;Dar es Salaam (for Kampala):80:30
RW|Rwanda|East Africa|0|0|Africa/Kigali|0|Dar es Salaam (for Kigali):80:30;Mombasa (for Kigali):78:28
BI|Burundi|East Africa|0|0|Africa/Bujumbura|1|Dar es Salaam (for Bujumbura):80:30
SS|South Sudan|East Africa|0|0|Africa/Juba|0|Mombasa (for Juba):78:28
ET|Ethiopia|East Africa|0|0|Africa/Addis_Ababa|0|Djibouti (for Addis Ababa):90:26
DJ|Djibouti|East Africa|0|0|Africa/Djibouti|1|Djibouti:90:26
SO|Somalia|East Africa|0|0|Africa/Mogadishu|1|Mogadishu:95:30;Berbera:95:29;Bosaso:98:30
ER|Eritrea|East Africa|0|0|Africa/Asmara|1|Massawa:100:30
CD|DR Congo|Central Africa|0|0|Africa/Lubumbashi|1|Dar es Salaam (for Lubumbashi):80:30;Matadi:115:40
MW|Malawi|Southern Africa|1|200|Africa/Blantyre|1|Dar es Salaam (for Lilongwe):80:30;Beira (for Blantyre):85:32
ZM|Zambia|Southern Africa|1|200|Africa/Lusaka|1|Dar es Salaam (for Lusaka):80:30;Durban (for Lusaka):82:30;Walvis Bay (for Lusaka):92:34
ZW|Zimbabwe|Southern Africa|0|0|Africa/Harare|1|Durban (for Harare):82:30;Beira (for Harare):85:32
MZ|Mozambique|Southern Africa|1|180|Africa/Maputo|1|Maputo:84:31;Beira:85:32;Nacala:88:31
MG|Madagascar|East Africa|0|0|Indian/Antananarivo|0|Toamasina:92:30
MU|Mauritius|East Africa|1|200|Indian/Mauritius|1|Port Louis:85:26
SC|Seychelles|East Africa|0|0|Indian/Mahe|1|Port Victoria:95:28
KM|Comoros|East Africa|0|0|Indian/Comoro|1|Moroni:105:35
ZA|South Africa|Southern Africa|0|0|Africa/Johannesburg|1|Durban:82:30;Cape Town:86:32;Port Elizabeth:86:33
NA|Namibia|Southern Africa|0|0|Africa/Windhoek|1|Walvis Bay:90:34
BW|Botswana|Southern Africa|0|0|Africa/Gaborone|1|Durban (for Gaborone):82:30;Walvis Bay (for Gaborone):90:34
LS|Lesotho|Southern Africa|0|0|Africa/Maseru|1|Durban (for Maseru):82:30
SZ|Eswatini|Southern Africa|0|0|Africa/Mbabane|1|Durban (for Mbabane):82:30;Maputo (for Mbabane):84:31
AO|Angola|Southern Africa|0|0|Africa/Luanda|0|Luanda:110:38;Lobito:112:40
NG|Nigeria|West Africa|0|0|Africa/Lagos|0|Lagos (Apapa):105:40;Lagos (Tin Can):105:40;Onne:108:42
GH|Ghana|West Africa|0|0|Africa/Accra|0|Tema:102:38;Takoradi:104:39
BJ|Benin|West Africa|0|0|Africa/Porto-Novo|0|Cotonou:100:38
TG|Togo|West Africa|0|0|Africa/Lome|0|Lomé:100:38
CI|Côte d'Ivoire|West Africa|0|0|Africa/Abidjan|0|Abidjan:102:38;San-Pédro:105:40
SN|Senegal|West Africa|0|0|Africa/Dakar|0|Dakar:105:36
GN|Guinea|West Africa|0|0|Africa/Conakry|0|Conakry:108:38
SL|Sierra Leone|West Africa|0|0|Africa/Freetown|0|Freetown:108:38
LR|Liberia|West Africa|0|0|Africa/Monrovia|0|Monrovia:108:38
GM|Gambia|West Africa|0|0|Africa/Banjul|0|Banjul:108:37
MR|Mauritania|West Africa|0|0|Africa/Nouakchott|0|Nouakchott:110:38
CV|Cape Verde|West Africa|0|0|Atlantic/Cape_Verde|0|Praia:110:36
CM|Cameroon|Central Africa|0|0|Africa/Douala|0|Douala:108:40;Kribi:110:41
GA|Gabon|Central Africa|0|0|Africa/Libreville|0|Owendo (Libreville):110:40
CG|Congo|Central Africa|0|0|Africa/Brazzaville|0|Pointe-Noire:110:40
GQ|Equatorial Guinea|Central Africa|0|0|Africa/Malabo|0|Malabo:112:41
ST|São Tomé and Príncipe|Central Africa|0|0|Africa/Sao_Tome|0|São Tomé:115:42
LY|Libya|North Africa|0|0|Africa/Tripoli|0|Misrata:95:30;Benghazi:96:31;Tripoli:95:30
EG|Egypt|North Africa|0|0|Africa/Cairo|0|Alexandria:90:28
SD|Sudan|North Africa|0|0|Africa/Khartoum|0|Port Sudan:92:28
AE|United Arab Emirates|Middle East|0|0|Asia/Dubai|1|Jebel Ali (Dubai):62:20;Sharjah:63:20
SA|Saudi Arabia|Middle East|0|0|Asia/Riyadh|0|Dammam:66:22;Jeddah:68:24
OM|Oman|Middle East|0|0|Asia/Muscat|0|Sohar:64:20;Salalah:66:21
QA|Qatar|Middle East|0|0|Asia/Qatar|0|Hamad Port:65:21
KW|Kuwait|Middle East|0|0|Asia/Kuwait|0|Shuwaikh:66:22
BH|Bahrain|Middle East|0|0|Asia/Bahrain|0|Khalifa Bin Salman:65:21
JO|Jordan|Middle East|0|0|Asia/Amman|0|Aqaba:75:25
IQ|Iraq|Middle East|0|0|Asia/Baghdad|0|Umm Qasr:70:24
YE|Yemen|Middle East|0|0|Asia/Aden|1|Aden:85:26
GE|Georgia|Caucasus|0|0|Asia/Tbilisi|1|Poti:95:40;Batumi:96:41
AZ|Azerbaijan|Caucasus|0|0|Asia/Baku|0|Poti (for Baku):95:40
AM|Armenia|Caucasus|0|0|Asia/Yerevan|1|Poti (for Yerevan):95:40
PK|Pakistan|South Asia|0|0|Asia/Karachi|1|Karachi Port:58:18;Port Qasim:58:18
BD|Bangladesh|South Asia|0|0|Asia/Dhaka|1|Chattogram:60:20;Mongla:62:22
LK|Sri Lanka|South Asia|1|150|Asia/Colombo|1|Colombo:55:16;Hambantota:57:17
MV|Maldives|South Asia|0|0|Indian/Maldives|1|Malé:70:20
NP|Nepal|South Asia|0|0|Asia/Kathmandu|1|Kolkata (for Kathmandu):65:22
BT|Bhutan|South Asia|0|0|Asia/Thimphu|1|Kolkata (for Thimphu):65:22
MN|Mongolia|East Asia|0|0|Asia/Ulaanbaatar|1|Tianjin (for Ulaanbaatar):45:12
RU|Russia|East Asia|0|0|Asia/Vladivostok|1|Vladivostok:40:4;Nakhodka:42:5
KG|Kyrgyzstan|Central Asia|0|0|Asia/Bishkek|1|Vladivostok (for Bishkek):40:4;Poti (for Bishkek):95:40
KZ|Kazakhstan|Central Asia|0|0|Asia/Almaty|0|Vladivostok (for Almaty):40:4
UZ|Uzbekistan|Central Asia|0|0|Asia/Tashkent|0|Poti (for Tashkent):95:40
TJ|Tajikistan|Central Asia|0|0|Asia/Dushanbe|0|Poti (for Dushanbe):95:40
TM|Turkmenistan|Central Asia|0|0|Asia/Ashgabat|0|Poti (for Ashgabat):95:40
AF|Afghanistan|Central Asia|0|0|Asia/Kabul|0|Karachi (for Kabul):58:18
MM|Myanmar|South-East Asia|0|0|Asia/Yangon|0|Yangon:52:14
KH|Cambodia|South-East Asia|0|0|Asia/Phnom_Penh|0|Sihanoukville:50:12
LA|Laos|South-East Asia|0|0|Asia/Vientiane|0|Laem Chabang (for Vientiane):50:12
TH|Thailand|South-East Asia|0|0|Asia/Bangkok|1|Laem Chabang:50:12
MY|Malaysia|South-East Asia|0|0|Asia/Kuala_Lumpur|1|Port Klang:48:10;Penang:50:12;Pasir Gudang:48:10
SG|Singapore|South-East Asia|0|0|Asia/Singapore|1|Singapore:46:9
BN|Brunei|South-East Asia|0|0|Asia/Brunei|1|Muara:55:12
ID|Indonesia|South-East Asia|0|0|Asia/Jakarta|1|Jakarta (Tanjung Priok):50:12
PH|Philippines|South-East Asia|0|0|Asia/Manila|0|Subic Bay:45:8;Manila:45:7
TL|Timor-Leste|South-East Asia|0|0|Asia/Dili|1|Dili:70:20
VN|Vietnam|South-East Asia|0|0|Asia/Ho_Chi_Minh|0|Ho Chi Minh City:45:9;Hai Phong:44:8
HK|Hong Kong|East Asia|0|0|Asia/Hong_Kong|1|Hong Kong:38:5
MO|Macau|East Asia|0|0|Asia/Macau|1|Macau:40:6
PG|Papua New Guinea|Oceania|0|0|Pacific/Port_Moresby|1|Port Moresby:78:18;Lae:80:19
FJ|Fiji|Oceania|1|150|Pacific/Fiji|1|Suva:80:20;Lautoka:80:20
SB|Solomon Islands|Oceania|0|0|Pacific/Guadalcanal|1|Honiara:85:22
VU|Vanuatu|Oceania|0|0|Pacific/Efate|0|Port Vila:88:22
WS|Samoa|Oceania|0|0|Pacific/Apia|1|Apia:90:24
TO|Tonga|Oceania|0|0|Pacific/Tongatapu|1|Nuku'alofa:90:24
KI|Kiribati|Oceania|0|0|Pacific/Tarawa|1|Tarawa:98:28
FM|Micronesia|Oceania|0|0|Pacific/Pohnpei|0|Pohnpei:95:24
MH|Marshall Islands|Oceania|0|0|Pacific/Majuro|0|Majuro:96:25
PW|Palau|Oceania|0|0|Pacific/Palau|0|Koror:90:20
NR|Nauru|Oceania|0|0|Pacific/Nauru|1|Nauru:100:28
TV|Tuvalu|Oceania|0|0|Pacific/Funafuti|1|Funafuti:105:30
CK|Cook Islands|Oceania|0|0|Pacific/Rarotonga|1|Avarua:100:28
NC|New Caledonia|Oceania|0|0|Pacific/Noumea|0|Nouméa:88:20
PF|French Polynesia|Oceania|0|0|Pacific/Tahiti|0|Papeete:100:26
AU|Australia|Oceania|1|300|Australia/Sydney|1|Melbourne:82:20;Sydney:82:20;Brisbane:80:18;Fremantle:85:22
NZ|New Zealand|Oceania|1|250|Pacific/Auckland|1|Auckland:76:18;Wellington:78:20;Lyttelton:79:21;Tauranga:77:19
JM|Jamaica|Caribbean|1|200|America/Jamaica|1|Kingston:110:38
BS|Bahamas|Caribbean|0|0|America/Nassau|1|Nassau:112:36;Freeport:112:35
TT|Trinidad and Tobago|Caribbean|1|200|America/Port_of_Spain|1|Port of Spain:115:40;Point Lisas:115:40
GY|Guyana|Caribbean|0|0|America/Guyana|1|Georgetown:118:42
SR|Suriname|Caribbean|0|0|America/Paramaribo|1|Paramaribo:120:44
BB|Barbados|Caribbean|0|0|America/Barbados|1|Bridgetown:115:40
AG|Antigua and Barbuda|Caribbean|0|0|America/Antigua|1|St. John's:118:40
DM|Dominica|Caribbean|0|0|America/Dominica|1|Roseau:120:42
GD|Grenada|Caribbean|0|0|America/Grenada|1|St. George's:120:42
KN|Saint Kitts and Nevis|Caribbean|0|0|America/St_Kitts|1|Basseterre:120:41
LC|Saint Lucia|Caribbean|0|0|America/St_Lucia|1|Castries:118:41
VC|Saint Vincent and the Grenadines|Caribbean|0|0|America/St_Vincent|1|Kingstown:120:42
KY|Cayman Islands|Caribbean|0|0|America/Cayman|1|George Town:115:38
TC|Turks and Caicos|Caribbean|0|0|America/Grand_Turk|1|Providenciales:118:38
VG|British Virgin Islands|Caribbean|0|0|America/Tortola|1|Road Town:120:40
AI|Anguilla|Caribbean|0|0|America/Anguilla|1|Road Bay:122:41
MS|Montserrat|Caribbean|0|0|America/Montserrat|1|Little Bay:124:42
BM|Bermuda|Caribbean|0|0|Atlantic/Bermuda|1|Hamilton:118:38
VI|US Virgin Islands|Caribbean|0|0|America/St_Thomas|1|Charlotte Amalie:118:40
DO|Dominican Republic|Caribbean|0|0|America/Santo_Domingo|0|Santo Domingo:112:36;Caucedo:112:36
HT|Haiti|Caribbean|0|0|America/Port-au-Prince|0|Port-au-Prince:115:38
CU|Cuba|Caribbean|0|0|America/Havana|0|Mariel:118:38
PR|Puerto Rico|Caribbean|0|0|America/Puerto_Rico|0|San Juan:115:36
CL|Chile|South America|0|0|America/Santiago|1|Iquique (Free Zone):95:32;San Antonio:98:34
BO|Bolivia|South America|0|0|America/La_Paz|1|Iquique (for La Paz):95:32;Arica (for La Paz):96:33
PE|Peru|South America|0|0|America/Lima|0|Callao:98:30
PY|Paraguay|South America|0|0|America/Asuncion|1|Iquique (for Asunción):95:32
UY|Uruguay|South America|0|0|America/Montevideo|0|Montevideo:120:42
AR|Argentina|South America|0|0|America/Argentina/Buenos_Aires|0|Buenos Aires:122:44
BR|Brazil|South America|0|0|America/Sao_Paulo|0|Santos:120:42
EC|Ecuador|South America|0|0|America/Guayaquil|0|Guayaquil:105:30
CO|Colombia|South America|0|0|America/Bogota|0|Buenaventura:105:30;Cartagena:110:36
VE|Venezuela|South America|0|0|America/Caracas|0|La Guaira:115:38
CR|Costa Rica|Central America|0|0|America/Costa_Rica|0|Puerto Caldera:100:28;Puerto Limón:108:36
PA|Panama|Central America|0|0|America/Panama|0|Colón:100:28;Balboa:98:26
SV|El Salvador|Central America|0|0|America/El_Salvador|0|Acajutla:100:28
GT|Guatemala|Central America|0|0|America/Guatemala|0|Puerto Quetzal:100:28
HN|Honduras|Central America|0|0|America/Tegucigalpa|0|Puerto Cortés:108:35
NI|Nicaragua|Central America|0|0|America/Managua|0|Corinto:100:28
BZ|Belize|Central America|0|0|America/Belize|0|Belize City:110:36
MX|Mexico|North America|0|0|America/Mexico_City|0|Manzanillo:95:22;Lázaro Cárdenas:95:22
US|United States|North America|1|300|America/New_York|1|Tacoma:85:14;Long Beach:85:14;Baltimore:110:32;Jacksonville:110:30
CA|Canada|North America|1|250|America/Vancouver|1|Vancouver:80:14;Halifax:110:32;Montréal:112:34
GB|United Kingdom|Europe|1|250|Europe/London|1|Southampton:105:42;Bristol (Portbury):106:43;Tilbury:106:43
IE|Ireland|Europe|1|250|Europe/Dublin|1|Dublin:108:44;Cork:110:45
MT|Malta|Europe|0|0|Europe/Malta|1|Valletta (Marsaxlokk):102:38
CY|Cyprus|Europe|1|200|Asia/Nicosia|1|Limassol:98:34
NL|Netherlands|Europe|0|0|Europe/Amsterdam|0|Rotterdam:100:38
BE|Belgium|Europe|0|0|Europe/Brussels|0|Antwerp:100:38;Zeebrugge:100:38
DE|Germany|Europe|0|0|Europe/Berlin|0|Bremerhaven:102:40;Hamburg:102:40
FI|Finland|Europe|0|0|Europe/Helsinki|0|Hanko:110:45
NO|Norway|Europe|0|0|Europe/Oslo|0|Drammen:108:44
SE|Sweden|Europe|0|0|Europe/Stockholm|0|Gothenburg:105:42
PL|Poland|Europe|0|0|Europe/Warsaw|0|Gdańsk:106:43
UA|Ukraine|Europe|0|0|Europe/Kyiv|0|Odesa:100:38
TR|Türkiye|Europe|0|0|Europe/Istanbul|0|Mersin:90:30
FR|France|Europe|0|0|Europe/Paris|0|Le Havre:104:42;Marseille Fos:100:38
ES|Spain|Europe|0|0|Europe/Madrid|0|Valencia:98:36;Barcelona:98:36
IT|Italy|Europe|0|0|Europe/Rome|0|Genoa:98:36;Gioia Tauro:96:34
PT|Portugal|Europe|0|0|Europe/Lisbon|0|Lisbon:106:42
GR|Greece|Europe|0|0|Europe/Athens|0|Piraeus:96:32;Thessaloniki:98:34
DK|Denmark|Europe|0|0|Europe/Copenhagen|0|Aarhus:108:44
IS|Iceland|Europe|0|0|Atlantic/Reykjavik|0|Reykjavik:125:50
EE|Estonia|Europe|0|0|Europe/Tallinn|0|Tallinn:112:46
LV|Latvia|Europe|0|0|Europe/Riga|0|Riga:112:46
LT|Lithuania|Europe|0|0|Europe/Vilnius|0|Klaipeda:110:45
BG|Bulgaria|Europe|0|0|Europe/Sofia|0|Varna:102:38
RO|Romania|Europe|0|0|Europe/Bucharest|0|Constanta:100:37
HR|Croatia|Europe|0|0|Europe/Zagreb|0|Rijeka:100:37
SI|Slovenia|Europe|0|0|Europe/Ljubljana|0|Koper:98:36
AL|Albania|Europe|0|0|Europe/Tirane|0|Durres:102:38
ME|Montenegro|Europe|0|0|Europe/Podgorica|0|Bar:102:38
BA|Bosnia and Herzegovina|Europe|0|0|Europe/Sarajevo|0|Ploce:102:38
MK|North Macedonia|Europe|0|0|Europe/Skopje|0|Thessaloniki (for Skopje):98:34
AT|Austria|Europe|0|0|Europe/Vienna|0|Koper (for Vienna):98:36
CH|Switzerland|Europe|0|0|Europe/Zurich|0|Genoa (for Zurich):98:36
CZ|Czechia|Europe|0|0|Europe/Prague|0|Hamburg (for Prague):102:40
SK|Slovakia|Europe|0|0|Europe/Bratislava|0|Koper (for Bratislava):98:36
HU|Hungary|Europe|0|0|Europe/Budapest|0|Koper (for Budapest):98:36
RS|Serbia|Europe|0|0|Europe/Belgrade|0|Bar (for Belgrade):102:38
BY|Belarus|Europe|0|0|Europe/Minsk|0|Klaipeda (for Minsk):110:45
MD|Moldova|Europe|0|0|Europe/Chisinau|0|Constanta (for Chisinau):100:37
LU|Luxembourg|Europe|0|0|Europe/Luxembourg|0|Antwerp (for Luxembourg):104:41
GI|Gibraltar|Europe|0|0|Europe/Gibraltar|1|Gibraltar:106:40
MA|Morocco|North Africa|0|0|Africa/Casablanca|0|Casablanca:102:40
DZ|Algeria|North Africa|0|0|Africa/Algiers|0|Algiers:104:42
TN|Tunisia|North Africa|0|0|Africa/Tunis|0|Rades (Tunis):102:40
ML|Mali|West Africa|0|0|Africa/Bamako|0|Dakar (for Bamako):108:40
BF|Burkina Faso|West Africa|0|0|Africa/Ouagadougou|0|Tema (for Ouagadougou):104:38
NE|Niger|West Africa|0|0|Africa/Niamey|0|Cotonou (for Niamey):106:40
GW|Guinea-Bissau|West Africa|0|0|Africa/Bissau|0|Bissau:114:44
TD|Chad|Central Africa|0|0|Africa/Ndjamena|0|Douala (for N'Djamena):108:42
CF|Central African Republic|Central Africa|0|0|Africa/Bangui|0|Douala (for Bangui):108:42
RE|Reunion|East Africa|0|0|Indian/Reunion|0|Le Port:92:28
YT|Mayotte|East Africa|0|0|Indian/Mayotte|0|Longoni:104:34
IN|India|South Asia|1|250|Asia/Kolkata|1|Nhava Sheva (Mumbai):58:18;Chennai:56:16
KR|South Korea|East Asia|0|0|Asia/Seoul|0|Incheon:42:5;Busan:40:4
TW|Taiwan|East Asia|0|0|Asia/Taipei|0|Keelung:45:6;Kaohsiung:45:7
SY|Syria|Middle East|0|0|Asia/Damascus|0|Latakia:88:30
LB|Lebanon|Middle East|0|0|Asia/Beirut|0|Beirut:88:30
IL|Israel|Middle East|0|0|Asia/Jerusalem|0|Haifa:90:30;Ashdod:90:31
IR|Iran|Middle East|0|0|Asia/Tehran|0|Bandar Abbas:66:22
GP|Guadeloupe|Caribbean|0|0|America/Guadeloupe|0|Pointe-a-Pitre:112:38
MQ|Martinique|Caribbean|0|0|America/Martinique|0|Fort-de-France:112:38
GF|French Guiana|South America|0|0|America/Cayenne|0|Degrad des Cannes:118:42
AW|Aruba|Caribbean|0|0|America/Aruba|0|Oranjestad:108:34
CW|Curacao|Caribbean|0|0|America/Curacao|0|Willemstad:108:34
SX|Sint Maarten|Caribbean|0|0|America/Lower_Princes|1|Philipsburg:110:36
BQ|Bonaire|Caribbean|0|0|America/Kralendijk|0|Kralendijk:112:36
MF|Saint Martin|Caribbean|0|0|America/Marigot|0|Marigot:112:37
BL|Saint Barthelemy|Caribbean|0|0|America/St_Barthelemy|0|Gustavia:115:38
FK|Falkland Islands|South America|0|0|Atlantic/Stanley|1|Stanley:130:55
GU|Guam|Oceania|0|0|Pacific/Guam|0|Apra Harbor:72:10
MP|Northern Mariana Islands|Oceania|0|0|Pacific/Saipan|0|Saipan:74:11
AS|American Samoa|Oceania|0|0|Pacific/Pago_Pago|0|Pago Pago:92:24
NU|Niue|Oceania|0|0|Pacific/Niue|1|Alofi:110:30
WF|Wallis and Futuna|Oceania|0|0|Pacific/Wallis|0|Mata-Utu:110:30
`;

export interface PortSeed {
  name: string;
  freightUsdPerM3: number;
  transitDays: number;
}
export interface CountrySeed {
  code: string;
  name: string;
  region: string;
  inspectionRequired: boolean;
  inspectionFeeUsd: number;
  timezone: string;
  rhdAllowed: boolean;
  ports: PortSeed[];
}

export const COUNTRIES: CountrySeed[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [code, name, region, insp, fee, tz, rhd, portsRaw] = line.split("|");
    return {
      code: code!,
      name: name!,
      region: region!,
      inspectionRequired: insp === "1",
      inspectionFeeUsd: Number(fee),
      timezone: tz!,
      rhdAllowed: rhd === "1",
      ports: portsRaw!.split(";").map((p) => {
        const parts = p.split(":");
        const days = Number(parts.pop());
        const freight = Number(parts.pop());
        return { name: parts.join(":"), freightUsdPerM3: freight, transitDays: days };
      }),
    };
  });
