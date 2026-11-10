/**
 * Bet Zone's own football world for generated matches: ten invented leagues of five invented clubs,
 * each with an art-directed crest (lib/crests/render). Every place, club and league here is made
 * up, so a generated match never borrows a real club's name or identity.
 */
export type Shape = "shield" | "round" | "heater" | "modern";
export type Pattern = "plain" | "stripes" | "hoops" | "halves" | "sash" | "quarters" | "chevron" | "band";
export type Emblem =
  | "ball" | "crown" | "flame" | "bolt" | "wings" | "anchor" | "compass" | "star" | "sword" | "trident"
  | "sun" | "gem" | "mountain" | "paw" | "tower" | "wave" | "tree";
export type Metal = "gold" | "silver" | "bronze";

export interface ClubDesign {
  shape: Shape;
  pattern: Pattern;
  emblem: Emblem;
  /** Main kit colour, second kit colour (hex). */
  colors: [string, string];
  metal: Metal;
}
export interface Club extends ClubDesign {
  name: string;
  town: string;
  founded: number;
}
export interface League {
  name: string;
  region: string;
  code: string;
  colors: [string, string];
  clubs: Club[];
}

const c = (name: string, town: string, founded: number, shape: Shape, pattern: Pattern, emblem: Emblem, colors: [string, string], metal: Metal): Club => ({
  name, town, founded, shape, pattern, emblem, colors, metal,
});

