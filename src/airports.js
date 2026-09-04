/**
 * Airport lookup for the flight search box.
 *
 * A bundled dataset answers instantly and works offline: every Nepali airport
 * with scheduled service, plus the international destinations flown from
 * Kathmandu. Suggestions are additionally topped up from Sastotickets' public
 * airport endpoint, so a place missing from this list is still findable - but
 * the app never depends on that call.
 *
 * Codes are IATA. Nothing here is guessed: an airport whose code could not be
 * confirmed was left out rather than approximated.
 */
import { getJson } from './http.js';

/** @type {{code:string,name:string,city:string,country:string,domestic?:boolean}[]} */
export const AIRPORTS = [
  // --- Nepal ------------------------------------------------------------
  { code: 'KTM', name: 'Tribhuvan International Airport', city: 'Kathmandu', country: 'Nepal', domestic: true },
  { code: 'PKR', name: 'Pokhara Regional International Airport', city: 'Pokhara', country: 'Nepal', domestic: true },
  { code: 'PHH', name: "Pokhara Int'l Airport", city: 'Pokhara', country: 'Nepal', domestic: true },
  { code: 'BWA', name: 'Gautam Buddha International Airport', city: 'Bhairahawa', country: 'Nepal', domestic: true },
  { code: 'BIR', name: 'Biratnagar Airport', city: 'Biratnagar', country: 'Nepal', domestic: true },
  { code: 'BDP', name: 'Bhadrapur Airport (Chandragadhi)', city: 'Bhadrapur', country: 'Nepal', domestic: true },
  { code: 'JKR', name: 'Janakpur Airport', city: 'Janakpur', country: 'Nepal', domestic: true },
  { code: 'KEP', name: 'Nepalgunj Airport', city: 'Nepalgunj', country: 'Nepal', domestic: true },
  { code: 'DHI', name: 'Dhangadhi Airport', city: 'Dhangadhi', country: 'Nepal', domestic: true },
  { code: 'BHR', name: 'Bharatpur Airport', city: 'Bharatpur (Chitwan)', country: 'Nepal', domestic: true },
  { code: 'SIF', name: 'Simara Airport', city: 'Simara', country: 'Nepal', domestic: true },
  { code: 'SKH', name: 'Surkhet Airport', city: 'Surkhet', country: 'Nepal', domestic: true },
  { code: 'TMI', name: 'Tumlingtar Airport', city: 'Tumlingtar', country: 'Nepal', domestic: true },
  { code: 'RJB', name: 'Rajbiraj Airport', city: 'Rajbiraj', country: 'Nepal', domestic: true },
  { code: 'LUA', name: 'Tenzing-Hillary Airport', city: 'Lukla', country: 'Nepal', domestic: true },
  { code: 'RHP', name: 'Ramechhap Airport (Manthali)', city: 'Ramechhap', country: 'Nepal', domestic: true },
  { code: 'PPL', name: 'Phaplu Airport', city: 'Phaplu', country: 'Nepal', domestic: true },
  { code: 'JMO', name: 'Jomsom Airport', city: 'Jomsom', country: 'Nepal', domestic: true },
  { code: 'JUM', name: 'Jumla Airport', city: 'Jumla', country: 'Nepal', domestic: true },
  { code: 'DOP', name: 'Dolpa Airport (Juphal)', city: 'Dolpa', country: 'Nepal', domestic: true },
  { code: 'IMK', name: 'Simikot Airport', city: 'Simikot', country: 'Nepal', domestic: true },
  { code: 'BJH', name: 'Bajhang Airport', city: 'Bajhang', country: 'Nepal', domestic: true },
  { code: 'BJU', name: 'Bajura Airport', city: 'Bajura', country: 'Nepal', domestic: true },
  { code: 'TPJ', name: 'Taplejung Airport (Suketar)', city: 'Taplejung', country: 'Nepal', domestic: true },
  { code: 'BHP', name: 'Bhojpur Airport', city: 'Bhojpur', country: 'Nepal', domestic: true },
  { code: 'RUM', name: 'Rumjatar Airport', city: 'Rumjatar', country: 'Nepal', domestic: true },
  { code: 'NGX', name: 'Manang Airport', city: 'Manang', country: 'Nepal', domestic: true },
  { code: 'MEY', name: 'Meghauli Airport', city: 'Meghauli', country: 'Nepal', domestic: true },

  // --- India ------------------------------------------------------------
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India' },
  { code: 'BOM', name: 'Chhatrapati Shivaji International Airport', city: 'Mumbai', country: 'India' },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'India' },
  { code: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'India' },
  { code: 'MAA', name: 'Chennai International Airport', city: 'Chennai', country: 'India' },
  { code: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'India' },
  { code: 'VNS', name: 'Lal Bahadur Shastri Airport', city: 'Varanasi', country: 'India' },

  // --- Gulf & Middle East ----------------------------------------------
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates' },
  { code: 'SHJ', name: 'Sharjah International Airport', city: 'Sharjah', country: 'United Arab Emirates' },
  { code: 'AUH', name: 'Zayed International Airport', city: 'Abu Dhabi', country: 'United Arab Emirates' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar' },
  { code: 'KWI', name: 'Kuwait International Airport', city: 'Kuwait City', country: 'Kuwait' },
  { code: 'MCT', name: 'Muscat International Airport', city: 'Muscat', country: 'Oman' },
  { code: 'BAH', name: 'Bahrain International Airport', city: 'Manama', country: 'Bahrain' },
  { code: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', country: 'Saudi Arabia' },
  { code: 'JED', name: 'King Abdulaziz International Airport', city: 'Jeddah', country: 'Saudi Arabia' },
  { code: 'DMM', name: 'King Fahd International Airport', city: 'Dammam', country: 'Saudi Arabia' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Türkiye' },

  // --- Asia Pacific -----------------------------------------------------
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' },
  { code: 'DMK', name: 'Don Mueang International Airport', city: 'Bangkok', country: 'Thailand' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia' },
  { code: 'SIN', name: 'Changi Airport', city: 'Singapore', country: 'Singapore' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong' },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea' },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan' },
  { code: 'KMG', name: 'Kunming Changshui International Airport', city: 'Kunming', country: 'China' },
  { code: 'CTU', name: 'Chengdu Shuangliu International Airport', city: 'Chengdu', country: 'China' },
  { code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China' },
  { code: 'LXA', name: 'Lhasa Gonggar Airport', city: 'Lhasa', country: 'China' },
  { code: 'DAC', name: 'Hazrat Shahjalal International Airport', city: 'Dhaka', country: 'Bangladesh' },
  { code: 'CMB', name: 'Bandaranaike International Airport', city: 'Colombo', country: 'Sri Lanka' },
  { code: 'PBH', name: 'Paro International Airport', city: 'Paro', country: 'Bhutan' },
  { code: 'MLE', name: 'Velana International Airport', city: 'Malé', country: 'Maldives' },
  { code: 'KHI', name: 'Jinnah International Airport', city: 'Karachi', country: 'Pakistan' },

  // --- Europe, Americas, Oceania ---------------------------------------
  { code: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada' },
  { code: 'SYD', name: 'Sydney Airport', city: 'Sydney', country: 'Australia' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia' },
];

const byCode = new Map(AIRPORTS.map((airport) => [airport.code, airport]));

export const airportByCode = (code) => byCode.get(String(code || '').toUpperCase().trim()) ?? null;

export const isValidCode = (code) => /^[A-Z]{3}$/.test(String(code || '').toUpperCase().trim());

/**
 * Rank matches the way a traveller expects: an exact code first, then cities
 * starting with what was typed, then anything containing it. Nepali airports
 * outrank foreign ones on equal footing, since most searches here are domestic.
 */
export function searchAirports(query, limit = 8) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) {
    return AIRPORTS.filter((airport) => airport.domestic).slice(0, limit);
  }

  const scored = [];
  for (const airport of AIRPORTS) {
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();
    const name = airport.name.toLowerCase();

    let score = 0;
    if (code === term) score = 100;
    else if (city === term) score = 90;
    else if (city.startsWith(term)) score = 80;
    else if (code.startsWith(term)) score = 70;
    else if (name.toLowerCase().startsWith(term)) score = 60;
    else if (city.includes(term)) score = 50;
    else if (name.includes(term)) score = 40;
    else if (airport.country.toLowerCase().startsWith(term)) score = 20;

    if (score) scored.push({ airport, score: score + (airport.domestic ? 5 : 0) });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.airport.city.localeCompare(b.airport.city))
    .slice(0, limit)
    .map((entry) => entry.airport);
}

/**
 * Top up the bundled results from Sastotickets' public airport endpoint, so a
 * small airfield missing from the list above is still reachable. Failure here
 * is silent by design: the bundled matches are already a usable answer.
 */
export async function searchAirportsLive(query, limit = 8) {
  const local = searchAirports(query, limit);
  const term = String(query || '').trim();
  if (term.length < 3 || local.length >= limit) return local;

  try {
    const remote = await getJson(
      `https://sastotickets.com/ajax/search-airports?q=${encodeURIComponent(term)}`,
      { timeout: 3500, retries: 0 },
    );
    if (!Array.isArray(remote)) return local;

    const seen = new Set(local.map((airport) => airport.code));
    for (const entry of remote) {
      const code = String(entry?.code || '').toUpperCase();
      if (!isValidCode(code) || seen.has(code)) continue;
      seen.add(code);
      local.push({
        code,
        name: entry.name ?? code,
        city: entry.city ?? '',
        country: entry.country ?? '',
        source: 'sastotickets',
      });
      if (local.length >= limit) break;
    }
  } catch {
    // Bundled results stand on their own.
  }

  return local;
}
