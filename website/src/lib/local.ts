// The facts about the school, in one place.
//
// Every page that mentions the address, the hours, the size of the play
// area or the year it opened reads them from here. Written out page by page
// they drift — one says 5,000 sq ft and another 6,000, one says 2017 and
// another 2018 — and inconsistent facts across a site are both a bad look
// for a parent comparing pages and a real signal to a search engine that
// the pages are not maintained.
//
// Everything here is a claim the school already makes publicly on its own
// site. Nothing has been invented to decorate a page.

export const SCHOOL = {
  name: "EuroKids JMD Enclave",
  legal: "Veena Educational Services",
  founded: "2017",
  phone: "020 6962 2686",
  phoneHref: "tel:+912069622686",
  whatsapp: "+91 78750 96690",
  whatsappHref: "https://wa.me/917875096690",
  email: "admin@eurokidsjmdenclave.org",
  street: "JMD Enclave, Undri",
  locality: "Pune",
  region: "Maharashtra",
  postcode: "411060",
  // Undri, Pune. Used for LocalBusiness geo, which is what lets a search
  // engine place the school on a map rather than guess from the address.
  lat: 18.4575,
  lng: 73.9165,
  playArea: "5,000 sq ft",
  families: "3,000+",
  reviews: "200+",
  award: "Best Ambience Award",
  instagram: "https://www.instagram.com/eurokidsjmdenclave/",
  maps:
    "https://www.google.com/maps/search/?api=1&query=EuroKids+JMD+Enclave+Undri+Pune",
} as const;

export const HOURS = [
  { what: "Preschool", when: "8:30 AM – 12:30 PM, Mon to Sat" },
  { what: "Day care", when: "8:00 AM – 6:30 PM, Mon to Sat" },
  { what: "Office", when: "9:00 AM – 4:00 PM, Mon to Sat" },
] as const;

// The places parents actually name when they ring up and ask how far we
// are. Used for the areaServed in the structured data and for the "getting
// here" paragraph on the location pages.
export const NEARBY = [
  "Undri",
  "Mohammadwadi",
  "NIBM Road",
  "Pisoli",
  "Kondhwa",
  "Hadapsar",
] as const;

export const LANDMARKS = [
  "Corinthian Club",
  "Nyati Evara",
  "Nyati Eternity",
  "Godrej Greens",
] as const;

export const PROGRAMMES = [
  {
    slug: "play-group",
    name: "Play Group",
    age: "1.5 – 2.5 years",
    hours: "2 hours",
    blurb:
      "The first time away from home, and treated as such. Short days, a great deal of play, and a teacher whose main job is that your child wants to come back tomorrow.",
  },
  {
    slug: "nursery",
    name: "Nursery",
    age: "2.5 – 3.5 years",
    hours: "2.5 hours",
    blurb:
      "Letters and numbers arrive, but through sand, water, song and a lot of talking. Children start managing their own bag, shoes and water bottle.",
  },
  {
    slug: "euro-junior",
    name: "Euro Junior",
    age: "3.5 – 4.5 years",
    hours: "3 hours",
    blurb:
      "Junior KG. Reading and writing in earnest, alongside the things that make school bearable — friendships, taking turns, and losing a game without it ending the day.",
  },
  {
    slug: "euro-senior",
    name: "Euro Senior",
    age: "4.5 – 5.5 years",
    hours: "3 hours",
    blurb:
      "Senior KG, and the year that decides how a child walks into Class 1. Writing, phonics, numbers and the confidence to put a hand up in a room of thirty.",
  },
  {
    slug: "day-care",
    name: "Day Care",
    age: "1.5 – 10 years",
    hours: "Up to 6:30 PM",
    blurb:
      "Before school, after school, or the whole day. Meals, nap, homework help and supervised play, for families where both parents work full time.",
  },
] as const;
