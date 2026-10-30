/**
 * Vehicle catalog for demo data. Model names and chassis codes are public facts; prices are demo values
 * (typical FOB range for a ~2018 car with ~60,000 km), dimensions are approximate.
 */
export interface ModelSpec {
  brand: string;
  model: string;
  codes: string[];
  body: "Sedan" | "SUV" | "Hatchback" | "Pickup" | "Van" | "Wagon" | "Truck" | "Coupe" | "Minivan";
  engineCc: number[];
  fuel: ("Petrol" | "Diesel" | "Hybrid" | "Electric")[];
  drive: ("2WD" | "4WD" | "AWD")[];
  transmission: ("Automatic" | "Manual" | "CVT")[];
  doors: number;
  seats: number;
  dims: [number, number, number]; // L, W, H mm
  baseUsd: number;
  years: [number, number];
  trims: string[];
}

export const CATALOG: ModelSpec[] = [
  { brand: "Toyota", model: "Hilux", codes: ["GUN125", "GUN126"], body: "Pickup", engineCc: [2400, 2800], fuel: ["Diesel"], drive: ["4WD"], transmission: ["Automatic", "Manual"], doors: 4, seats: 5, dims: [5335, 1855, 1800], baseUsd: 21500, years: [2016, 2022], trims: ["Double Cab Z", "Double Cab X", "GR Sport"] },
  { brand: "Toyota", model: "Land Cruiser Prado", codes: ["TRJ150W", "GDJ150W", "GDJ151W"], body: "SUV", engineCc: [2700, 2800], fuel: ["Petrol", "Diesel"], drive: ["4WD"], transmission: ["Automatic"], doors: 5, seats: 7, dims: [4825, 1885, 1850], baseUsd: 33500, years: [2015, 2022], trims: ["TX", "TX L Package", "TZ-G"] },
  { brand: "Toyota", model: "Land Cruiser", codes: ["URJ202W", "VJA300W"], body: "SUV", engineCc: [4600, 3500], fuel: ["Petrol"], drive: ["4WD"], transmission: ["Automatic"], doors: 5, seats: 8, dims: [4950, 1980, 1880], baseUsd: 52000, years: [2015, 2022], trims: ["AX", "AX G Selection", "ZX"] },
  { brand: "Toyota", model: "RAV4", codes: ["MXAA54", "AXAH54"], body: "SUV", engineCc: [2000, 2500], fuel: ["Petrol", "Hybrid"], drive: ["4WD", "2WD"], transmission: ["CVT", "Automatic"], doors: 5, seats: 5, dims: [4600, 1855, 1685], baseUsd: 21000, years: [2019, 2023], trims: ["X", "G", "Adventure"] },
  { brand: "Toyota", model: "Harrier", codes: ["ZSU60W", "AVU65W", "MXUA80"], body: "SUV", engineCc: [2000, 2500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4740, 1855, 1660], baseUsd: 24000, years: [2016, 2022], trims: ["Premium", "Elegance", "Progress"] },
  { brand: "Toyota", model: "Corolla Fielder", codes: ["NZE161G", "NKE165G", "NRE161G"], body: "Wagon", engineCc: [1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4410, 1695, 1510], baseUsd: 8200, years: [2015, 2020], trims: ["X", "G", "Hybrid G"] },
  { brand: "Toyota", model: "Corolla Axio", codes: ["NZE161", "NKE165"], body: "Sedan", engineCc: [1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 4, seats: 5, dims: [4400, 1695, 1460], baseUsd: 7600, years: [2015, 2020], trims: ["X", "G", "Hybrid"] },
  { brand: "Toyota", model: "Probox", codes: ["NCP160V", "NSP160V", "NHP160V"], body: "Wagon", engineCc: [1300, 1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4245, 1690, 1525], baseUsd: 6400, years: [2015, 2022], trims: ["DX", "GL", "F"] },
  { brand: "Toyota", model: "Hiace Van", codes: ["KDH201V", "TRH200V", "GDH201V"], body: "Van", engineCc: [2000, 2800], fuel: ["Petrol", "Diesel"], drive: ["2WD", "4WD"], transmission: ["Automatic"], doors: 5, seats: 6, dims: [4695, 1695, 1980], baseUsd: 22500, years: [2015, 2022], trims: ["DX", "Super GL", "Super GL Dark Prime"] },
  { brand: "Toyota", model: "Vitz", codes: ["KSP130", "NSP130"], body: "Hatchback", engineCc: [1000, 1300], fuel: ["Petrol"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [3945, 1695, 1500], baseUsd: 5400, years: [2015, 2019], trims: ["F", "Jewela", "U"] },
  { brand: "Toyota", model: "Aqua", codes: ["NHP10", "MXPK11"], body: "Hatchback", engineCc: [1500], fuel: ["Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [3995, 1695, 1455], baseUsd: 6700, years: [2015, 2022], trims: ["S", "G", "Crossover"] },
  { brand: "Toyota", model: "Prius", codes: ["ZVW50", "ZVW51", "ZVW55"], body: "Hatchback", engineCc: [1800], fuel: ["Hybrid"], drive: ["2WD", "AWD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4575, 1760, 1470], baseUsd: 10500, years: [2016, 2022], trims: ["S", "A", "A Premium"] },
  { brand: "Toyota", model: "Noah", codes: ["ZRR80G", "ZWR80G"], body: "Minivan", engineCc: [2000, 1800], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 8, dims: [4695, 1695, 1825], baseUsd: 12800, years: [2015, 2021], trims: ["X", "G", "Si"] },
  { brand: "Toyota", model: "Voxy", codes: ["ZRR80W", "ZWR80W"], body: "Minivan", engineCc: [2000, 1800], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 8, dims: [4710, 1735, 1825], baseUsd: 13600, years: [2015, 2021], trims: ["V", "ZS", "ZS Kirameki"] },
  { brand: "Toyota", model: "Alphard", codes: ["AGH30W", "GGH30W", "AYH30W"], body: "Minivan", engineCc: [2500, 3500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT", "Automatic"], doors: 5, seats: 7, dims: [4945, 1850, 1935], baseUsd: 34000, years: [2016, 2022], trims: ["S", "SC", "Executive Lounge"] },
  { brand: "Toyota", model: "Crown", codes: ["GRS210", "AWS210", "ARS220"], body: "Sedan", engineCc: [2500, 2000], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["Automatic", "CVT"], doors: 4, seats: 5, dims: [4910, 1800, 1455], baseUsd: 15500, years: [2015, 2021], trims: ["Royal Saloon", "Athlete S", "RS"] },
  { brand: "Toyota", model: "Mark X", codes: ["GRX130", "GRX133"], body: "Sedan", engineCc: [2500, 3500], fuel: ["Petrol"], drive: ["2WD"], transmission: ["Automatic"], doors: 4, seats: 5, dims: [4770, 1795, 1435], baseUsd: 10800, years: [2015, 2019], trims: ["250G", "250RDS", "350RDS"] },
  { brand: "Toyota", model: "Premio", codes: ["NZT260", "ZRT260"], body: "Sedan", engineCc: [1500, 1800], fuel: ["Petrol"], drive: ["2WD"], transmission: ["CVT"], doors: 4, seats: 5, dims: [4595, 1695, 1475], baseUsd: 9600, years: [2015, 2020], trims: ["1.5F", "1.8X", "1.8G EX"] },
  { brand: "Toyota", model: "Dyna", codes: ["XZU605", "XZU710"], body: "Truck", engineCc: [4000], fuel: ["Diesel"], drive: ["2WD"], transmission: ["Manual"], doors: 2, seats: 3, dims: [4690, 1695, 2000], baseUsd: 18500, years: [2014, 2020], trims: ["Flat Deck", "Dump", "Box"] },
  { brand: "Nissan", model: "Note", codes: ["E12", "HE12", "SNE12"], body: "Hatchback", engineCc: [1200], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4100, 1695, 1520], baseUsd: 5600, years: [2016, 2020], trims: ["X", "e-Power X", "Medalist"] },
  { brand: "Nissan", model: "X-Trail", codes: ["NT32", "T32", "HNT32"], body: "SUV", engineCc: [2000], fuel: ["Petrol", "Hybrid"], drive: ["4WD", "2WD"], transmission: ["CVT"], doors: 5, seats: 7, dims: [4690, 1820, 1740], baseUsd: 13200, years: [2015, 2021], trims: ["20X", "20Xi", "Autech"] },
  { brand: "Nissan", model: "Serena", codes: ["C27", "GC27", "HFC27"], body: "Minivan", engineCc: [2000, 1200], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 8, dims: [4770, 1740, 1865], baseUsd: 11400, years: [2016, 2021], trims: ["X", "Highway Star", "e-Power"] },
  { brand: "Nissan", model: "NV350 Caravan", codes: ["VR2E26", "CW8E26", "VW6E26"], body: "Van", engineCc: [2000, 2500], fuel: ["Petrol", "Diesel"], drive: ["2WD", "4WD"], transmission: ["Automatic"], doors: 5, seats: 6, dims: [4695, 1695, 1990], baseUsd: 15800, years: [2015, 2021], trims: ["DX", "Premium GX", "Super Long"] },
  { brand: "Nissan", model: "March", codes: ["K13", "NK13"], body: "Hatchback", engineCc: [1200], fuel: ["Petrol"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [3825, 1665, 1515], baseUsd: 4300, years: [2015, 2020], trims: ["S", "X", "Bolero"] },
  { brand: "Nissan", model: "Leaf", codes: ["ZE1", "AZE0"], body: "Hatchback", engineCc: [0], fuel: ["Electric"], drive: ["2WD"], transmission: ["Automatic"], doors: 5, seats: 5, dims: [4480, 1790, 1540], baseUsd: 9800, years: [2017, 2021], trims: ["S", "X", "G"] },
  { brand: "Nissan", model: "Atlas", codes: ["SZ2F24", "TZ3F24"], body: "Truck", engineCc: [3000], fuel: ["Diesel"], drive: ["2WD"], transmission: ["Manual"], doors: 2, seats: 3, dims: [4690, 1695, 1990], baseUsd: 16800, years: [2014, 2020], trims: ["Flat Deck", "Dump"] },
  { brand: "Honda", model: "Fit", codes: ["GK3", "GP5", "GR3"], body: "Hatchback", engineCc: [1300, 1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [3990, 1695, 1525], baseUsd: 6200, years: [2015, 2021], trims: ["13G", "Hybrid L", "RS"] },
  { brand: "Honda", model: "Vezel", codes: ["RU1", "RU3", "RV5"], body: "SUV", engineCc: [1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4330, 1770, 1605], baseUsd: 12400, years: [2015, 2022], trims: ["X", "Hybrid Z", "RS"] },
  { brand: "Honda", model: "CR-V", codes: ["RW1", "RT5", "RW2"], body: "SUV", engineCc: [1500, 2000], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4605, 1855, 1680], baseUsd: 17500, years: [2018, 2022], trims: ["EX", "EX Masterpiece", "Hybrid EX"] },
  { brand: "Honda", model: "Freed", codes: ["GB5", "GB7", "GB8"], body: "Minivan", engineCc: [1500], fuel: ["Petrol", "Hybrid"], drive: ["2WD", "4WD"], transmission: ["CVT"], doors: 5, seats: 6, dims: [4265, 1695, 1710], baseUsd: 9800, years: [2016, 2022], trims: ["G", "Hybrid G", "Crosstar"] },
  { brand: "Honda", model: "Stepwgn", codes: ["RP3", "RP5"], body: "Minivan", engineCc: [1500, 2000], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT"], doors: 5, seats: 8, dims: [4690, 1695, 1840], baseUsd: 12900, years: [2015, 2021], trims: ["G", "Spada", "Spada Hybrid"] },
  { brand: "Mazda", model: "Demio", codes: ["DJ3FS", "DJ5FS"], body: "Hatchback", engineCc: [1300, 1500], fuel: ["Petrol", "Diesel"], drive: ["2WD"], transmission: ["Automatic"], doors: 5, seats: 5, dims: [4060, 1695, 1500], baseUsd: 5800, years: [2015, 2019], trims: ["13S", "XD Touring", "15MB"] },
  { brand: "Mazda", model: "CX-5", codes: ["KF2P", "KFEP", "KE2FW"], body: "SUV", engineCc: [2000, 2200, 2500], fuel: ["Petrol", "Diesel"], drive: ["2WD", "4WD"], transmission: ["Automatic"], doors: 5, seats: 5, dims: [4545, 1840, 1690], baseUsd: 15800, years: [2016, 2022], trims: ["20S", "XD Proactive", "XD L Package"] },
  { brand: "Mazda", model: "Axela", codes: ["BM5FS", "BMEFS"], body: "Hatchback", engineCc: [1500, 2200], fuel: ["Petrol", "Diesel"], drive: ["2WD"], transmission: ["Automatic"], doors: 5, seats: 5, dims: [4470, 1795, 1470], baseUsd: 7400, years: [2015, 2019], trims: ["15S", "22XD", "Sport"] },
  { brand: "Subaru", model: "Forester", codes: ["SK9", "SJ5", "SKE"], body: "SUV", engineCc: [2000, 2500], fuel: ["Petrol", "Hybrid"], drive: ["AWD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4625, 1815, 1730], baseUsd: 13900, years: [2015, 2021], trims: ["2.0i-L EyeSight", "Advance", "X-Break"] },
  { brand: "Subaru", model: "Impreza", codes: ["GT2", "GK2", "GT7"], body: "Hatchback", engineCc: [1600, 2000], fuel: ["Petrol"], drive: ["AWD", "2WD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4460, 1775, 1480], baseUsd: 8600, years: [2016, 2021], trims: ["1.6i-L", "2.0i-S", "Sport"] },
  { brand: "Subaru", model: "XV", codes: ["GT3", "GT7", "GTE"], body: "SUV", engineCc: [1600, 2000], fuel: ["Petrol", "Hybrid"], drive: ["AWD"], transmission: ["CVT"], doors: 5, seats: 5, dims: [4465, 1800, 1550], baseUsd: 11200, years: [2017, 2021], trims: ["1.6i-L", "2.0i-S", "Advance"] },
  { brand: "Mitsubishi", model: "Pajero", codes: ["V98W", "V93W"], body: "SUV", engineCc: [3200, 3800], fuel: ["Diesel", "Petrol"], drive: ["4WD"], transmission: ["Automatic"], doors: 5, seats: 7, dims: [4900, 1875, 1870], baseUsd: 17900, years: [2014, 2019], trims: ["Exceed", "Super Exceed", "Final Edition"] },
  { brand: "Mitsubishi", model: "Outlander", codes: ["GF8W", "GG2W", "GN0W"], body: "SUV", engineCc: [2000, 2400], fuel: ["Petrol", "Hybrid"], drive: ["4WD", "2WD"], transmission: ["CVT"], doors: 5, seats: 7, dims: [4695, 1810, 1710], baseUsd: 12600, years: [2015, 2021], trims: ["20G", "24G", "PHEV G"] },
  { brand: "Mitsubishi", model: "Delica D:5", codes: ["CV1W", "CV5W"], body: "Minivan", engineCc: [2200, 2400], fuel: ["Diesel", "Petrol"], drive: ["4WD"], transmission: ["Automatic", "CVT"], doors: 5, seats: 8, dims: [4800, 1795, 1875], baseUsd: 16400, years: [2015, 2022], trims: ["G Power Package", "Urban Gear", "P"] },
  { brand: "Mitsubishi", model: "Canter", codes: ["FBA20", "FEB80", "FEA50"], body: "Truck", engineCc: [3000], fuel: ["Diesel"], drive: ["2WD", "4WD"], transmission: ["Manual", "Automatic"], doors: 2, seats: 3, dims: [4690, 1695, 2000], baseUsd: 19800, years: [2014, 2021], trims: ["Flat Deck", "Dump", "Refrigerated"] },
  { brand: "Suzuki", model: "Swift", codes: ["ZC83S", "ZC33S", "ZD83S"], body: "Hatchback", engineCc: [1200, 1400], fuel: ["Petrol", "Hybrid"], drive: ["2WD"], transmission: ["CVT", "Manual"], doors: 5, seats: 5, dims: [3840, 1695, 1500], baseUsd: 6600, years: [2017, 2022], trims: ["XG", "Hybrid RS", "Sport"] },
  { brand: "Suzuki", model: "Jimny", codes: ["JB64W", "JB74W"], body: "SUV", engineCc: [660, 1500], fuel: ["Petrol"], drive: ["4WD"], transmission: ["Automatic", "Manual"], doors: 3, seats: 4, dims: [3395, 1475, 1725], baseUsd: 14800, years: [2018, 2023], trims: ["XL", "XC", "Sierra JC"] },
  { brand: "Suzuki", model: "Every", codes: ["DA17V", "DA64V"], body: "Van", engineCc: [660], fuel: ["Petrol"], drive: ["2WD", "4WD"], transmission: ["Automatic", "Manual"], doors: 5, seats: 4, dims: [3395, 1475, 1895], baseUsd: 4800, years: [2015, 2022], trims: ["PA", "Join", "Join Turbo"] },
  { brand: "Isuzu", model: "Elf", codes: ["NKR85", "NJR85", "NPR85"], body: "Truck", engineCc: [3000], fuel: ["Diesel"], drive: ["2WD"], transmission: ["Manual", "Automatic"], doors: 2, seats: 3, dims: [4690, 1695, 2000], baseUsd: 18900, years: [2014, 2021], trims: ["Flat Deck", "Dump", "Box"] },
  { brand: "Daihatsu", model: "Hijet", codes: ["S500P", "S510P"], body: "Truck", engineCc: [660], fuel: ["Petrol"], drive: ["2WD", "4WD"], transmission: ["Manual", "CVT"], doors: 2, seats: 2, dims: [3395, 1475, 1780], baseUsd: 3900, years: [2015, 2022], trims: ["Standard", "Jumbo", "Extra"] },
  { brand: "Lexus", model: "RX", codes: ["AGL20W", "GYL25W", "GYL20W"], body: "SUV", engineCc: [2000, 3500], fuel: ["Petrol", "Hybrid"], drive: ["AWD", "2WD"], transmission: ["Automatic", "CVT"], doors: 5, seats: 5, dims: [4890, 1895, 1710], baseUsd: 31000, years: [2016, 2022], trims: ["RX300 Version L", "RX450h F Sport", "RX450hL"] },
];

export const COLORS: { name: string; hex: string; weight: number }[] = [
  { name: "Pearl White", hex: "#f4f4f2", weight: 26 },
  { name: "Black", hex: "#1c1d21", weight: 18 },
  { name: "Silver", hex: "#b8bcc2", weight: 16 },
  { name: "Gray", hex: "#6b7078", weight: 10 },
  { name: "Dark Blue", hex: "#1f3a63", weight: 7 },
  { name: "Red", hex: "#b3202a", weight: 6 },
  { name: "Wine Red", hex: "#6d1f2c", weight: 4 },
  { name: "Beige", hex: "#d8c7a3", weight: 4 },
  { name: "Green", hex: "#3d5a40", weight: 3 },
  { name: "Light Blue", hex: "#7fa7c9", weight: 3 },
  { name: "Brown", hex: "#5c4033", weight: 3 },
];

export function colorHex(name: string): string {
  return COLORS.find((c) => c.name === name)?.hex ?? "#9aa0a6";
}

export const FEATURES_BY_BODY: Record<string, string[]> = {
  Sedan: ["Navigation", "Back camera", "Smart key", "Push start", "Alloy wheels", "Cruise control", "Leather seats", "Sunroof", "LED headlights", "Lane assist"],
  SUV: ["Navigation", "Back camera", "360° camera", "Smart key", "Push start", "Alloy wheels", "Roof rails", "Leather seats", "Sunroof", "Power tailgate", "Lane assist", "Adaptive cruise"],
  Hatchback: ["Navigation", "Back camera", "Smart key", "Push start", "Alloy wheels", "LED headlights", "Bluetooth", "Collision safety"],
  Pickup: ["Navigation", "Back camera", "Smart key", "Alloy wheels", "Bed liner", "Tow hitch", "Diff lock", "Side steps", "Leather seats"],
  Van: ["Navigation", "Back camera", "Power sliding door", "Rear heater", "Keyless entry", "Roof carrier"],
  Wagon: ["Navigation", "Back camera", "Smart key", "Alloy wheels", "Roof rails", "Bluetooth"],
  Truck: ["Power steering", "Air conditioner", "Power windows", "Tachograph", "Dual rear wheels"],
  Minivan: ["Navigation", "Back camera", "Twin power sliding doors", "Rear monitor", "Captain seats", "Smart key", "Alloy wheels", "Lane assist"],
  Coupe: ["Navigation", "Back camera", "Smart key", "Alloy wheels", "Leather seats", "Sport mode"],
};
