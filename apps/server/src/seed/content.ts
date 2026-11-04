/** Website content for the fictional demo exporter "Hikari Motors". Editable later in Admin. */
import { HERO_PHOTOS } from "./photos";

export const HOME_SECTIONS = [
  {
    key: "hero",
    title: "Hero slides",
    data: {
      slides: [
        { title: "Japanese quality, delivered to your port", subtitle: "80+ inspected cars in stock and 1,700+ auction lots every week — quoted in USD to your port, any hour, by Sora, our AI sales executive.", cta: "Browse stock", link: "/shop", body: "SUV", color: "Pearl White", image: HERO_PHOTOS[0] },
        { title: "Buy straight from Japan's auctions", subtitle: "We read every auction sheet for you, bid inside your budget and ship RoRo or container.", cta: "See auction lots", link: "/auction", body: "Pickup", color: "Silver", image: HERO_PHOTOS[1] },
        { title: "Track every step to your port", subtitle: "Invoices, payments, documents and shipping progress — all in your account.", cta: "Create account", link: "/register", body: "Minivan", color: "Dark Blue", image: HERO_PHOTOS[2] },
      ],
    },
  },
  {
    key: "stats",
    title: "Hikari Motors in numbers",
    data: {
      items: [
        { label: "Cars exported", value: "18,500+" },
        { label: "Countries served", value: "62" },
        { label: "Years in business", value: "14" },
        { label: "Average rating", value: "4.8/5" },
      ],
    },
  },
  { key: "best_sellers", title: "This Week's Best Sellers", subtitle: "Most requested by buyers this week", data: { homeSection: "best_seller" } },
  { key: "steering", title: "Shop by steering", subtitle: "Right-hand or left-hand: choose the side your country drives on.", data: {} },
  {
    key: "why",
    title: "Why choose Hikari Motors",
    data: {
      items: [
        { icon: "ShieldCheck", title: "Inspected before you pay", text: "Every stock car and auction lot comes with its inspection grade explained in plain words." },
        { icon: "Bot", title: "Answers in minutes, 24/7", text: "Sora, our AI sales executive, quotes the landed price to your port at any hour, and our AI invoice desk has your invoice out in minutes." },
        { icon: "Ship", title: "Shipping you can follow", text: "RoRo and container shipping with live progress, from purchase to arrival at your port." },
        { icon: "FileText", title: "Clean paperwork", text: "Export certificate, inspection certificate, B/L and courier — uploaded to your account the day they exist." },
      ],
    },
  },
  {
    key: "member_of",
    title: "Member of",
    data: {
      items: [
        { name: "Japan Vehicle Exporters Forum (demo)", short: "JVEF" },
        { name: "Yokohama Port Traders Association (demo)", short: "YPTA" },
        { name: "Pacific Auto Logistics Network (demo)", short: "PALN" },
        { name: "Fair Trade Car Exporters (demo)", short: "FTCE" },
      ],
    },
  },
  { key: "upcoming", title: "Upcoming Collection", subtitle: "Arriving in our yard soon", data: { homeSection: "upcoming" } },
  {
    key: "payment",
    title: "Pick your payment method",
    subtitle: "Every payment appears in your account the day we receive it.",
    data: {
      items: [
        { icon: "Landmark", title: "Bank transfer (T/T)", text: "Send the advance, then the balance, to the company account shown on your invoice. Our bank details are public, so you can check them first.", link: "/bank-details", cta: "See our bank details" },
        { icon: "WalletCards", title: "Advance and balance", text: "An advance holds the car for you. The balance is due before shipping. Your invoice shows both amounts in US dollars.", link: "/how-to-buy", cta: "How buying works" },
        { icon: "Banknote", title: "Letter of credit", text: "For larger orders your bank can open a letter of credit in our favour. Ask the sales desk before you apply.", link: "/contact", cta: "Ask the sales desk" },
      ],
    },
  },
  { key: "luxury", title: "Luxury cars", subtitle: "Lexus, Land Cruiser, Alphard and Crown, ready to ship", data: { homeSection: "luxury" } },
  { key: "commercial", title: "Commercial vehicles", subtitle: "Trucks and vans that earn their keep", data: { homeSection: "commercial" } },
  {
    key: "we_bid",
    title: "We bid for you",
    subtitle: "Can't find it in stock? Thousands of cars go through Japan's auctions every week. Choose one, set your limit, and we do the rest.",
    data: {
      items: [
        { title: "Choose a lot", text: "Search this week's auction lots by make, model, year and grade." },
        { title: "We read the sheet", text: "The inspector's sheet is in Japanese. We read it and tell you what it really says." },
        { title: "We bid inside your limit", text: "You set the most you will pay. We never go over it." },
        { title: "We ship it to your port", text: "Win or lose, you hear from us the same day. A win gets an invoice and a ship." },
      ],
    },
  },
  { key: "new_arrivals", title: "New In-Demand Arrivals", subtitle: "Fresh in stock", data: { homeSection: "new_arrivals" } },
  {
    key: "steps",
    title: "Buy your car in 3 easy steps",
    data: {
      items: [
        { title: "Choose", text: "Pick a car from stock or an auction lot — or just tell Sora what you need." },
        { title: "Confirm & pay", text: "Get your invoice with the exact C&F price to your port, pay the advance by bank transfer." },
        { title: "Receive", text: "We ship it and upload every document. Follow each step in your account." },
      ],
    },
  },
  { key: "body_types", title: "Search by body type", data: { items: ["SUV", "Sedan", "Hatchback", "Pickup", "Van", "Wagon", "Minivan", "Truck"] } },
  {
    key: "videos",
    title: "Our clients and their cars",
    data: {
      items: [
        { title: "Hilux delivered to Mombasa", country: "Kenya", body: "Pickup", color: "Silver", image: "/cars/toyota-hilux-2.jpg", videoUrl: "" },
        { title: "Fleet of Probox for Dar es Salaam", country: "Tanzania", body: "Wagon", color: "Pearl White", image: "/cars/toyota-probox-2.jpg", videoUrl: "" },
        { title: "Prado for a family in Kingston", country: "Jamaica", body: "SUV", color: "Black", image: "/cars/toyota-land-cruiser-prado-2.jpg", videoUrl: "" },
      ],
    },
  },
  { key: "testimonials", title: "What buyers say", data: {} },
  { key: "register", title: "Create a free account", subtitle: "Save cars, follow your invoices and documents, and chat with us from any device.", data: { cta: "Register now", link: "/register" } },
  { key: "guides", title: "Latest guides", data: {} },
  { key: "faq", title: "Frequently asked questions", data: {} },
];

