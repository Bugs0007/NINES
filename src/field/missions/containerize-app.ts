import { defineField } from "../types";

export default defineField({
  id: "field-containerize-app",
  title: "Field: Containerize Your Own App",
  estimatedMinutes: 50,
  xp: 200,
  brief: [
    { speaker: "kabir", line: "It runs on my machine. It does not run on anyone else's, and the server is a different version of everything." },
    { speaker: "meera", line: "Put it in an image that runs as a non-root user, add a health check, and bring up the app with its database in one command." },
  ],
  goal: "Containerize an app you wrote with a small multi-stage image, a non-root user, a health check, and a compose file that starts it with its database.",
  needs: ["Docker with Compose", "An app of yours that talks to a database (Postgres is easiest)", "A terminal"],
  steps: [
    {
      id: "baseline",
      title: "Write the simplest Dockerfile and note the size",
      detail: "Start from a full language image, copy everything, install, run. Build it and record the size. This is the number you are about to beat.",
      commands: ["docker build -t app:naive .", "docker image ls app"],
    },
    {
      id: "multi",
      title: "Make it multi-stage",
      detail: "Build in one stage and copy only what runs into a slim final stage. Install dependencies before copying source so the layer is cached. Add a .dockerignore.",
    },
    {
      id: "user",
      title: "Run as a non-root user",
      detail: "Create a user in the image and switch to it. Confirm with id inside the container.",
      commands: ["docker run --rm app:slim id"],
    },
    {
      id: "compose",
      title: "Write the compose file with a health check",
      detail: "Define the app and the database. Give the database a healthcheck and make the app wait for it with depends_on condition service_healthy. Give the app its own healthcheck against a /health route.",
      commands: ["docker compose up -d", "docker compose ps"],
    },
    {
      id: "break",
      title: "Break it and watch it recover",
      detail: "Stop the database container and watch the app's health change. Start it again and see the app recover without a rebuild.",
    },
  ],
  criteria: [
    { id: "size", criterion: "Shows the image size before and after multi-stage, and the after is smaller" },
    { id: "nonroot", criterion: "Shows the container runs as a non-root user (id shows a uid other than 0)" },
    { id: "health", criterion: "Shows docker compose ps with the services reporting healthy" },
    { id: "order", criterion: "The app waits for the database to be healthy before starting" },
  ],
  hints: [
    { text: "Order Dockerfile lines from least to most frequently changed. Copy the dependency manifest, install, then copy source, so edits do not reinstall everything.", cost: 20 },
    { text: "A health check is a command that exits 0 when the service works. For Postgres, pg_isready is the usual one.", cost: 15 },
    { text: "depends_on with condition: service_healthy needs the dependency to have a healthcheck defined.", cost: 20 },
  ],
  proof: {
    prompt: "Paste docker image ls for the naive and slim images, the output of id from inside the container, and docker compose ps showing the health status.",
    placeholder: "REPOSITORY TAG SIZE\napp naive ...\napp slim ...\nuid=1000(app) ...\nNAME ... STATUS\napp ... Up (healthy)\ndb ... Up (healthy)",
    checks: [
      { id: "images", label: "Shows image sizes for two builds", pattern: "(REPOSITORY|IMAGE)[\\s\\S]*(naive|slim|multi)" },
      { id: "nonroot", label: "Shows a non-root uid", pattern: "uid=(?!0\\b)\\d+" },
      { id: "healthy", label: "Shows a healthy service", pattern: "\\(healthy\\)" },
      { id: "two", label: "Shows both app and database", pattern: "(db|postgres)[\\s\\S]*healthy|healthy[\\s\\S]*(db|postgres)" },
    ],
    sample:
      "REPOSITORY   TAG     IMAGE ID   SIZE\napp          naive   3f1c9a2d   1.12GB\napp          slim    8b27de10   148MB\nuid=10001(app) gid=10001(app) groups=10001(app)\nNAME      IMAGE      STATUS\napp-1     app:slim   Up 2 minutes (healthy)\ndb-1      postgres   Up 2 minutes (healthy)",
  },
  debrief: [
    "A multi-stage build keeps the toolchain out of the image you ship: smaller to pull, fewer packages to patch, less for an attacker to use.",
    "A health check turns 'the process is running' into 'the service works', which is the difference an orchestrator needs to restart or hold traffic.",
  ],
  honestPhysics: ["Image sizes depend on your language and base image. The ratio between the naive and the slim build is the lesson, not the figure."],
  sources: [
    { id: "docker-multistage", title: "Docker docs: Multi-stage builds", url: "https://docs.docker.com/build/building/multi-stage/" },
    { id: "compose-healthcheck", title: "Docker docs: Compose services, healthcheck and depends_on", url: "https://docs.docker.com/reference/compose-file/services/" },
    { id: "docker-best", title: "Docker docs: Building best practices", url: "https://docs.docker.com/build/building/best-practices/" },
  ],
});
