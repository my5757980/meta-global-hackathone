/** Fictional people and companies for the demo tenant. Any resemblance to real persons is coincidental. */
export interface StaffSeed {
  key: string;
  name: string;
  email: string;
  username: string;
  role: "admin" | "manager" | "supervisor" | "agent" | "accounts" | "fte";
  title: string;
  phone: string;
}

export const STAFF: StaffSeed[] = [
  { key: "admin", name: "Kenji Watanabe", email: "kenji@hikari-motors.example", username: "kenji", role: "admin", title: "System Admin", phone: "+81 90 1111 0001" },
  { key: "manager", name: "Fatima Noor", email: "fatima@hikari-motors.example", username: "fatima", role: "manager", title: "Sales Manager", phone: "+81 90 1111 0002" },
  { key: "supervisor", name: "Daniel Mensah", email: "daniel@hikari-motors.example", username: "daniel", role: "supervisor", title: "Sales Supervisor", phone: "+81 90 1111 0003" },
  { key: "agent", name: "Ayesha Raza", email: "ayesha@hikari-motors.example", username: "ayesha", role: "agent", title: "Sales Agent (Africa)", phone: "+81 90 1111 0004" },
  { key: "agent2", name: "Hiro Tanaka", email: "hiro@hikari-motors.example", username: "hiro", role: "agent", title: "Sales Agent (Caribbean & Pacific)", phone: "+81 90 1111 0005" },
  { key: "accounts", name: "Grace Wanjiru", email: "grace@hikari-motors.example", username: "grace", role: "accounts", title: "Accounts", phone: "+81 90 1111 0006" },
  { key: "fte", name: "Sora", email: "sora@hikari-motors.example", username: "sora", role: "fte", title: "AI Sales Executive", phone: "+81 90 1111 0007" },
];

export interface CustomerSeed {
  key: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  agent: "agent" | "agent2" | "fte";
}

export const CUSTOMERS: CustomerSeed[] = [
  { key: "customer", name: "Joseph Mwangi", company: "Mwangi Auto Traders", email: "joseph.mwangi@example.com", phone: "+254 712 000 101", country: "KE", city: "Mombasa", agent: "agent" },
  { key: "c2", name: "Amina Hassan", company: "Hassan Motors Ltd", email: "amina.hassan@example.com", phone: "+255 754 000 102", country: "TZ", city: "Dar es Salaam", agent: "agent" },
  { key: "c3", name: "Peter Okello", company: "Okello Car Bazaar", email: "peter.okello@example.com", phone: "+256 772 000 103", country: "UG", city: "Kampala", agent: "agent" },
  { key: "c4", name: "Chanda Mulenga", company: "Copperbelt Wheels", email: "chanda.mulenga@example.com", phone: "+260 977 000 104", country: "ZM", city: "Lusaka", agent: "agent" },
  { key: "c5", name: "Tendai Moyo", company: "Moyo Fleet Services", email: "tendai.moyo@example.com", phone: "+263 77 000 0105", country: "ZW", city: "Harare", agent: "agent" },
  { key: "c6", name: "Andre Campbell", company: "Island Auto Imports", email: "andre.campbell@example.com", phone: "+1 876 000 0106", country: "JM", city: "Kingston", agent: "agent2" },
  { key: "c7", name: "Kevin Ramdeen", company: "Ramdeen Motors", email: "kevin.ramdeen@example.com", phone: "+1 868 000 0107", country: "TT", city: "Port of Spain", agent: "agent2" },
  { key: "c8", name: "Ravi Persaud", company: "Demerara Auto Sales", email: "ravi.persaud@example.com", phone: "+592 600 0108", country: "GY", city: "Georgetown", agent: "agent2" },
  { key: "c9", name: "Bilal Ahmed", company: "Ahmed Japanese Cars", email: "bilal.ahmed@example.com", phone: "+92 300 000 0109", country: "PK", city: "Karachi", agent: "agent" },
  { key: "c10", name: "Nimal Perera", company: "Perera Auto Hub", email: "nimal.perera@example.com", phone: "+94 77 000 0110", country: "LK", city: "Colombo", agent: "agent2" },
  { key: "c11", name: "Tomás Silva", company: "Silva Importaciones", email: "tomas.silva@example.com", phone: "+56 9 0000 0111", country: "CL", city: "Iquique", agent: "agent2" },
  { key: "c12", name: "Ahmed Al-Mansouri", company: "Gulf Re-export Trading", email: "ahmed.almansouri@example.com", phone: "+971 50 000 0112", country: "AE", city: "Dubai", agent: "agent" },
  { key: "c13", name: "Fernando Macuacua", company: "Macuacua Auto", email: "fernando.macuacua@example.com", phone: "+258 84 000 0113", country: "MZ", city: "Maputo", agent: "agent" },
  { key: "c14", name: "Sione Taufa", company: "Taufa Rentals", email: "sione.taufa@example.com", phone: "+676 77 00114", country: "TO", city: "Nuku'alofa", agent: "agent2" },
  { key: "c15", name: "Liam Walker", company: "Walker Imports NZ", email: "liam.walker@example.com", phone: "+64 21 000 0115", country: "NZ", city: "Auckland", agent: "agent2" },
  { key: "c16", name: "Aleksandr Petrov", company: "Primorye Auto", email: "aleksandr.petrov@example.com", phone: "+7 914 000 0116", country: "RU", city: "Vladivostok", agent: "agent2" },
  { key: "c17", name: "Bat-Erdene Ganbold", company: "Steppe Motors", email: "baterdene.ganbold@example.com", phone: "+976 9900 0117", country: "MN", city: "Ulaanbaatar", agent: "agent2" },
  { key: "c18", name: "Mohamed Abdi", company: "Horn Auto Dealers", email: "mohamed.abdi@example.com", phone: "+252 61 000 0118", country: "SO", city: "Mogadishu", agent: "agent" },
  { key: "c19", name: "Grace Banda", company: "Banda Car Mart", email: "grace.banda@example.com", phone: "+265 99 000 0119", country: "MW", city: "Lilongwe", agent: "agent" },
  { key: "c20", name: "Samuel Kiprono", company: "Rift Valley Autos", email: "samuel.kiprono@example.com", phone: "+254 722 000 120", country: "KE", city: "Nairobi", agent: "fte" },
  { key: "c21", name: "Nadia Rahman", company: "Rahman Reconditioned Cars", email: "nadia.rahman@example.com", phone: "+880 1700 000121", country: "BD", city: "Dhaka", agent: "agent" },
  { key: "c22", name: "James O'Brien", company: "Emerald JDM Imports", email: "james.obrien@example.com", phone: "+353 85 000 0122", country: "IE", city: "Dublin", agent: "agent2" },
  { key: "c23", name: "Mere Tuilagi", company: "Pacific Island Motors", email: "mere.tuilagi@example.com", phone: "+679 900 0123", country: "FJ", city: "Suva", agent: "agent2" },
  { key: "c24", name: "Lindiwe Dube", company: "Dube Transport", email: "lindiwe.dube@example.com", phone: "+267 71 000 124", country: "BW", city: "Gaborone", agent: "fte" },
];