export const SERVICES = [
  { title: "Auction buying service", icon: "Gavel", body: "Access to 1,700+ lots a week across Japan's auction halls. We read the auction sheet, check the photos and bid only within the budget you set." },
  { title: "Ready stock", icon: "Car", body: "Inspected cars in our Yokohama yard, ready to ship this week. Prices shown in USD with C&F quotes to your port." },
  { title: "Pre-shipment inspection", icon: "ClipboardCheck", body: "We arrange the inspection your country requires before the car leaves Japan, and upload the certificate to your account." },
  { title: "Shipping & logistics", icon: "Ship", body: "RoRo and container shipping to 150+ ports, with progress updates from yard to vessel to your port." },
  { title: "Export documentation", icon: "FileText", body: "Export certificate, invoice, B/L (or surrender) and courier of originals — handled and tracked." },
  { title: "After-sales support", icon: "Headphones", body: "Spare parts, clearing-agent contacts and help with registration questions after your car arrives." },
];

export const FAQS = [
  { category: "Buying", question: "How do I buy a car from you?", answer: "Choose a car from stock or the auction, or tell Sora what you need. You receive an invoice with the C&F price to your port, pay the advance by bank transfer, and we ship once the balance is paid." },
  { category: "Buying", question: "What does C&F mean?", answer: "Cost and Freight: the price of the car plus shipping to your destination port. Import duties and clearing at your port are paid by you locally." },
  { category: "Buying", question: "Can I buy from the auctions?", answer: "Yes. Create an account, open the Auction section, and bid. We read the auction sheet with you and bid only up to the limit you approve." },
  { category: "Payment", question: "How do I pay?", answer: "By bank transfer (T/T) to our company account shown on your invoice and on the Bank Details page. Never pay to a personal account." },
  { category: "Payment", question: "How much advance do I pay?", answer: "Usually 50% to reserve the car; the balance before shipping. Your invoice shows the exact amounts." },
  { category: "Shipping", question: "How long does shipping take?", answer: "From 2 to 6 weeks depending on your port and the vessel schedule. Your account shows each step." },
  { category: "Shipping", question: "Which documents will I receive?", answer: "Export certificate, commercial invoice, B/L (or telex release), and inspection certificate where required — couriered or released electronically." },
  { category: "Cars", question: "What is an auction grade?", answer: "Japan's auction houses grade cars from 1 to 6 (and R/RA for repaired). Grade 4 and above means good condition; the auction sheet lists every scratch and dent." },
  { category: "Cars", question: "Can my country import right-hand-drive cars?", answer: "Many countries can, some cannot. Tell Sora your country and it will check before quoting." },
  { category: "Account", question: "Who is Sora?", answer: "Sora is our AI sales executive, built with Meta's Muse Spark Open model. Sora answers, searches and quotes 24/7. A team of Digital FTEs checks invoices, reads payment slips and files your documents, and our people handle anything outside policy." },
];

