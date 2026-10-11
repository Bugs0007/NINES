import { definePack } from "../define";

export const DN = { start: { net: "user", host: "service", publish: "none" } };
export const DN_CHALLENGE = { start: { net: "bridge", host: "localhost", publish: "none" } };

const NET_DOCS = { id: "docker-networking", title: "Docker docs: Networking overview (bridge, host, user-defined networks, published ports)", url: "https://docs.docker.com/engine/network/" };
const BRIDGE = { id: "docker-bridge", title: "Docker docs: Bridge network driver (automatic service discovery on user-defined bridges)", url: "https://docs.docker.com/engine/network/drivers/bridge/" };
const PUBLISH = { id: "docker-publish", title: "Docker docs: Port publishing and mapping", url: "https://docs.docker.com/engine/network/port-publishing/" };

export default definePack({
  id: "docker-networking",
  title: "Container Networking",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "app · ECONNREFUSED 127.0.0.1:5432", detail: "database container is up and healthy" },
    lines: [
      { speaker: "kabir", line: "The database is running and the app says connection refused to localhost. It works fine on my laptop without Docker." },
      { speaker: "meera", line: "Every container has its own idea of localhost. Reaching another container means using its name on a network you both joined." },
    ],
  },
  predictions: [
    {
      id: "localhost",
      kind: "choice",
      prompt: "The app container connects to localhost:5432. The database runs in another container on the default bridge network, with its port not published. Does the connection work?",
      options: [
        { id: "yes", label: "Yes, both are on the same machine" },
        { id: "no", label: "No, localhost inside the app container is the app container" },
        { id: "maybe", label: "Only after the first restart" },
      ],
      answer: "no",
      observe: "localhost-fails",
      reveal: {
        text: "Each container has its own network namespace and its own loopback interface. The database is not listening there. On the default bridge containers can reach each other only by IP address, which changes every run. Put both on a user-defined network and use the service name.",
        derived: true,
        line: { speaker: "rao", line: "Localhost is not the machine. It is the namespace." },
      },
    },
    {
      id: "exposed",
      kind: "choice",
      prompt: "To get the app connecting, someone publishes the database port on all interfaces and uses the host's address. The app connects. Who else can reach the database?",
      options: [
        { id: "app", label: "Only the app" },
        { id: "host", label: "Only processes on the host" },
        { id: "all", label: "Anyone who can reach the host's network, internet included if it is open" },
      ],
      answer: "all",
      observe: "exposed",
      reveal: {
        text: "Publishing on all interfaces opens the port on the host's every address, and Docker's rules can bypass a host firewall that you configured. A database reachable from outside is a common breach. The app did not need a published port at all: containers on the same user-defined network talk directly.",
        derived: true,
        line: { speaker: "meera", line: "Publish what outsiders must reach. Nothing else." },
      },
    },
  ],
  widget: { id: "net-lab", config: DN },
  mechanism: [
    {
      id: "namespace",
      text: "A container gets its own network namespace: its own interfaces, routing table, ports and loopback. Inside it, localhost means that container. Two containers on one host cannot reach each other over localhost, and each can listen on the same port number without conflict, because they are separate namespaces joined by a virtual network.",
      sourceIds: ["docker-networking"],
    },
    {
      id: "dns",
      scene: "dns",
      text: "Docker connects containers with bridge networks. On the default bridge a container can reach another only by IP address. On a user-defined bridge, which Compose creates for you, Docker's built-in DNS resolves service names, so an app can connect to the host name db. Traffic stays inside the network, with no published port.",
      sourceIds: ["docker-bridge"],
    },
    {
      id: "publish",
      scene: "publish",
      text: "Publishing a port, with -p, makes a container port reachable from outside by mapping a host port to it. The default binds to every interface. Bind to 127.0.0.1 for something only the host should reach. Publish the web front end, and leave databases, caches and internal services unpublished on a private network.",
      sourceIds: ["docker-publish"],
    },
    {
      id: "host",
      scene: "host",
      text: "Host networking removes the separate namespace: the container uses the host's interfaces directly, so localhost reaches host services and there is no port mapping. It is faster to set up and gives up isolation. A database in host mode listens on the host's addresses, so it is exposed unless the host firewall blocks it.",
      sourceIds: ["docker-networking"],
    },
  ],
  challenges: [
    {
      id: "wire-containers",
      title: "Wire the containers",
      brief: "The app must reach the database, and the database must not be reachable from the network.",
      line: { speaker: "rao", line: "It is a private database. It should stay that way." },
      widget: { id: "net-lab", config: DN_CHALLENGE },
      conditions: [
        { metric: "appConnects", op: ">=", value: 1, label: "The app reaches the database" },
        { metric: "dbExposed", op: "<=", value: 0, label: "The database is not exposed" },
      ],
      stars: [],
      hints: ["What does localhost mean inside a container?", "Which network type resolves names?", "Does the app need a published port?"],
    },
  ],
  explainBack: {
    prompt: "Explain how containers talk to each other and to the outside world.",
    rubric: [
      { id: "ns", criterion: "Each container has its own network namespace, so localhost inside it is itself", keyIdea: "localhost is per container" },
      { id: "dns", criterion: "On a user-defined bridge network, containers reach each other by service name through Docker's DNS; the default bridge has no name resolution", keyIdea: "names on a user network" },
      { id: "publish", criterion: "Publish only what outsiders must reach, bound to specific interfaces; host mode removes isolation", keyIdea: "publish deliberately" },
    ],
    exemplar:
      "Each container has its own network namespace, so localhost inside it is that container, not the host. Containers on a user-defined bridge network reach each other by service name through Docker's DNS, while the default bridge only offers IP addresses. I would publish only what outsiders must reach, bound to the right interface, and keep databases unpublished on the private network, since host networking gives up isolation.",
  },
  reviews: [
    {
      id: "dn-est",
      format: "estimate",
      scenario: "Three services each listen on port 8080 inside their own containers. How many distinct host ports do you need if none are published?",
      unit: "ports",
      answer: 0,
      acceptFactor: 1,
      breakdown: ["Each container has its own namespace, so port 8080 does not conflict", "an unpublished port uses no host port"],
      explain: "Host ports are only used for what you publish.",
    },
    {
      id: "dn-pick",
      format: "pick-fix",
      scenario: "An app container must call 'redis' by name, but on the default bridge network the name does not resolve. What is the best fix?",
      options: [
        { id: "a", label: "Put both on a user-defined network, for example with Compose, and connect by service name" },
        { id: "b", label: "Hard-code the container's IP address" },
        { id: "c", label: "Publish Redis on all interfaces and use the host address" },
        { id: "d", label: "Use host networking" },
      ],
      answer: "a",
      explain: "A user-defined network gives name resolution without exposing anything. The other options are brittle or insecure.",
    },
    {
      id: "dn-order",
      format: "order",
      scenario: "Order these by how reachable the database is from outside the host, most reachable first.",
      items: [
        { id: "all", label: "Published on all interfaces" },
        { id: "host", label: "Host networking, no firewall rule" },
        { id: "loop", label: "Published on 127.0.0.1" },
        { id: "none", label: "Not published, on a private network" },
      ],
      answer: ["all", "host", "loop", "none"],
      explain: "Published on all interfaces is reachable by anyone on the network. Host mode listens on the host's addresses too but your own firewall may cover it. Loopback is the host only, and an unpublished port is not reachable from the host either.",
    },
    {
      id: "dn-graph",
      format: "predict-graph",
      scenario: "As you move a database from 'published on all interfaces' to 'unpublished on a private network', how does the number of machines that can reach its port change?",
      xLabel: "tighter exposure →",
      yLabel: "machines that can connect",
      options: [
        { id: "fall", label: "Falls from the whole network to the app container only", points: [1000, 1000, 1, 1, 1, 1, 1, 1] },
        { id: "flat", label: "Stays the same", points: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] },
        { id: "linear", label: "Falls steadily", points: [1000, 850, 700, 550, 400, 250, 100, 1] },
      ],
      answer: "fall",
      explain: "There is a sharp line between exposed to the network and not. The middle options narrow it to the host.",
    },
    {
      id: "dn-flaw",
      format: "spot-flaw",
      scenario: "A Compose file publishes 5432:5432 for the database 'so the app can connect', and the host is a cloud VM with a public address. Tap the problem.",
      diagram: {
        nodes: [
          { id: "net", label: "internet", kind: "external", col: 0, row: 1 },
          { id: "port", label: "host port 5432, published on all interfaces", kind: "server", col: 1, row: 1 },
          { id: "db", label: "database container", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "net", to: "port" },
          { from: "port", to: "db" },
        ],
      },
      answer: "net->port",
      explain: "The published port opens the database to the internet. The app on the same Compose network does not need it; remove the mapping or bind it to 127.0.0.1.",
    },
    {
      id: "dn-explain",
      format: "explain",
      scenario: "In two sentences: why can two containers on one host both listen on port 80?",
      rubric: [
        { id: "ns", criterion: "Each container has its own network namespace, so the ports are separate sets" },
        { id: "map", criterion: "Only when published do they use host ports, and then they need different host ports mapped to the same container port" },
      ],
      exemplar: "Each container has its own network namespace, so each has a separate set of ports. Only when they are published do they use host ports, and then they need different host ports mapped to the same container port.",
      explain: "Namespaces hold the ports.",
    },
  ],
  codex: {
    oneLiner: "Each container has its own localhost. Join a user-defined network and use service names; publish only what outsiders need, on the right interface.",
    keyNumbers: [
      { label: "Containers needed on a user-defined network for name resolution", value: "2 or more", sourceId: "docker-bridge" },
      { label: "Default publish binds to", value: "all interfaces", sourceId: "docker-publish" },
    ],
    tradeoffs: [
      { choice: "User-defined network", gain: "Name resolution and isolation", cost: "Must create and attach" },
      { choice: "Published ports", gain: "Reachable from outside", cost: "Attack surface" },
      { choice: "Host networking", gain: "No translation, simple", cost: "No isolation, port conflicts" },
    ],
    seenIn: ["Compose files with a private default network.", "Kubernetes services, which generalise the same idea."],
    interviewAngle: "Say: 'localhost is per container; use a user network and DNS names; publish only the front door, bound deliberately'.",
    aws: [{ concept: "Container networking", service: "ECS awsvpc networking and security groups" }],
    replay: { id: "net-lab", config: DN, scene: "publish" },
  },
  interview: [
    "Why can't my container connect to localhost:5432?",
    "How do containers find each other by name?",
    "What does publishing a port do and what are the risks?",
  ],
  deeper: [
    {
      title: "Docker and your firewall",
      body: "Docker inserts its own rules for published ports, and these can take effect before the host firewall rules you wrote with the usual tools. A port published on all interfaces may be open to the internet while the firewall appears to block it. Check what is actually reachable from outside, and bind published ports to specific addresses.",
      sourceIds: ["docker-publish"],
    },
  ],
  honestPhysics: [
    "An app and a database as two containers. The app can connect if: both are on one user-defined bridge and it uses the service name; or the database port is published on all interfaces and it uses the host's address; or it uses host networking and localhost.",
    "The database is exposed if its port is published on all interfaces or it runs in host networking. Publishing on 127.0.0.1 is reachable by the host only. The model checks whether the connection works and whether the database is exposed.",
  ],
  sources: [NET_DOCS, BRIDGE, PUBLISH],
  verify: [
    { id: "localhost", claim: "localhost on the default bridge does not reach the database", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: {}, metric: "appConnects" }, expect: { max: 0 } },
    { id: "dns", claim: "A user-defined network and the service name work", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: { net: "user", host: "service" }, metric: "appConnects" }, expect: { min: 1 } },
    { id: "private", claim: "…and leave the database unexposed", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: { net: "user", host: "service", publish: "none" }, metric: "dbExposed" }, expect: { max: 0 } },
    { id: "published", claim: "Publishing on all interfaces exposes it", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: { net: "bridge", host: "gateway", publish: "all" }, metric: "dbExposed" }, expect: { min: 1 } },
    { id: "gateway-local", claim: "A loopback-only publish does not let a container reach it through the host address", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: { net: "bridge", host: "gateway", publish: "local" }, metric: "appConnects" }, expect: { max: 0 } },
    { id: "host-mode", claim: "Host networking connects and exposes the database", run: "lab", params: { model: "net-lab", config: DN_CHALLENGE, values: { net: "host", host: "localhost" }, metric: "dbExposed" }, expect: { min: 1 } },
  ],
});