export const FIRST_NAMES: Record<string, string[]> = {
  "East Africa": ["Brian", "Faith", "Kevin", "Mercy", "Dennis", "Esther", "Collins", "Wanjiku", "Baraka", "Neema", "Juma", "Halima", "Moses", "Ruth", "Ibrahim", "Zawadi"],
  "Southern Africa": ["Thabo", "Naledi", "Tatenda", "Rudo", "Mwila", "Bwalya", "Kagiso", "Lerato", "Chikondi", "Mphatso", "Sipho", "Nomsa"],
  Caribbean: ["Andre", "Shanice", "Marcus", "Keisha", "Devon", "Tamara", "Ryan", "Alicia", "Shawn", "Natalie", "Jason", "Kimberly"],
  "South Asia": ["Imran", "Sana", "Kamran", "Hina", "Rashid", "Farah", "Tariq", "Nimal", "Kumari", "Arif", "Rubina", "Sajid"],
  Oceania: ["Sione", "Losana", "Mele", "Tevita", "Ana", "Viliami", "Josefa", "Litia", "Tom", "Emma", "Jack", "Olivia"],
  default: ["Ahmed", "Maria", "Ivan", "Sofia", "Omar", "Elena", "Carlos", "Yusuf", "Daniel", "Layla", "Pedro", "Mariam"],
};

export const LAST_NAMES: Record<string, string[]> = {
  "East Africa": ["Otieno", "Kamau", "Mutua", "Njoroge", "Wekesa", "Mushi", "Mrema", "Kato", "Ssempala", "Abdi", "Hassan", "Omondi"],
  "Southern Africa": ["Banda", "Phiri", "Mwale", "Moyo", "Ncube", "Dube", "Sithole", "Mokoena", "Tembo", "Chirwa", "Ndlovu", "Zulu"],
  Caribbean: ["Brown", "Campbell", "Williams", "Thompson", "Reid", "Ramdial", "Persaud", "Singh", "Clarke", "Edwards", "Morgan", "Bailey"],
  "South Asia": ["Khan", "Ahmed", "Hussain", "Malik", "Perera", "Fernando", "Silva", "Chowdhury", "Rahman", "Qureshi", "Siddiqui", "Iqbal"],
  Oceania: ["Taufa", "Fifita", "Tuilagi", "Naidu", "Prasad", "Smith", "Wilson", "Taylor", "Kumar", "Ravu", "Vea", "Lolohea"],
  default: ["Hassan", "Garcia", "Petrov", "Rossi", "Ali", "Ivanova", "Lopez", "Demir", "Novak", "Haddad", "Santos", "Nasser"],
};

export const COMPANY_SUFFIX = ["Motors", "Auto Traders", "Car Bazaar", "Autos", "Car Mart", "Auto Imports", "Trading Co.", "Fleet Services", "Wheels", "Auto Hub"];
