import { definePack } from "../define";

export const RPO = { start: { method: "replica", copy: false, drills: true } };
export const RPO_CHALLENGE = {};

const AWS_DR = { id: "aws-dr", title: "AWS Whitepaper: Disaster Recovery of Workloads on AWS (RPO, RTO, backup and restore to multi-site active-active)", url: "https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html" };
const GITLAB = { id: "gitlab-2017", title: "GitLab (2017), Postmortem of database outage of January 31 (backups that did not work)", url: "https://about.gitlab.com/blog/2017/02/10/postmortem-of-database-outage-of-january-31/" };
const PG_PITR = { id: "pg-pitr", title: "PostgreSQL docs: Continuous Archiving and Point-in-Time Recovery (PITR)", url: "https://www.postgresql.org/docs/current/continuous-archiving.html" };

export default definePack({
  id: "rpo-rto",
  title: "RPO & RTO",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "orders-db · primary volume corrupted", detail: "last good backup is from 02:00, it is now 14:40" },
    lines: [
      { speaker: "kabir", line: "The database volume is gone. The last backup is twelve hours old, which means twelve hours of orders, and the restore will take hours more." },
      { speaker: "meera", line: "Two questions decide how bad this is: how much recent data can we afford to lose, and how long can we afford to be down? Nobody wrote either one down." },
    ],
  },
  predictions: [
    {
      id: "day",
      kind: "choice",
      prompt: "You rely on a nightly backup of a 2 TB database, restored at 200 MB/s. If the database is lost just before the next backup, how much data is lost and how long is the restore?",
      options: [
        { id: "min", label: "Minutes of data; an hour to restore" },
        { id: "hour", label: "An hour of data; about two hours to restore" },
        { id: "day", label: "Up to a day of data; nearly three hours to restore" },
        { id: "week", label: "A week of data; a day to restore" },
      ],
      answer: "day",
      observe: "lost-day",
      reveal: {
        text: "A nightly backup means the newest recoverable data can be up to 24 hours old: that is the recovery point objective. Restoring 2 TB at 200 MB/s takes 10,000 seconds, about 170 minutes: that is the recovery time. Both numbers come from how you back up, not from how fast you hurry.",
        derived: true,
        line: { speaker: "meera", line: "Your RPO is the gap between backups. Your RTO is the size of the data divided by the speed of the restore." },
      },
    },
    {
      id: "untested",
      kind: "choice",
      prompt: "You have backups but have never restored one. In the lab, what is the chance a given backup restores cleanly?",
      options: [
        { id: "sure", label: "Near 100%: it ran without errors" },
        { id: "eighty", label: "About 80%" },
        { id: "half", label: "About half" },
      ],
      answer: "eighty",
      observe: "untested",
      reveal: {
        text: "A backup that completes only shows that something was written. Misconfigured jobs, empty files, wrong permissions and missing logs are found when you restore. The lab uses 80% for untested backups and 99% for ones that are drilled. GitLab's 2017 outage found that five of its backup methods were not working.",
        derived: true,
        sourceIds: ["gitlab-2017"],
        line: { speaker: "rao", line: "A backup nobody has restored is Schrödinger's insurance." },
      },
    },
  ],
  widget: { id: "rpo-lab", config: RPO },
  mechanism: [
    {
      id: "def",
      text: "RPO, recovery point objective, is how much recent data you can afford to lose, measured as time: 5 minutes means recovering to within 5 minutes of the failure. RTO, recovery time objective, is how long you can afford to be down. Both are business decisions, priced by what it takes to meet them.",
      sourceIds: ["aws-dr"],
    },
    {
      id: "backups",
      scene: "backups",
      text: "Backups set RPO by how often they run, and RTO by how long a restore takes. Hourly snapshots give an RPO of an hour. Archiving the write-ahead log lets you replay to almost any moment, an RPO of minutes, but replay adds hours. Backups are cheap and slow to recover from.",
      sourceIds: ["aws-dr", "pg-pitr"],
    },
    {
      id: "replicas",
      scene: "replicas",
      text: "A live replica shrinks both numbers. An asynchronous replica in the same region loses about a second and fails over in minutes; a synchronous standby loses nothing; a replica in another region also survives losing the region, for a higher bill. Replication is not a backup: a bad delete is copied to every replica too.",
      sourceIds: ["aws-dr"],
    },
    {
      id: "drills",
      scene: "drills",
      text: "None of it counts until it has been tested. Restore a backup into a fresh environment on a schedule, time it, and check the data. The measured restore time is your true RTO. Untested backups fail a surprising fraction of the time, and you learn that at the worst moment.",
      sourceIds: ["gitlab-2017", "aws-dr"],
    },
  ],
  challenges: [
    {
      id: "recovery-plan",
      title: "Write the recovery plan",
      brief: "A 2 TB orders database. The business can lose at most 5 minutes of data, be down at most 30 minutes, and must survive losing a whole region within 30 minutes too. Backups must restore reliably. Stay under $4,000 a month.",
      line: { speaker: "rao", line: "I will fund the plan that meets the numbers, not the one with the most boxes." },
      widget: { id: "rpo-lab", config: RPO_CHALLENGE },
      conditions: [
        { metric: "rpoMin", op: "<=", value: 5, label: "Lose at most 5 minutes of data" },
        { metric: "rtoMin", op: "<=", value: 30, label: "Recover within 30 minutes" },
        { metric: "regionRtoMin", op: "<=", value: 30, label: "Survive losing a region within 30 minutes" },
        { metric: "restorable", op: ">=", value: 0.99, label: "99% chance a backup restores" },
        { metric: "costPerMonth", op: "<=", value: 4000, label: "Under $4,000 a month" },
      ],
      stars: [],
      hints: [
        "Which options meet a 5-minute RPO and 30-minute RTO?",
        "Which of those also survive a region failure?",
        "What makes a backup trustworthy?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain RPO and RTO and how they drive the choice between backups and replicas.",
    rubric: [
      { id: "def", criterion: "RPO is how much data you can lose, RTO is how long you can be down; both come from the business", keyIdea: "RPO and RTO defined" },
      { id: "choice", criterion: "Backups are cheap with RPO of the backup interval and long restores; replicas give seconds of loss and minutes of failover at higher cost", keyIdea: "backups versus replicas" },
      { id: "test", criterion: "Replication is not a backup, and backups must be restored regularly to be trusted", keyIdea: "test restores" },
    ],
    exemplar:
      "RPO is how much recent data the business can afford to lose and RTO is how long it can be down, and both are business decisions. Backups are cheap, but the RPO is the interval between them and a restore of terabytes takes hours. A replica loses a second or less and fails over in minutes, and one in another region survives losing the region, for more money. Replication is not a backup, since a bad delete is copied, and backups must be restored regularly or they may not work.",
  },
  reviews: [
    {
      id: "rr-est",
      format: "estimate",
      scenario: "A 5 TB database restores from backup at 250 MB/s. About how long does the restore take, in minutes?",
      unit: "minutes",
      answer: 333,
      acceptFactor: 1.05,
      breakdown: ["5 TB = 5,000,000 MB", "÷ 250 MB/s = 20,000 s", "÷ 60 ≈ 333 minutes"],
      explain: "Restore time is size over throughput, and it grows with the data. A 5 TB restore is more than five hours.",
    },
    {
      id: "rr-pick",
      format: "pick-fix",
      scenario: "A developer deletes a table by mistake. The database has two synchronous replicas, and the table is gone from both within a second. What would have allowed recovery?",
      options: [
        { id: "a", label: "Point-in-time backups with archived logs, restored to just before the delete" },
        { id: "b", label: "A third replica" },
        { id: "c", label: "A faster replica" },
        { id: "d", label: "Asynchronous replication" },
      ],
      answer: "a",
      explain: "Replication copies mistakes as faithfully as data. Recovering from a bad change needs a backup of an earlier state.",
    },
    {
      id: "rr-order",
      format: "order",
      scenario: "Order these by recovery point (data you can lose), largest first.",
      items: [
        { id: "nightly", label: "Nightly backup" },
        { id: "hourly", label: "Hourly snapshots" },
        { id: "pitr", label: "Archived log (point in time)" },
        { id: "sync", label: "Synchronous standby" },
      ],
      answer: ["nightly", "hourly", "pitr", "sync"],
      explain: "RPO shrinks from a day, to an hour, to a few minutes, to zero as the copy gets closer to the primary.",
    },
    {
      id: "rr-graph",
      format: "predict-graph",
      scenario: "As the database grows from 100 GB to 20 TB, restored at 200 MB/s, how does the restore time (RTO) from backup change?",
      xLabel: "database size →",
      yLabel: "restore time",
      options: [
        { id: "linear", label: "Grows in proportion to the size", points: [8, 17, 42, 83, 170, 330, 830, 1660] },
        { id: "flat", label: "Stays the same", points: [170, 170, 170, 170, 170, 170, 170, 170] },
        { id: "sqrt", label: "Grows slowly", points: [10, 20, 30, 40, 50, 55, 60, 65] },
      ],
      answer: "linear",
      explain: "Restore speed is limited by the network and disk, so time is data over throughput. At 20 TB it is about 28 hours.",
    },
    {
      id: "rr-flaw",
      format: "spot-flaw",
      scenario: "A team's disaster recovery plan is a backup to a bucket in the same region, never restored. The region has an outage. Tap the weakest part of the plan.",
      diagram: {
        nodes: [
          { id: "db", label: "database", kind: "db", col: 0, row: 1 },
          { id: "bucket", label: "backup bucket, same region, never restored", kind: "store", col: 1, row: 1 },
          { id: "dr", label: "'disaster recovery'", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "db", to: "bucket" },
          { from: "bucket", to: "dr" },
        ],
      },
      answer: "bucket->dr",
      explain: "A backup in the failed region cannot help, and a backup that has never been restored cannot be trusted. Copy it elsewhere and test the restore.",
    },
    {
      id: "rr-explain",
      format: "explain",
      scenario: "In two sentences: why is replication not a backup?",
      rubric: [
        { id: "copy", criterion: "A replica applies every change, including mistakes and deletes, so it copies the damage within moments" },
        { id: "history", criterion: "A backup preserves earlier states you can return to, which a replica does not" },
      ],
      exemplar: "A replica applies every change, including a mistaken delete or a corruption, and copies the damage within moments. A backup keeps earlier states you can go back to, which a replica does not.",
      explain: "Replication protects against hardware; backups protect against mistakes.",
    },
  ],
  codex: {
    oneLiner: "RPO is the data you can lose, RTO the time you can be down. Backups are cheap and slow, replicas fast and costly; test restores.",
    keyNumbers: [
      { label: "Restore time", value: "data size ÷ restore throughput", sourceId: "aws-dr" },
      { label: "2 TB at 200 MB/s", value: "about 170 minutes", sourceId: "aws-dr" },
    ],
    tradeoffs: [
      { choice: "Backups", gain: "Cheap; protect against mistakes", cost: "RPO of the interval; slow restores" },
      { choice: "Replicas", gain: "Seconds of loss; minutes to recover", cost: "More instances; copies mistakes" },
      { choice: "Cross-region", gain: "Survives a region loss", cost: "Highest cost; some lag" },
    ],
    seenIn: ["Point-in-time recovery on Postgres, Aurora and DynamoDB.", "Disaster recovery tiers: backup and restore, pilot light, warm standby, active-active."],
    interviewAngle: "Say: 'ask the business for RPO and RTO, then price the options; use replicas for fast failover, backups for mistakes, and test restores'.",
    aws: [{ concept: "Backup, snapshots, point-in-time recovery and cross-region replicas", service: "RDS / Aurora, AWS Backup" }],
    replay: { id: "rpo-lab", config: RPO, scene: "replicas" },
  },
  interview: [
    "What are RPO and RTO?",
    "Why is replication not a backup?",
    "How do you know your backups work?",
  ],
  deeper: [
    {
      title: "The four disaster recovery tiers",
      body: "AWS describes four patterns of rising cost and falling recovery time: backup and restore, where you rebuild after the event; pilot light, with the data live and the servers off; warm standby, a scaled-down copy that runs all the time; and multi-site active-active. Each step buys a lower RTO and RPO at a higher monthly cost.",
      sourceIds: ["aws-dr"],
    },
  ],
  honestPhysics: [
    "A 2 TB database. Restoring from backup runs at 200 MB/s, about 170 minutes. Nightly backups lose up to 1,440 minutes; hourly snapshots 60; archiving the write-ahead log about 5 minutes with a 2-hour restore.",
    "A same-region async replica loses about a second and fails over in 2 minutes; a synchronous standby loses nothing; a cross-region replica loses about 6 seconds and fails over in 15 minutes. Copying backups to another region means a 4-hour restore after a region loss.",
    "80% of untested backups restore cleanly, 99% of drilled ones; drills cost $200 a month.",
  ],
  sources: [AWS_DR, GITLAB, PG_PITR],
  verify: [
    { id: "nightly-rpo", claim: "A nightly backup can lose up to a day", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "nightly" }, metric: "rpoMin" }, expect: { min: 1440, max: 1440 } },
    { id: "nightly-rto", claim: "…and takes about 170 minutes to restore", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "nightly" }, metric: "rtoMin" }, expect: { min: 165, max: 175 } },
    { id: "untested", claim: "Untested backups restore 80% of the time", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { drills: false }, metric: "restorable" }, expect: { min: 0.8, max: 0.8 } },
    { id: "drilled", claim: "Drilled backups, 99%", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { drills: true }, metric: "restorable" }, expect: { min: 0.99 } },
    { id: "replica-no-region", claim: "A same-region replica cannot survive a region loss", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "replica", copy: false }, metric: "regionRtoMin" }, expect: { min: 99999 } },
    { id: "xregion", claim: "A cross-region replica recovers from a region loss in 15 minutes", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "xregion" }, metric: "regionRtoMin" }, expect: { max: 30 } },
    { id: "plan-cost", claim: "…and with drills costs $3,700 a month", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "xregion", drills: true }, metric: "costPerMonth" }, expect: { max: 4000 } },
    { id: "copy-only", claim: "Copying backups to another region means a 4-hour recovery", run: "lab", params: { model: "rpo-lab", config: RPO_CHALLENGE, values: { method: "pitr", copy: true }, metric: "regionRtoMin" }, expect: { min: 240 } },
  ],
});