export const LEAGUES: League[] = [
  {
    name: "Aurelia Premier League", region: "Aurelia", code: "AUR", colors: ["#0B2A5B", "#E7B53C"],
    clubs: [
      c("Port Aurel Mariners", "Port Aurel", 1912, "round", "hoops", "anchor", ["#0B2A5B", "#F2F4F7"], "gold"),
      c("Saltmere Athletic", "Saltmere", 1924, "shield", "stripes", "wave", ["#1B6FB8", "#FFFFFF"], "silver"),
      c("Goldhaven City", "Goldhaven", 1931, "heater", "plain", "crown", ["#7A1020", "#E7B53C"], "gold"),
      c("Brightwater Rovers", "Brightwater", 1946, "modern", "sash", "compass", ["#0E7C66", "#F4E9C8"], "silver"),
      c("Aurel Valley FC", "Aurel Valley", 1958, "shield", "halves", "tree", ["#1F4D2B", "#E7B53C"], "gold"),
    ],
  },
  {
    name: "Northmarch Championship", region: "Northmarch", code: "NMC", colors: ["#1C3D5A", "#CFE3F2"],
    clubs: [
      c("Frostvik Wolves", "Frostvik", 1909, "shield", "plain", "paw", ["#17324D", "#CFE3F2"], "silver"),
      c("Helmsgard United", "Helmsgard", 1921, "round", "quarters", "sword", ["#9E1B22", "#FFFFFF"], "silver"),
      c("Skarholm Rangers", "Skarholm", 1934, "heater", "chevron", "mountain", ["#2E4A3B", "#F1F3F2"], "bronze"),
      c("Ironmoor Athletic", "Ironmoor", 1928, "modern", "stripes", "tower", ["#2B2D33", "#F2B33D"], "gold"),
      c("Northmarch Polar FC", "Lysholm", 1967, "round", "plain", "star", ["#3B7FC4", "#FFFFFF"], "silver"),
    ],
  },
  {
    name: "Solenne Coast League", region: "Solenne", code: "SOL", colors: ["#E2631F", "#0F6D73"],
    clubs: [
      c("Solenne Suns", "Solenne", 1937, "round", "plain", "sun", ["#E2631F", "#FFD166"], "gold"),
      c("Marisol Harbour FC", "Marisol", 1948, "shield", "hoops", "anchor", ["#0F6D73", "#FFFFFF"], "silver"),
      c("Costa Verde Falcons", "Costa Verde", 1952, "heater", "sash", "wings", ["#2C8C3F", "#FFFFFF"], "gold"),
      c("Playa Alta Sporting", "Playa Alta", 1961, "modern", "halves", "ball", ["#C2185B", "#FFFFFF"], "silver"),
      c("Riomar Tide", "Riomar", 1975, "shield", "band", "wave", ["#123E7C", "#5FC3E4"], "silver"),
    ],
  },
  {
    name: "Varnholt First Division", region: "Varnholt", code: "VRN", colors: ["#1E5631", "#D4A72C"],
    clubs: [
      c("Varnholt Oaks", "Varnholt", 1903, "heater", "plain", "tree", ["#1E5631", "#D4A72C"], "gold"),
      c("Bremsdal Miners", "Bremsdal", 1919, "shield", "stripes", "mountain", ["#3A2A1E", "#E9C46A"], "bronze"),
      c("Kettering Moss FC", "Kettering Moss", 1927, "round", "chevron", "ball", ["#5B2C83", "#FFFFFF"], "silver"),
      c("Edelweiss Alpine", "Hochfeld", 1950, "modern", "plain", "star", ["#B3202A", "#FFFFFF"], "silver"),
      c("Rothmund Castle", "Rothmund", 1912, "shield", "quarters", "tower", ["#8C1C13", "#F4D35E"], "gold"),
    ],
  },
  {
    name: "Kestria Super League", region: "Kestria", code: "KES", colors: ["#B71C1C", "#F5F5F5"],
    clubs: [
      c("Kestria Lions", "Kestria", 1914, "shield", "plain", "paw", ["#B71C1C", "#F5D76E"], "gold"),
      c("Dunmore Thunder", "Dunmore", 1938, "modern", "sash", "bolt", ["#1A1A2E", "#FFD23F"], "gold"),
      c("Halbrook Athletic", "Halbrook", 1922, "round", "stripes", "ball", ["#0D47A1", "#FFFFFF"], "silver"),
      c("Carvell Royals", "Carvell", 1906, "heater", "halves", "crown", ["#4A148C", "#F5F5F5"], "gold"),
      c("Westmere Phoenix", "Westmere", 1979, "shield", "chevron", "flame", ["#D84315", "#212121"], "bronze"),
    ],
  },
  {
    name: "Isle of Merrow League", region: "Merrow", code: "MER", colors: ["#0B6E4F", "#E8F1EE"],
    clubs: [
      c("Merrow Town", "Merrow", 1901, "round", "plain", "tower", ["#0B6E4F", "#F2E8CF"], "gold"),
      c("Gullhaven Seahawks", "Gullhaven", 1955, "shield", "hoops", "wings", ["#1D3557", "#A8DADC"], "silver"),
      c("Penrock Pirates", "Penrock", 1947, "modern", "plain", "sword", ["#111111", "#E63946"], "silver"),
      c("Lanterne Bay FC", "Lanterne Bay", 1963, "heater", "band", "star", ["#264653", "#E9C46A"], "gold"),
      c("Merrow Rangers", "Kilmarrow", 1929, "shield", "stripes", "compass", ["#2A9D8F", "#FFFFFF"], "bronze"),
    ],
  },
  {
    name: "Tavora Liga Primera", region: "Tavora", code: "TAV", colors: ["#5E2A84", "#F2C14E"],
    clubs: [
      c("Real Tavora", "Tavora", 1908, "shield", "plain", "crown", ["#F7F7F7", "#5E2A84"], "gold"),
      c("Deportivo Lumbra", "Lumbra", 1926, "round", "halves", "sun", ["#E09F1F", "#1B1B3A"], "gold"),
      c("Atlético Sierra Roja", "Sierra Roja", 1933, "heater", "stripes", "mountain", ["#C62828", "#FFFFFF"], "silver"),
      c("Unión Valdoro", "Valdoro", 1945, "modern", "quarters", "gem", ["#00695C", "#FFD54F"], "gold"),
      c("Club Ciervo Azul", "Monteluz", 1958, "shield", "sash", "star", ["#1565C0", "#FFFFFF"], "silver"),
    ],
  },
  {
    name: "Drummond Valley League", region: "Drummond", code: "DRV", colors: ["#6D1A36", "#8ECAE6"],
    clubs: [
      c("Drummond Claret", "Drummond", 1899, "shield", "halves", "tower", ["#6D1A36", "#8ECAE6"], "gold"),
      c("Ashby Vale United", "Ashby Vale", 1910, "heater", "plain", "tree", ["#2D6A4F", "#FFFFFF"], "silver"),
      c("Thornfield Rovers", "Thornfield", 1923, "round", "hoops", "compass", ["#023E8A", "#FFFFFF"], "silver"),
      c("Glenhallow Stags", "Glenhallow", 1936, "modern", "chevron", "crown", ["#7F5539", "#EDE0D4"], "bronze"),
      c("Copperbridge Town", "Copperbridge", 1952, "shield", "band", "bolt", ["#B5651D", "#1F1F1F"], "bronze"),
    ],
  },
  {
    name: "Zarelia Highlands League", region: "Zarelia", code: "ZAR", colors: ["#1B1B1B", "#F4A300"],
    clubs: [
      c("Zarelia Eagles", "Zarelia", 1930, "shield", "plain", "wings", ["#1B1B1B", "#F4A300"], "gold"),
      c("Kordan Spartans", "Kordan", 1941, "heater", "stripes", "sword", ["#8E0E00", "#F5F5F5"], "bronze"),
      c("Tirava Granite", "Tirava", 1953, "modern", "plain", "mountain", ["#4A4E69", "#C9ADA7"], "silver"),
      c("Ostel Vipers", "Ostel", 1968, "round", "sash", "trident", ["#386641", "#F2E8CF"], "gold"),
      c("Mirhaven Stars", "Mirhaven", 1984, "shield", "quarters", "star", ["#003049", "#FCBF49"], "gold"),
    ],
  },
  {
    name: "Calvessa Premier Division", region: "Calvessa", code: "CAL", colors: ["#0D3B66", "#EE4266"],
    clubs: [
      c("Calvessa Rovers", "Calvessa", 1915, "round", "stripes", "ball", ["#0D3B66", "#FFFFFF"], "silver"),
      c("Bellamar Dragons", "Bellamar", 1939, "shield", "plain", "flame", ["#9D0208", "#FFBA08"], "gold"),
      c("San Corvo Athletic", "San Corvo", 1927, "heater", "hoops", "wings", ["#14213D", "#FCA311"], "gold"),
      c("Vellmont Jaguars", "Vellmont", 1962, "modern", "halves", "paw", ["#FFB703", "#023047"], "bronze"),
      c("Calvessa Harbour", "Porto Calvo", 1948, "shield", "chevron", "anchor", ["#0077B6", "#FFFFFF"], "silver"),
    ],
  },
];

export const CLUBS: (Club & { league: League })[] = LEAGUES.flatMap((league) => league.clubs.map((club) => ({ ...club, league })));
const byName = new Map(CLUBS.map((club) => [club.name.toLowerCase(), club]));
const leagueByName = new Map(LEAGUES.map((l) => [l.name.toLowerCase(), l]));

export const findClub = (name: string) => byName.get(name.trim().toLowerCase());
export const findLeague = (name: string) => leagueByName.get(name.trim().toLowerCase());
