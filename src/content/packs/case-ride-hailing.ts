import { defineBoss } from "../define";

export const RHC = {};

const H3 = { id: "uber-h3", title: "Uber Engineering: H3, a hexagonal hierarchical spatial index", url: "https://www.uber.com/blog/h3/" };
const GEOHASH = { id: "geohash", title: "Geohash: encoding locations as strings with shared prefixes for nearby points", url: "https://en.wikipedia.org/wiki/Geohash" };
const S2 = { id: "s2", title: "S2 Geometry: the cell hierarchy used for spatial indexing", url: "http://s2geometry.io/" };

export default defineBoss({
  id: "case-ride-hailing",
  title: "Case: Ride Hailing (Uber)",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "dispatch · nearby-driver queries p99 80 ms in the city centre", detail: "250,000 location updates a second; riders wait 190 s on average" },
    lines: [{ speaker: "kabir", line: "A million drivers report their location every four seconds. In the city centre the query for nearby drivers takes eighty milliseconds, and riders wait over three minutes for a pickup." }],
  },
  intro: [
    { speaker: "meera", line: "Three loads: a firehose of location writes, a spatial query for every ride request, and a matching decision that should consider more than the nearest driver." },
    { speaker: "rao", line: "How often drivers report is a dial. Turn it down and the map lies; turn it up and you pay for every second." },
  ],
  forecast: {
    metric: "serversNeeded",
    prompt: "With a million drivers reporting every 4 seconds, and a server handling 12,000 location updates a second, how many servers do the updates alone need?",
    unit: "servers",
    scale: 1,
    min: 1,
    max: 1000,
    tolerance: 1.3,
  },
  exercises: ["geospatial-index", "realtime-transport", "sharding-strategies"],
  challenge: {
    id: "design-dispatch",
    title: "Design the dispatch",
    brief: "Handle location updates on at most 25 servers, keep the average location error under 30 metres, answer nearby-driver queries in 20 ms or less, and bring the average pickup to 160 seconds or less.",
    line: { speaker: "meera", line: "The index, the report interval and the matching rule each move one of these." },
    widget: { id: "ride-lab", config: RHC },
    conditions: [
      { metric: "serversNeeded", op: "<=", value: 25, label: "At most 25 update servers" },
      { metric: "locationErrorM", op: "<=", value: 30, label: "Location error under 30 m" },
      { metric: "queryP99Ms", op: "<=", value: 20, label: "Nearby query p99 at most 20 ms" },
      { metric: "pickupSec", op: "<=", value: 160, label: "Average pickup at most 160 s" },
    ],
    stars: [{ metric: "pickupSec", op: "<=", value: 155, label: "Average pickup at most 155 s" }],
    hints: ["What is the update rate for a given interval?", "Which index copes with dense and sparse areas?", "Does the nearest driver make the best match?"],
  },
  debrief: [
    { id: "index", text: "A uniform grid has the same cell size in Manhattan and in a suburb, so dense cells hold far more drivers than a query can scan: 80 ms. Geohash prefixes and quadtrees produce cells of predictable occupancy, 6 ms and 4 ms. Hierarchical cell systems such as H3 and S2 serve the same purpose.", sourceIds: ["geohash", "uber-h3", "s2"] },
    { id: "interval", text: "The interval is a trade: a driver at 8 m/s is half an interval from the reported point on average, so 4 s means 16 m of error and 250,000 updates a second, 12,000 per server, 21 servers. Reporting every 15 seconds would cut the servers to six and put the map 60 metres out.", derived: true },
    { id: "match", text: "Giving each request the nearest free driver on arrival is greedy: a driver can be taken from a rider for whom they were the best choice. Collecting requests for two seconds and assigning in a batch brought the average pickup from 190 seconds to 150.", derived: true },
  ],
  outro: { speaker: "kabir", line: "Quadtree index, a five-second report interval, batch matching every two seconds. A pickup under three minutes, and the update fleet is seventeen servers." },
  explainBack: {
    prompt: "Explain how your dispatch system indexes drivers, handles the update load and matches riders.",
    rubric: [
      { id: "index", criterion: "Use a spatial index with adaptive cells (geohash, quadtree, H3 or S2) so dense areas do not overload a cell", keyIdea: "adaptive spatial index" },
      { id: "updates", criterion: "Location updates are a write firehose: update rate = drivers ÷ interval; choose the interval by the acceptable position error", keyIdea: "interval versus error" },
      { id: "match", criterion: "Batch matching beats nearest-on-arrival because it considers riders and drivers together", keyIdea: "batch assignment" },
      { id: "shard", criterion: "Shard by geography so queries and updates for an area stay together", keyIdea: "geographic sharding" },
    ],
    exemplar:
      "A million drivers reporting every five seconds is 200,000 updates a second, which about 17 servers handle, and the position is on average 20 metres out. Drivers are indexed in a quadtree so dense city centres are subdivided and queries stay at a few milliseconds. Requests are matched in two-second batches, assigning drivers and riders together instead of grabbing the nearest driver on arrival, which brought the average pickup down by about 20 percent. The data is sharded by geography so an area's updates and queries live together.",
  },
  honestPhysics: [
    "One million drivers, a location report every few seconds you choose (4 s is 250,000 updates a second). A server holds 12,000 updates a second sharded by city, 20,000 by cell. Nearby-driver query p99: a uniform grid 80 ms, geohash 6 ms, quadtree 4 ms.",
    "A driver moving at 8 m/s is on average half an interval from the reported position. Nearest-free-driver matching averages a 190 s pickup and two-second batching 150 s, with a few seconds added for each second of report interval and 20 s for a poor index. Round figures.",
  ],
  sources: [H3, GEOHASH, S2],
  verify: [
    { id: "forecast", claim: "250,000 updates a second need 21 servers", run: "lab", params: { model: "ride-lab", config: RHC, values: {}, metric: "serversNeeded" }, expect: { min: 21, max: 21 } },
    { id: "grid", claim: "A uniform grid has an 80 ms query p99", run: "lab", params: { model: "ride-lab", config: RHC, values: { index: "grid" }, metric: "queryP99Ms" }, expect: { min: 80, max: 80 } },
    { id: "error", claim: "A 4-second interval means 16 m of error", run: "lab", params: { model: "ride-lab", config: RHC, values: { intervalS: 4 }, metric: "locationErrorM" }, expect: { min: 16, max: 16 } },
    { id: "batch", claim: "Batch matching averages a 156 s pickup at 4 s intervals", run: "lab", params: { model: "ride-lab", config: RHC, values: { index: "quadtree", intervalS: 4, match: "batch" }, metric: "pickupSec" }, expect: { min: 155, max: 157 } },
    { id: "nearest", claim: "Nearest-on-arrival averages 196 s", run: "lab", params: { model: "ride-lab", config: RHC, values: { index: "quadtree", intervalS: 4, match: "nearest" }, metric: "pickupSec" }, expect: { min: 195, max: 197 } },
    { id: "good-servers", claim: "A 5-second interval needs 17 servers", run: "lab", params: { model: "ride-lab", config: RHC, values: { index: "quadtree", intervalS: 5, match: "batch" }, metric: "serversNeeded" }, expect: { min: 17, max: 17 } },
    { id: "stale", claim: "A 15-second interval puts drivers 60 m out", run: "lab", params: { model: "ride-lab", config: RHC, values: { intervalS: 15 }, metric: "locationErrorM" }, expect: { min: 60, max: 60 } },
  ],
});