export const TESTIMONIALS = [
  { name: "Joseph M.", country: "Kenya", rating: 5, text: "Sora answered at midnight with three Hilux options and the exact price to Mombasa. The invoice was in the chat a minute after I said yes." },
  { name: "Andre C.", country: "Jamaica", rating: 5, text: "I could see the auction sheet explained in plain English before I bid. The Prado arrived exactly as described." },
  { name: "Amina H.", country: "Tanzania", rating: 5, text: "Every document appeared in my account — no chasing on WhatsApp for the B/L." },
  { name: "Ravi P.", country: "Guyana", rating: 4, text: "Good prices on the Probox fleet and clear shipping updates." },
  { name: "Liam W.", country: "New Zealand", rating: 5, text: "The inspection certificate was uploaded before the ship left. Smooth import." },
  { name: "Bilal A.", country: "Pakistan", rating: 5, text: "Quick quotes for Karachi and honest grades. Will buy again." },
];

export const PARTNERS = [
  { name: "BlueWave RoRo Lines (demo)", url: null },
  { name: "Pacific Car Carriers (demo)", url: null },
  { name: "Kaigan Inspection Services (demo)", url: null },
  { name: "Harbor Express Courier (demo)", url: null },
  { name: "Sakura Marine Insurance (demo)", url: null },
  { name: "Minato Container Lines (demo)", url: null },
];

export const LOCATIONS = [
  { name: "Head office & yard — Yokohama", mapUrl: "https://www.google.com/maps/search/?api=1&query=Yokohama%2C%20Japan", address: "1-2-3 Minato, Yokohama, Kanagawa, Japan (demo address)", phone: "+81 3 0000 0000", email: "sales@hikari-motors.example" },
  { name: "East Africa office — Mombasa", mapUrl: "https://www.google.com/maps/search/?api=1&query=Mombasa%2C%20Kenya", address: "Moi Avenue, Mombasa, Kenya (demo address)", phone: "+254 700 000 000", email: "kenya@hikari-motors.example" },
  { name: "Caribbean office — Kingston", mapUrl: "https://www.google.com/maps/search/?api=1&query=Kingston%2C%20Jamaica", address: "Knutsford Boulevard, Kingston, Jamaica (demo address)", phone: "+1 876 000 0000", email: "caribbean@hikari-motors.example" },
  { name: "South Asia office — Karachi", mapUrl: "https://www.google.com/maps/search/?api=1&query=Karachi%2C%20Pakistan", address: "Shahrah-e-Faisal, Karachi, Pakistan (demo address)", phone: "+92 21 0000 0000", email: "pakistan@hikari-motors.example" },
];

export const PAGES = [
  {
    slug: "about",
    title: "About Hikari Motors",
    body: `Hikari Motors is a **demo exporter** used to show AutoFTE — a platform any Japanese used-car exporter can run under its own name.\n\nWe buy from Japan's auction halls and our own stock yard in Yokohama, inspect every car, and ship to buyers across Africa, the Caribbean, the Pacific and Asia.\n\n### How we work\n- **Sora**, our AI sales executive (built with Meta's Muse Spark Open), answers buyers day and night, searches stock and auctions, reads auction sheets and quotes the landed price to the buyer's port.\n- **A team of Digital FTEs does the back office.** One checks and approves each invoice, one reads payment slips, one files your shipping documents, each inside limits the company sets.\n- **People decide what matters.** Anything above those limits reaches the owner, and you can always ask to speak to a person.\n- **Everything is on record.** Leads, invoices, payments, units, documents and shipping progress live in one system, and buyers see their own records in their account.\n\n### A word from our director\n\nWe started with one idea: a buyer far from Japan should know as much about a car as we do. So every car comes with its sheet, its photos and a straight price to your port. *(Demo text: Hikari Motors is fictional.)*\n\n### What we aim for\n\n**Our vision:** buying a car from Japan should feel as safe as buying one down the road.\n\n**Our mission:** reliable sourcing, clear prices, and a person or a Digital FTE who answers at any hour.\n\n### For buyers and trade partners\n\nWhether you want one car for your family or a container for your yard, the same team and the same open numbers serve you. [Talk to us](/contact).`,
  },
  {
    slug: "how-to-buy",
    title: "How to buy",
    body: `1. **Find a car** in Shop or Auction — or ask Sora in the chat.\n2. **Get a C&F quote** to your port. Sora shows every line: car, inspection, freight, insurance.\n3. **Request the invoice.** Our invoice desk checks it, and you receive it in chat and in your account, usually within minutes.\n4. **Pay the advance** by bank transfer to the company account on the invoice, and send the bank slip in the chat or on your invoice page.\n5. **Follow shipping** step by step and download your documents.`,
  },
  { slug: "terms", title: "Terms of sale (demo)", body: "These are demo terms for a fictional company. Prices are C&F unless stated. Cars are sold as described in the inspection report. Deposits reserve a car for 7 days." },
  { slug: "privacy", title: "Privacy (demo)", body: "Demo policy: we store only what is needed to sell and ship your car, and you can ask for a copy or deletion at any time." },
];

