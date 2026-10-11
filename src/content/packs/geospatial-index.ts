import { definePack } from "../define";

export const GEO = { start: { method: "geohash", precision: "6", neighbours: true } };
export const GEO_CHALLENGE = {};

const GEOHASH = { id: "geohash", title: "Geohash: encoding latitude and longitude into a string of cells (Wikipedia)", url: "https://en.wikipedia.org/wiki/Geohash" };
const H3 = { id: "uber-h3", title: "Uber Engineering: H3, Uber's Hexagonal Hierarchical Spatial Index", url: "https://www.uber.com/blog/h3/" };
const S2 = { id: "s2-geometry", title: "S2 Geometry Library: spherical geometry and cell hierarchy", url: "http://s2geometry.io/" };
const REDIS_GEO = { id: "redis-geosearch", title: "Redis docs: GEOSEARCH", url: "https://redis.io/docs/latest/commands/geosearch/" };

export default definePack({
  id: "geospatial-index",
  title: "Geospatial Indexes",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "dispatch · 'nearby drivers' takes 2 seconds", detail: "1 million drivers, one rider" },
    lines: [
      { speaker: "kabir", line: "Finding the drivers within a kilometre of a rider takes two seconds, because we measure the distance to every driver in the city every time." },
      { speaker: "meera", line: "A map is two-dimensional and an index is a list. Cut the map into cells, name them, and a nearby search becomes reading a few cells." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "1 million drivers spread over a city, a rider within 1 km, no index. Each driver is measured at about 2 microseconds. How long does one request take?",
      options: [
        { id: "ms2", label: "About 2 ms" },
        { id: "ms20", label: "About 20 ms" },
        { id: "s2", label: "About 2 seconds" },
        { id: "min", label: "About 2 minutes" },
      ],
      answer: "s2",
      observe: "slow-geo",
      reveal: {
        text: "A million measurements at 2 µs is two seconds, though only about 1,260 drivers are actually within the kilometre. Almost all the work is spent on drivers on the other side of the city. An index exists to avoid measuring them.",
        derived: true,
        line: { speaker: "meera", line: "Most of the work is checking things that obviously cannot be the answer." },
      },
    },
    {
      id: "edge",
      kind: "choice",
      prompt: "You index drivers by geohash cells about 4.9 km wide and search only the rider's own cell. A rider stands near a cell edge. What share of the drivers who are really within 1 km does the search miss?",
      options: [
        { id: "none", label: "None: the cell is much bigger than 1 km" },
        { id: "few", label: "About 5%" },
        { id: "many", label: "About 45%" },
      ],
      answer: "many",
      observe: "missed",
      reveal: {
        text: "The cell is a box with hard edges. A driver across the edge may be 50 metres away yet sits in a different cell, so is never read. Averaged over riders in the lab, about 45% of true neighbours are in neighbouring cells. Searching the surrounding cells as well removes the problem.",
        derived: true,
        line: { speaker: "rao", line: "A boundary in the index is invisible to the rider, who just sees an empty street." },
      },
    },
  ],
  widget: { id: "geo-lab", config: GEO },
  mechanism: [
    {
      id: "problem",
      scene: "scan",
      text: "A proximity search asks which points lie near a location. A B-tree index orders values along one axis, so an index on latitude finds a thin band of the map but includes everything across the whole width of the city. Two dimensions do not fit a one-dimensional order unless you map them onto it.",
      sourceIds: ["geohash"],
    },
    {
      id: "cells",
      scene: "cells",
      text: "Geohash cuts the map into a grid of cells and gives each a code, where a longer code names a smaller cell and cells that share a prefix are near each other. Index drivers by their cell code, then a search reads the cells covering the circle and measures the drivers in them.",
      sourceIds: ["geohash", "redis-geosearch"],
    },
    {
      id: "size",
      text: "Cell size is the main choice. Cells much bigger than the radius pull in thousands of drivers to measure. Cells much smaller need hundreds of lookups to cover the circle. Pick cells about the size of the search radius: a few dozen lookups and a few thousand candidates.",
      sourceIds: ["uber-h3", "s2-geometry"],
      derived: true,
    },
    {
      id: "edges",
      scene: "edges",
      text: "Neighbours across a cell edge are near in space and far in the code. Always search the neighbouring cells as well as your own. Uber's H3 uses hexagons so every neighbour is the same distance away, and Google's S2 uses cells on a sphere to avoid distortion near the poles; the idea is the same.",
      sourceIds: ["uber-h3", "s2-geometry"],
    },
  ],
  challenges: [
    {
      id: "nearby",
      title: "Find nearby drivers fast",
      brief: "1 million drivers, 1 km search radius. Choose the index, cell size and neighbour search so a request takes at most 20 ms, measures at most 10,000 drivers, and misses no nearby driver.",
      line: { speaker: "kabir", line: "A rider who waits for the map to load is a rider who opens the other app." },
      widget: { id: "geo-lab", config: GEO_CHALLENGE },
      conditions: [
        { metric: "queryMs", op: "<=", value: 20, label: "At most 20 ms per request" },
        { metric: "candidates", op: "<=", value: 10000, label: "At most 10,000 drivers measured" },
        { metric: "missPct", op: "<=", value: 0.001, label: "No nearby driver missed" },
      ],
      stars: [],
      hints: [
        "A latitude index reads 40,000 drivers. Is that enough of an improvement?",
        "What happens to lookups when the cells are tiny, and to candidates when they are huge?",
        "What must you do at cell edges?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how a geohash index finds nearby points and what can go wrong.",
    rubric: [
      { id: "cells", criterion: "Geohash divides the map into cells with codes, so a search reads the few cells covering the search circle and measures only those points", keyIdea: "read cells, not the whole map" },
      { id: "size", criterion: "Cell size trades candidates against lookups; pick cells about the size of the radius", keyIdea: "cell size matches radius" },
      { id: "edges", criterion: "Points just across a cell edge are in another cell, so search the neighbouring cells too", keyIdea: "search neighbours" },
    ],
    exemplar:
      "Geohash divides the map into cells with codes, so a nearby search reads only the few cells that cover the search circle and measures the points in them, not every point in the city. Cell size trades candidates against lookups: huge cells put thousands of points to measure and tiny cells need hundreds of lookups, so I would use cells about the size of the radius. A point just across a cell edge sits in a different cell, so I would always search the neighbouring cells as well.",
  },
  reviews: [
    {
      id: "gi-est",
      format: "estimate",
      scenario: "Drivers are 400 per km². A search reads 25 cells of 0.757 km² each. About how many drivers are measured?",
      unit: "drivers",
      answer: 7570,
      acceptFactor: 1.05,
      breakdown: ["25 × 0.757 km² = 18.9 km²", "× 400 per km² ≈ 7,570"],
      explain: "Candidates are the total cell area times the density, which is why cell size and radius matter together.",
    },
    {
      id: "gi-pick",
      format: "pick-fix",
      scenario: "Riders near the edge of a geohash cell often see no drivers even though one is 50 metres away across the edge. What is the fix?",
      options: [
        { id: "a", label: "Search the neighbouring cells as well as the rider's cell" },
        { id: "b", label: "Use smaller cells only" },
        { id: "c", label: "Cache results" },
        { id: "d", label: "Round the rider's location" },
      ],
      answer: "a",
      explain: "Neighbours in space can be far apart in the code. Always read the cells around the query point.",
    },
    {
      id: "gi-order",
      format: "order",
      scenario: "Order these by drivers measured per request, most first, for a 1 km radius.",
      items: [
        { id: "scan", label: "No index" },
        { id: "lat", label: "Latitude index only" },
        { id: "p6", label: "Geohash, 0.87 km cells, with neighbours" },
      ],
      answer: ["scan", "lat", "p6"],
      explain: "A million, 40,000 and about 7,600: each index narrows the search in a second dimension.",
    },
    {
      id: "gi-graph",
      format: "predict-graph",
      scenario: "As geohash cells shrink from 28 km to 4 cm wide, with neighbour search, how does the query time change?",
      xLabel: "cell size (smaller →)",
      yLabel: "query time",
      options: [
        { id: "u", label: "High, falls to a minimum near the search radius, rises again", points: [5645, 173, 16, 15, 155, 1500, 15000, 150000] },
        { id: "fall", label: "Keeps falling", points: [5645, 173, 16, 5, 2, 1, 0.5, 0.2] },
        { id: "flat", label: "Stays flat", points: [20, 20, 20, 20, 20, 20, 20, 20] },
      ],
      answer: "u",
      explain: "Big cells bring too many candidates; tiny cells need too many lookups. The best size is about the search radius.",
    },
    {
      id: "gi-flaw",
      format: "spot-flaw",
      scenario: "A team compares two coordinates by treating latitude and longitude as flat x and y, with 1 degree equal in both. Near the north of the country, 'nearby' results are skewed east and west. Tap the assumption.",
      diagram: {
        nodes: [
          { id: "pts", label: "points as (lat, lon)", kind: "db", col: 0, row: 1 },
          { id: "dist", label: "distance = sqrt(Δlat² + Δlon²)", kind: "server", col: 1, row: 1 },
          { id: "result", label: "'nearby' list", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "pts", to: "dist" },
          { from: "dist", to: "result" },
        ],
      },
      answer: "pts->dist",
      explain: "A degree of longitude shrinks toward the poles. Use a proper distance such as haversine, or an index like S2 or H3 that accounts for the sphere.",
    },
    {
      id: "gi-explain",
      format: "explain",
      scenario: "In two sentences: why is a geohash prefix useful for finding nearby places?",
      rubric: [
        { id: "prefix", criterion: "Places that share a prefix lie in the same larger cell, so a range scan on the prefix returns places in one area" },
        { id: "caveat", criterion: "Nearby places across a cell boundary can have different prefixes, so neighbouring cells must be checked too" },
      ],
      exemplar: "Places that share a geohash prefix lie in the same cell, so an ordinary range scan on the prefix returns places in one area. Nearby places across a cell boundary can have different prefixes, so the neighbouring cells must be searched as well.",
      explain: "A string index becomes a map index.",
    },
  ],
  codex: {
    oneLiner: "Cut the map into coded cells, index points by cell, search the cells covering the radius plus their neighbours, and size cells near the radius.",
    keyNumbers: [
      { label: "Geohash 6-character cell", value: "about 1.2 km × 0.6 km", sourceId: "geohash" },
      { label: "Drivers measured", value: "covered area × density", sourceId: "geohash" },
    ],
    tradeoffs: [
      { choice: "Large cells", gain: "Few lookups", cost: "Many candidates to measure" },
      { choice: "Small cells", gain: "Few candidates", cost: "Many lookups" },
      { choice: "Neighbour search", gain: "No boundary misses", cost: "More cells read" },
    ],
    seenIn: ["Ride-hailing dispatch with H3 or S2.", "Redis GEOSEARCH and PostGIS spatial indexes."],
    interviewAngle: "Say: 'index by geohash, H3 or S2 cell, query the cells covering the radius and their neighbours, then filter by exact distance'.",
    aws: [{ concept: "Geo queries on cell indexes", service: "ElastiCache Redis GEOSEARCH, Aurora PostGIS, OpenSearch geo_point" }],
    replay: { id: "geo-lab", config: GEO, scene: "cells" },
  },
  interview: [
    "How would you find the nearest drivers to a rider?",
    "What is a geohash and what are its weaknesses?",
    "How do H3 or S2 differ from geohash?",
  ],
  deeper: [
    {
      title: "Moving points",
      body: "Drivers move every few seconds, so a location index must absorb a huge write rate. Keeping the index in memory, in Redis or a purpose-built service, and updating only when a driver crosses into another cell reduces writes dramatically. The index holds where things are now and does not need history; keep the trail elsewhere.",
      sourceIds: ["redis-geosearch"],
    },
  ],
  honestPhysics: [
    "1 million drivers spread evenly over a city of 2,500 km², 400 per km², searched within 1 km: about 1,260 inside the circle.",
    "A scan measures every driver at 2 microseconds. A latitude index reads a 100 km² band, 40,000 drivers. Geohash cells are about 28, 4.9, 0.87, 0.15 and 0.04 km wide for lengths 4 to 8; each cell is one lookup at 0.05 ms and each driver measured costs 0.002 ms.",
    "Searching only the rider's cell misses 1 − (1 − 1.27 ÷ s)² of true neighbours for cell width s; with neighbours the search reads (2k + 1)² cells for k = ⌈1 km ÷ s⌉.",
  ],
  sources: [GEOHASH, H3, S2, REDIS_GEO],
  verify: [
    { id: "scan", claim: "Without an index a request takes 2 seconds", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "scan" }, metric: "queryMs" }, expect: { min: 2000, max: 2001 } },
    { id: "lat", claim: "A latitude index still measures 40,000 drivers", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "lat" }, metric: "candidates" }, expect: { min: 40000, max: 40000 } },
    { id: "p5", claim: "5-character cells are too big: 170 ms", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "geohash", precision: "5", neighbours: true }, metric: "queryMs" }, expect: { min: 100 } },
    { id: "p6", claim: "6-character cells take about 16 ms", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "geohash", precision: "6", neighbours: true }, metric: "queryMs" }, expect: { max: 20 } },
    { id: "p7", claim: "7-character cells take about 15 ms", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "geohash", precision: "7", neighbours: true }, metric: "queryMs" }, expect: { max: 20 } },
    { id: "p8", claim: "8-character cells need 3,025 lookups: 155 ms", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "geohash", precision: "8", neighbours: true }, metric: "queryMs" }, expect: { min: 100 } },
    { id: "miss", claim: "Searching one 4.9 km cell misses 45% of neighbours", run: "lab", params: { model: "geo-lab", config: GEO_CHALLENGE, values: { method: "geohash", precision: "5", neighbours: false }, metric: "missPct" }, expect: { min: 0.44, max: 0.46 } },
  ],
});