export const BLOG = [
  {
    slug: "how-to-read-a-japanese-auction-sheet",
    title: "How to read a Japanese auction sheet",
    excerpt: "Grades, interior letters and damage codes like A1, U2 and W1 — explained in plain words.",
    body: `Every car sold at a Japanese auction comes with an **auction sheet** written by the hall's inspector.\n\n### The overall grade\n- **6 / S** — like new\n- **5** — excellent\n- **4.5 / 4** — good, small marks\n- **3.5 / 3** — average, visible marks or repairs\n- **R / RA** — repaired after an accident (RA = minor repair)\n\n### Interior grade\nA (excellent) to D (needs work).\n\n### Damage codes on the car map\n- **A1–A3** scratches (1 = small)\n- **U1–U3** dents\n- **B1–B3** dent with scratch\n- **W1–W3** repainted or wavy panel\n- **S1–S2** rust, **C1–C2** corrosion\n- **X** needs replacing, **XX** already replaced\n- **Y1–Y3** cracks or holes, **G** stone chip on the windscreen\n\nSora reads the sheet and photos for you and gives a clear verdict — good, caution or avoid — with reasons.`,
  },
  {
    slug: "cnf-vs-fob-vs-cif",
    title: "C&F, FOB and CIF: what is in the price?",
    excerpt: "Know exactly what you pay to Japan and what you pay at your port.",
    body: `- **FOB** (Free On Board): car loaded on the ship in Japan. Freight is yours.\n- **C&F** (Cost & Freight): FOB + ocean freight to your port.\n- **CIF**: C&F + marine insurance.\n\nOur quotes show each line: vehicle, auction/handling, inspection (if your country requires it), freight to your port and insurance. Import duty and clearing at your port are not included.`,
  },
  {
    slug: "importing-a-car-to-kenya",
    title: "Importing a car from Japan to Kenya",
    excerpt: "The 8-year rule, pre-shipment inspection and Mombasa port — in short.",
    body: `Kenya accepts right-hand-drive cars up to **8 years** from the year of first registration. Every car must pass a **pre-shipment inspection** in Japan before it ships.\n\nShipping to **Mombasa** usually takes about 4 weeks. Your clearing agent pays duty and port charges on arrival.\n\n*Rules change — always confirm with your local authority. This article is a demo guide.*`,
  },
  {
    slug: "roro-or-container",
    title: "RoRo or container shipping?",
    excerpt: "Which one is cheaper and safer for your car?",
    body: `**RoRo** (roll-on/roll-off) ships the car driven onto a car carrier: usually the cheapest for single cars.\n\n**Containers** suit several cars or spare parts together and protect from weather, but cost more for one car.\n\nOur freight table is per cubic metre of the car (length × width × height), so small cars cost less to ship.`,
  },
  {
    slug: "why-hybrids-are-popular",
    title: "Why Japanese hybrids are popular in export markets",
    excerpt: "Aqua, Prius and Fielder Hybrid — fuel savings and what to check.",
    body: `Japanese hybrids use far less fuel in city traffic. When buying used, check the **hybrid battery** history, the inspection grade and the mileage. Sora flags high-mileage hybrids and explains the risks.`,
  },
  {
    slug: "meet-sora",
    title: "Meet Sora, our AI sales executive",
    excerpt: "How an AI employee answers, quotes and works with our team.",
    body: `Sora is a **Digital FTE** built with Meta's **Muse Spark Open** model. Sora works from our real records — stock, auctions, ports and price policy — and never invents a price.\n\nSora can search cars, read auction sheets, quote C&F, record your request in our CRM and ask our invoice desk to issue your invoice. Anything outside policy goes to a person, with a summary, so you never repeat yourself.`,
  },
];
